# Bling por Grupo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada grupo (Sul de Minas, BH, Vale) passa a ter seu próprio Client ID/Secret e token OAuth do Bling, isolados entre si, em vez do singleton global atual.

**Architecture:** `grupos` ganha duas colunas de credencial (`bling_client_id`, `bling_client_secret`). `bling_config` deixa de ser uma linha fixa (`id=1`) e passa a ter `grupo_id` como chave primária (uma linha por grupo). Todas as funções de `src/lib/bling.ts` e as rotas OAuth (`/api/bling/connect`, `/api/bling/callback`) passam a receber/resolver `grupoId`.

**Tech Stack:** Next.js App Router, Drizzle ORM, Postgres (Supabase), TypeScript.

## Global Constraints

- Este repo **não usa `drizzle-kit generate`/`migrate`** (journal quebrado) — migrações são SQL manual em `src/lib/db/migrations/`, aplicadas via `mcp__plugin_supabase_supabase__apply_migration` (project_id: `bzlaradpofaecqzawyym`).
- Este repo **não tem suite de testes automatizados** (sem jest/vitest). Verificação é: `npm run type-check` (deve terminar sem output) + consultas diretas no banco via Supabase MCP + verificação manual no navegador para o fluxo OAuth (não dá pra automatizar uma autorização real no Bling).
- **Nunca commitar segredos** (Client Secret do Bling) em arquivos de migração ou scripts do git. Backfill de valores sensíveis é feito por `execute_sql` direto, fora de qualquer arquivo versionado.
- UUID fixo do grupo Sul de Minas (criado na migração da fundação multi-grupo): `00000000-0000-4000-8000-000000000001`.
- `blingCodigo` dos modelos **não muda** — continua global. Não mexer em `modelos` nem em `admin/modelos`.

---

### Task 1: Migration — `grupos.bling_client_id`/`bling_client_secret` e `bling_config` por grupo

**Files:**
- Create: `src/lib/db/migrations/0023_bling_por_grupo.sql`
- Modify: `src/lib/db/schema.ts:28-37` (tabela `grupos`)
- Modify: `src/lib/db/schema.ts:498-505` (tabela `bling_config`)

**Interfaces:**
- Produces: coluna `grupos.blingClientId` (text, nulável), `grupos.blingClientSecret` (text, nulável); tabela `blingConfig` com `grupoId` (uuid) como chave primária, sem a coluna `id`.

- [ ] **Step 1: Escrever o arquivo de migração**

Crie `src/lib/db/migrations/0023_bling_por_grupo.sql`:

```sql
-- grupos: Client ID/Secret do Bling por grupo (BH tem app Bling próprio,
-- diferente do Sul de Minas). Sem backfill aqui — os valores atuais do
-- Sul de Minas são um segredo e são inseridos separadamente via execute_sql,
-- fora de qualquer arquivo versionado.
ALTER TABLE "grupos" ADD COLUMN "bling_client_id" text;
ALTER TABLE "grupos" ADD COLUMN "bling_client_secret" text;

-- bling_config: era um singleton fixo (id sempre 1) — vira uma linha por
-- grupo, com grupo_id como chave primária (mesmo padrão de configuracao_taxas
-- na migração 0020_pix_mcp_grupo/0021_precificacao_grupo).
ALTER TABLE "bling_config" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");

UPDATE "bling_config" SET "grupo_id" = '00000000-0000-4000-8000-000000000001' WHERE "id" = 1;

ALTER TABLE "bling_config" DROP CONSTRAINT "bling_config_pkey";
ALTER TABLE "bling_config" ALTER COLUMN "grupo_id" SET NOT NULL;
ALTER TABLE "bling_config" ADD PRIMARY KEY ("grupo_id");
ALTER TABLE "bling_config" DROP COLUMN "id";
```

- [ ] **Step 2: Aplicar a migração via Supabase MCP**

Use a ferramenta `mcp__plugin_supabase_supabase__apply_migration` com `project_id: "bzlaradpofaecqzawyym"`, `name: "bling_por_grupo"`, e o conteúdo do arquivo acima como `query`.

- [ ] **Step 3: Verificar a migração**

Rode via `mcp__plugin_supabase_supabase__execute_sql` (mesmo `project_id`):

```sql
select column_name from information_schema.columns where table_name = 'grupos' and column_name like 'bling%';
select grupo_id, access_token is not null as tem_token from bling_config;
```

Esperado: duas colunas (`bling_client_id`, `bling_client_secret`) e uma linha em `bling_config` com `grupo_id = '00000000-0000-4000-8000-000000000001'`.

- [ ] **Step 4: Atualizar `src/lib/db/schema.ts` — tabela `grupos`**

Em `src/lib/db/schema.ts:28-37`, troque:

```ts
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  validapixEmail:     text('validapix_email'),
  validapixPassword:  text('validapix_password'),
  fabricaEmail:       text('fabrica_email'),
  fabricaSenha:       text('fabrica_senha'),
})
```

por:

```ts
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  validapixEmail:     text('validapix_email'),
  validapixPassword:  text('validapix_password'),
  fabricaEmail:       text('fabrica_email'),
  fabricaSenha:       text('fabrica_senha'),
  blingClientId:      text('bling_client_id'),
  blingClientSecret:  text('bling_client_secret'),
})
```

- [ ] **Step 5: Atualizar `src/lib/db/schema.ts` — tabela `bling_config`**

Em `src/lib/db/schema.ts:498-505`, troque:

```ts
// ─── bling_config (singleton) ────────────────────────────────────────────────
export const blingConfig = pgTable('bling_config', {
  id: integer('id').primaryKey().default(1),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

por:

```ts
// ─── bling_config (uma linha por grupo) ──────────────────────────────────────
export const blingConfig = pgTable('bling_config', {
  grupoId: uuid('grupo_id').primaryKey().references(() => grupos.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 6: Backfill do Client ID/Secret do Sul de Minas (NÃO commitar)**

Rode diretamente via `mcp__plugin_supabase_supabase__execute_sql` (não escreva isso em nenhum arquivo do repo), usando os valores atuais de `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET` (os mesmos já usados em produção — conferir em `.env.local` ou na env var da Vercel):

```sql
update grupos
set bling_client_id = '<valor atual de BLING_CLIENT_ID>',
    bling_client_secret = '<valor atual de BLING_CLIENT_SECRET>'
where id = '00000000-0000-4000-8000-000000000001';
```

- [ ] **Step 7: Rodar type-check**

Run: `npm run type-check`
Expected: sem output (schema.ts sozinho não deve quebrar nada ainda, mas `src/lib/bling.ts` e as actions que usam `blingConfig.id`/`eq(blingConfig.id, 1)` vão quebrar o type-check até a Task 4 — isso é esperado neste ponto, não precisa corrigir ainda).

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/migrations/0023_bling_por_grupo.sql src/lib/db/schema.ts
git commit -m "feat: bling_config e grupos.bling_client_id/secret por grupo"
```

---

### Task 2: Admin → Grupos — editar Client ID/Secret do Bling

**Files:**
- Modify: `src/app/(dashboard)/admin/grupos/actions.ts`
- Modify: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`

**Interfaces:**
- Consumes: `grupos.blingClientId`, `grupos.blingClientSecret` (Task 1).
- Produces: `GrupoInput` com `blingClientId?: string`, `blingClientSecret?: string`; formulário de grupo com esses dois campos.

- [ ] **Step 1: Atualizar `actions.ts`**

Em `src/app/(dashboard)/admin/grupos/actions.ts`, troque o tipo `GrupoInput` e as duas funções de gravação:

```ts
type GrupoInput = {
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail?: string
  validapixPassword?: string
  fabricaEmail?: string
  fabricaSenha?: string
  blingClientId?: string
  blingClientSecret?: string
}

export async function criarGrupoAction(dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.insert(grupos).values({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
  })
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

export async function editarGrupoAction(id: string, dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.update(grupos).set({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
  }).where(eq(grupos.id, id))
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}
```

`listarGruposAction` não muda (já faz `select()` de tudo).

- [ ] **Step 2: Atualizar `grupo-dialog.tsx` — tipo `Grupo` e estado**

Em `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`, troque o tipo `Grupo`:

```ts
type Grupo = {
  id: string
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail: string | null
  validapixPassword: string | null
  fabricaEmail: string | null
  fabricaSenha: string | null
  blingClientId: string | null
  blingClientSecret: string | null
}
```

E adicione os dois estados novos, logo após `fabricaSenha`:

```ts
  const [fabricaSenha, setFabricaSenha] = useState(inicial?.fabricaSenha ?? '')
  const [blingClientId, setBlingClientId] = useState(inicial?.blingClientId ?? '')
  const [blingClientSecret, setBlingClientSecret] = useState(inicial?.blingClientSecret ?? '')
```

- [ ] **Step 3: Incluir os campos no `dados` enviado e no formulário**

Troque a linha `const dados = { ... }` dentro de `handleSalvar`:

```ts
      const dados = { nome, cnpj, ativo, validapixEmail, validapixPassword, fabricaEmail, fabricaSenha, blingClientId, blingClientSecret }
```

E adicione os dois campos de input, dentro do bloco `<div className="border-t pt-3 space-y-3">`, logo após o grid do ValidaPix/Fábrica (depois do `</div>` que fecha `grid-cols-2` e antes do `<p className="text-xs text-slate-400">`):

```tsx
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client ID</Label>
                <Input value={blingClientId} onChange={e => setBlingClientId(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client Secret</Label>
                <Input type="password" value={blingClientSecret} onChange={e => setBlingClientSecret(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
```

- [ ] **Step 4: Rodar type-check**

Run: `npm run type-check`
Expected: sem novos erros nesses dois arquivos (os erros de `bling.ts`/rotas ainda existem, ignorar por enquanto).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/grupos/actions.ts src/app/\(dashboard\)/admin/grupos/components/grupo-dialog.tsx
git commit -m "feat: editar Client ID/Secret do Bling por grupo em Admin > Grupos"
```

---

### Task 3: `src/lib/bling.ts` — todas as funções recebem `grupoId`

**Files:**
- Modify: `src/lib/bling.ts` (reescrita quase completa)

**Interfaces:**
- Consumes: `grupos.blingClientId`/`blingClientSecret`, `blingConfig` com `grupoId` como PK (Task 1).
- Produces: `salvarTokens(grupoId, access, refresh, expiresIn)`, `getBlingStatus(grupoId)`, `criarRascunhoNFe(grupoId, dados)`, `atualizarRascunhoNFe(grupoId, blingId, dados)`, `emitirNFe(grupoId, dados)`, `buscarNfeIdPorNumero(grupoId, numero)`, `buscarLinksDanfe(grupoId, blingNfeId)`, `blingAuthUrl(clientId, redirectUri, state)`, `trocarCodePorTokens(clientId, clientSecret, redirectUri, code)`.

- [ ] **Step 1: Reescrever `src/lib/bling.ts`**

Substitua o arquivo inteiro por:

```ts
import { db } from '@/lib/db'
import { blingConfig, grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const AUTH_URL   = 'https://www.bling.com.br/Api/v3/oauth/authorize'
const TOKEN_URL  = 'https://www.bling.com.br/Api/v3/oauth/token'
const API_BASE   = 'https://api.bling.com.br/Api/v3'

async function getCredenciaisGrupo(grupoId: string): Promise<{ clientId: string; clientSecret: string }> {
  const [grupo] = await db
    .select({ blingClientId: grupos.blingClientId, blingClientSecret: grupos.blingClientSecret })
    .from(grupos)
    .where(eq(grupos.id, grupoId))
    .limit(1)
  if (!grupo?.blingClientId || !grupo?.blingClientSecret) {
    throw new Error('Client ID/Secret do Bling não configurados para este grupo. Configure em Admin → Grupos.')
  }
  return { clientId: grupo.blingClientId, clientSecret: grupo.blingClientSecret }
}

function basicHeader(clientId: string, clientSecret: string) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export function blingAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  })
  return `${AUTH_URL}?${params}`
}

export async function trocarCodePorTokens(clientId: string, clientSecret: string, redirectUri: string, code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  if (!res.ok) throw new Error(`Bling token error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Bling refresh error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function salvarTokens(grupoId: string, access: string, refresh: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  await db.insert(blingConfig)
    .values({ grupoId, accessToken: access, refreshToken: refresh, expiresAt, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: blingConfig.grupoId,
      set: { accessToken: access, refreshToken: refresh, expiresAt, atualizadoEm: new Date() },
    })
}

export async function getBlingStatus(grupoId: string) {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.grupoId, grupoId)).limit(1)
  return { conectado: !!cfg?.refreshToken, atualizadoEm: cfg?.atualizadoEm ?? null }
}

async function getToken(grupoId: string): Promise<string> {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.grupoId, grupoId)).limit(1)
  if (!cfg?.refreshToken) throw new Error('Bling não conectado. Configure em Admin → Bling NF-e.')

  const { clientId, clientSecret } = await getCredenciaisGrupo(grupoId)

  const agora = new Date()
  // Refresh se o access token expirar nos próximos 5 minutos
  if (!cfg.accessToken || !cfg.expiresAt || cfg.expiresAt <= new Date(agora.getTime() + 5 * 60 * 1000)) {
    const tokens = await refreshAccessToken(clientId, clientSecret, cfg.refreshToken)
    await salvarTokens(grupoId, tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return tokens.access_token
  }
  return cfg.accessToken
}

async function blingRequest(grupoId: string, method: string, path: string, body?: unknown) {
  const token = await getToken(grupoId)
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const texto = await res.text()
    try {
      const json = JSON.parse(texto)
      const fields: { msg: string }[] = json?.error?.fields ?? []
      if (fields.length > 0) {
        const msgs = fields.map((f) => f.msg).join('; ')
        const municipioErro = fields.some((f) => /municipio|munic/i.test(f.msg ?? ''))
        if (municipioErro) {
          throw new Error(
            `${msgs}. Para corrigir: edite a venda, ajuste o campo Cidade para o nome exato do município (ex: "Poços de Caldas") e tente novamente. Se persistir, deixe o campo Cidade em branco.`
          )
        }
        throw new Error(msgs)
      }
      if (json?.error?.message) {
        throw new Error(json.error.message)
      }
    } catch (e) {
      if (e instanceof Error && e.message && !e.message.startsWith('Bling API')) throw e
    }
    throw new Error(`Bling API ${method} ${path} → ${res.status}: ${texto}`)
  }
  return res.json()
}

async function buscarVendedorBlingId(grupoId: string, nome: string): Promise<number | null> {
  try {
    const res = await blingRequest(grupoId, 'GET', `/vendedores?nomeContato=${encodeURIComponent(nome)}&limite=10`, undefined)
    const lista: { id?: number; contato?: { nome?: string } }[] = Array.isArray(res?.data) ? res.data : []
    const normalizar = (s: string) => s.toLowerCase().trim()
    const nomeNorm = normalizar(nome)
    const match = lista.find(v => {
      const blingNome = normalizar(v.contato?.nome ?? '')
      return blingNome === nomeNorm ||
             blingNome.startsWith(nomeNorm + ' ') ||
             nomeNorm.startsWith(blingNome + ' ')
    })
    return match?.id ?? null
  } catch {
    return null
  }
}

export type DadosNFe = {
  clienteNome: string
  clienteCpf: string
  clienteCelular: string | null
  clienteEmail: string | null
  clienteCep: string | null
  clienteLogradouro: string | null
  clienteNumero: string | null
  clienteComplemento: string | null
  clienteBairro: string | null
  clienteCidade: string | null
  clienteEstado: string | null
  valor: string
  pagamentos: { tipo: string; valor: number; parcelas?: number }[]
  blingCodigo: string
  descricaoProduto: string
  chassi: string
  marca: string
  modeloNome: string
  cor: string
  motor: string | null
  tipoMotor: string
  categoria: string
  potencia: string
  vendedorNome: string
}

const tipoLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

function montarPayloadNFe(dados: DadosNFe, vendedorBlingId?: number | null) {
  const dataHoje = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const valorTotal = parseFloat(dados.valor)

  const parcelas = dados.pagamentos.length > 0
    ? dados.pagamentos.map(p => ({
        dias: 0,
        data: dataHoje,
        valor: p.valor,
        observacoes: tipoLabel[p.tipo] ?? p.tipo,
      }))
    : [{ dias: 0, data: dataHoje, valor: valorTotal, observacoes: 'À vista' }]

  const motorDesc = dados.motor || dados.tipoMotor || 'N/I'

  const garantia =
    'GARANTIA DE 90 DIAS CONFORME CDC + 9 MESES PARA MOTOR, BATERIA E MODULO ' +
    '(TOTALIZANDO 1 ANO) MANTENDO AS REVISÕES EM DIA. AS REVISÕES DEVERÃO SER ' +
    'REALIZADAS NO PERÍODO DE 3 MESES OU 2000KM RODADOS. OS DEMAIS COMPONENTES ' +
    'A GARANTIA É DE 90 DIAS CONFORME CDC. Garantia não cobre danos causados por ' +
    'mau uso da parte do cliente.'

  const dadosVeiculo = [
    `Marca: ${dados.marca || 'N/I'}`,
    `Modelo: ${dados.modeloNome || 'N/I'}`,
    `Chassi: ${dados.chassi || 'N/I'}`,
    `Motor: ${motorDesc}`,
    `Categoria: ${dados.categoria || 'N/I'}`,
    `Potência: ${dados.potencia || 'N/I'}`,
    `Cor: ${dados.cor || 'N/I'}`,
  ].join('\n')

  const observacoes = `${garantia}\n\n${dadosVeiculo}`

  return {
    tipo: 1,
    dataOperacao: dataHoje,
    naturezaOperacao: process.env.BLING_NATUREZA_OPERACAO ?? 'VENDA',
    observacoes,
    ...(vendedorBlingId ? { vendedor: { id: vendedorBlingId } } : {}),
    contato: {
      nome: dados.clienteNome.toUpperCase(),
      tipoPessoa: 'F',
      numeroDocumento: dados.clienteCpf.replace(/\D/g, ''),
      email: dados.clienteEmail ?? '',
      telefone: (dados.clienteCelular ?? '').replace(/\D/g, ''),
      endereco: {
        endereco: dados.clienteLogradouro ?? '',
        numero: dados.clienteNumero ?? '',
        complemento: dados.clienteComplemento ?? '',
        bairro: dados.clienteBairro ?? '',
        municipio: dados.clienteCidade ?? '',
        uf: dados.clienteEstado ?? '',
        cep: (dados.clienteCep ?? '').replace(/\D/g, ''),
      },
    },
    itens: [
      {
        codigo: dados.blingCodigo,
        descricao: `${dados.descricaoProduto} - Chassi ${dados.chassi}`,
        quantidade: 1,
        valor: valorTotal,
        tipo: 'P',
        unidade: 'UN',
        pesoBruto: 0,
        pesoLiquido: 0,
      },
    ],
    transporte: {
      transportadora: {},
      tipoFrete: 9,
      volume: { quantidade: 1, especie: 'UN', pesoBruto: 0, pesoLiquido: 0 },
    },
    parcelas,
  }
}

export async function criarRascunhoNFe(grupoId: string, dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado. Edite a venda e adicione o CPF antes de emitir a NF-e.')
  }
  const vendedorBlingId = dados.vendedorNome ? await buscarVendedorBlingId(grupoId, dados.vendedorNome) : null
  const payload = montarPayloadNFe(dados, vendedorBlingId)
  const criacao = await blingRequest(grupoId, 'POST', '/nfe', payload)
  const blingId: number = criacao?.data?.id
  if (!blingId) throw new Error('Bling não retornou ID da NF-e criada.')
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function atualizarRascunhoNFe(grupoId: string, blingId: number, dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado.')
  }
  const nfeAtual = await blingRequest(grupoId, 'GET', `/nfe/${blingId}`, undefined)
  const numero: number = nfeAtual?.data?.numero ?? 0

  // PUT /nfe não aceita o campo vendedor — só é definido na criação (POST)
  const payload = { ...montarPayloadNFe(dados, null), numero }
  await blingRequest(grupoId, 'PUT', `/nfe/${blingId}`, payload)
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function buscarNfeIdPorNumero(grupoId: string, numero: string): Promise<string | null> {
  try {
    const res = await blingRequest(grupoId, 'GET', `/nfe?numero=${encodeURIComponent(numero)}&limite=1`, undefined)
    const item = Array.isArray(res?.data) ? res.data[0] : null
    return item?.id ? String(item.id) : null
  } catch {
    return null
  }
}

export async function buscarLinksDanfe(grupoId: string, blingNfeId: string): Promise<{ linkDanfe: string | null; linkPDF: string | null }> {
  const res = await blingRequest(grupoId, 'GET', `/nfe/${blingNfeId}`, undefined)
  return {
    linkDanfe: res?.data?.linkDanfe ?? null,
    linkPDF:   res?.data?.linkPDF   ?? null,
  }
}

export async function emitirNFe(grupoId: string, dados: DadosNFe): Promise<string> {
  const payload = montarPayloadNFe(dados)
  const criacao = await blingRequest(grupoId, 'POST', '/nfe', payload)
  const nfeId: number = criacao?.data?.id
  if (!nfeId) throw new Error('Bling não retornou ID da NF-e criada.')

  // Transmite a NF-e
  const transmissao = await blingRequest(grupoId, 'POST', `/nfe/${nfeId}/transmitir`, {})

  // Número da NF pode vir na transmissão ou já estava na criação
  const numero: string | number =
    transmissao?.data?.numero ??
    criacao?.data?.numero ??
    nfeId

  return String(numero)
}
```

- [ ] **Step 2: Rodar type-check**

Run: `npm run type-check`
Expected: erros restantes só nos arquivos que ainda chamam as funções antigas (rotas `/api/bling/*`, `admin/bling/actions.ts`, `vendas/actions.ts`) — isso é esperado, resolvido nas próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bling.ts
git commit -m "feat: funções de src/lib/bling.ts recebem grupoId em vez de credenciais globais"
```

---

### Task 4: Rotas OAuth (`/api/bling/connect` e `/callback`)

**Files:**
- Modify: `src/app/api/bling/connect/route.ts`
- Modify: `src/app/api/bling/callback/route.ts`

**Interfaces:**
- Consumes: `getGrupoAtivo(usuario)` de `@/lib/grupo`; `blingAuthUrl(clientId, redirectUri, state)`, `trocarCodePorTokens(clientId, clientSecret, redirectUri, code)`, `salvarTokens(grupoId, ...)` de `@/lib/bling` (Task 3).

- [ ] **Step 1: Reescrever `src/app/api/bling/connect/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { blingAuthUrl } from '@/lib/bling'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
    if (usuario.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/bling?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const grupo = await getGrupoAtivo(usuario)

  const [cfg] = await db.select({ blingClientId: grupos.blingClientId }).from(grupos).where(eq(grupos.id, grupo.id)).limit(1)
  if (!cfg?.blingClientId) {
    return NextResponse.redirect(new URL('/admin/bling?erro=sem_credenciais', req.url))
  }

  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(blingAuthUrl(cfg.blingClientId, process.env.BLING_REDIRECT_URI!, state))
  res.cookies.set('bling_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutos
    path: '/',
  })
  res.cookies.set('bling_oauth_grupo', grupo.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
```

- [ ] **Step 2: Reescrever `src/app/api/bling/callback/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorTokens, salvarTokens } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  // 1. Verificar sessão admin antes de qualquer troca de tokens
  try {
    const u = await getUsuarioLogado()
    if (u.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/bling?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // 2. Validar state (proteção CSRF) e recuperar o grupo que iniciou o fluxo
  const storedState = req.cookies.get('bling_oauth_state')?.value
  const grupoId = req.cookies.get('bling_oauth_grupo')?.value
  if (!storedState || !state || state !== storedState || !grupoId) {
    return NextResponse.redirect(new URL('/admin/bling?erro=state_invalido', req.url))
  }

  function limparCookies(res: NextResponse) {
    res.cookies.set('bling_oauth_state', '', { maxAge: 0, path: '/' })
    res.cookies.set('bling_oauth_grupo', '', { maxAge: 0, path: '/' })
    return res
  }

  if (error || !code) {
    return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=acesso_negado', req.url)))
  }

  try {
    const [grupo] = await db
      .select({ blingClientId: grupos.blingClientId, blingClientSecret: grupos.blingClientSecret })
      .from(grupos)
      .where(eq(grupos.id, grupoId))
      .limit(1)
    if (!grupo?.blingClientId || !grupo?.blingClientSecret) {
      return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=sem_credenciais', req.url)))
    }

    const tokens = await trocarCodePorTokens(grupo.blingClientId, grupo.blingClientSecret, process.env.BLING_REDIRECT_URI!, code)
    await salvarTokens(grupoId, tokens.access_token, tokens.refresh_token, tokens.expires_in)

    return limparCookies(NextResponse.redirect(new URL('/admin/bling?ok=1', req.url)))
  } catch (e: any) {
    console.error('Bling OAuth callback error:', e)
    return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=token', req.url)))
  }
}
```

- [ ] **Step 3: Rodar type-check**

Run: `npm run type-check`
Expected: erros restantes só em `admin/bling/actions.ts` e `vendas/actions.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bling/connect/route.ts src/app/api/bling/callback/route.ts
git commit -m "feat: fluxo OAuth do Bling passa a ser grupo-aware"
```

---

### Task 5: `/admin/bling` — status e desconexão por grupo ativo

**Files:**
- Modify: `src/app/(dashboard)/admin/bling/actions.ts`
- Modify: `src/app/(dashboard)/admin/bling/page.tsx`

**Interfaces:**
- Consumes: `getGrupoAtivo(usuario)` de `@/lib/grupo`; `getBlingStatus(grupoId)` de `@/lib/bling` (Task 3).

- [ ] **Step 1: Atualizar `actions.ts`**

```ts
'use server'
import { db } from '@/lib/db'
import { blingConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getBlingStatus } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function getBlingStatusAction() {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)
  return { ...(await getBlingStatus(grupo.id)), grupoNome: grupo.nome }
}

export async function desconectarBlingAction() {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)
  await db.update(blingConfig).set({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    atualizadoEm: new Date(),
  }).where(eq(blingConfig.grupoId, grupo.id))
  revalidatePath('/admin/bling')
}
```

- [ ] **Step 2: Atualizar `page.tsx`**

Troque o título do cabeçalho (linha com `<h1>`) e adicione o tratamento do novo erro `sem_credenciais`:

```tsx
import { AdminGuard } from '../components/admin-guard'
import { getBlingStatusAction } from './actions'
import { BlingConnectButton } from './components/bling-connect-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default async function BlingPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const params = await searchParams
  const status = await getBlingStatusAction()

  return (
    <AdminGuard>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={22} /> Bling NF-e — {status.grupoNome}
          </h1>
          <p className="text-slate-500 text-sm">Integração para emissão automática de NF-e de saída</p>
        </div>

        {params.ok && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 size={16} /> Conta Bling conectada com sucesso!
          </div>
        )}
        {params.erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle size={16} />
            {params.erro === 'acesso_negado' && 'Autorização negada no Bling.'}
            {params.erro === 'sem_credenciais' && `Client ID/Secret do Bling não configurados para o grupo ${status.grupoNome}. Configure em Admin → Grupos.`}
            {params.erro !== 'acesso_negado' && params.erro !== 'sem_credenciais' && 'Erro ao obter tokens. Tente novamente.'}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status da conexão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {status.conectado ? (
                <CheckCircle2 className="text-green-500" size={20} />
              ) : (
                <XCircle className="text-slate-400" size={20} />
              )}
              <div>
                <p className="font-medium text-sm">
                  {status.conectado ? 'Conta conectada' : 'Não conectado'}
                </p>
                {status.atualizadoEm && (
                  <p className="text-xs text-slate-500">
                    Última atualização: {format(new Date(status.atualizadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>

            <BlingConnectButton conectado={status.conectado} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-requisitos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Antes de conectar, verifique:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
              <li>Acesse o <strong>Portal do Desenvolvedor Bling</strong> (logado com a conta Bling deste grupo) → Aplicações → criar app com URL de retorno: <code className="bg-slate-100 px-1 rounded text-xs">https://moto-chefe.vercel.app/api/bling/callback</code></li>
              <li>Cadastre o <strong>Client ID e Client Secret</strong> desse app em <strong>Admin → Grupos</strong>, editando o grupo <strong>{status.grupoNome}</strong></li>
              <li>Configure o <strong>código do produto Bling</strong> em cada modelo em Admin → Modelos</li>
              <li>Certifique-se que o certificado digital está ativo no Bling</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 3: Rodar type-check**

Run: `npm run type-check`
Expected: erros restantes só em `vendas/actions.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/admin/bling/actions.ts src/app/\(dashboard\)/admin/bling/page.tsx
git commit -m "feat: /admin/bling mostra e opera sobre o grupo ativo"
```

---

### Task 6: `vendas/actions.ts` — repassar `grupoId` nas 4 chamadas ao Bling

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts:358-463` (criar rascunho)
- Modify: `src/app/(dashboard)/vendas/actions.ts:474-` (atualizar rascunho)
- Modify: `src/app/(dashboard)/vendas/actions.ts:~570-660` (emitir NF-e)
- Modify: `src/app/(dashboard)/vendas/actions.ts:1042-1060` (buscar DANFE)

**Interfaces:**
- Consumes: `getGrupoIdDaLoja(lojaId)` de `@/lib/grupo` (já importado no arquivo); `criarRascunhoNFe(grupoId, dados)`, `atualizarRascunhoNFe(grupoId, blingId, dados)`, `emitirNFe(grupoId, dados)`, `buscarLinksDanfe(grupoId, blingNfeId)` de `@/lib/bling` (Task 3).

- [ ] **Step 1: Criar rascunho — adicionar `lojaId` ao select e resolver `grupoId`**

No `select` da venda (por volta da linha 358), adicione `lojaId: vendas.lojaId` à lista de campos:

```ts
  const [venda] = await db
    .select({
      id: vendas.id,
      lojaId: vendas.lojaId,
      valor: vendas.valor,
      pagamentos: vendas.pagamentos,
      vendedorId: vendas.vendedorId,
      blingNfeId: vendas.blingNfeId,
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteCelular: vendas.clienteCelular,
      clienteEmail: vendas.clienteEmail,
      clienteCep: vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
```

Logo antes da chamada a `criarRascunhoNFe` (troque as duas linhas):

```ts
  const { criarRascunhoNFe } = await import('@/lib/bling')
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const resultado = await criarRascunhoNFe(grupoId, {
    clienteNome: venda.clienteNome,
```

(mantendo o restante do objeto `dados` exatamente como está — só adiciona `grupoId` como primeiro argumento).

- [ ] **Step 2: Atualizar rascunho — mesmo padrão**

No `select` da venda desta função (por volta da linha 474), adicione `lojaId: vendas.lojaId` do mesmo jeito.

Troque a chamada:

```ts
  const { atualizarRascunhoNFe } = await import('@/lib/bling')
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const resultado = await atualizarRascunhoNFe(grupoId, Number(venda.blingNfeId), {
    clienteNome: venda.clienteNome,
```

- [ ] **Step 3: Emitir NF-e — mesmo padrão**

No `select` da venda desta função (por volta da linha 575), adicione `lojaId: vendas.lojaId`.

Troque a chamada:

```ts
  const { emitirNFe } = await import('@/lib/bling')
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const numeroNF = await emitirNFe(grupoId, {
    clienteNome: venda.clienteNome,
```

- [ ] **Step 4: Buscar DANFE — mesmo padrão**

Em `buscarDanfeAction` (por volta da linha 1042), adicione `lojaId: vendas.lojaId` ao select:

```ts
  const [venda] = await db
    .select({ blingNfeId: vendas.blingNfeId, lojaId: vendas.lojaId })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda?.blingNfeId) throw new Error('ID da NF-e não encontrado. Verifique se o rascunho foi criado pelo MOVA.')

  const { buscarLinksDanfe } = await import('@/lib/bling')
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  const links = await buscarLinksDanfe(grupoId, venda.blingNfeId)
```

- [ ] **Step 5: Rodar type-check**

Run: `npm run type-check`
Expected: sem output (nenhum erro em nenhum arquivo).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/vendas/actions.ts
git commit -m "feat: vendas resolvem grupoId da loja ao chamar o Bling"
```

---

### Task 7: Validação ponta a ponta (BH)

**Files:** nenhum arquivo — validação manual.

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Deploy**

```bash
git push
```

Aguarde o deploy automático da Vercel concluir (ou rode `npx vercel deploy --prod --yes` se precisar forçar).

- [ ] **Step 2: Cadastrar Client ID/Secret da BH**

Peça o Client ID e Client Secret do app Bling da BH (criado no Portal do Desenvolvedor Bling, com callback `https://moto-chefe.vercel.app/api/bling/callback`). Em `/admin/grupos`, edite o grupo BH e preencha os dois campos novos.

- [ ] **Step 3: Conectar**

Troque para o grupo BH na barra do dashboard, acesse `/admin/bling`, confirme que o cabeçalho mostra "Bling NF-e — BH" e que o status é "Não conectado". Clique em "Conectar ao Bling", autorize no Bling, confirme o retorno com `?ok=1` e status "Conta conectada".

- [ ] **Step 4: Confirmar isolamento**

Troque de volta para o grupo Sul de Minas na barra do dashboard, acesse `/admin/bling` de novo, e confirme que o status do Sul de Minas continua "Conta conectada" (não foi afetado pela conexão da BH).

- [ ] **Step 5: Verificar no banco**

Via `mcp__plugin_supabase_supabase__execute_sql` (project_id `bzlaradpofaecqzawyym`):

```sql
select g.nome, bc.grupo_id, bc.access_token is not null as tem_token, bc.atualizado_em
from bling_config bc
join grupos g on g.id = bc.grupo_id
order by g.nome;
```

Esperado: uma linha para Sul de Minas e uma linha para BH, ambas com `tem_token = true`.

- [ ] **Step 6: Teste de emissão (opcional, se houver venda de teste na BH)**

Numa venda do grupo BH com CPF preenchido, clique em "Emitir NF-e" (ou "Criar rascunho", dependendo do fluxo da tela de vendas) e confirme que o rascunho é criado sem erro de autenticação — isso comprova que o token/credencial da BH está sendo usado corretamente, e não o do Sul de Minas.
