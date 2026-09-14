# Radar de NF-e recebidas — Fase 1 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O MOVA consulta sozinho a Distribuição DF-e da SEFAZ, de hora em hora, e mostra numa tela toda NF-e emitida contra os CNPJs do grupo — marcando o que já foi lançado no estoque e o que está pendente.

**Architecture:** Cron horário → cliente SOAP com TLS mútuo (certificado A1 lido cifrado do banco) → lote de documentos gzipados → parser puro → tabela `nfe_recebidas`. Toda decisão (próximo NSU, quando pode consultar de novo, o que é cada documento) mora em módulo **puro e testado**; o que fala com a rede não decide nada. **Fase 1 não envia nenhum evento à SEFAZ** — só lê.

**Tech Stack:** Next.js 16 (App Router, Node runtime), Drizzle + `pg` sobre Postgres do Supabase, `node:https` para mTLS, `node:zlib` para o gunzip, `fast-xml-parser` para ler o XML, `node-forge` para abrir o `.pfx`, `node:test` para os testes.

**Spec:** `docs/superpowers/specs/2026-09-14-radar-nfe-recebidas-design.md`

## Global Constraints

- **Toda funcionalidade nasce escopada por grupo** (Sul de Minas / BH). Nada global, nem certificado nem sincronização.
- **Trava de 1 hora é obrigatória.** Depois de um `cStat 137`, consultar antes de 1 hora gera `cStat 656 — consumo indevido` e a SEFAZ **bloqueia o CNPJ**. Nenhum caminho de código pode furar isso.
- **Lote e NSU gravam na MESMA transação.** Reprocessar NSU é inofensivo (chave é única); pular NSU perde nota para sempre.
- Endpoint de produção: `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
- SOAP 1.2, `action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"`, `distDFeInt` versão `1.01`, namespace `http://www.portalfiscal.inf.br/nfe`.
- `tpAmb=1` (produção), `cUFAutor=31` (Minas Gerais — os dois grupos são de MG).
- Migrações: SQL numerado em `src/lib/db/migrations/`, aplicado com `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file <arquivo>`. **Nunca** `db:generate`/`db:migrate` (journal quebrado).
- Todo arquivo `*.test.ts` novo precisa ser acrescentado à lista do script `test` no `package.json`, senão não roda em `npm test`.
- Comentários e mensagens em **pt-BR**, explicando *por que*, no estilo do repo.
- O certificado **nunca** é escrito em disco nem aparece em log.

---

### Task 1: Cifrar e decifrar material sensível

**Files:**
- Create: `src/lib/cripto.ts`
- Create: `src/lib/cripto.test.ts`
- Modify: `package.json` (lista do script `test`)

**Interfaces:**
- Consumes: nada.
- Produces: `cifrar(texto: string | Buffer): string` e `decifrar(pacote: string): Buffer`. O pacote é `iv:tag:dados` em base64, numa string só.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cripto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifrar, decifrar } from './cripto'

// 32 bytes em hex — o formato que CERT_MASTER_KEY tem que ter.
const CHAVE = 'a'.repeat(64)

test('o que foi cifrado volta igual', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  const original = Buffer.from('conteúdo do certificado')
  assert.deepEqual(decifrar(cifrar(original)), original)
})

test('cifrar duas vezes o mesmo texto dá pacotes diferentes', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  // IV aleatório por chamada: dois certificados iguais não podem produzir o
  // mesmo blob, senão o banco entrega essa informação de graça.
  assert.notEqual(cifrar('igual'), cifrar('igual'))
})

test('pacote adulterado não decifra — falha, não devolve lixo', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  const pacote = cifrar('conteúdo do certificado')
  const [iv, tag, dados] = pacote.split(':')
  const corrompido = [iv, tag, Buffer.from('outra coisa').toString('base64')].join(':')
  assert.throws(() => decifrar(corrompido))
})

test('sem a chave mestra, falha na hora e com o nome da variável', () => {
  delete process.env.CERT_MASTER_KEY
  assert.throws(() => cifrar('x'), /CERT_MASTER_KEY/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/cripto.test.ts`
Expected: FAIL — `Cannot find module './cripto'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/cripto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM porque o que é guardado aqui é certificado digital: além de
// secreto, precisa ser à prova de adulteração. GCM autentica — um blob mexido
// no banco falha em vez de devolver bytes corrompidos que viram um .pfx
// inválido três camadas adiante, num erro que não diz nada.

function chave(): Buffer {
  const hex = process.env.CERT_MASTER_KEY
  if (!hex) throw new Error('CERT_MASTER_KEY não configurada')
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 32) throw new Error('CERT_MASTER_KEY precisa ter 32 bytes em hex (64 caracteres)')
  return bytes
}

/** `iv:tag:dados`, tudo em base64, numa string só — cabe numa coluna text. */
export function cifrar(conteudo: string | Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([cipher.update(Buffer.from(conteudo)), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), dados.toString('base64')].join(':')
}

export function decifrar(pacote: string): Buffer {
  const [iv, tag, dados] = pacote.split(':')
  if (!iv || !tag || !dados) throw new Error('Pacote cifrado malformado')
  const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/cripto.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Registrar o teste na suíte**

No `package.json`, no script `test`, acrescente `src/lib/cripto.test.ts` logo depois de `src/lib/estado-moto.test.ts`. Rode `npm test` e confirme que o total de testes subiu.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cripto.ts src/lib/cripto.test.ts package.json
git commit -m "feat(cripto): cifra autenticada para guardar certificado no banco"
```

---

### Task 2: Guardar o certificado A1 por grupo

**Files:**
- Create: `src/lib/db/migrations/0092_certificados_digitais.sql`
- Modify: `src/lib/db/schema.ts` (tabela nova, no fim do arquivo)
- Create: `src/lib/sefaz/certificado.ts`
- Create: `src/lib/sefaz/certificado.test.ts`
- Modify: `package.json` (dependências e lista do script `test`)

**Interfaces:**
- Consumes: `cifrar`/`decifrar` da Task 1.
- Produces:
  - `type DadosCertificado = { cnpj: string; validoAte: Date; titular: string }`
  - `lerDadosDoPfx(pfx: Buffer, senha: string): DadosCertificado` — **puro**, lança se a senha estiver errada.
  - `salvarCertificado(grupoId: string, pfx: Buffer, senha: string): Promise<DadosCertificado>`
  - `carregarCertificado(grupoId: string): Promise<{ pfx: Buffer; senha: string; validoAte: Date } | null>`

- [ ] **Step 1: Instalar as dependências**

```bash
npm install node-forge fast-xml-parser
npm install -D @types/node-forge
```

`node-forge` abre o PKCS#12 para ler titular/CNPJ/validade; `fast-xml-parser` é usado a partir da Task 5. Confirme que `npm run type-check` continua limpo.

- [ ] **Step 2: Escrever a migração**

```sql
-- src/lib/db/migrations/0092_certificados_digitais.sql
-- Certificado A1 por grupo, cifrado.
--
-- Não vai em variável de ambiente: o .pfx tem ~12 KB em base64 e o conjunto de
-- variáveis da Vercel tem teto — dois CNPJs já apertam, e a premissa do MOVA é
-- que tudo nasce escopado por grupo. "Uma variável por CNPJ" não é solução.
--
-- `arquivo` e `senha` guardam o pacote de src/lib/cripto.ts (iv:tag:dados). O
-- banco sozinho não abre nada: a chave mestra vive em CERT_MASTER_KEY.

CREATE TABLE IF NOT EXISTS certificados_digitais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id    uuid NOT NULL UNIQUE REFERENCES grupos(id) ON DELETE CASCADE,
  arquivo     text NOT NULL,
  senha       text NOT NULL,
  cnpj        text NOT NULL,
  titular     text NOT NULL,
  valido_ate  timestamptz NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
```

Aplique:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0092_certificados_digitais.sql
```

- [ ] **Step 3: Acrescentar a tabela no schema do Drizzle**

```ts
// src/lib/db/schema.ts — no fim do arquivo
// ─── certificados_digitais ───────────────────────────────────────────────────
// Um certificado A1 por grupo. `arquivo` e `senha` são o pacote cifrado de
// src/lib/cripto.ts — nunca o conteúdo cru.
export const certificadosDigitais = pgTable('certificados_digitais', {
  id:        uuid('id').primaryKey().defaultRandom(),
  grupoId:   uuid('grupo_id').notNull().unique().references(() => grupos.id, { onDelete: 'cascade' }),
  arquivo:   text('arquivo').notNull(),
  senha:     text('senha').notNull(),
  cnpj:      text('cnpj').notNull(),
  titular:   text('titular').notNull(),
  validoAte: timestamp('valido_ate', { withTimezone: true }).notNull(),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 4: Write the failing test**

```ts
// src/lib/sefaz/certificado.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { lerDadosDoPfx } from './certificado'

// O .pfx real do Sul de Minas está fora do repo. Quando a variável não estiver
// apontando para ele, o teste é pulado em vez de falhar — CI não tem o
// certificado, e um teste vermelho por falta de arquivo ensina a ignorar
// vermelho.
const CAMINHO = process.env.NFSE_CERT_PATH
const SENHA = process.env.NFSE_CERT_PASS

test('lê CNPJ, titular e validade de um .pfx real', { skip: !CAMINHO || !existsSync(CAMINHO) }, () => {
  const dados = lerDadosDoPfx(readFileSync(CAMINHO!), SENHA!)
  assert.match(dados.cnpj, /^\d{14}$/)
  assert.ok(dados.titular.length > 0)
  assert.ok(dados.validoAte instanceof Date)
  assert.ok(dados.validoAte.getTime() > Date.now(), 'certificado já vencido')
})

test('senha errada falha com mensagem de senha, não com erro de parse', { skip: !CAMINHO || !existsSync(CAMINHO) }, () => {
  assert.throws(
    () => lerDadosDoPfx(readFileSync(CAMINHO!), 'senha-errada'),
    /senha/i,
  )
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/sefaz/certificado.test.ts`
Expected: FAIL — `Cannot find module './certificado'`

- [ ] **Step 6: Write the implementation**

```ts
// src/lib/sefaz/certificado.ts
import forge from 'node-forge'
import { db } from '@/lib/db'
import { certificadosDigitais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { cifrar, decifrar } from '@/lib/cripto'

export type DadosCertificado = { cnpj: string; titular: string; validoAte: Date }

/**
 * Abre o PKCS#12 e lê o que interessa do certificado do titular.
 *
 * O CNPJ vem do CN do subject, no formato "RAZAO SOCIAL:CNPJ" que a ICP-Brasil
 * usa. Ler isso na hora do upload é o que permite recusar na tela o certificado
 * do grupo errado, em vez de descobrir na primeira consulta à SEFAZ — quando o
 * erro chega como rejeição genérica.
 */
export function lerDadosDoPfx(pfx: Buffer, senha: string): DadosCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
  } catch {
    // node-forge dá o mesmo erro para senha errada e para arquivo corrompido.
    // Senha errada é o caso de longe mais comum no upload, e é o que a pessoa
    // consegue corrigir sozinha.
    throw new Error('Não foi possível abrir o certificado — senha incorreta ou arquivo inválido')
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const cert = bags.map(b => b.cert).find((c): c is forge.pki.Certificate => !!c)
  if (!cert) throw new Error('Certificado não encontrado dentro do arquivo')

  const cn = cert.subject.getField('CN')?.value ?? ''
  const cnpj = (cn.split(':')[1] ?? '').replace(/\D/g, '')
  if (cnpj.length !== 14) throw new Error(`Não achei o CNPJ no certificado (CN: "${cn}")`)

  return { cnpj, titular: cn.split(':')[0].trim(), validoAte: cert.validity.notAfter }
}

export async function salvarCertificado(grupoId: string, pfx: Buffer, senha: string): Promise<DadosCertificado> {
  const dados = lerDadosDoPfx(pfx, senha)
  await db.insert(certificadosDigitais)
    .values({
      grupoId,
      arquivo: cifrar(pfx),
      senha: cifrar(senha),
      cnpj: dados.cnpj,
      titular: dados.titular,
      validoAte: dados.validoAte,
    })
    .onConflictDoUpdate({
      target: certificadosDigitais.grupoId,
      set: {
        arquivo: cifrar(pfx),
        senha: cifrar(senha),
        cnpj: dados.cnpj,
        titular: dados.titular,
        validoAte: dados.validoAte,
        criadoEm: new Date(),
      },
    })
  return dados
}

/** null = grupo sem certificado cadastrado. Quem chama decide o que fazer. */
export async function carregarCertificado(grupoId: string) {
  const [linha] = await db.select().from(certificadosDigitais)
    .where(eq(certificadosDigitais.grupoId, grupoId)).limit(1)
  if (!linha) return null
  return {
    pfx: decifrar(linha.arquivo),
    senha: decifrar(linha.senha).toString('utf8'),
    validoAte: linha.validoAte,
    cnpj: linha.cnpj,
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/sefaz/certificado.test.ts`
Expected: PASS — o primeiro teste imprime nada, mas não pode ser `skip` na sua máquina (o `.env.local` tem `NFSE_CERT_PATH`).

- [ ] **Step 8: Gerar a chave mestra e guardar**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ponha o valor em `CERT_MASTER_KEY` no `.env.local` **e** nas variáveis de ambiente do projeto na Vercel (Production). Sem ela na Vercel, o cron falha em toda execução.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sefaz/certificado.ts src/lib/sefaz/certificado.test.ts src/lib/db/schema.ts src/lib/db/migrations/0092_certificados_digitais.sql package.json package-lock.json
git commit -m "feat(sefaz): certificado A1 por grupo, cifrado no banco"
```

---

### Task 3: Tela de upload do certificado

**Files:**
- Create: `src/app/(dashboard)/admin/certificados/page.tsx`
- Create: `src/app/(dashboard)/admin/certificados/actions.ts`
- Create: `src/app/(dashboard)/admin/certificados/components/upload-form.tsx`
- Modify: `src/lib/navegacao.ts` (item novo na categoria `configuracao`)
- Modify: `src/lib/navegacao.test.ts` (o teste que lista os itens, se houver contagem)

**Interfaces:**
- Consumes: `salvarCertificado`, `lerDadosDoPfx` da Task 2.
- Produces: rota `/admin/certificados`. Nada é consumido por outras tasks.

- [ ] **Step 1: Registrar a rota na tabela de navegação**

Em `src/lib/navegacao.ts`, na seção `// ── Configuração`, acrescente:

```ts
  { id: 'certificados',   href: '/admin/certificados', label: 'Certificados', icon: Shield, categoria: 'configuracao', papeis: SUPER },
```

`SUPER` = só `admin_geral`. Certificado digital é a credencial fiscal da empresa; não é item de configuração comum. `Shield` já está importado no arquivo.

- [ ] **Step 2: Escrever a action**

```ts
// src/app/(dashboard)/admin/certificados/actions.ts
'use server'

import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { salvarCertificado } from '@/lib/sefaz/certificado'
import { revalidatePath } from 'next/cache'

export async function enviarCertificado(formData: FormData): Promise<{ ok: true; titular: string } | { ok: false; erro: string }> {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') return { ok: false, erro: 'Sem permissão' }

  const arquivo = formData.get('arquivo')
  const senha = String(formData.get('senha') ?? '')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: 'Escolha o arquivo .pfx ou .p12' }
  if (!senha) return { ok: false, erro: 'Informe a senha do certificado' }

  const grupo = await getGrupoAtivo(usuario)
  const pfx = Buffer.from(await arquivo.arrayBuffer())

  try {
    // Lê ANTES de gravar. Certificado do grupo errado tem que ser recusado sem
    // encostar no banco — gravar e depois reclamar deixaria o CNPJ errado
    // guardado, e a falha só apareceria na SEFAZ, como rejeição genérica.
    const dados = lerDadosDoPfx(pfx, senha)
    const cnpjDoGrupo = grupo.cnpj.replace(/\D/g, '')
    if (dados.cnpj !== cnpjDoGrupo) {
      return { ok: false, erro: `Este certificado é de ${dados.titular} (CNPJ ${dados.cnpj}), e o grupo ativo é ${grupo.nome} (CNPJ ${cnpjDoGrupo}). Troque de grupo no topo da tela ou envie o certificado certo.` }
    }

    await salvarCertificado(grupo.id, pfx, senha)
    revalidatePath('/admin/certificados')
    return { ok: true, titular: dados.titular }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler o certificado' }
  }
}
```

O import da action precisa trazer os dois: `import { salvarCertificado, lerDadosDoPfx } from '@/lib/sefaz/certificado'`.

- [ ] **Step 3: Escrever a página**

```tsx
// src/app/(dashboard)/admin/certificados/page.tsx
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { certificadosDigitais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { UploadForm } from './components/upload-form'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

const DIAS_DE_AVISO = 30

export default async function CertificadosPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/certificados')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [atual] = await db.select({
    titular: certificadosDigitais.titular,
    cnpj: certificadosDigitais.cnpj,
    validoAte: certificadosDigitais.validoAte,
    criadoEm: certificadosDigitais.criadoEm,
  }).from(certificadosDigitais).where(eq(certificadosDigitais.grupoId, grupo.id)).limit(1)

  const diasRestantes = atual
    ? Math.floor((atual.validoAte.getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certificado digital — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          O certificado A1 é a credencial que o MOVA usa para falar com a SEFAZ. Ele fica
          guardado cifrado no nosso banco e não é enviado a nenhum terceiro.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2">
          {atual ? (
            <>
              <p className="text-sm"><strong>{atual.titular}</strong> — CNPJ {atual.cnpj}</p>
              <p className="text-sm text-slate-500">
                Válido até {atual.validoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {diasRestantes !== null && ` (${diasRestantes} dias)`}
              </p>
              {diasRestantes !== null && diasRestantes <= DIAS_DE_AVISO && (
                <p className="flex gap-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Vence em {diasRestantes} dias. Quando vencer, o radar de notas para de
                    sincronizar — envie o novo por esta tela, sem precisar de deploy.
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Nenhum certificado cadastrado para este grupo.</p>
          )}
        </CardContent>
      </Card>

      <UploadForm />
    </div>
  )
}
```

- [ ] **Step 4: Escrever o formulário**

```tsx
// src/app/(dashboard)/admin/certificados/components/upload-form.tsx
'use client'
import { useState } from 'react'
import { enviarCertificado } from '../actions'
import { Card, CardContent } from '@/components/ui/card'

export function UploadForm() {
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function acao(formData: FormData) {
    setEnviando(true)
    setMsg(null)
    const r = await enviarCertificado(formData)
    setMsg(r.ok
      ? { tipo: 'ok', texto: `Certificado de ${r.titular} guardado.` }
      : { tipo: 'erro', texto: r.erro })
    setEnviando(false)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={acao} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Arquivo .pfx / .p12</label>
            <input type="file" name="arquivo" accept=".pfx,.p12" required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Senha do certificado</label>
            <input type="password" name="senha" required autoComplete="off"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none" />
          </div>
          <button type="submit" disabled={enviando}
            className="rounded-md bg-slate-800 text-white px-3 h-9 text-sm hover:bg-slate-700 disabled:opacity-60">
            {enviando ? 'Enviando…' : 'Enviar certificado'}
          </button>
          {msg && (
            <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.texto}</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Subir os dois certificados e conferir**

Rode `npm run dev`, entre em `/admin/certificados` com o grupo **Sul de Minas** ativo e envie
`D:\ECOMOV\MOTOCHEFE SUL DE MINAS LTDA_57113017000172_Certificado.pfx`. A tela deve mostrar
titular, CNPJ e "válido até 01/09/2027". Troque para o grupo **BH** e envie
`certificado MOTOCHEFE BH.p12`. Confirme no banco:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select g.nome, c.titular, c.cnpj, c.valido_ate::date from certificados_digitais c join grupos g on g.id=c.grupo_id"
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/admin/certificados" src/lib/navegacao.ts
git commit -m "feat(certificados): tela de upload do A1 por grupo, com aviso de vencimento"
```

---

### Task 4: A trava de consulta e o avanço de NSU

**Files:**
- Create: `src/lib/sefaz/nsu.ts`
- Create: `src/lib/sefaz/nsu.test.ts`
- Modify: `package.json` (lista do script `test`)

**Interfaces:**
- Consumes: nada. **Módulo puro.**
- Produces:
  - `type EstadoSync = { ultNSU: string; maxNSU: string; proximaConsultaEm: Date | null }`
  - `type RetornoSefaz = { cStat: number; ultNSU: string; maxNSU: string }`
  - `podeConsultar(estado: { proximaConsultaEm: Date | null }, agora: Date): boolean`
  - `proximoEstado(retorno: RetornoSefaz, agora: Date): EstadoSync`

Esta é a task mais importante do plano: é ela que impede o bloqueio do CNPJ.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sefaz/nsu.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeConsultar, proximoEstado, ESPERA_APOS_VAZIO_MS } from './nsu'

const AGORA = new Date('2026-09-14T12:00:00.000Z')

// cStat 137 = "nenhum documento localizado". Consultar de novo antes de 1 hora
// devolve 656 (consumo indevido) e a SEFAZ BLOQUEIA o CNPJ. É a regra que não
// pode ser furada por caminho nenhum.
test('depois de "nenhum documento", só pode consultar daqui a 1 hora', () => {
  const estado = proximoEstado({ cStat: 137, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(ESPERA_APOS_VAZIO_MS, 60 * 60 * 1000)
})

// Enquanto ultNSU < maxNSU ainda tem documento na fila: pode emendar a próxima
// consulta sem esperar, senão esvaziar um backlog de 90 dias levaria dias.
test('com documento na fila, pode emendar a próxima consulta', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000050', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm, null)
  assert.equal(estado.ultNSU, '000000000000050')
})

// Alcançou o fim da fila: mesmo com cStat 138, não há mais o que buscar.
test('quando ultNSU alcança maxNSU, espera a hora mesmo com cStat 138', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

// 656 é o bloqueio já acontecendo. Insistir piora.
test('consumo indevido (656) também segura por 1 hora e preserva o NSU', () => {
  const estado = proximoEstado({ cStat: 656, ultNSU: '', maxNSU: '' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(estado.ultNSU, '', 'não inventa NSU quando a SEFAZ não devolveu')
})

test('sem trava gravada, pode consultar', () => {
  assert.equal(podeConsultar({ proximaConsultaEm: null }, AGORA), true)
})

test('antes da hora marcada, não pode', () => {
  const daquiMeiaHora = new Date(AGORA.getTime() + 30 * 60 * 1000)
  assert.equal(podeConsultar({ proximaConsultaEm: daquiMeiaHora }, AGORA), false)
})

test('na hora marcada, pode', () => {
  assert.equal(podeConsultar({ proximaConsultaEm: AGORA }, AGORA), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/sefaz/nsu.test.ts`
Expected: FAIL — `Cannot find module './nsu'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sefaz/nsu.ts
// Quando o MOVA pode falar com a Distribuição DF-e, e de onde continua a leitura.
//
// A consulta é sequencial por NSU: manda-se o último NSU conhecido e a SEFAZ
// devolve o lote seguinte, mais o ultNSU (onde a leitura parou) e o maxNSU (o
// fim da fila). Enquanto ultNSU < maxNSU tem documento esperando.
//
// A regra que manda aqui não é de eficiência, é de bloqueio: depois de um
// retorno vazio, consultar antes de uma hora devolve cStat 656 (consumo
// indevido) e a SEFAZ suspende o CNPJ. Por isso a decisão vive neste módulo
// puro, com teste — e não espalhada pelo código que faz a chamada.

export const ESPERA_APOS_VAZIO_MS = 60 * 60 * 1000

export const CSTAT_DOCUMENTO_LOCALIZADO = 138
export const CSTAT_NENHUM_DOCUMENTO = 137
export const CSTAT_CONSUMO_INDEVIDO = 656

export type RetornoSefaz = { cStat: number; ultNSU: string; maxNSU: string }
export type EstadoSync = { ultNSU: string; maxNSU: string; proximaConsultaEm: Date | null }

/** `proximaConsultaEm` nulo = nunca consultou, ou ainda tem fila. */
export function podeConsultar(estado: { proximaConsultaEm: Date | null }, agora: Date): boolean {
  if (!estado.proximaConsultaEm) return true
  return agora.getTime() >= estado.proximaConsultaEm.getTime()
}

/** NSU vem zero-padded em 15 dígitos; comparar como número evita "9" > "10". */
const n = (nsu: string) => Number(nsu || 0)

export function proximoEstado(retorno: RetornoSefaz, agora: Date): EstadoSync {
  const aindaTemFila =
    retorno.cStat === CSTAT_DOCUMENTO_LOCALIZADO && n(retorno.ultNSU) < n(retorno.maxNSU)

  return {
    ultNSU: retorno.ultNSU,
    maxNSU: retorno.maxNSU,
    proximaConsultaEm: aindaTemFila ? null : new Date(agora.getTime() + ESPERA_APOS_VAZIO_MS),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/sefaz/nsu.test.ts`
Expected: PASS — 7 testes

- [ ] **Step 5: Registrar na suíte e commitar**

Acrescente `src/lib/sefaz/nsu.test.ts` ao script `test` do `package.json`, rode `npm test`, depois:

```bash
git add src/lib/sefaz/nsu.ts src/lib/sefaz/nsu.test.ts package.json
git commit -m "feat(sefaz): trava de 1 hora e avanço de NSU, com teste"
```

---

### Task 5: Ler o lote que a SEFAZ devolve

**Files:**
- Create: `src/lib/sefaz/parser.ts`
- Create: `src/lib/sefaz/parser.test.ts`
- Modify: `package.json` (lista do script `test`)

**Interfaces:**
- Consumes: `fast-xml-parser` (Task 2, passo 1). **Módulo puro** — recebe texto, devolve objeto.
- Produces:
  - `type DocumentoDfe = { nsu: string; tipo: 'resumo' | 'completa' | 'evento'; chave: string; emitenteCnpj: string; emitenteNome: string; valor: string; dataEmissao: Date; tipoEvento: string | null; xml: string }`
  - `type RespostaDistribuicao = { cStat: number; xMotivo: string; ultNSU: string; maxNSU: string; documentos: DocumentoDfe[] }`
  - `lerRetorno(soapXml: string, descompactar: (b64: string) => string): RespostaDistribuicao`

`descompactar` entra como parâmetro para o módulo continuar puro e o teste
não precisar gerar gzip de verdade.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sefaz/parser.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRetorno } from './parser'

// Resumo de NF-e: é o que a SEFAZ entrega ANTES de qualquer manifestação.
const RESUMO = `<resNFe versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
  <chNFe>31260953780554000115550010000123451000123456</chNFe>
  <CNPJ>53780554000115</CNPJ>
  <xNome>Q.P.A DISTRIBUICAO LTDA</xNome>
  <IE>0011223344</IE>
  <dhEmi>2026-09-12T14:32:00-03:00</dhEmi>
  <tpNF>1</tpNF>
  <vNF>31579.24</vNF>
  <digVal>abc</digVal>
  <dhRecbto>2026-09-12T14:40:00-03:00</dhRecbto>
  <cSitNFe>1</cSitNFe>
</resNFe>`

const EVENTO_CANCELAMENTO = `<resEvento versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
  <cOrgao>31</cOrgao>
  <CNPJ>53780554000115</CNPJ>
  <chNFe>31260953780554000115550010000123451000123456</chNFe>
  <dhEvento>2026-09-13T09:00:00-03:00</dhEvento>
  <tpEvento>110111</tpEvento>
  <nSeqEvento>1</nSeqEvento>
  <xEvento>Cancelamento</xEvento>
  <dhRecbto>2026-09-13T09:01:00-03:00</dhRecbto>
</resEvento>`

/** Monta o envelope como a SEFAZ devolve, com o conteúdo já "descompactado". */
function envelope(docs: { nsu: string; schema: string; conteudo: string }[], cStat = 138, ultNSU = '000000000000002', maxNSU = '000000000000002') {
  const zips = docs.map(d =>
    `<docZip NSU="${d.nsu}" schema="${d.schema}">${Buffer.from(d.conteudo).toString('base64')}</docZip>`).join('')
  return `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
 <soap:Body>
  <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
   <nfeDistDFeInteresseResult>
    <retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
     <tpAmb>1</tpAmb><verAplic>1.0</verAplic>
     <cStat>${cStat}</cStat><xMotivo>Documento localizado</xMotivo>
     <dhResp>2026-09-14T12:00:00-03:00</dhResp>
     <ultNSU>${ultNSU}</ultNSU><maxNSU>${maxNSU}</maxNSU>
     <loteDistDFeInt>${zips}</loteDistDFeInt>
    </retDistDFeInt>
   </nfeDistDFeInteresseResult>
  </nfeDistDFeInteresseResponse>
 </soap:Body>
</soap:Envelope>`
}

// No teste, "descompactar" só desfaz o base64 — o gzip é responsabilidade de
// quem chama, e deixar isso de fora é o que mantém o parser puro.
const semGzip = (b64: string) => Buffer.from(b64, 'base64').toString('utf8')

test('lê cStat, ultNSU e maxNSU do retorno', () => {
  const r = lerRetorno(envelope([]), semGzip)
  assert.equal(r.cStat, 138)
  assert.equal(r.ultNSU, '000000000000002')
  assert.equal(r.maxNSU, '000000000000002')
})

test('resumo de NF-e vira documento com emitente, valor e data', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO }]), semGzip)
  assert.equal(r.documentos.length, 1)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'resumo')
  assert.equal(d.nsu, '000000000000001')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
  assert.equal(d.emitenteCnpj, '53780554000115')
  assert.equal(d.emitenteNome, 'Q.P.A DISTRIBUICAO LTDA')
  assert.equal(d.valor, '31579.24')
  assert.equal(d.dataEmissao.toISOString(), '2026-09-12T17:32:00.000Z')
})

// O cancelamento é distribuído mesmo sem manifestação. Sem tratá-lo, o radar
// mostra como pendente uma nota que não existe mais.
test('evento de cancelamento é reconhecido e traz a chave da nota', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000002', schema: 'resEvento_v1.01.xsd', conteudo: EVENTO_CANCELAMENTO }]), semGzip)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'evento')
  assert.equal(d.tipoEvento, '110111')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
})

test('lote vazio não quebra', () => {
  const r = lerRetorno(envelope([], 137, '000000000000120', '000000000000120'), semGzip)
  assert.equal(r.cStat, 137)
  assert.deepEqual(r.documentos, [])
})

// Um documento ilegível no meio do lote não pode derrubar os outros: o NSU
// avança de qualquer jeito e o que foi perdido não volta.
test('documento ilegível é pulado, o resto do lote entra', () => {
  const r = lerRetorno(envelope([
    { nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', conteudo: '<lixo' },
    { nsu: '000000000000002', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO },
  ]), semGzip)
  assert.equal(r.documentos.length, 1)
  assert.equal(r.documentos[0].nsu, '000000000000002')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/sefaz/parser.test.ts`
Expected: FAIL — `Cannot find module './parser'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sefaz/parser.ts
// Lê o retorno da Distribuição DF-e. Texto entra, objeto sai — sem rede, sem
// banco, sem gzip: a descompactação chega como função, para o módulo continuar
// puro e o teste não precisar produzir gzip de verdade.
//
// O lote vem como uma lista de <docZip>, cada um com o NSU e o schema. O schema
// é o que diz o que tem dentro: resNFe (resumo), procNFe (nota completa) ou
// resEvento (evento, incluindo cancelamento).

import { XMLParser } from 'fast-xml-parser'

export type DocumentoDfe = {
  nsu: string
  tipo: 'resumo' | 'completa' | 'evento'
  chave: string
  emitenteCnpj: string
  emitenteNome: string
  valor: string
  dataEmissao: Date
  /** Só para tipo 'evento' — 110111 é cancelamento. */
  tipoEvento: string | null
  xml: string
}

export type RespostaDistribuicao = {
  cStat: number
  xMotivo: string
  ultNSU: string
  maxNSU: string
  documentos: DocumentoDfe[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,   // chave de NF-e tem 44 dígitos: como número vira lixo
  trimValues: true,
})

const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const texto = (v: unknown): string => (v == null ? '' : String(v))

function achar(no: Record<string, unknown>, nome: string): Record<string, unknown> | null {
  // A resposta vem com prefixos de namespace variáveis entre ambientes; procurar
  // pelo fim do nome da tag é mais robusto que cravar "soap:Envelope".
  for (const [chave, valor] of Object.entries(no)) {
    if (chave === nome || chave.endsWith(`:${nome}`)) return valor as Record<string, unknown>
    if (valor && typeof valor === 'object') {
      const achado = achar(valor as Record<string, unknown>, nome)
      if (achado) return achado
    }
  }
  return null
}

function lerDocumento(nsu: string, xml: string): DocumentoDfe | null {
  const raiz = parser.parse(xml) as Record<string, unknown>

  const resumo = achar(raiz, 'resNFe')
  if (resumo) {
    return {
      nsu,
      tipo: 'resumo',
      chave: texto(resumo.chNFe),
      emitenteCnpj: texto(resumo.CNPJ),
      emitenteNome: texto(resumo.xNome),
      valor: texto(resumo.vNF),
      dataEmissao: new Date(texto(resumo.dhEmi)),
      tipoEvento: null,
      xml,
    }
  }

  const evento = achar(raiz, 'resEvento')
  if (evento) {
    return {
      nsu,
      tipo: 'evento',
      chave: texto(evento.chNFe),
      emitenteCnpj: texto(evento.CNPJ),
      emitenteNome: '',
      valor: '',
      dataEmissao: new Date(texto(evento.dhEvento)),
      tipoEvento: texto(evento.tpEvento),
      xml,
    }
  }

  // Nota completa: só chega depois de manifestação (fase 2), mas o parser já
  // sabe ler — assim a fase 2 não mexe neste arquivo.
  const nfe = achar(raiz, 'infNFe')
  if (nfe) {
    const emit = (nfe.emit ?? {}) as Record<string, unknown>
    const total = ((nfe.total ?? {}) as Record<string, unknown>).ICMSTot as Record<string, unknown> | undefined
    const ide = (nfe.ide ?? {}) as Record<string, unknown>
    return {
      nsu,
      tipo: 'completa',
      chave: texto(nfe['@Id']).replace(/^NFe/, ''),
      emitenteCnpj: texto(emit.CNPJ),
      emitenteNome: texto(emit.xNome),
      valor: texto(total?.vNF),
      dataEmissao: new Date(texto(ide.dhEmi)),
      tipoEvento: null,
      xml,
    }
  }

  return null
}

export function lerRetorno(soapXml: string, descompactar: (b64: string) => string): RespostaDistribuicao {
  const raiz = parser.parse(soapXml) as Record<string, unknown>
  const ret = achar(raiz, 'retDistDFeInt')
  if (!ret) throw new Error('Resposta da SEFAZ sem retDistDFeInt')

  const lote = achar(ret, 'loteDistDFeInt')
  const zips = lote ? lista(lote.docZip as Record<string, unknown> | Record<string, unknown>[]) : []

  const documentos: DocumentoDfe[] = []
  for (const zip of zips) {
    const nsu = texto(zip['@NSU'])
    try {
      const doc = lerDocumento(nsu, descompactar(texto(zip['#text'])))
      if (doc) documentos.push(doc)
    } catch {
      // Um documento ilegível não pode derrubar o lote: o NSU avança de
      // qualquer jeito e o que ficar de fora não volta a ser oferecido.
      continue
    }
  }

  return {
    cStat: Number(texto(ret.cStat)),
    xMotivo: texto(ret.xMotivo),
    ultNSU: texto(ret.ultNSU),
    maxNSU: texto(ret.maxNSU),
    documentos,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/sefaz/parser.test.ts`
Expected: PASS — 5 testes. Se `dataEmissao` falhar por fuso, confira que o teste espera `2026-09-12T17:32:00.000Z` (14:32 em −03:00).

- [ ] **Step 5: Registrar na suíte e commitar**

```bash
git add src/lib/sefaz/parser.ts src/lib/sefaz/parser.test.ts package.json
git commit -m "feat(sefaz): parser do lote de Distribuição DF-e"
```

---

### Task 6: Falar com a SEFAZ

**Files:**
- Create: `src/lib/sefaz/distribuicao.ts`

**Interfaces:**
- Consumes: `carregarCertificado` (Task 2), `lerRetorno` (Task 5).
- Produces: `consultarDistribuicao(opts: { pfx: Buffer; senha: string; cnpj: string; ultNSU: string }): Promise<RespostaDistribuicao>`

Sem teste unitário: este módulo é só transporte, e a decisão toda está nas Tasks 4 e 5. A verificação é o passo 3, contra a SEFAZ de verdade.

- [ ] **Step 1: Escrever o cliente**

```ts
// src/lib/sefaz/distribuicao.ts
// Transporte para o NFeDistribuicaoDFe do Ambiente Nacional.
//
// O certificado A1 é a credencial da CONEXÃO (TLS mútuo), não um header: por
// isso `fetch` não serve e usamos node:https com um Agent montado a partir do
// .pfx. Este módulo não decide nada — quem decide o próximo NSU é nsu.ts e quem
// entende o conteúdo é parser.ts.

import https from 'node:https'
import { gunzipSync } from 'node:zlib'
import { lerRetorno, type RespostaDistribuicao } from './parser'

const HOST = 'www1.nfe.fazenda.gov.br'
const CAMINHO = '/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const ACAO = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

/** 1 = produção. Homologação não distribui documento real, então não é opção. */
const TP_AMB = '1'
/** UF do autor da consulta. 31 = Minas Gerais — os dois grupos são de MG. */
const C_UF_AUTOR = '31'

function envelope(cnpj: string, ultNSU: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
 <soap12:Body>
  <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
   <nfeDadosMsg>
    <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
     <tpAmb>${TP_AMB}</tpAmb>
     <cUFAutor>${C_UF_AUTOR}</cUFAutor>
     <CNPJ>${cnpj}</CNPJ>
     <distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU>
    </distDFeInt>
   </nfeDadosMsg>
  </nfeDistDFeInteresse>
 </soap12:Body>
</soap12:Envelope>`
}

export async function consultarDistribuicao(opts: {
  pfx: Buffer
  senha: string
  cnpj: string
  ultNSU: string
}): Promise<RespostaDistribuicao> {
  const corpo = envelope(opts.cnpj.replace(/\D/g, ''), opts.ultNSU || '0')

  const resposta = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path: CAMINHO,
        method: 'POST',
        pfx: opts.pfx,
        passphrase: opts.senha,
        timeout: 60_000,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${ACAO}"`,
          'Content-Length': Buffer.byteLength(corpo),
        },
      },
      res => {
        const partes: Buffer[] = []
        res.on('data', p => partes.push(p))
        res.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8')
          if (res.statusCode !== 200) {
            // O corpo do erro da SEFAZ é HTML/SOAP Fault e não cabe em log —
            // só o começo, que é onde o motivo aparece.
            reject(new Error(`SEFAZ respondeu ${res.statusCode}: ${texto.slice(0, 300)}`))
            return
          }
          resolve(texto)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('Timeout de 60s falando com a SEFAZ')))
    req.on('error', reject)
    req.end(corpo)
  })

  return lerRetorno(resposta, b64 => gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'))
}
```

- [ ] **Step 2: Escrever um script descartável de verificação**

```ts
// scripts/_tmp-dfe.ts  (apagar depois)
import { carregarCertificado } from '@/lib/sefaz/certificado'
import { consultarDistribuicao } from '@/lib/sefaz/distribuicao'

async function main() {
  const cert = await carregarCertificado('00000000-0000-4000-8000-000000000001') // Sul de Minas
  if (!cert) throw new Error('Sem certificado — faça a Task 3 primeiro')
  const r = await consultarDistribuicao({ pfx: cert.pfx, senha: cert.senha, cnpj: cert.cnpj, ultNSU: '0' })
  console.log('cStat', r.cStat, r.xMotivo, '| ultNSU', r.ultNSU, '| maxNSU', r.maxNSU)
  for (const d of r.documentos.slice(0, 10)) {
    console.log(d.nsu, d.tipo.padEnd(8), d.emitenteNome.slice(0, 30).padEnd(30), d.valor, d.chave)
  }
  console.log('total no lote:', r.documentos.length)
}
main().then(() => process.exit(0))
```

- [ ] **Step 3: Rodar contra a SEFAZ de verdade — UMA VEZ**

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/_tmp-dfe.ts
```

Esperado: `cStat 138` com uma lista de resumos, ou `cStat 137` se não houver nada nos 90 dias.

**Não rode de novo em menos de 1 hora se voltar 137.** É esse o caminho para o 656 e para o bloqueio do CNPJ. Se voltar erro de TLS, o problema é o certificado (Task 2), não o envelope.

- [ ] **Step 4: Apagar o script e commitar**

```bash
rm scripts/_tmp-dfe.ts
git add src/lib/sefaz/distribuicao.ts
git commit -m "feat(sefaz): cliente SOAP da Distribuição DF-e com TLS mútuo"
```

---

### Task 7: Onde as notas ficam

**Files:**
- Create: `src/lib/db/migrations/0093_nfe_recebidas.sql`
- Modify: `src/lib/db/schema.ts`

**Interfaces:**
- Produces: tabelas `nfe_recebidas` e `nfe_dfe_sync`, e os objetos Drizzle `nfeRecebidas` e `nfeDfeSync`.

- [ ] **Step 1: Escrever a migração**

```sql
-- src/lib/db/migrations/0093_nfe_recebidas.sql
-- O que a SEFAZ entregou, e de onde continuar lendo.
--
-- `nfe_dfe_sync` é pequena e é a peça mais importante: `ult_nsu` é o ponto de
-- leitura (pular NSU perde nota para sempre) e `proxima_consulta_em` é a trava
-- que impede o consumo indevido — consultar antes da hora depois de um retorno
-- vazio faz a SEFAZ bloquear o CNPJ.
--
-- "Já lançada no MOVA" NÃO é coluna aqui: é junção com motos.nota_fiscal_entrada
-- na hora de montar a tela. Como campo, viraria uma segunda verdade que
-- envelhece sozinha quando a moto é registrada depois.

CREATE TABLE IF NOT EXISTS nfe_recebidas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  chave          text NOT NULL,
  nsu            text NOT NULL,
  emitente_cnpj  text NOT NULL,
  emitente_nome  text NOT NULL,
  valor          numeric(12,2),
  data_emissao   timestamptz NOT NULL,
  situacao       text NOT NULL DEFAULT 'resumo',   -- resumo | completa | cancelada
  manifestado_em timestamptz,
  xml            text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, chave)
);

CREATE INDEX IF NOT EXISTS nfe_recebidas_grupo_data_idx
  ON nfe_recebidas (grupo_id, data_emissao DESC);

CREATE TABLE IF NOT EXISTS nfe_dfe_sync (
  grupo_id            uuid PRIMARY KEY REFERENCES grupos(id) ON DELETE CASCADE,
  ult_nsu             text NOT NULL DEFAULT '0',
  max_nsu             text NOT NULL DEFAULT '0',
  proxima_consulta_em timestamptz,
  ultimo_cstat        integer,
  ultimo_erro         text,
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);
```

Aplique com `scripts/sql.ts --file 0093_nfe_recebidas.sql` e confirme com
`\d nfe_recebidas` equivalente:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select column_name, data_type from information_schema.columns where table_name='nfe_recebidas' order by ordinal_position"
```

- [ ] **Step 2: Acrescentar ao schema do Drizzle**

```ts
// src/lib/db/schema.ts — no fim do arquivo
// ─── nfe_recebidas / nfe_dfe_sync ────────────────────────────────────────────
export const nfeRecebidas = pgTable('nfe_recebidas', {
  id:            uuid('id').primaryKey().defaultRandom(),
  grupoId:       uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  chave:         text('chave').notNull(),
  nsu:           text('nsu').notNull(),
  emitenteCnpj:  text('emitente_cnpj').notNull(),
  emitenteNome:  text('emitente_nome').notNull(),
  valor:         numeric('valor', { precision: 12, scale: 2 }),
  dataEmissao:   timestamp('data_emissao', { withTimezone: true }).notNull(),
  situacao:      text('situacao').notNull().default('resumo'),
  manifestadoEm: timestamp('manifestado_em', { withTimezone: true }),
  xml:           text('xml'),
  criadoEm:      timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('nfe_recebidas_grupo_id_chave_key').on(t.grupoId, t.chave)])

export const nfeDfeSync = pgTable('nfe_dfe_sync', {
  grupoId:           uuid('grupo_id').primaryKey().references(() => grupos.id, { onDelete: 'cascade' }),
  ultNsu:            text('ult_nsu').notNull().default('0'),
  maxNsu:            text('max_nsu').notNull().default('0'),
  proximaConsultaEm: timestamp('proxima_consulta_em', { withTimezone: true }),
  ultimoCstat:       integer('ultimo_cstat'),
  ultimoErro:        text('ultimo_erro'),
  atualizadoEm:      timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Confira que `unique` e `integer` estão no import do `drizzle-orm/pg-core` no topo do arquivo; acrescente se faltar. Rode `npm run type-check`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrations/0093_nfe_recebidas.sql src/lib/db/schema.ts
git commit -m "feat(radar-fiscal): tabelas de notas recebidas e controle de NSU"
```

---

### Task 8: O cron que sincroniza

**Files:**
- Create: `src/lib/sefaz/sincronizar.ts`
- Create: `src/app/api/cron/nfe-dfe/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `carregarCertificado` (2), `podeConsultar`/`proximoEstado` (4), `consultarDistribuicao` (6), tabelas (7).
- Produces: `sincronizarGrupo(grupo: { id: string; nome: string }, agora?: Date): Promise<ResultadoSync>`
  O grupo entra como objeto, não como id solto: a Task 10 precisa do nome para
  montar o aviso, e acrescentar um parâmetro depois colidiria com `agora`.

- [ ] **Step 1: Escrever o orquestrador**

```ts
// src/lib/sefaz/sincronizar.ts
import { db } from '@/lib/db'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { carregarCertificado } from './certificado'
import { consultarDistribuicao } from './distribuicao'
import { podeConsultar, proximoEstado } from './nsu'

/** 110111 = Cancelamento de NF-e. Vem mesmo sem manifestação. */
const EVENTO_CANCELAMENTO = '110111'

export type ResultadoSync = {
  status: 'ok' | 'esperando' | 'sem_certificado' | 'erro'
  documentos: number
  cStat?: number
  erro?: string
}

export async function sincronizarGrupo(
  grupo: { id: string; nome: string },
  agora = new Date(),
): Promise<ResultadoSync> {
  const grupoId = grupo.id
  const [estado] = await db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, grupoId)).limit(1)

  if (estado && !podeConsultar({ proximaConsultaEm: estado.proximaConsultaEm }, agora)) {
    return { status: 'esperando', documentos: 0 }
  }

  const cert = await carregarCertificado(grupoId)
  if (!cert) return { status: 'sem_certificado', documentos: 0 }

  let retorno
  try {
    retorno = await consultarDistribuicao({
      pfx: cert.pfx,
      senha: cert.senha,
      cnpj: cert.cnpj,
      ultNSU: estado?.ultNsu ?? '0',
    })
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao falar com a SEFAZ'
    // Falha de rede NÃO avança o NSU e NÃO arma a trava: na próxima hora tenta
    // de novo do mesmo ponto. Só registra para a tela poder dizer que a
    // sincronização está parada, em vez de ficar muda.
    await db.insert(nfeDfeSync)
      .values({ grupoId, ultimoErro: erro, atualizadoEm: agora })
      .onConflictDoUpdate({ target: nfeDfeSync.grupoId, set: { ultimoErro: erro, atualizadoEm: agora } })
    return { status: 'erro', documentos: 0, erro }
  }

  const proximo = proximoEstado(retorno, agora)

  // Lote e NSU na MESMA transação. Gravar as notas e perder o NSU faz reprocessar
  // (inofensivo, a chave é única); gravar o NSU e perder as notas perde nota para
  // sempre, porque a SEFAZ não oferece o mesmo NSU de novo.
  await db.transaction(async (tx) => {
    for (const doc of retorno.documentos) {
      if (doc.tipo === 'evento') {
        if (doc.tipoEvento === EVENTO_CANCELAMENTO) {
          await tx.update(nfeRecebidas)
            .set({ situacao: 'cancelada' })
            .where(sql`${nfeRecebidas.grupoId} = ${grupoId} AND ${nfeRecebidas.chave} = ${doc.chave}`)
        }
        continue
      }

      await tx.insert(nfeRecebidas)
        .values({
          grupoId,
          chave: doc.chave,
          nsu: doc.nsu,
          emitenteCnpj: doc.emitenteCnpj,
          emitenteNome: doc.emitenteNome,
          valor: doc.valor || null,
          dataEmissao: doc.dataEmissao,
          situacao: doc.tipo === 'completa' ? 'completa' : 'resumo',
          xml: doc.tipo === 'completa' ? doc.xml : null,
        })
        // A nota completa chega DEPOIS do resumo, com NSU novo: a linha do
        // resumo precisa poder virar completa. Situação 'cancelada' não é
        // reescrita — cancelamento é definitivo.
        .onConflictDoUpdate({
          target: [nfeRecebidas.grupoId, nfeRecebidas.chave],
          set: {
            nsu: doc.nsu,
            situacao: sql`CASE WHEN ${nfeRecebidas.situacao} = 'cancelada' THEN 'cancelada' ELSE excluded.situacao END`,
            xml: sql`COALESCE(excluded.xml, ${nfeRecebidas.xml})`,
          },
        })
    }

    await tx.insert(nfeDfeSync)
      .values({
        grupoId,
        ultNsu: proximo.ultNSU || '0',
        maxNsu: proximo.maxNSU || '0',
        proximaConsultaEm: proximo.proximaConsultaEm,
        ultimoCstat: retorno.cStat,
        ultimoErro: null,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: nfeDfeSync.grupoId,
        set: {
          ultNsu: proximo.ultNSU || '0',
          maxNsu: proximo.maxNSU || '0',
          proximaConsultaEm: proximo.proximaConsultaEm,
          ultimoCstat: retorno.cStat,
          ultimoErro: null,
          atualizadoEm: agora,
        },
      })
  })

  return { status: 'ok', documentos: retorno.documentos.length, cStat: retorno.cStat }
}
```

- [ ] **Step 2: Escrever a rota do cron**

```ts
// src/app/api/cron/nfe-dfe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sincronizarGrupo } from '@/lib/sefaz/sincronizar'

// SOAP + TLS mútuo + lote grande passa folgado do default.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
    || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ativos = await db.select({ id: grupos.id, nome: grupos.nome })
    .from(grupos).where(eq(grupos.ativo, true))

  const resultados = []
  for (const grupo of ativos) {
    // Um grupo por vez, em série: são conexões TLS com certificados
    // diferentes, e a SEFAZ conta consumo por CNPJ. Paralelizar não ganha nada
    // e atrapalha o diagnóstico quando um deles falha.
    resultados.push({ grupo: grupo.nome, ...(await sincronizarGrupo(grupo)) })
  }

  return NextResponse.json({ ok: true, resultados })
}
```

- [ ] **Step 3: Declarar o cron**

Em `vercel.json`, acrescente ao array `crons`:

```json
    {
      "path": "/api/cron/nfe-dfe",
      "schedule": "0 * * * *"
    }
```

De hora em hora. **Não aumente essa frequência:** a trava de 1 hora da SEFAZ é
por CNPJ e o preço de furar é bloqueio, não lentidão.

- [ ] **Step 4: Verificar localmente**

```bash
npm run dev
# noutro terminal:
curl -H "x-cron-secret: $(grep '^CRON_SECRET' .env.local | cut -d= -f2-)" http://localhost:3000/api/cron/nfe-dfe
```

Esperado: JSON com um resultado por grupo. Rode **duas vezes seguidas**: a
segunda tem que voltar `"status":"esperando"` para os grupos que acabaram de
sincronizar — é a prova de que a trava funciona. Confira o estado:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select g.nome, s.ult_nsu, s.max_nsu, s.ultimo_cstat, s.proxima_consulta_em from nfe_dfe_sync s join grupos g on g.id=s.grupo_id"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sefaz/sincronizar.ts src/app/api/cron/nfe-dfe/route.ts vercel.json
git commit -m "feat(radar-fiscal): cron horário sincroniza a Distribuição DF-e por grupo"
```

---

### Task 9: A tela do radar

**Files:**
- Create: `src/app/(dashboard)/radar-fiscal/page.tsx`
- Create: `src/lib/queries/nfe-recebidas.ts`
- Modify: `src/lib/navegacao.ts`

**Interfaces:**
- Consumes: tabelas da Task 7.
- Produces: `listarNotasRecebidas(grupoId: string, dias: number): Promise<NotaRecebida[]>`, com
  `type NotaRecebida = { chave: string; emitenteNome: string; emitenteCnpj: string; valor: string | null; dataEmissao: Date; situacao: string; jaLancada: boolean }`

- [ ] **Step 1: Escrever a consulta**

```ts
// src/lib/queries/nfe-recebidas.ts
import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'

export type NotaRecebida = {
  chave: string
  emitenteNome: string
  emitenteCnpj: string
  valor: string | null
  dataEmissao: Date
  situacao: string
  jaLancada: boolean
}

/**
 * As notas recebidas do grupo, já dizendo se a entrada foi registrada.
 *
 * "Já lançada" sai de uma junção com `motos.nota_fiscal_entrada`, não de uma
 * coluna: guardar como campo criaria uma segunda verdade que envelhece sozinha
 * quando a moto for registrada depois. O número da NF está nas posições 26–34
 * da chave de 44 dígitos — é assim que a nota do extrato encontra a moto.
 */
export async function listarNotasRecebidas(grupoId: string, dias = 90): Promise<NotaRecebida[]> {
  const linhas = await execRows(sql`
    SELECT n.chave, n.emitente_nome, n.emitente_cnpj, n.valor, n.data_emissao, n.situacao,
           EXISTS (
             SELECT 1 FROM motos m
               JOIN lojas l ON l.id = m.loja_id
              WHERE l.grupo_id = ${grupoId}
                AND regexp_replace(COALESCE(m.nota_fiscal_entrada, ''), '[^0-9]', '', 'g')
                    = ltrim(substring(n.chave from 26 for 9), '0')
           ) AS ja_lancada
      FROM nfe_recebidas n
     WHERE n.grupo_id = ${grupoId}
       AND n.data_emissao >= now() - ${`${dias} days`}::interval
     ORDER BY n.data_emissao DESC`)

  return linhas.map(l => ({
    chave: String(l.chave),
    emitenteNome: String(l.emitente_nome),
    emitenteCnpj: String(l.emitente_cnpj),
    valor: l.valor == null ? null : String(l.valor),
    dataEmissao: new Date(l.data_emissao),
    situacao: String(l.situacao),
    jaLancada: Boolean(l.ja_lancada),
  }))
}
```

- [ ] **Step 2: Registrar a rota na navegação**

Em `src/lib/navegacao.ts`, na seção `// ── Estoque & Fábrica`, logo depois do item `entrada`:

```ts
  { id: 'radar-fiscal',   href: '/radar-fiscal',   label: 'Notas Recebidas',   icon: Radar,         categoria: 'estoque',      papeis: GESTORES },
```

`GESTORES` inclui `aux_adm` — é quem opera a loja e quem vai olhar isso todo dia.
`Radar` já está importado no arquivo.

- [ ] **Step 3: Escrever a página**

```tsx
// src/app/(dashboard)/radar-fiscal/page.tsx
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { nfeDfeSync } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { listarNotasRecebidas } from '@/lib/queries/nfe-recebidas'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Radar } from 'lucide-react'

const brl = (v: string | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function RadarFiscalPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/radar-fiscal')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [notas, [sync]] = await Promise.all([
    listarNotasRecebidas(grupo.id),
    db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, grupo.id)).limit(1),
  ])

  const pendentes = notas.filter(n => !n.jaLancada && n.situacao !== 'cancelada')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Recebidas — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Toda NF-e emitida contra o CNPJ do grupo, direto da SEFAZ. A consulta roda de hora em
          hora e alcança os últimos 90 dias — nota mais antiga que isso a SEFAZ não distribui mais.
        </p>
      </div>

      {sync?.ultimoErro && (
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Última sincronização falhou: {sync.ultimoErro}</span>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Notas no período</p>
          <p className="text-xl font-bold mt-1">{notas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Não lançadas</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{pendentes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Última sincronização</p>
          <p className="text-sm mt-1 text-slate-700">
            {sync?.atualizadoEm
              ? sync.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
              : 'ainda não rodou'}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Emissão</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead className="pr-4">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map(n => (
                <TableRow key={n.chave}>
                  <TableCell className="pl-4 text-sm text-slate-500 whitespace-nowrap">
                    {n.dataEmissao.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{n.emitenteNome}</p>
                    <p className="text-xs text-slate-400">{n.emitenteCnpj}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(n.valor)}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-400">{n.chave}</TableCell>
                  <TableCell className="pr-4">
                    {n.situacao === 'cancelada'
                      ? <Badge variant="secondary" className="text-xs">Cancelada</Badge>
                      : n.jaLancada
                        ? <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">Já lançada</Badge>
                        : <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">Não lançada</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {notas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-12">
                    <Radar size={32} className="mx-auto mb-2 opacity-20" />
                    Nenhuma nota recebida no período
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Conferir na tela**

`npm run dev`, abrir `/radar-fiscal` com o Sul de Minas ativo. Confira, contra
uma nota que você sabe que já foi registrada, que ela aparece como "Já lançada" —
e, contra uma que não foi, que aparece como "Não lançada". Se **tudo** aparecer
como não lançada, o casamento pelas posições 26–34 da chave está errado: compare
`substring(chave from 26 for 9)` com o `nota_fiscal_entrada` de uma moto real
antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/radar-fiscal" src/lib/queries/nfe-recebidas.ts src/lib/navegacao.ts
git commit -m "feat(radar-fiscal): tela de notas recebidas com o que já foi lançado"
```

---

### Task 10: Avisar no WhatsApp quando chega nota da fábrica

**Files:**
- Modify: `src/lib/sefaz/sincronizar.ts`
- Create: `src/lib/whatsapp/nfe-recebida.ts`
- Create: `src/lib/whatsapp/nfe-recebida.test.ts`
- Modify: `package.json` (lista do script `test`)

**Interfaces:**
- Consumes: `enviarAlertaWhatsapp` de `src/lib/whatsapp/client.ts`, `DocumentoDfe` da Task 5.
- Produces: `montarAvisoNfe(docs: { emitenteNome: string; valor: string; chave: string }[]): string` (puro) e `avisarNotasNovas(grupoNome, docs): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/whatsapp/nfe-recebida.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarAvisoNfe } from './nfe-recebida'

test('a mensagem começa com MOVA INFORMA', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'Q.P.A DISTRIBUICAO LTDA', valor: '31579.24', chave: '31260953780554000115550010000123451000123456' },
  ])
  assert.ok(texto.startsWith('MOVA INFORMA'), texto)
})

test('traz emitente e valor em reais', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'Q.P.A DISTRIBUICAO LTDA', valor: '31579.24', chave: '31260953780554000115550010000123451000123456' },
  ])
  assert.match(texto, /Q\.P\.A DISTRIBUICAO LTDA/)
  assert.match(texto, /31\.579,24/)
})

test('várias notas viram uma mensagem só, com o total', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'FORNECEDOR A', valor: '100.00', chave: 'a'.repeat(44) },
    { emitenteNome: 'FORNECEDOR B', valor: '250.50', chave: 'b'.repeat(44) },
  ])
  assert.match(texto, /2 notas/)
  assert.match(texto, /350,50/)
})

test('sem nota nova, não monta mensagem', () => {
  assert.equal(montarAvisoNfe('Sul de Minas', []), '')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/whatsapp/nfe-recebida.test.ts`
Expected: FAIL — `Cannot find module './nfe-recebida'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/whatsapp/nfe-recebida.ts
import { enviarAlertaWhatsapp } from './client'

export type NotaParaAviso = { emitenteNome: string; valor: string; chave: string }

// toLocaleString separa "R$" do número com espaço não-quebrável (U+00A0),
// invisível na tela e ruim em log e comparação — normalizado, como no aviso de
// pedidos da fábrica.
const brl = (v: string) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

/** String vazia = não há o que avisar. Quem chama não manda mensagem vazia. */
export function montarAvisoNfe(grupo: string, notas: NotaParaAviso[]): string {
  if (notas.length === 0) return ''
  const total = notas.reduce((s, n) => s + Number(n.valor || 0), 0)
  const linhas = notas.map(n => `• ${n.emitenteNome} — ${brl(n.valor)}`).join('\n')
  const cabecalho = notas.length === 1
    ? `MOVA INFORMA: chegou 1 nota nova contra o CNPJ de ${grupo}.`
    : `MOVA INFORMA: chegaram ${notas.length} notas novas contra o CNPJ de ${grupo}, somando ${brl(String(total))}.`
  return `${cabecalho}\n\n${linhas}\n\nVeja em Estoque & Fábrica › Notas Recebidas.`
}

export async function avisarNotasNovas(grupo: string, notas: NotaParaAviso[]): Promise<void> {
  const texto = montarAvisoNfe(grupo, notas)
  if (!texto) return
  await enviarAlertaWhatsapp(texto)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/whatsapp/nfe-recebida.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Disparar o aviso a partir da sincronização**

Em `src/lib/sefaz/sincronizar.ts`, acrescente o import e três trechos. Primeiro,
no topo:

```ts
import { avisarNotasNovas } from '@/lib/whatsapp/nfe-recebida'
```

Depois, **antes** da transação (logo abaixo do `const proximo = proximoEstado(...)`),
descubra o que é novo de verdade. A checagem é antes porque `returning` devolve
linha tanto em INSERT quanto em UPDATE — não serve para separar nota nova de
nota que só teve o NSU atualizado:

```ts
  const jaConhecidas = new Set(
    (await db.select({ chave: nfeRecebidas.chave }).from(nfeRecebidas)
       .where(eq(nfeRecebidas.grupoId, grupoId))).map(l => l.chave),
  )
  const novas = retorno.documentos.filter(d => d.tipo !== 'evento' && !jaConhecidas.has(d.chave))
```

E, **depois** da transação, antes do `return`:

```ts
  // Fora da transação de propósito: WhatsApp fora do ar não pode desfazer a
  // gravação das notas nem o avanço do NSU. O aviso é consequência, não parte
  // do registro.
  if (novas.length > 0) {
    await avisarNotasNovas(grupo.nome, novas.map(d => ({
      emitenteNome: d.emitenteNome,
      valor: d.valor,
      chave: d.chave,
    }))).catch(() => {})
  }
```

A assinatura de `sincronizarGrupo` já recebe `grupo: { id, nome }` desde a
Task 8 — nada muda na rota do cron.

- [ ] **Step 6: Verificar**

Rode `npm test` (todos passando), `npm run type-check` e `npm run build`. Depois
chame o cron local uma vez e confirme no WhatsApp que a mensagem chegou — ou,
se não houver nota nova, que **nada** foi enviado.

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp/nfe-recebida.ts src/lib/whatsapp/nfe-recebida.test.ts src/lib/sefaz/sincronizar.ts src/app/api/cron/nfe-dfe/route.ts package.json
git commit -m "feat(radar-fiscal): aviso no WhatsApp quando chega nota nova"
```

---

## Depois de tudo

- [ ] `npm test`, `npm run type-check` e `npm run build` limpos.
- [ ] `CERT_MASTER_KEY` cadastrada na Vercel (Production). **Sem ela o cron falha em toda execução.**
- [ ] Deploy, e na hora seguinte conferir `/radar-fiscal` com dado real.
- [ ] Conferir uma vez que o cron da Vercel rodou e que `proxima_consulta_em` está
      no futuro — é a prova de que a trava chegou em produção.

## O que a fase 1 NÃO faz

Não envia evento nenhum à SEFAZ, então **não baixa o XML completo**: a tela
mostra os resumos. O XML e o `/entrada` automático são a fase 2, que começa com
a manifestação **manual, por nota**, até uma nota real passar ponta a ponta.
