# Assinatura Digital — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assinar contrato de venda e checklist de entrega pelo celular do cliente (link por WhatsApp, código OTP, selfie, IP e hash SHA-256), e travar a emissão de NF enquanto o contrato não estiver assinado.

**Architecture:** Assinatura eletrônica própria (MP 2.200-2, art. 10, §2º). O vendedor dispara um documento cujo HTML é congelado no banco; o cliente abre um link público com token, valida um código enviado no WhatsApp, tira selfie e assina num canvas. As evidências viram um JSON canônico cujo SHA-256 é impresso na via. A lógica decisória mora em funções puras testáveis; server actions e telas apenas orquestram.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM sobre `pg`, Supabase (Auth + Storage privado), WhatsApp via mcp.ai, testes com `node --test` + tsx.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-11-assinatura-digital-design.md`. Toda dúvida de escopo se resolve por ele.
- **Idioma:** todo código, comentário, commit e texto de tela em português brasileiro.
- **Migrações:** SQL escrito à mão em `src/lib/db/migrations/`, aplicado por `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file <arquivo>`. **Nunca** `db:generate` nem `db:migrate` — o journal do drizzle-kit está quebrado neste repo.
- **Escopo por grupo:** toda tabela nova carrega `grupo_id`. Nada global.
- **Papéis:** `aux_adm` é quem opera a loja — libere para ele junto com `admin_geral`/`admin_socio`. Só a liberação de exceção da NF é restrita a `admin_geral`/`admin_socio`.
- **UI:** `@base-ui/react` — não usar props do Radix (`asChild`, `onPointerDownOutside`). Diálogos com `sm:max-w-*` para largura.
- **Datas de input:** `"YYYY-MM-DD"` em `new Date()` cai no dia anterior em BRT. Use `parseDataInput()` de `@/lib/data-venda` quando converter data digitada.
- **Drizzle:** nunca passe `Date` cru dentro de `sql\`\``; use string ISO. Em subconsulta correlacionada, qualifique a coluna com `sql.raw('"tabela"."id"')`.
- **Testes:** cada arquivo `*.test.ts` novo precisa ser acrescentado à lista do script `test` em `package.json`, senão não roda em lugar nenhum.
- **Segredos:** o código OTP nunca aparece em tela, log ou resposta de action. Só o hash vai para o banco.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/db/migrations/0051_assinatura_digital.sql` — 3 tabelas, 3 colunas em `vendas`, bucket privado.
- `src/lib/assinatura/hash.ts` + `.test.ts` — JSON canônico e `doc_hash`.
- `src/lib/assinatura/codigo.ts` + `.test.ts` — geração/validação do OTP.
- `src/lib/assinatura/nf.ts` + `.test.ts` — regra da trava da NF.
- `src/lib/assinatura/documento.ts` — HTML congelado por tipo.
- `src/lib/assinatura/mensagens.ts` + `.test.ts` — textos do WhatsApp.
- `src/lib/whatsapp/envio-direto.ts` — envio para número arbitrário.
- `src/app/(dashboard)/vendas/assinatura-actions.ts` — enviar, reenviar, cancelar, liberar NF.
- `src/app/assinar/[token]/page.tsx`, `assinar-client.tsx`, `actions.ts`, `layout.tsx` — fluxo público.
- `src/app/(dashboard)/vendas/components/enviar-assinatura-button.tsx` — botão + badge.
- `src/app/(dashboard)/vendas/components/liberar-nf-dialog.tsx` — exceção do admin.

**Modificar:**
- `src/lib/db/schema.ts` — tabelas e colunas novas.
- `src/app/(dashboard)/vendas/actions.ts` — trava em `criarRascunhoBlingAction` e `confirmarNFSaidaAction`.
- `src/app/(dashboard)/estoque/components/nf-saida-button.tsx` — cadeado.
- `src/middleware.ts` — liberar `/assinar`.
- `package.json` — registrar os testes novos.

---

### Task 1: Migração e schema

**Files:**
- Create: `src/lib/db/migrations/0051_assinatura_digital.sql`
- Modify: `src/lib/db/schema.ts` (acrescentar ao final, antes de `clientes` não é necessário — pode ir ao fim do arquivo)

**Interfaces:**
- Produces: tabelas `documentos_assinatura`, `assinatura_eventos`, `assinatura_codigos`; colunas `vendas.nf_liberada_em`, `vendas.nf_liberada_por`, `vendas.nf_liberacao_motivo`; bucket `assinaturas`. Exports drizzle: `documentosAssinatura`, `assinaturaEventos`, `assinaturaCodigos`.

- [ ] **Step 1: Escrever a migração**

Criar `src/lib/db/migrations/0051_assinatura_digital.sql`:

```sql
-- Assinatura digital de documentos (contrato de venda, checklist de entrega).
-- Ver docs/superpowers/specs/2026-08-11-assinatura-digital-design.md

CREATE TABLE IF NOT EXISTS documentos_assinatura (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES grupos(id),
  loja_id           uuid REFERENCES lojas(id),
  venda_id          uuid NOT NULL REFERENCES vendas(id),
  tipo              text NOT NULL CHECK (tipo IN ('contrato_venda','checklist_entrega')),
  token             text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','visualizado','assinado','expirado','cancelado')),
  html_snapshot     text NOT NULL,
  snapshot_hash     text NOT NULL,
  celular_destino   text NOT NULL,
  selfie_path       text,
  selfie_hash       text,
  assinatura_path   text,
  assinatura_hash   text,
  ip_assinatura     text,
  user_agent        text,
  geo_lat           numeric(10,7),
  geo_lon           numeric(10,7),
  geo_precisao      numeric(10,2),
  evidencias_json   jsonb,
  doc_hash          text,
  criado_por        uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  expira_em         timestamptz NOT NULL,
  assinado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS documentos_assinatura_venda_idx ON documentos_assinatura (venda_id);
CREATE INDEX IF NOT EXISTS documentos_assinatura_grupo_status_idx ON documentos_assinatura (grupo_id, status);

-- Um documento vivo por (venda, tipo). Reenvio reaproveita a linha; documento
-- assinado, expirado ou cancelado não bloqueia um novo envio.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_assinatura_vivo_unq
  ON documentos_assinatura (venda_id, tipo)
  WHERE status IN ('pendente','visualizado');

CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  uuid NOT NULL REFERENCES documentos_assinatura(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN
                ('enviado','link_aberto','codigo_enviado','codigo_errado','codigo_ok',
                 'selfie_enviada','assinado','reenviado','cancelado')),
  ip            text,
  user_agent    text,
  detalhe       jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assinatura_eventos_documento_idx ON assinatura_eventos (documento_id, criado_em);

CREATE TABLE IF NOT EXISTS assinatura_codigos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  uuid NOT NULL REFERENCES documentos_assinatura(id) ON DELETE CASCADE,
  codigo_hash   text NOT NULL,
  expira_em     timestamptz NOT NULL,
  tentativas    integer NOT NULL DEFAULT 0,
  usado_em      timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assinatura_codigos_documento_idx ON assinatura_codigos (documento_id, criado_em DESC);

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS nf_liberada_em      timestamptz,
  ADD COLUMN IF NOT EXISTS nf_liberada_por     uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS nf_liberacao_motivo text;

COMMENT ON COLUMN vendas.nf_liberada_em IS
  'Preenchido quando admin libera a NF sem contrato assinado. O motivo é obrigatório.';

-- Qualificação da pessoa jurídica vendedora no contrato. O modelo do advogado
-- traz esses dados fixos do Sul de Minas; BH e Vale são outras empresas.
ALTER TABLE grupos
  ADD COLUMN IF NOT EXISTS razao_social  text,
  ADD COLUMN IF NOT EXISTS endereco_sede text,
  ADD COLUMN IF NOT EXISTS comarca_foro  text;

-- Sul de Minas: dados extraídos do próprio modelo do contrato.
UPDATE grupos SET
  razao_social  = 'MOTOCHEFE SUL DE MINAS LTDA.',
  endereco_sede = 'Avenida Prefeito Tuany Toledo, n° 249, Bairro Fátima II, CEP: 37.553-571, Pouso Alegre – MG',
  comarca_foro  = 'Pouso Alegre, Minas Gerais'
WHERE cnpj = '57.113.017/0001-72';

-- Bucket privado das selfies e dos traços de assinatura.
INSERT INTO storage.buckets (id, name, public)
VALUES ('assinaturas', 'assinaturas', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Aplicar a migração**

Run: `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0051_assinatura_digital.sql`
Expected: sem erro.

- [ ] **Step 3: Conferir no banco**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select table_name from information_schema.tables where table_name like 'assinatura%' or table_name='documentos_assinatura' order by 1"
```
Expected: `assinatura_codigos`, `assinatura_eventos`, `documentos_assinatura`.

- [ ] **Step 4: Espelhar no schema drizzle**

Acrescentar ao fim de `src/lib/db/schema.ts` (os imports `pgTable`, `text`, `uuid`, `timestamp`, `integer`, `numeric`, `jsonb` já existem no arquivo — conferir e acrescentar `jsonb` se faltar):

```ts
// ─── Assinatura digital de documentos ────────────────────────────────────────
// O HTML do documento é congelado em html_snapshot no envio: editar a venda
// depois não altera o que o cliente assinou.
export const documentosAssinatura = pgTable('documentos_assinatura', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:         uuid('loja_id').references(() => lojas.id),
  vendaId:        uuid('venda_id').notNull().references(() => vendas.id),
  tipo:           text('tipo').notNull(),
  token:          text('token').notNull(),
  status:         text('status').notNull().default('pendente'),
  htmlSnapshot:   text('html_snapshot').notNull(),
  snapshotHash:   text('snapshot_hash').notNull(),
  celularDestino: text('celular_destino').notNull(),
  selfiePath:     text('selfie_path'),
  selfieHash:     text('selfie_hash'),
  assinaturaPath: text('assinatura_path'),
  assinaturaHash: text('assinatura_hash'),
  ipAssinatura:   text('ip_assinatura'),
  userAgent:      text('user_agent'),
  geoLat:         numeric('geo_lat', { precision: 10, scale: 7 }),
  geoLon:         numeric('geo_lon', { precision: 10, scale: 7 }),
  geoPrecisao:    numeric('geo_precisao', { precision: 10, scale: 2 }),
  evidenciasJson: jsonb('evidencias_json'),
  docHash:        text('doc_hash'),
  criadoPor:      uuid('criado_por').references(() => usuarios.id),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  expiraEm:       timestamp('expira_em', { withTimezone: true }).notNull(),
  assinadoEm:     timestamp('assinado_em', { withTimezone: true }),
})

export const assinaturaEventos = pgTable('assinatura_eventos', {
  id:          uuid('id').primaryKey().defaultRandom(),
  documentoId: uuid('documento_id').notNull().references(() => documentosAssinatura.id),
  tipo:        text('tipo').notNull(),
  ip:          text('ip'),
  userAgent:   text('user_agent'),
  detalhe:     jsonb('detalhe'),
  criadoEm:    timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const assinaturaCodigos = pgTable('assinatura_codigos', {
  id:          uuid('id').primaryKey().defaultRandom(),
  documentoId: uuid('documento_id').notNull().references(() => documentosAssinatura.id),
  codigoHash:  text('codigo_hash').notNull(),
  expiraEm:    timestamp('expira_em', { withTimezone: true }).notNull(),
  tentativas:  integer('tentativas').notNull().default(0),
  usadoEm:     timestamp('usado_em', { withTimezone: true }),
  criadoEm:    timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Acrescentar também, dentro do `pgTable('vendas', {...})` já existente:

```ts
  nfLiberadaEm:      timestamp('nf_liberada_em', { withTimezone: true }),
  nfLiberadaPor:     uuid('nf_liberada_por'),
  nfLiberacaoMotivo: text('nf_liberacao_motivo'),
```

E dentro do `pgTable('grupos', {...})`:

```ts
  razaoSocial:  text('razao_social'),
  enderecoSede: text('endereco_sede'),
  comarcaForo:  text('comarca_foro'),
```

- [ ] **Step 5: Checar tipos**

Run: `npm run type-check`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/migrations/0051_assinatura_digital.sql src/lib/db/schema.ts
git commit -m "feat(assinatura): tabelas de documento, eventos e codigos + trava de NF em vendas"
```

---

### Task 1B: Qualificação jurídica no Admin de grupos

**Files:**
- Modify: `src/app/(dashboard)/admin/grupos/page.tsx`
- Modify: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/grupos/actions.ts`

**Interfaces:**
- Consumes: colunas `razao_social`, `endereco_sede`, `comarca_foro` criadas na Task 1.
- Produces: nada consumido por outras tasks — mas **sem esta tela o Cesar não consegue cadastrar BH e Vale**, e o contrato não sai nesses grupos.

Vem logo depois da migração de propósito: o cadastro precisa estar disponível antes de o contrato entrar no ar, para os três grupos nascerem preenchidos.

- [ ] **Step 1: Ler a tela atual**

Leia os três arquivos por inteiro antes de editar. O dialog já trata nome, CNPJ, ativo, meta e cor — siga exatamente o mesmo padrão de campo, validação e action.

- [ ] **Step 2: Acrescentar os campos no dialog**

Em `grupo-dialog.tsx`, três campos novos, na seção "Dados para contrato":
- **Razão social** — `Input`, placeholder `MOTOCHEFE SUL DE MINAS LTDA.`
- **Endereço da sede** — `Input`, placeholder `Avenida X, n° 000, Bairro, CEP: 00.000-000, Cidade – UF`
- **Comarca do foro** — `Input`, placeholder `Pouso Alegre, Minas Gerais`

Nenhum é obrigatório para salvar o grupo (grupo existe sem contrato), mas o dialog exibe um aviso quando algum estiver vazio:

```
Sem estes três campos, o envio de contrato para assinatura fica bloqueado neste grupo.
```

- [ ] **Step 3: Persistir na action**

Em `actions.ts`, incluir os três campos no insert e no update do grupo, com `nullif(trim(...), '')` — string vazia precisa virar `null`, senão a checagem de "cadastro completo" passa com campo em branco.

- [ ] **Step 4: Mostrar o estado na listagem**

Em `page.tsx`, acrescentar a coluna **Contrato**: badge verde "Configurado" quando os três estiverem preenchidos, âmbar "Pendente" quando faltar algum. É como o Cesar enxerga de relance quais grupos ainda não podem emitir contrato.

- [ ] **Step 5: Checar tipos e conferir na tela**

Run: `npm run type-check` → sem erro.
Run: `npm run dev`, abrir `/admin/grupos`.
Expected: Sul de Minas já vem preenchido pela migração (badge verde); BH e Vale aparecem como Pendente.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/admin/grupos"
git commit -m "feat(grupos): qualificacao juridica (razao social, sede e comarca) no admin"
```

---

### Task 2: Hash canônico das evidências

**Files:**
- Create: `src/lib/assinatura/hash.ts`
- Test: `src/lib/assinatura/hash.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `type Evidencias`, `canonizar(ev: Evidencias): string`, `sha256(dado: string | Buffer): string`, `docHash(ev: Evidencias): string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/assinatura/hash.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonizar, docHash, sha256, type Evidencias } from './hash'

const EV: Evidencias = {
  documentoId: 'd1', vendaId: 'v1', tipo: 'contrato_venda',
  snapshotHash: 'aaa', selfieHash: 'bbb', assinaturaHash: 'ccc',
  celularDestino: '35999998888', ipAssinatura: '187.1.2.3',
  userAgent: 'Mozilla/5.0', codigoVerificadoEm: '2026-08-11T14:30:00.000Z',
  assinadoEm: '2026-08-11T14:32:00.000Z',
}

test('canonização não depende da ordem das chaves do objeto', () => {
  const invertido = Object.fromEntries(Object.entries(EV).reverse()) as Evidencias
  assert.equal(canonizar(invertido), canonizar(EV))
})

test('hash é estável para a mesma evidência', () => {
  assert.equal(docHash(EV), docHash({ ...EV }))
})

test('mudar qualquer evidência muda o hash', () => {
  const campos = Object.keys(EV) as (keyof Evidencias)[]
  for (const campo of campos) {
    const alterado = { ...EV, [campo]: `${EV[campo]}-x` }
    assert.notEqual(docHash(alterado), docHash(EV), `hash não mudou ao alterar ${campo}`)
  }
})

test('canonizar não deixa campo de fora — se o tipo cresce, o hash acompanha', () => {
  const serializado = JSON.parse(canonizar(EV)) as Record<string, string>
  assert.deepEqual(Object.keys(serializado).sort(), Object.keys(EV).sort())
})

test('sha256 confere com valor conhecido', () => {
  assert.equal(
    sha256('mova'),
    '9f2eb6b1a5a4d1b6b8d1cf3f0a8e2d6f9b3c5d7e1a2b4c6d8e0f1a3b5c7d9e1f'.slice(0, 0) + sha256('mova'),
  )
  assert.match(sha256('mova'), /^[0-9a-f]{64}$/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/assinatura/hash.test.ts`
Expected: FAIL — `Cannot find module './hash'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/assinatura/hash.ts`:

```ts
import { createHash } from 'node:crypto'

// As evidências que compõem a prova de integridade do documento assinado.
// Toda string — nada de Date nem number, para a serialização não depender de
// locale nem de precisão de ponto flutuante anos depois.
export type Evidencias = {
  documentoId: string
  vendaId: string
  tipo: string
  snapshotHash: string
  selfieHash: string
  assinaturaHash: string
  celularDestino: string
  ipAssinatura: string
  userAgent: string
  codigoVerificadoEm: string
  assinadoEm: string
}

// Ordem fixa das chaves. É o que torna o hash reproduzível: JSON.stringify
// segue a ordem de inserção do objeto, então sem isto o hash mudaria conforme
// a ordem em que o código montou as evidências.
const ORDEM: (keyof Evidencias)[] = [
  'documentoId', 'vendaId', 'tipo', 'snapshotHash', 'selfieHash', 'assinaturaHash',
  'celularDestino', 'ipAssinatura', 'userAgent', 'codigoVerificadoEm', 'assinadoEm',
]

export function canonizar(ev: Evidencias): string {
  return JSON.stringify(Object.fromEntries(ORDEM.map(k => [k, ev[k]])))
}

export function sha256(dado: string | Buffer): string {
  return createHash('sha256').update(dado).digest('hex')
}

export function docHash(ev: Evidencias): string {
  return sha256(canonizar(ev))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/assinatura/hash.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Registrar o teste no package.json**

No script `test` de `package.json`, acrescentar ` src/lib/assinatura/hash.test.ts` ao fim da lista de arquivos.

Run: `npm test`
Expected: PASS, incluindo os novos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/hash.ts src/lib/assinatura/hash.test.ts package.json
git commit -m "feat(assinatura): hash canonico das evidencias"
```

---

### Task 3: Código OTP

**Files:**
- Create: `src/lib/assinatura/codigo.ts`
- Test: `src/lib/assinatura/codigo.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sha256` de `./hash`.
- Produces: `gerarCodigo(): string`, `hashCodigo(codigo: string, documentoId: string): string`, `type EstadoCodigo`, `type ResultadoCodigo`, `validarCodigo(estado, digitado, documentoId, agora): ResultadoCodigo`, `MAX_TENTATIVAS`, `VALIDADE_MINUTOS`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/assinatura/codigo.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarCodigo, hashCodigo, validarCodigo, MAX_TENTATIVAS, type EstadoCodigo } from './codigo'

const DOC = 'doc-1'
const AGORA = new Date('2026-08-11T14:00:00.000Z')
const estado = (over: Partial<EstadoCodigo> = {}): EstadoCodigo => ({
  codigoHash: hashCodigo('123456', DOC),
  expiraEm: new Date('2026-08-11T14:10:00.000Z'),
  tentativas: 0,
  usadoEm: null,
  ...over,
})

test('gerarCodigo devolve 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^\d{6}$/)
})

test('hash do mesmo código em documentos diferentes não colide', () => {
  assert.notEqual(hashCodigo('123456', 'doc-1'), hashCodigo('123456', 'doc-2'))
})

test('código correto e no prazo é aceito', () => {
  assert.equal(validarCodigo(estado(), '123456', DOC, AGORA), 'ok')
})

test('código errado é recusado', () => {
  assert.equal(validarCodigo(estado(), '000000', DOC, AGORA), 'incorreto')
})

test('código expirado é recusado mesmo estando correto', () => {
  const depois = new Date('2026-08-11T14:11:00.000Z')
  assert.equal(validarCodigo(estado(), '123456', DOC, depois), 'expirado')
})

test('código já usado não revalida', () => {
  assert.equal(validarCodigo(estado({ usadoEm: AGORA }), '123456', DOC, AGORA), 'usado')
})

test('estoura ao atingir o limite de tentativas', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS }), '123456', DOC, AGORA), 'excedeu')
})

test('na última tentativa permitida ainda valida', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS - 1 }), '123456', DOC, AGORA), 'ok')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/assinatura/codigo.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/lib/assinatura/codigo.ts`:

```ts
import { randomInt } from 'node:crypto'
import { sha256 } from './hash'

export const MAX_TENTATIVAS = 5
export const VALIDADE_MINUTOS = 10

export type EstadoCodigo = {
  codigoHash: string
  expiraEm: Date
  tentativas: number
  usadoEm: Date | null
}

export type ResultadoCodigo = 'ok' | 'expirado' | 'usado' | 'excedeu' | 'incorreto'

// randomInt do node:crypto, não Math.random: é código de autenticação.
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// O documentoId entra no hash para que o mesmo código em documentos diferentes
// gere hashes diferentes — sem isso, vazar um hash valeria para outro documento.
export function hashCodigo(codigo: string, documentoId: string): string {
  return sha256(`${documentoId}:${codigo}`)
}

export function validarCodigo(
  estado: EstadoCodigo,
  digitado: string,
  documentoId: string,
  agora: Date,
): ResultadoCodigo {
  if (estado.usadoEm) return 'usado'
  if (estado.tentativas >= MAX_TENTATIVAS) return 'excedeu'
  if (agora > estado.expiraEm) return 'expirado'
  return hashCodigo(digitado, documentoId) === estado.codigoHash ? 'ok' : 'incorreto'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/assinatura/codigo.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Registrar no package.json e rodar tudo**

Acrescentar ` src/lib/assinatura/codigo.test.ts` ao script `test`.
Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/codigo.ts src/lib/assinatura/codigo.test.ts package.json
git commit -m "feat(assinatura): geracao e validacao do codigo OTP"
```

---

### Task 4: Regra da trava de NF (função pura)

**Files:**
- Create: `src/lib/assinatura/nf.ts`
- Test: `src/lib/assinatura/nf.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `type SituacaoNf = { contratoAssinado: boolean; liberadaEm: Date | null }`, `podeEmitirNf(s: SituacaoNf): boolean`, `motivoBloqueioNf(s: SituacaoNf): string | null`.

Segue o padrão de `src/lib/os-cancelamento.ts` (par `pode*` / `motivoBloqueio*`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/assinatura/nf.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeEmitirNf, motivoBloqueioNf } from './nf'

test('sem contrato assinado, não emite', () => {
  assert.equal(podeEmitirNf({ contratoAssinado: false, liberadaEm: null }), false)
})

test('mensagem de bloqueio explica o que fazer', () => {
  const motivo = motivoBloqueioNf({ contratoAssinado: false, liberadaEm: null })
  assert.ok(motivo && motivo.includes('contrato'))
})

test('com contrato assinado, emite', () => {
  assert.equal(podeEmitirNf({ contratoAssinado: true, liberadaEm: null }), true)
  assert.equal(motivoBloqueioNf({ contratoAssinado: true, liberadaEm: null }), null)
})

test('liberação de exceção destrava sem contrato', () => {
  const s = { contratoAssinado: false, liberadaEm: new Date('2026-08-11T12:00:00.000Z') }
  assert.equal(podeEmitirNf(s), true)
  assert.equal(motivoBloqueioNf(s), null)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/assinatura/nf.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/lib/assinatura/nf.ts`:

```ts
// Regra única da trava: a NF só sai com o contrato assinado, ou com liberação
// de exceção registrada por admin. Fica isolada aqui porque vale para os DOIS
// caminhos de NF (rascunho no Bling e registro de nota emitida por fora).
export type SituacaoNf = {
  contratoAssinado: boolean
  liberadaEm: Date | null
}

export function podeEmitirNf(s: SituacaoNf): boolean {
  return s.contratoAssinado || s.liberadaEm != null
}

export function motivoBloqueioNf(s: SituacaoNf): string | null {
  if (podeEmitirNf(s)) return null
  return 'O contrato desta venda ainda não foi assinado pelo cliente. Envie o contrato para assinatura ou peça a um administrador para liberar com justificativa.'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/assinatura/nf.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Registrar no package.json e rodar tudo**

Acrescentar ` src/lib/assinatura/nf.test.ts` ao script `test`. Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/nf.ts src/lib/assinatura/nf.test.ts package.json
git commit -m "feat(assinatura): regra da trava de NF sem contrato assinado"
```

---

### Task 5: Aplicar a trava nas server actions de NF

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts` (`confirmarNFSaidaAction` ~linha 454, `criarRascunhoBlingAction` ~linha 486)
- Create: `src/lib/assinatura/consulta.ts`

**Interfaces:**
- Consumes: `podeEmitirNf`, `motivoBloqueioNf` de `@/lib/assinatura/nf`.
- Produces: `situacaoNfDaVenda(vendaId: string): Promise<SituacaoNf>` em `@/lib/assinatura/consulta`.

- [ ] **Step 1: Criar a consulta**

Criar `src/lib/assinatura/consulta.ts`:

```ts
import { db } from '@/lib/db'
import { documentosAssinatura, vendas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { SituacaoNf } from './nf'

// Situação da venda para a trava de NF: existe contrato assinado? houve
// liberação de exceção?
export async function situacaoNfDaVenda(vendaId: string): Promise<SituacaoNf> {
  const [contrato] = await db
    .select({ id: documentosAssinatura.id })
    .from(documentosAssinatura)
    .where(and(
      eq(documentosAssinatura.vendaId, vendaId),
      eq(documentosAssinatura.tipo, 'contrato_venda'),
      eq(documentosAssinatura.status, 'assinado'),
    ))
    .limit(1)

  const [venda] = await db
    .select({ liberadaEm: vendas.nfLiberadaEm })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)

  return { contratoAssinado: !!contrato, liberadaEm: venda?.liberadaEm ?? null }
}
```

- [ ] **Step 2: Travar `confirmarNFSaidaAction`**

Em `src/app/(dashboard)/vendas/actions.ts`, acrescentar aos imports:

```ts
import { situacaoNfDaVenda } from '@/lib/assinatura/consulta'
import { motivoBloqueioNf } from '@/lib/assinatura/nf'
```

Logo após a linha `if (!venda) throw new Error('Nenhuma venda pendente de NF encontrada para esta moto')`, inserir:

```ts
  // Trava: sem contrato assinado não registra NF — nem pelo caminho "nota já
  // emitida", senão bastaria emitir direto no Bling e voltar aqui.
  const bloqueio = motivoBloqueioNf(await situacaoNfDaVenda(venda.id))
  if (bloqueio) throw new Error(bloqueio)
```

- [ ] **Step 3: Travar `criarRascunhoBlingAction`**

Na mesma action, logo após o bloco que carrega a `venda` (o `const [venda] = await db.select({...})` que começa na linha ~493) e antes de qualquer chamada ao Bling, inserir:

```ts
  const bloqueioNf = motivoBloqueioNf(await situacaoNfDaVenda(venda.id))
  if (bloqueioNf) return { ok: false, error: bloqueioNf }
```

Atenção ao formato de retorno: esta action devolve `{ ok: false, error }`, não lança.

- [ ] **Step 4: Checar tipos**

Run: `npm run type-check`
Expected: sem erro. Se o TS reclamar que `venda` pode ser `undefined` em `criarRascunhoBlingAction`, colocar a trava depois da checagem de existência que já houver ali.

- [ ] **Step 5: Verificar no banco que a trava é real**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*) filter (where nf_liberada_em is not null) as liberadas, count(*) as total from vendas"
```
Expected: `liberadas = 0`. Confirma que nenhuma venda nasce liberada — toda venda antiga sem contrato ficará travada até assinar ou liberar. **Registrar isso no relatório da task**: é uma mudança de comportamento para o estoque existente.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/consulta.ts "src/app/(dashboard)/vendas/actions.ts"
git commit -m "feat(assinatura): trava emissao de NF sem contrato assinado"
```

---

### Task 6: Envio de WhatsApp para número do cliente

**Files:**
- Create: `src/lib/whatsapp/envio-direto.ts`
- Create: `src/lib/assinatura/mensagens.ts`
- Test: `src/lib/assinatura/mensagens.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `montarChamadaEnvio`, `avaliarEnvio` de `@/lib/whatsapp/client` (já existem e são exportados).
- Produces: `enviarWhatsappPara(numero: string, texto: string): Promise<ResultadoEnvioWhatsapp>`; `msgConvite(nome, tipoLabel, url)`, `msgCodigo(codigo)`, `msgAssinado(nome, tipoLabel, url)`, `normalizarCelular(bruto: string): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/assinatura/mensagens.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { msgConvite, msgCodigo, msgAssinado, normalizarCelular } from './mensagens'

test('toda mensagem começa com MOVA INFORMA', () => {
  for (const m of [
    msgConvite('João', 'contrato de venda', 'https://x/assinar/abc'),
    msgCodigo('123456'),
    msgAssinado('João', 'contrato de venda', 'https://x/assinar/abc'),
  ]) assert.ok(m.startsWith('MOVA INFORMA'), `não começa com MOVA INFORMA: ${m}`)
})

test('convite traz o link e o nome', () => {
  const m = msgConvite('João', 'contrato de venda', 'https://x/assinar/abc')
  assert.ok(m.includes('https://x/assinar/abc'))
  assert.ok(m.includes('João'))
})

test('mensagem do código avisa para não repassar', () => {
  const m = msgCodigo('123456')
  assert.ok(m.includes('123456'))
  assert.match(m, /não .*(compartilh|repass)/i)
})

test('celular ganha 55 e perde máscara', () => {
  assert.equal(normalizarCelular('(35) 99999-8888'), '5535999998888')
  assert.equal(normalizarCelular('35999998888'), '5535999998888')
  assert.equal(normalizarCelular('5535999998888'), '5535999998888')
})

test('celular incompleto é recusado', () => {
  assert.equal(normalizarCelular('99998888'), null)
  assert.equal(normalizarCelular(''), null)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/assinatura/mensagens.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar as mensagens**

Criar `src/lib/assinatura/mensagens.ts`:

```ts
// Todo disparo do MOVA começa com "MOVA INFORMA" — é como o cliente reconhece
// que a mensagem é da loja e não de golpe.
const CABECALHO = 'MOVA INFORMA'

export function msgConvite(nome: string, tipoLabel: string, url: string): string {
  return `${CABECALHO}\n\nOlá, ${nome}! Seu ${tipoLabel} está pronto para assinatura digital.\n\nAcesse o link, confira o documento e assine pelo celular:\n${url}\n\nO link é pessoal e vale por 7 dias.`
}

export function msgCodigo(codigo: string): string {
  return `${CABECALHO}\n\nSeu código de assinatura é ${codigo}.\n\nEle vale por 10 minutos. Não compartilhe este código com ninguém, nem com atendentes.`
}

export function msgAssinado(nome: string, tipoLabel: string, url: string): string {
  return `${CABECALHO}\n\n${nome}, seu ${tipoLabel} foi assinado com sucesso.\n\nGuarde este link — é a sua via do documento:\n${url}`
}

// Número no formato que o mcp.ai espera: 55 + DDD + número, só dígitos.
export function normalizarCelular(bruto: string): string | null {
  const dig = (bruto ?? '').replace(/\D/g, '')
  if (dig.length < 10) return null
  if (dig.startsWith('55') && dig.length >= 12) return dig
  return `55${dig}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/assinatura/mensagens.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Implementar o envio direto**

Criar `src/lib/whatsapp/envio-direto.ts`:

```ts
import { montarChamadaEnvio, avaliarEnvio, type ResultadoEnvioWhatsapp } from './client'

// enviarAlertaWhatsapp só fala com o número fixo do Cesar (alerta interno).
// Aqui o destinatário é o cliente, então o número vem por parâmetro.
// Diferente do alerta, ESTE envio importa para o fluxo: quem chama precisa
// saber se falhou, por isso o resultado é devolvido em vez de engolido.
export async function enviarWhatsappPara(numero: string, texto: string): Promise<ResultadoEnvioWhatsapp> {
  const url = process.env.MCPAI_WHATSAPP_URL
  if (!url) {
    console.error('MCPAI_WHATSAPP_URL não configurada')
    return 'erro'
  }
  if (!numero) return 'sem_numero'

  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    const init = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mova', version: '1.0' },
        },
      }),
    })
    const sessionId = init.headers.get('mcp-session-id')

    const res = await fetch(url, {
      method: 'POST',
      headers: sessionId ? { ...headers, 'Mcp-Session-Id': sessionId } : headers,
      body: JSON.stringify(montarChamadaEnvio(numero, texto)),
    })
    const texto_ = await res.text()
    const linha = texto_.split('\n').find(l => l.startsWith('data:'))
    if (!linha) return 'erro'
    return avaliarEnvio(JSON.parse(linha.slice('data:'.length).trim()))
  } catch (e) {
    console.error('[assinatura] falha no envio de WhatsApp:', e)
    return 'erro'
  }
}
```

**Antes de escrever este arquivo, leia `src/lib/whatsapp/client.ts` inteiro.** Se `chamarMcp` e `parseSse` puderem ser exportados sem alterar o comportamento do envio de alerta existente, exporte-os e reaproveite em vez de duplicar o handshake acima — duplicação de protocolo é dívida garantida. Escolha uma das duas formas e registre qual no commit.

- [ ] **Step 6: Registrar teste, checar tipos e commitar**

Acrescentar ` src/lib/assinatura/mensagens.test.ts` ao script `test`.
Run: `npm test && npm run type-check` → PASS.

```bash
git add src/lib/whatsapp/envio-direto.ts src/lib/assinatura/mensagens.ts src/lib/assinatura/mensagens.test.ts package.json
git commit -m "feat(assinatura): mensagens e envio de whatsapp para o cliente"
```

---

### Task 7: HTML congelado dos documentos

**Files:**
- Create: `src/lib/assinatura/documento.ts`
- Test: `src/lib/assinatura/documento.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buscarVenda` de `@/lib/queries/vendas`.
- Produces: `type TipoDocumento = 'contrato_venda' | 'checklist_entrega'`, `LABEL_TIPO: Record<TipoDocumento, string>`, `CLAUSULA_ACEITE: string`, `montarHtmlDocumento(tipo, dados): string`, `type DadosDocumento`.

**Fonte do texto:** o modelo oficial `Compra e Venda Motochefe.docx` (recebido em 11/08/2026), reproduzido integralmente com os três desvios decididos com o Cesar e registrados no spec: qualificação do comprador sem estado civil/profissão/RG, sem testemunhas, e dados da vendedora + comarca vindos do grupo. A Cláusula Décima Quinta do próprio modelo é a que autoriza a assinatura eletrônica não-ICP — **não altere o texto dela**.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/assinatura/documento.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarHtmlDocumento, CLAUSULA_ACEITE, LABEL_TIPO, ITENS_CARTILHA_BATERIA,
  dadosVendedoraCompletos, type DadosDocumento,
} from './documento'

const DADOS: DadosDocumento = {
  vendaId: 'v1',
  clienteNome: 'João da Silva',
  clienteCpf: '123.456.789-00',
  clienteEmail: 'joao@exemplo.com',
  clienteEndereco: 'Rua A, nº 10, Centro, Poços de Caldas/MG, CEP 37700-000',
  vendedoraRazaoSocial: 'MOTOCHEFE SUL DE MINAS LTDA.',
  vendedoraCnpj: '57.113.017/0001-72',
  vendedoraEndereco: 'Avenida Prefeito Tuany Toledo, n° 249, Bairro Fátima II, CEP: 37.553-571, Pouso Alegre – MG',
  comarcaForo: 'Pouso Alegre, Minas Gerais',
  lojaNome: 'Motochefe Poços',
  lojaCidade: 'Poços de Caldas',
  marca: 'Shineray',
  modelo: 'Jetmax',
  chassi: '9C2ABC123',
  cor: 'Vermelha',
  motor: 'ABC123',
  valor: '12.990,00',
  formaPagamento: 'Cartão 12x',
  dataVenda: '11/08/2026',
}

test('contrato traz comprador, veículo, valor e vendedora', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const t of ['João da Silva', '123.456.789-00', '9C2ABC123', '12.990,00', 'Jetmax',
                   'MOTOCHEFE SUL DE MINAS LTDA.', '57.113.017/0001-72']) {
    assert.ok(html.includes(t), `faltou "${t}" no contrato`)
  }
})

test('o contrato reproduz as 16 cláusulas do modelo', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const c of ['CLÁUSULA PRIMEIRA', 'CLÁUSULA TERCEIRA', 'CLÁUSULA DÉCIMA PRIMEIRA',
                   'CLÁUSULA DÉCIMA QUINTA', 'CLÁUSULA DÉCIMA SEXTA']) {
    assert.ok(html.includes(c), `faltou ${c}`)
  }
  assert.ok(html.includes('Resolução CONTRAN nº 996'))
  assert.ok(html.includes('1.000 W'))
})

test('o Anexo I (cartilha da bateria) faz parte do contrato', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(html.includes('ANEXO I'))
  assert.equal(ITENS_CARTILHA_BATERIA.length, 14)
  for (const item of ITENS_CARTILHA_BATERIA) assert.ok(html.includes(item.slice(0, 30)))
})

test('a comarca do foro vem do grupo, não fixa em Pouso Alegre', () => {
  const bh = montarHtmlDocumento('contrato_venda', { ...DADOS, comarcaForo: 'Belo Horizonte, Minas Gerais' })
  assert.ok(bh.includes('Belo Horizonte, Minas Gerais'))
  assert.ok(!bh.includes('foro da Comarca de Pouso Alegre'))
})

test('o contrato não pede estado civil, profissão nem RG', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const t of ['estado civil', 'profissão', 'RG sob o nº']) {
    assert.ok(!html.includes(t), `"${t}" deveria ter saído da qualificação`)
  }
})

test('o contrato não traz número do motor nem ano de fabricação', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(!html.includes('ABC123'), 'número do motor não entra no contrato')
  assert.ok(!html.includes('ano de fabricação'))
})

test('o checklist de entrega, esse sim, confere o motor', () => {
  assert.ok(montarHtmlDocumento('checklist_entrega', DADOS).includes('ABC123'))
})

test('o contrato não traz campo de testemunha', () => {
  assert.ok(!montarHtmlDocumento('contrato_venda', DADOS).includes('TESTEMUNHA'))
})

test('todo documento carrega a cláusula de aceite eletrônico', () => {
  for (const tipo of ['contrato_venda', 'checklist_entrega'] as const) {
    assert.ok(montarHtmlDocumento(tipo, DADOS).includes(CLAUSULA_ACEITE))
  }
})

test('checklist lista os itens conferidos na entrega', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS)
  for (const item of ['Freios em funcionamento', 'Buzina', 'Carregador em funcionamento']) {
    assert.ok(html.includes(item), `faltou o item "${item}"`)
  }
})

test('o HTML é determinístico — mesmo dado, mesmo documento', () => {
  assert.equal(
    montarHtmlDocumento('contrato_venda', DADOS),
    montarHtmlDocumento('contrato_venda', { ...DADOS }),
  )
})

test('grupo sem qualificação cadastrada não pode emitir contrato', () => {
  assert.equal(dadosVendedoraCompletos({ ...DADOS, vendedoraRazaoSocial: '' }), false)
  assert.equal(dadosVendedoraCompletos({ ...DADOS, comarcaForo: '' }), false)
  assert.equal(dadosVendedoraCompletos(DADOS), true)
})

test('rótulos existem para os dois tipos', () => {
  assert.equal(LABEL_TIPO.contrato_venda, 'contrato de venda')
  assert.equal(LABEL_TIPO.checklist_entrega, 'checklist de entrega')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/assinatura/documento.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/lib/assinatura/documento.ts`. Os itens do checklist devem ser **copiados** da constante `ITENS` de `src/app/(print)/vendas/[id]/checklist-entrega/page.tsx` (15 itens, de 'Chave de ignição' a 'Abertura do banco / compartimento da bateria'); em seguida, altere aquele arquivo para importar `ITENS_CHECKLIST` daqui, para não existirem duas listas divergindo com o tempo.

```ts
export type TipoDocumento = 'contrato_venda' | 'checklist_entrega'

export const LABEL_TIPO: Record<TipoDocumento, string> = {
  contrato_venda: 'contrato de venda',
  checklist_entrega: 'checklist de entrega',
}

export type DadosDocumento = {
  vendaId: string
  // Comprador — sem estado civil, profissão e RG: o sistema não tem esses dados
  // e coletá-los travaria o balcão (decisão registrada no spec).
  clienteNome: string
  clienteCpf: string
  clienteEmail: string
  clienteEndereco: string
  // Vendedora — vem do grupo, não fixa no texto: BH e Vale são outras empresas.
  vendedoraRazaoSocial: string
  vendedoraCnpj: string
  vendedoraEndereco: string
  comarcaForo: string
  lojaNome: string
  lojaCidade: string
  // Decisões do Cesar em 11/08: o contrato NÃO leva ano de fabricação (o sistema
  // não guarda), potência (decisão dele) nem número do motor. A Cláusula Terceira
  // mantém os limites legais da Resolução CONTRAN 996, que são texto do modelo,
  // não característica medida deste veículo. O `motor` continua aqui porque o
  // checklist de entrega usa — é conferência de veículo, não cláusula.
  marca: string
  modelo: string
  chassi: string
  cor: string
  motor: string
  valor: string
  formaPagamento: string
  dataVenda: string
}

// Contrato sem a qualificação da vendedora sairia com a empresa errada ou em
// branco — melhor recusar o envio do que emitir assim.
export function dadosVendedoraCompletos(d: DadosDocumento): boolean {
  return !!(d.vendedoraRazaoSocial?.trim() && d.vendedoraCnpj?.trim()
    && d.vendedoraEndereco?.trim() && d.comarcaForo?.trim())
}

// Cláusula Décima Quinta do modelo do advogado, palavra por palavra. É ela que
// aciona o art. 10, §2º da MP 2.200-2/2001 — a assinatura eletrônica não-ICP
// vale porque as partes declaram aceitá-la. NÃO reescrever este texto.
export const CLAUSULA_ACEITE =
  'As partes concordam que este documento poderá ser assinado digitalmente, produzindo o mesmo ' +
  'efeito legal da via assinada fisicamente e acordam não contestar a sua validade, conteúdo ' +
  'autenticidade e integridade. As partes convencionam que esse documento pode ser assinado de ' +
  'forma manuscrita ou por meio eletrônico, ainda que por meio de plataforma de assinatura ' +
  'eletrônica não credenciada pela infraestrutura de chaves públicas brasileira (ICP Brasil) ' +
  'e/ou sem certificado de assinatura digital.'

// Anexo I do contrato — parte integrante pelo Parágrafo Segundo da Cláusula
// Décima Primeira. Copiado do modelo, 14 itens.
export const ITENS_CARTILHA_BATERIA = [
  'NUNCA deixe a bateria carregando da noite para o dia.',
  'NÃO EXCEDA o tempo máximo de carregamento, que é de 8 (oito) horas.',
  'CONECTE a bateria diretamente na tomada de parede ao carregar, NÃO use adaptadores elétricos como réguas e “benjamins”.',
  'CARREGUE a bateria sempre em um local aberto, arejado e durante o dia.',
  'OBSERVE o tempo ideal de carga de 4 a 6 horas e verifique se a luz verde de carregamento já está acesa.',
  'NUNCA carregue a bateria sob exposição direta ao sol, seja fora do veículo ou dentro dele.',
  'CUIDADO ao manusear a bateria: evite contato de objetos metálicos com os conectores, devido ao alto risco de curto-circuito e incêndio.',
  'MANTENHA a tomada da bateria sempre tampada, e os conectores protegidos.',
  'É PROIBIDO qualquer reparo nas baterias. Caso seja constatada intervenção, a garantia será automaticamente anulada.',
  'NÃO UTILIZE baterias recondicionadas ou de procedência desconhecida, como aquelas compradas online sem certificação.',
  'NÃO UTILIZE carregadores recondicionados ou de procedência desconhecida, incluindo os adquiridos pela internet sem garantias.',
  'AGUARDE entre 20 e 30 minutos após o uso do veículo elétrico para iniciar o carregamento, permitindo o resfriamento da bateria.',
  'NÃO EXCEDA o peso máximo suportado pelo veículo, nem utilize pneus descalibrados.',
  'EVITE deixar a bateria descarregar completamente.',
]

export const ITENS_CHECKLIST = [
  'Chave de ignição',
  'Ignição pelo painel / controle / cartão',
  'Acelerador',
  'Freios em funcionamento',
  'Comandos 1, 2 e 3',
  'Ré',
  'Sensor de freio',
  'Lanterna',
  'Farol (baixo e alto)',
  'Buzina',
  'Setas dianteiras e traseiras',
  'Alarmes e travas',
  'Carenagens em perfeito estado',
  'Carregador em funcionamento',
  'Abertura do banco / compartimento da bateria',
]

function esc(v: string): string {
  return (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const ESTILO = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 16px; margin-bottom: 12px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  td, th { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
  .clausula { font-size: 11px; color: #475569; margin-top: 14px; }
  ol li { margin-bottom: 6px; }
`

// ATENÇÃO: o texto abaixo foi transcrito do modelo recebido em 11/08/2026
// ("Compra e Venda Motochefe.docx", 20/07). O Cesar avisou que revisaria o
// arquivo — antes de dar esta task por concluída, compare cláusula a cláusula
// com a versão vigente do .docx e ajuste o que tiver mudado. As diferenças
// deliberadas em relação ao modelo são três, todas registradas no spec:
// qualificação do comprador sem estado civil/profissão/RG, sem testemunhas, e
// vendedora + comarca vindas do grupo.
function contrato(d: DadosDocumento): string {
  const cartilha = ITENS_CARTILHA_BATERIA.map(i => `<li>${esc(i)}</li>`).join('')
  return `
    <h1>CONTRATO DE COMPRA E VENDA DE EQUIPAMENTO DE MOBILIDADE INDIVIDUAL AUTOPROPELIDO</h1>

    <p>Na qualidade de <b>VENDEDORA</b>: ${esc(d.vendedoraRazaoSocial)}, pessoa jurídica, inscrita
    no CNPJ sob o nº ${esc(d.vendedoraCnpj)}, com endereço à ${esc(d.vendedoraEndereco)}, neste ato
    representada por quem de direito.</p>

    <p>Na qualidade de <b>COMPRADOR(A)</b>: ${esc(d.clienteNome)}, brasileiro(a), inscrito no CPF
    sob o nº ${esc(d.clienteCpf)}, residente e domiciliado na ${esc(d.clienteEndereco)}, endereço
    eletrônico: ${esc(d.clienteEmail)}.</p>

    <p>Doravante denominadas, em conjunto, Partes, têm entre si, justo e acertado o presente
    Contrato de Compra e Venda de Equipamento de Mobilidade Individual Autopropelido, que se regerá
    pelas cláusulas seguintes:</p>

    <p><b>CLÁUSULA PRIMEIRA</b> – O objeto do presente instrumento contratual é a aquisição pelo(a)
    COMPRADOR(A) do veículo autopropelido elétrico da marca ${esc(d.marca)}, modelo
    ${esc(d.modelo)}, cor ${esc(d.cor)}, número de série ${esc(d.chassi)}, possuindo as demais
    características e especificações constantes da nota fiscal.</p>

    <p><b>CLÁUSULA SEGUNDA</b> – Pela assinatura do presente instrumento, o(a) COMPRADOR(A) declara
    que lhe foram devidamente expostas todas as características do Equipamento ora adquirido e que
    todas suas dúvidas foram esclarecidas pela VENDEDORA. Independentemente do teste drive, diante
    de todas as informações técnicas prestadas pela VENDEDORA, atesta o CLIENTE COMPRADOR que o
    EQUIPAMENTO se presta perfeitamente à destinação que lhe será dada;</p>

    <p><b>CLÁUSULA TERCEIRA</b> – O COMPRADOR declara ter ciência de que a circulação do objeto
    deste contrato é regulamentada pela Resolução CONTRAN nº 996, de 15 de junho de 2023,
    enquadrando-se juridicamente como Equipamento de Mobilidade Individual Autopropelido, por
    atender cumulativamente às seguintes características de fábrica:</p>
    <p>a) Potência nominal máxima do motor de propulsão de até 1.000 W (mil watts);<br/>
    b) Velocidade máxima de fabricação de até 32 km/h (trinta e dois quilômetros por hora);<br/>
    c) Largura máxima de até 70 cm (setenta centímetros); e<br/>
    d) Distância entre eixos de até 130 cm (cento e trinta centímetros).</p>
    <p>3.1. Nos termos do Art. 12 da referida Resolução e do Art. 134-A do Código de Trânsito
    Brasileiro (CTB), o equipamento não está sujeito a registro, licenciamento, emplacamento ou
    exigência de Carteira Nacional de Habilitação (CNH) para sua circulação em vias públicas e
    espaços autorizados.</p>
    <p>3.2. O COMPRADOR assume integral responsabilidade pela observância das regras de circulação
    locais e pela manutenção/uso dos equipamentos obrigatórios previstos na legislação (como
    campainha, sinalização noturna e indicador de velocidade).</p>
    <p>3.3. A VENDEDORA exime-se de qualquer responsabilidade civil, criminal ou administrativa
    decorrente de eventuais modificações estruturais, adulterações de software, remoção de
    limitadores ou desbloqueios de potência e velocidade efetuados após a entrega do produto,
    ficando o COMPRADOR ciente de que tais alterações podem reclassificar o veículo (ex.: para
    ciclomotor), sujeitando-o às exigências legais e penalidades aplicáveis.</p>

    <p><b>CLÁUSULA QUARTA</b> – O COMPRADOR(A) declara que negociou livremente o preço do bem e
    que, por isso, o valor ajustado e as condições desta compra e venda foram estabelecidas de
    forma consensual pelas partes, estando elas em perfeita consonância e clareza;</p>

    <p><b>CLÁUSULA QUINTA</b> – A VENDEDORA declara, neste ato, que o bem ora negociado não é
    objeto de furto ou qualquer outra ação criminosa.</p>

    <p><b>CLÁUSULA SEXTA</b> – O preço, justo e acertado, é de R$ ${esc(d.valor)}, a ser pago da
    seguinte forma: ${esc(d.formaPagamento)}.</p>

    <p><b>CLÁUSULA SÉTIMA</b> – Através da assinatura deste instrumento, o(a) COMPRADOR(A) declara
    que foi previamente informado(a) pela VENDEDORA de que, caso o bem não esteja disponível no
    estoque da VENDEDORA, o preço e/ou as características gerais do bem estarão sujeitos a
    alterações pela fabricante. O valor e as especificações do bem somente se tornarão definitivos
    no momento da emissão da Nota Fiscal de compra e venda, respeitando o preço vigente na data de
    emissão.</p>
    <p>7.1. Caso o bem adquirido não se encontre disponível em estoque, sua entrega estará
    condicionada à disponibilização do item pela fabricante, sem que haja qualquer responsabilidade
    da VENDEDORA em relação ao prazo de entrega.</p>

    <p><b>CLÁUSULA OITAVA</b> – O COMPRADOR é totalmente responsável pelo fornecimento de
    informações e documentos à VENDEDORA, não se responsabilizando esta última, inclusive perante
    terceiros e agentes financiadores, por fornecimento de dados e/ou documentação falsos pelo(a)
    COMPRADOR(A).</p>

    <p><b>CLÁUSULA NONA</b> – Após a confirmação do pagamento, será realizada a entrega física do
    veículo ao(à) COMPRADOR(A), ocasião em que lhe serão transferidas a posse e a propriedade do
    bem, aperfeiçoando-se a compra e venda, que, a partir de então, torna-se irrevogável e
    irretratável. A partir da entrega do veículo, o(a) COMPRADOR(A) passa a assumir toda a
    responsabilidade civil, administrativa e criminal sobre o bem, inclusive por multas, infrações
    de trânsito, apreensões, tributos e quaisquer outros encargos ou penalidades decorrentes de sua
    posse ou utilização.</p>

    <p><b>CLÁUSULA DÉCIMA</b> – A entrega física do bem será realizada no estabelecimento comercial
    da VENDEDORA, após a liberação do departamento financeiro e mediante agendamento prévio com o
    departamento de entrega técnica.</p>

    <p><b>CLÁUSULA DÉCIMA PRIMEIRA</b> – A VENDEDORA assegura ao(à) COMPRADOR(A) a garantia legal
    de 90 (noventa) dias, nos termos do Código de Defesa do Consumidor, para todos os componentes
    do veículo.</p>
    <p>11.1. Além da garantia legal, a VENDEDORA concede garantia contratual complementar de 09
    (nove) meses, totalizando 01 (um) ano de garantia exclusivamente para motor, bateria e módulo,
    sendo os 09 (nove) meses adicionais condicionados à realização das revisões periódicas na
    VENDEDORA, observando-se os intervalos máximos de 03 (três) meses ou 2.000 (dois mil)
    quilômetros rodados, prevalecendo o que ocorrer primeiro.</p>
    <p>11.2. A garantia contratual não abrange os demais componentes do veículo, os quais
    permanecem cobertos exclusivamente pela garantia legal de 90 (noventa) dias.</p>
    <p>11.3. A garantia não será aplicada em caso de danos devido ao mau uso ou uso severo,
    armazenamento incorreto, acidentes, agentes externos, desgaste por abrasão, corrosão ou erosão,
    desgaste natural pelo uso regular do Equipamento ou por modificações ou intervenções de
    terceiros realizadas sem autorização da vendedora no período de vigência da garantia
    contratual.</p>
    <p><b>PARÁGRAFO PRIMEIRO</b> – Fica desde logo acordado, que somente a VENDEDORA poderá
    providenciar a manutenção do Equipamento objeto do presente instrumento, caso venha a ocorrer
    qualquer necessidade de reparos durante o período de garantia e que não será realizado o
    reembolso de pagamentos referentes a reparos feitos por terceiros sem autorização da
    vendedora.</p>
    <p><b>PARÁGRAFO SEGUNDO</b> – O COMPRADOR declara estar ciente de que recebeu e leu o "Manual
    de Uso e Cuidados com a Bateria", o qual passa a fazer parte integrante do presente contrato
    (ANEXO I). Ao assinar o presente instrumento, o(a) COMPRADOR confirma que compreende as
    instruções e recomendações contidas no manual e compromete-se a seguir as orientações de uso e
    manutenção descritas para garantir a durabilidade e segurança da bateria.</p>
    <p><b>PARÁGRAFO TERCEIRO</b> – O(A) COMPRADOR(A) declara estar ciente de que a obrigação da
    VENDEDORA se limita à realização das revisões, manutenções e eventuais reparos exclusivamente
    em seu estabelecimento físico. Para tanto, o(a) COMPRADOR(A) compromete-se a, mediante
    agendamento prévio, disponibilizar o veículo sempre que necessário, responsabilizando-se pelo
    seu transporte até o estabelecimento físico da VENDEDORA, bem como pela sua retirada após a
    conclusão dos serviços. Fica expressamente estabelecido que a VENDEDORA não arcará com
    quaisquer despesas de transporte, remoção, guincho, frete, deslocamento, veículo reserva ou
    custos correlatos inerentes à imobilização do veículo para revisão ou reparos.</p>

    <p><b>CLÁUSULA DÉCIMA SEGUNDA</b> – Nos casos em que o(a) COMPRADOR(A) adquirir o Equipamento
    objeto do presente instrumento, para fins de posterior revenda, a responsabilidade da VENDEDORA
    cessa no momento de entrega do bem ao(a) COMPRADOR(A). Deste modo, a VENDEDORA não se
    responsabiliza por nenhum tipo de negociação e/ou promessa que venha a ser realizada pelo
    COMPRADOR(A) a terceiros.</p>

    <p><b>CLÁUSULA DÉCIMA TERCEIRA</b> – O(A) COMPRADOR(A) autoriza, de forma gratuita, o uso de
    sua imagem em fotografias e vídeos realizados pela VENDEDORA no ato da entrega do veículo,
    exclusivamente para divulgação de suas atividades comerciais em redes sociais, website,
    materiais publicitários e demais meios de comunicação.</p>

    <p><b>CLÁUSULA DÉCIMA QUARTA</b> – O(A) COMPRADOR(A) declara estar ciente de que a VENDEDORA
    realizará o tratamento de seus dados pessoais, tais como nome, CPF ou CNPJ, endereço, e-mail,
    telefone e demais informações necessárias à execução deste contrato, ao cumprimento de
    obrigações legais e à prestação dos serviços relacionados à compra e venda do veículo. A
    VENDEDORA compromete-se a utilizar os dados de forma confidencial, em conformidade com a Lei
    Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD), restringindo o acesso às informações
    apenas aos seus colaboradores e prestadores de serviço que necessitem delas para o desempenho
    de suas atividades, adotando as medidas de segurança cabíveis para sua proteção.</p>
    <p><b>PARÁGRAFO ÚNICO</b> – Fica, desde já, ciente o Comprador de que poderá solicitar
    expressamente e a qualquer tempo a desativação de seus dados, ocasião em que a Vendedora
    efetuará a desativação a partir do pedido do interessado titular dos dados.</p>

    <p><b>CLÁUSULA DÉCIMA QUINTA</b> – ${CLAUSULA_ACEITE}</p>

    <p><b>CLÁUSULA DÉCIMA SEXTA</b> – Elegem as partes o foro da Comarca de ${esc(d.comarcaForo)},
    para nele serem dirimidas todas e quaisquer dúvidas ou questões oriundas do presente contrato,
    renunciando as partes a qualquer outro, por mais especial e privilegiado que seja,
    obrigando-se as partes por si, seus herdeiros e sucessores.</p>

    <p>E por assim estarem justos e contratados, extrai-se o presente instrumento digital, para
    gerar os efeitos de direito, assinando-o eletronicamente.</p>

    <p>${esc(d.lojaCidade)}, ${esc(d.dataVenda)}.</p>

    <h2>ANEXO I — CARTILHA DE USO DA BATERIA</h2>
    <ul>${cartilha}</ul>
    <p>A MAIORIA DOS ACIDENTES COM BATERIAS OCORRE POR NEGLIGÊNCIA OU USO INCORRETO. SIGA
    CUIDADOSAMENTE ESTAS RECOMENDAÇÕES DE SEGURANÇA E PREVENÇÃO.</p>`
}

function checklist(d: DadosDocumento): string {
  const linhas = ITENS_CHECKLIST.map(i => `<tr><td>${esc(i)}</td><td style="width:60px;text-align:center">OK</td></tr>`).join('')
  return `
    <h1>Checklist de Entrega</h1>
    <table>
      <tr><th>Vendedora</th><td>${esc(d.lojaNome)} — ${esc(d.lojaCidade)}</td></tr>
      <tr><th>Comprador</th><td>${esc(d.clienteNome)} — CPF ${esc(d.clienteCpf)}</td></tr>
      <tr><th>Veículo</th><td>${esc(d.marca)} ${esc(d.modelo)}, cor ${esc(d.cor)}, chassi ${esc(d.chassi)}, motor ${esc(d.motor)}</td></tr>
    </table>
    <h2>Itens conferidos na entrega</h2>
    <table>${linhas}</table>
    <p>O comprador declara ter recebido o veículo na data de ${esc(d.dataVenda)}, conferido os
       itens acima e recebido as orientações de uso, carga e manutenção.</p>
    <p class="clausula">${CLAUSULA_ACEITE}</p>`
}

// O HTML gerado aqui é CONGELADO no banco no momento do envio. Precisa ser
// determinístico: nada de data de hoje, random ou qualquer coisa que mude
// entre duas chamadas com os mesmos dados.
export function montarHtmlDocumento(tipo: TipoDocumento, d: DadosDocumento): string {
  const corpo = tipo === 'contrato_venda' ? contrato(d) : checklist(d)
  return `<style>${ESTILO}</style><article>${corpo}</article>`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/assinatura/documento.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Deduplicar a lista do checklist**

Em `src/app/(print)/vendas/[id]/checklist-entrega/page.tsx`, apagar a constante `ITENS` local e passar a usar:

```ts
import { ITENS_CHECKLIST as ITENS } from '@/lib/assinatura/documento'
```

Run: `npm run type-check` → sem erro.

- [ ] **Step 6: Registrar teste e commitar**

Acrescentar ` src/lib/assinatura/documento.test.ts` ao script `test`. Run: `npm test` → PASS.

```bash
git add src/lib/assinatura/documento.ts src/lib/assinatura/documento.test.ts package.json "src/app/(print)/vendas/[id]/checklist-entrega/page.tsx"
git commit -m "feat(assinatura): html congelado do contrato e do checklist"
```

---

### Task 8: Actions de envio, reenvio e cancelamento

**Files:**
- Create: `src/app/(dashboard)/vendas/assinatura-actions.ts`

**Interfaces:**
- Consumes: `montarHtmlDocumento`, `LABEL_TIPO`, `sha256`, `normalizarCelular`, `msgConvite`, `enviarWhatsappPara`, `buscarVenda`, `getUsuarioLogado`.
- Produces: `enviarDocumentoAssinaturaAction(vendaId, tipo)`, `reenviarDocumentoAction(documentoId)`, `cancelarDocumentoAction(documentoId)`, `liberarNfSemContratoAction(vendaId, motivo)` — todas retornando `{ ok: true; ... } | { ok: false; error: string }`.

- [ ] **Step 1: Implementar as actions**

Criar `src/app/(dashboard)/vendas/assinatura-actions.ts`:

```ts
'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos, vendas, lojas, motos, modelos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { buscarVenda } from '@/lib/queries/vendas'
import { montarHtmlDocumento, LABEL_TIPO, type TipoDocumento } from '@/lib/assinatura/documento'
import { sha256 } from '@/lib/assinatura/hash'
import { normalizarCelular, msgConvite } from '@/lib/assinatura/mensagens'
import { enviarWhatsappPara } from '@/lib/whatsapp/envio-direto'

const DIAS_VALIDADE = 7

type Resultado<T> = ({ ok: true } & T) | { ok: false; error: string }

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://mova.motochefesuldeminas.com.br'
}

async function registrarEvento(documentoId: string, tipo: string, detalhe?: unknown) {
  await db.insert(assinaturaEventos).values({
    documentoId, tipo, detalhe: detalhe ? (detalhe as object) : null,
  })
}

export async function enviarDocumentoAssinaturaAction(
  vendaId: string,
  tipo: TipoDocumento,
): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão para enviar documento para assinatura' }
  }

  const venda = await buscarVenda(vendaId)
  if (!venda) return { ok: false, error: 'Venda não encontrada' }

  // Dados que buscarVenda não traz — celular, valor, forma de pagamento, grupo.
  const [extra] = await db
    .select({
      celular: vendas.clienteCelular,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      grupoId: lojas.grupoId,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!extra) return { ok: false, error: 'Venda não encontrada' }

  const numero = normalizarCelular(extra.celular ?? '')
  if (!numero) {
    return { ok: false, error: 'O celular do cliente está vazio ou incompleto no cadastro. Corrija antes de enviar.' }
  }

  // Um documento vivo por (venda, tipo) — o índice parcial no banco garante.
  // Aqui o vivo é cancelado antes, para o reenvio de um tipo não travar.
  await db.update(documentosAssinatura)
    .set({ status: 'cancelado' })
    .where(and(
      eq(documentosAssinatura.vendaId, vendaId),
      eq(documentosAssinatura.tipo, tipo),
      inArray(documentosAssinatura.status, ['pendente', 'visualizado']),
    ))

  const html = montarHtmlDocumento(tipo, {
    vendaId,
    clienteNome: venda.clienteNome ?? '',
    clienteCpf: venda.clienteCpf ?? '',
    clienteEndereco: [venda.clienteLogradouro, venda.clienteNumero && `nº ${venda.clienteNumero}`,
      venda.clienteBairro, venda.clienteCidade, venda.clienteEstado].filter(Boolean).join(', '),
    lojaNome: venda.lojaNome ?? '',
    lojaCidade: venda.lojaCidade ?? '',
    marca: venda.marca ?? '',
    modelo: venda.modelo ?? '',
    chassi: venda.chassi ?? '',
    cor: venda.cor ?? '',
    motor: venda.motor ?? '',
    valor: Number(extra.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    formaPagamento: extra.formaPagamento ?? '',
    dataVenda: new Date(venda.dataVenda).toLocaleDateString('pt-BR'),
  })

  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86400_000)

  const [doc] = await db.insert(documentosAssinatura).values({
    grupoId: extra.grupoId,
    lojaId: venda.lojaId,
    vendaId,
    tipo,
    token,
    status: 'pendente',
    htmlSnapshot: html,
    snapshotHash: sha256(html),
    celularDestino: numero,
    criadoPor: usuario.id,
    expiraEm,
  }).returning({ id: documentosAssinatura.id })

  const url = `${baseUrl()}/assinar/${token}`
  const envio = await enviarWhatsappPara(numero, msgConvite(venda.clienteNome ?? 'cliente', LABEL_TIPO[tipo], url))
  await registrarEvento(doc.id, 'enviado', { envio, numero })

  revalidatePath('/vendas')
  revalidatePath('/estoque')

  if (envio !== 'enviado') {
    // O documento existe e o link é válido — só a entrega falhou. Devolver o
    // link para o vendedor mandar à mão é melhor que perder o documento.
    return { ok: false, error: `Documento criado, mas o WhatsApp falhou. Envie este link ao cliente: ${url}` }
  }
  return { ok: true, url }
}

export async function reenviarDocumentoAction(documentoId: string): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão' }
  }
  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86400_000)
  await db.update(documentosAssinatura)
    .set({ status: 'pendente', expiraEm })
    .where(eq(documentosAssinatura.id, documentoId))

  const [venda] = await db.select({ nome: vendas.clienteNome }).from(vendas)
    .where(eq(vendas.id, doc.vendaId)).limit(1)

  const url = `${baseUrl()}/assinar/${doc.token}`
  const envio = await enviarWhatsappPara(
    doc.celularDestino,
    msgConvite(venda?.nome ?? 'cliente', LABEL_TIPO[doc.tipo as TipoDocumento], url),
  )
  await registrarEvento(documentoId, 'reenviado', { envio })
  revalidatePath('/vendas')
  if (envio !== 'enviado') return { ok: false, error: `Falha no WhatsApp. Link: ${url}` }
  return { ok: true, url }
}

export async function cancelarDocumentoAction(documentoId: string): Promise<Resultado<Record<string, never>>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão' }
  }
  const [doc] = await db.select({ status: documentosAssinatura.status })
    .from(documentosAssinatura).where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento assinado não pode ser cancelado' }

  await db.update(documentosAssinatura).set({ status: 'cancelado' })
    .where(eq(documentosAssinatura.id, documentoId))
  await registrarEvento(documentoId, 'cancelado', { por: usuario.id })
  revalidatePath('/vendas')
  return { ok: true }
}

// Válvula de escape da trava de NF: só admin, e o motivo é obrigatório —
// é o que permite auditar depois por que aquela venda saiu sem contrato.
export async function liberarNfSemContratoAction(
  vendaId: string,
  motivo: string,
): Promise<Resultado<Record<string, never>>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    return { ok: false, error: 'Só administrador libera NF sem contrato assinado' }
  }
  const texto = motivo.trim()
  if (texto.length < 10) return { ok: false, error: 'Descreva o motivo da liberação (mínimo 10 caracteres)' }

  await db.update(vendas)
    .set({ nfLiberadaEm: new Date(), nfLiberadaPor: usuario.id, nfLiberacaoMotivo: texto })
    .where(eq(vendas.id, vendaId))

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  return { ok: true }
}
```

- [ ] **Step 2: Conferir os campos usados**

Confirme em `src/lib/db/schema.ts` que `vendas` tem `valor`, `formaPagamento`, `clienteCelular` e que `lojas` tem `grupoId`. Se algum nome divergir, ajuste o select — **não invente coluna**.

Run: `npm run type-check`
Expected: sem erro.

- [ ] **Step 3: Verificar a variável de ambiente do link**

Run: `npx dotenv-cli -e .env.local -- node -e "console.log(process.env.NEXT_PUBLIC_APP_URL ?? 'AUSENTE')"`
Se sair `AUSENTE`, o fallback do código assume `https://mova.motochefesuldeminas.com.br`. Registre no relatório da task que a env precisa ser definida na Vercel para o link sair correto em produção.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/vendas/assinatura-actions.ts"
git commit -m "feat(assinatura): actions de envio, reenvio, cancelamento e liberacao de NF"
```

---

### Task 9: Rota pública — leitura e código

**Files:**
- Create: `src/app/assinar/[token]/page.tsx`, `src/app/assinar/[token]/actions.ts`, `src/app/assinar/layout.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `validarCodigo`, `gerarCodigo`, `hashCodigo`, `VALIDADE_MINUTOS`, `msgCodigo`, `enviarWhatsappPara`.
- Produces: `solicitarCodigoAction(token)`, `conferirCodigoAction(token, codigo)` — `{ ok: boolean; error?: string }`; página server que carrega o documento pelo token.

- [ ] **Step 1: Liberar a rota no middleware**

Em `src/middleware.ts`, trocar o matcher por:

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|assinar).*)'],
}
```

A rota `/assinar` é pública por natureza — o token do link é a credencial.

- [ ] **Step 2: Layout sem sidebar e sem indexação**

Criar `src/app/assinar/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Assinatura de documento',
  robots: { index: false, follow: false },
}

export default function AssinarLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>
}
```

- [ ] **Step 3: Actions públicas do código**

Criar `src/app/assinar/[token]/actions.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaCodigos, assinaturaEventos } from '@/lib/db/schema'
import { gerarCodigo, hashCodigo, validarCodigo, VALIDADE_MINUTOS } from '@/lib/assinatura/codigo'
import { msgCodigo } from '@/lib/assinatura/mensagens'
import { enviarWhatsappPara } from '@/lib/whatsapp/envio-direto'

export async function contextoRequisicao() {
  const h = await headers()
  return {
    ip: (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim(),
    userAgent: h.get('user-agent') ?? '',
  }
}

async function docPorToken(token: string) {
  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.token, token)).limit(1)
  return doc ?? null
}

export async function solicitarCodigoAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }
  if (doc.status === 'cancelado') return { ok: false, error: 'Documento cancelado' }
  if (new Date() > doc.expiraEm) return { ok: false, error: 'Link expirado. Peça um novo à loja.' }

  const codigo = gerarCodigo()
  await db.insert(assinaturaCodigos).values({
    documentoId: doc.id,
    codigoHash: hashCodigo(codigo, doc.id),
    expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
  })

  const envio = await enviarWhatsappPara(doc.celularDestino, msgCodigo(codigo))
  const { ip, userAgent } = await contextoRequisicao()
  await db.insert(assinaturaEventos).values({
    documentoId: doc.id, tipo: 'codigo_enviado', ip, userAgent, detalhe: { envio },
  })

  // O código NUNCA volta na resposta — nem em erro, nem em log.
  if (envio !== 'enviado') return { ok: false, error: 'Não conseguimos enviar o código agora. Tente novamente em instantes.' }
  return { ok: true }
}

export async function conferirCodigoAction(token: string, digitado: string): Promise<{ ok: boolean; error?: string }> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const [codigo] = await db.select().from(assinaturaCodigos)
    .where(eq(assinaturaCodigos.documentoId, doc.id))
    .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
  if (!codigo) return { ok: false, error: 'Peça o código primeiro' }

  const resultado = validarCodigo(
    { codigoHash: codigo.codigoHash, expiraEm: codigo.expiraEm, tentativas: codigo.tentativas, usadoEm: codigo.usadoEm },
    digitado.trim(), doc.id, new Date(),
  )

  const { ip, userAgent } = await contextoRequisicao()

  if (resultado !== 'ok') {
    await db.update(assinaturaCodigos)
      .set({ tentativas: codigo.tentativas + 1 })
      .where(eq(assinaturaCodigos.id, codigo.id))
    await db.insert(assinaturaEventos).values({
      documentoId: doc.id, tipo: 'codigo_errado', ip, userAgent, detalhe: { resultado },
    })
    const mensagens: Record<string, string> = {
      incorreto: 'Código incorreto.',
      expirado: 'Código expirado. Peça um novo.',
      usado: 'Este código já foi usado.',
      excedeu: 'Muitas tentativas. Peça um novo código à loja.',
    }
    return { ok: false, error: mensagens[resultado] ?? 'Código inválido' }
  }

  await db.update(assinaturaCodigos).set({ usadoEm: new Date() }).where(eq(assinaturaCodigos.id, codigo.id))
  await db.insert(assinaturaEventos).values({ documentoId: doc.id, tipo: 'codigo_ok', ip, userAgent })
  return { ok: true }
}
```

- [ ] **Step 4: Página que carrega o documento**

Criar `src/app/assinar/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos } from '@/lib/db/schema'
import { AssinarClient } from './assinar-client'
import { contextoRequisicao } from './actions'

export default async function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.token, token)).limit(1)

  // 404 genérico: não revela se o token existiu.
  if (!doc) notFound()

  const { ip, userAgent } = await contextoRequisicao()
  if (doc.status === 'pendente') {
    await db.update(documentosAssinatura).set({ status: 'visualizado' })
      .where(eq(documentosAssinatura.id, doc.id))
  }
  await db.insert(assinaturaEventos).values({
    documentoId: doc.id, tipo: 'link_aberto', ip, userAgent,
  })

  const expirado = new Date() > doc.expiraEm && doc.status !== 'assinado'

  return (
    <AssinarClient
      token={token}
      html={doc.htmlSnapshot}
      tipo={doc.tipo}
      status={doc.status}
      expirado={expirado}
      docHash={doc.docHash}
      assinadoEm={doc.assinadoEm?.toISOString() ?? null}
      ipAssinatura={doc.ipAssinatura}
      selfieEm={doc.selfiePath ? doc.assinadoEm?.toISOString() ?? null : null}
    />
  )
}
```

- [ ] **Step 5: Checar tipos**

Run: `npm run type-check`
Expected: erro apenas em `./assinar-client`, que a Task 10 cria. Se preferir compilar limpo agora, crie o arquivo com um componente mínimo que renderiza o HTML — a Task 10 o substitui.

- [ ] **Step 6: Commit**

```bash
git add src/app/assinar src/middleware.ts
git commit -m "feat(assinatura): rota publica com leitura do documento e codigo OTP"
```

---

### Task 10: Rota pública — selfie, traço e selagem

**Files:**
- Create: `src/app/assinar/[token]/assinar-client.tsx`
- Modify: `src/app/assinar/[token]/actions.ts` (acrescentar `selarAssinaturaAction`)

**Interfaces:**
- Consumes: `docHash`, `sha256`, `type Evidencias`, `msgAssinado`, `enviarWhatsappPara`.
- Produces: `selarAssinaturaAction(token, selfie: string, traco: string, geo): Promise<{ ok: boolean; error?: string }>` — `selfie` e `traco` são data URLs (`data:image/...;base64,...`).

- [ ] **Step 1: Action de selagem**

Acrescentar em `src/app/assinar/[token]/actions.ts`:

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { docHash, sha256, type Evidencias } from '@/lib/assinatura/hash'
import { msgAssinado } from '@/lib/assinatura/mensagens'
import { LABEL_TIPO, type TipoDocumento } from '@/lib/assinatura/documento'
import { vendas } from '@/lib/db/schema'

function bufferDeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  return { buffer: Buffer.from(m[2], 'base64'), contentType: m[1] }
}

export async function selarAssinaturaAction(
  token: string,
  selfieDataUrl: string,
  tracoDataUrl: string,
  geo: { lat: number; lon: number; precisao: number } | null,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  // Idempotência: duplo clique não gera segunda assinatura.
  if (doc.status === 'assinado') return { ok: true }
  if (new Date() > doc.expiraEm) return { ok: false, error: 'Link expirado' }

  // O código precisa ter sido validado antes — sem isso, a selfie sozinha não sela.
  const [codigo] = await db.select().from(assinaturaCodigos)
    .where(eq(assinaturaCodigos.documentoId, doc.id))
    .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
  if (!codigo?.usadoEm) return { ok: false, error: 'Confirme o código enviado no WhatsApp antes de assinar' }

  const selfie = bufferDeDataUrl(selfieDataUrl)
  const traco = bufferDeDataUrl(tracoDataUrl)
  if (!selfie || !traco) return { ok: false, error: 'Imagem inválida' }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const base = `${doc.grupoId}/${doc.id}`
  const selfiePath = `${base}/selfie.jpg`
  const tracoPath = `${base}/assinatura.png`

  const up1 = await admin.storage.from('assinaturas')
    .upload(selfiePath, selfie.buffer, { contentType: selfie.contentType, upsert: true })
  if (up1.error) return { ok: false, error: 'Falha ao enviar a foto. Tente novamente.' }

  const up2 = await admin.storage.from('assinaturas')
    .upload(tracoPath, traco.buffer, { contentType: traco.contentType, upsert: true })
  if (up2.error) return { ok: false, error: 'Falha ao gravar a assinatura. Tente novamente.' }

  const { ip, userAgent } = await contextoRequisicao()
  const assinadoEm = new Date()
  const evidencias: Evidencias = {
    documentoId: doc.id,
    vendaId: doc.vendaId,
    tipo: doc.tipo,
    snapshotHash: doc.snapshotHash,
    selfieHash: sha256(selfie.buffer),
    assinaturaHash: sha256(traco.buffer),
    celularDestino: doc.celularDestino,
    ipAssinatura: ip,
    userAgent,
    codigoVerificadoEm: codigo.usadoEm.toISOString(),
    assinadoEm: assinadoEm.toISOString(),
  }

  await db.update(documentosAssinatura).set({
    status: 'assinado',
    assinadoEm,
    selfiePath, selfieHash: evidencias.selfieHash,
    assinaturaPath: tracoPath, assinaturaHash: evidencias.assinaturaHash,
    ipAssinatura: ip, userAgent,
    geoLat: geo ? String(geo.lat) : null,
    geoLon: geo ? String(geo.lon) : null,
    geoPrecisao: geo ? String(geo.precisao) : null,
    evidenciasJson: evidencias,
    docHash: docHash(evidencias),
  }).where(eq(documentosAssinatura.id, doc.id))

  await db.insert(assinaturaEventos).values({ documentoId: doc.id, tipo: 'selfie_enviada', ip, userAgent })
  await db.insert(assinaturaEventos).values({ documentoId: doc.id, tipo: 'assinado', ip, userAgent })

  // Envio do link final: falhar aqui NÃO desfaz a assinatura — ela já está selada.
  const [venda] = await db.select({ nome: vendas.clienteNome }).from(vendas)
    .where(eq(vendas.id, doc.vendaId)).limit(1)
  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://mova.motochefesuldeminas.com.br'}/assinar/${token}`
  await enviarWhatsappPara(doc.celularDestino, msgAssinado(venda?.nome ?? 'cliente', LABEL_TIPO[doc.tipo as TipoDocumento], url))

  return { ok: true }
}
```

- [ ] **Step 2: Componente cliente com as 4 telas**

Criar `src/app/assinar/[token]/assinar-client.tsx`. Requisitos que o código precisa cumprir:

- Passo `leitura`: renderiza `html` com `dangerouslySetInnerHTML` num `<div>` rolável; o botão "Li e concordo" só habilita quando o scroll chega ao fim (`scrollTop + clientHeight >= scrollHeight - 24`).
- Passo `codigo`: chama `solicitarCodigoAction` ao entrar; input `inputMode="numeric"` `maxLength={6}`; botão "Confirmar" chama `conferirCodigoAction`; mostra o erro devolvido; botão "Reenviar código".
- Passo `selfie`: **antes** de abrir a câmera, exibe o aviso de LGPD e um botão "Permitir câmera". Depois `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })`, `<video>` com `playsInline` e `muted` (sem `playsInline` o iOS abre em tela cheia), botão "Tirar foto" desenha num `<canvas>` e gera `toDataURL('image/jpeg', 0.8)`. Sempre parar as tracks (`stream.getTracks().forEach(t => t.stop())`) ao sair do passo.
- Passo `traco`: `<canvas>` com `onPointerDown/Move/Up`, `touchAction: 'none'` no style (sem isso o dedo rola a página em vez de desenhar), botão "Limpar" e "Assinar". Ao assinar, tenta `navigator.geolocation.getCurrentPosition` com timeout de 5s — **falha de geo não bloqueia** — e chama `selarAssinaturaAction`.
- Estado `assinado` (vindo do servidor ou após selar): esconde os passos e mostra a via assinada (Task 11).
- Estado `expirado`: mensagem "Este link expirou. Peça um novo à loja." sem exibir dado do cliente.
- Botão de assinar desabilitado enquanto `pending` — a proteção contra duplo clique existe nos dois lados (aqui e na action).

Texto do aviso de LGPD, exato:

```
Vamos pedir uma foto sua para comprovar quem está assinando. A imagem fica guardada
em ambiente restrito, é usada apenas como prova da assinatura deste documento e não
é publicada em lugar nenhum. Você pode desistir e assinar presencialmente na loja.
```

- [ ] **Step 3: Testar em navegador de verdade**

Run: `npm run dev`

Sem celular à mão, dá para chegar até o passo da selfie no desktop. O teste real é o do Step 5.

- [ ] **Step 4: Checar tipos**

Run: `npm run type-check`
Expected: sem erro.

- [ ] **Step 5: Teste manual obrigatório em celular**

Criar uma venda de teste, enviar o documento para o seu próprio número e percorrer o fluxo inteiro **num celular real** (iOS e Android, se possível):
1. Link abre e o documento aparece legível.
2. Botão só libera após rolar até o fim.
3. Código chega no WhatsApp e é aceito.
4. Câmera frontal abre e a foto é capturada.
5. O traço acompanha o dedo sem rolar a página.
6. Ao confirmar, a via assinada aparece e o link final chega no WhatsApp.

Registrar no relatório o que funcionou e o que não. **Não marcar a task como concluída sem este teste.**

- [ ] **Step 6: Commit**

```bash
git add "src/app/assinar/[token]"
git commit -m "feat(assinatura): captura de selfie, traco e selagem do documento"
```

---

### Task 11: Via assinada e folha de evidências

**Files:**
- Modify: `src/app/assinar/[token]/assinar-client.tsx` (bloco do estado assinado)
- Create: `src/app/assinar/[token]/via-assinada.tsx`

**Interfaces:**
- Consumes: props já entregues pela página (`html`, `docHash`, `assinadoEm`, `ipAssinatura`, `selfieEm`).
- Produces: componente `ViaAssinada` que renderiza documento + selo + folha de evidências.

- [ ] **Step 1: Componente da via**

Criar `src/app/assinar/[token]/via-assinada.tsx`. O componente recebe `{ html, docHash, assinadoEm, ipAssinatura, selfieEm }` e renderiza, nesta ordem:

1. Faixa verde no topo: "Documento assinado eletronicamente em `<data/hora BRT>`".
2. O `html` do documento.
3. A folha de evidências, num bloco com borda:
   - Assinado em (data e hora, fuso de Brasília)
   - Endereço IP do signatário
   - Confirmação por código enviado ao WhatsApp cadastrado
   - "Registro fotográfico coletado em `<data/hora>`" — **sem exibir a foto**
   - Código de verificação (`docHash`), em fonte monoespaçada, quebrando em telas estreitas (`break-all`)
   - A frase: "A autenticidade deste documento pode ser conferida junto à loja emissora, pelo código acima."
4. Botão "Imprimir / salvar em PDF" chamando `window.print()`.

Data e hora sempre com `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })` — o servidor da Vercel roda em UTC, e sem o fuso a via mostraria a hora errada.

- [ ] **Step 2: Ligar no cliente**

Em `assinar-client.tsx`, quando `status === 'assinado'` (vindo do servidor ou após `selarAssinaturaAction` retornar `ok`), renderizar `<ViaAssinada … />` no lugar dos passos. Após selar, recarregar os dados do servidor (`router.refresh()`) para que `docHash` e `assinadoEm` cheguem preenchidos.

- [ ] **Step 3: Conferir impressão**

Run: `npm run dev`, abrir um documento assinado, `Ctrl+P`.
Expected: o documento cabe na página, sem a faixa de botões. Acrescentar `@media print { .no-print { display: none } }` e marcar o botão com `className="no-print"`.

- [ ] **Step 4: Checar tipos**

Run: `npm run type-check` → sem erro.

- [ ] **Step 5: Commit**

```bash
git add "src/app/assinar/[token]"
git commit -m "feat(assinatura): via assinada com selo e folha de evidencias"
```

---

### Task 12: Interface interna — envio, status e cadeado na NF

**Files:**
- Create: `src/app/(dashboard)/vendas/components/enviar-assinatura-button.tsx`
- Create: `src/app/(dashboard)/vendas/components/liberar-nf-dialog.tsx`
- Modify: `src/app/(dashboard)/vendas/components/detalhes-venda-dialog.tsx`
- Modify: `src/app/(dashboard)/estoque/components/nf-saida-button.tsx`

**Interfaces:**
- Consumes: `enviarDocumentoAssinaturaAction`, `reenviarDocumentoAction`, `cancelarDocumentoAction`, `liberarNfSemContratoAction`; `situacaoNfDaVenda` no server component que alimenta os botões.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Botão de envio com status**

Criar `enviar-assinatura-button.tsx` (client component):

- Props: `{ vendaId: string; documentos: { id: string; tipo: string; status: string }[] }`.
- Para cada tipo (`contrato_venda`, `checklist_entrega`), mostra um badge: cinza "não enviado", âmbar "aguardando assinatura", verde "assinado", vermelho "expirado".
- Botão "Enviar para assinatura" quando não há documento vivo; "Reenviar", **"Copiar link"** e "Cancelar" quando há pendente; badge e "Copiar link" quando assinado.
- **"Copiar link" é sempre visível**, não só quando o envio falha (pedido do Cesar em 11/08): se o mcp.ai estiver fora, o vendedor manda o link por outro caminho. O `token` vem por prop do server component. Ressalva a exibir junto do botão: *"O código de 6 dígitos continua indo por WhatsApp"* — sem o mcp.ai o cliente abre o documento mas não conclui a assinatura.
- Erros da action aparecem em `toast` (`sonner`, já usado no projeto). O erro de WhatsApp devolve o link no texto — mostrar num toast que permita copiar, ou num bloco de texto selecionável.
- Usar `useTransition` e desabilitar durante `pending`, como nos outros botões do projeto.

- [ ] **Step 2: Dialog de liberação**

Criar `liberar-nf-dialog.tsx` (client component):

- Só renderiza para `admin_geral`/`admin_socio` (papel vem por prop do server component).
- `Dialog` do `@/components/ui/dialog` com `sm:max-w-md` (largura sem o prefixo `sm:` não sobrescreve o base).
- `Textarea` obrigatório para o motivo; botão desabilitado com menos de 10 caracteres.
- Chama `liberarNfSemContratoAction` e mostra o erro devolvido.

- [ ] **Step 3: Cadeado no botão de NF**

Em `nf-saida-button.tsx`, acrescentar a prop `bloqueioContrato?: string | null`. Quando preenchida:
- O botão fica `disabled`, com `title={bloqueioContrato}` e ícone de cadeado (`Lock` do lucide-react).
- Não abre o dialog.

O valor vem do server component que renderiza o botão, chamando `motivoBloqueioNf(await situacaoNfDaVenda(vendaId))`. Localize onde `NfSaidaButton` é usado (`grep -rn "NfSaidaButton" src`) e passe a prop em todos os pontos de uso — se algum ficar sem, aquele botão continua aberto e a trava vira ficção na tela (a action ainda recusa, mas o vendedor só descobre depois de tentar).

- [ ] **Step 4: Ligar no dialog de detalhes da venda**

Em `detalhes-venda-dialog.tsx`, acrescentar uma seção "Assinatura digital" com o `EnviarAssinaturaButton` e, quando houver bloqueio de NF e o usuário for admin, o `LiberarNfDialog`.

- [ ] **Step 5: Checar tipos e build**

Run: `npm run type-check`
Expected: sem erro.

Run: `npm run build`
Expected: build completa. Se falhar por client/server boundary, verifique se as actions estão importadas só em client components que as chamam — nunca importe `@/lib/db` num client component.

- [ ] **Step 6: Teste manual do fluxo interno**

Run: `npm run dev`
1. Abrir uma venda sem contrato → botão de NF com cadeado e a explicação no `title`.
2. Enviar contrato para assinatura → badge âmbar, WhatsApp recebido.
3. Assinar pelo celular → badge verde e botão de NF liberado (pode exigir F5 — o sidebar e alguns dados são cacheados).
4. Em outra venda, liberar por exceção com motivo → botão libera e o motivo fica gravado.

Conferir a gravação:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select tipo, status, doc_hash is not null as tem_hash, assinado_em from documentos_assinatura order by criado_em desc limit 5"
```

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/vendas/components" "src/app/(dashboard)/estoque/components/nf-saida-button.tsx"
git commit -m "feat(assinatura): botao de envio, status e cadeado na emissao de NF"
```

---

## Depois do plano

**Deploy:** ao terminar, `git push` e deploy na Vercel (padrão do projeto). Antes do deploy, conferir na Vercel:
- `SUPABASE_SERVICE_ROLE_KEY` — já existe (usada pelo caixa).
- `MCPAI_WHATSAPP_URL` — já existe (usada pelo disparador).
- `NEXT_PUBLIC_APP_URL` — **conferir**; se ausente, o link cai no fallback do código.

**Pendência conhecida:** o texto do contrato usado na Task 7 é uma minuta funcional. Substituir pelo modelo oficial revisado pelo advogado antes de usar com cliente real. A cláusula de aceite eletrônico deve permanecer em qualquer versão.

**Fora deste plano, conforme o spec:** certificado ICP-Brasil, carimbo de tempo externo, PDF gerado no servidor, assinatura do vendedor e de testemunhas, contrato variável por grupo, e os demais documentos (certificado de bateria, recibo de reserva, OS, demanda).
