# Integrações por Grupo — PIX e Conciliação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer PIX e Conciliação de Cartão puxarem/gravarem dados por grupo ativo, em vez de uma conta/tabela global compartilhada entre Sul de Minas e BH.

**Architecture:** `pix_recebimentos` e `conciliacoes_cartao` ganham `grupo_id`. `src/lib/validapix.ts` passa a receber credenciais como parâmetro (lidas do registro do grupo ativo, não mais de `process.env`) e mantém uma sessão em cache por e-mail. A página `/pix` e a página `/conciliacao` passam a filtrar/gravar pelo grupo ativo do usuário.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase (Postgres).

## Global Constraints

- Fábrica e Bling continuam fora de escopo — não alterar `bling_config` nem `src/lib/fabrica-scraper.ts`.
- Todo dado existente (PIX e conciliações já importadas) migra para o grupo Sul de Minas (`00000000-0000-4000-8000-000000000001`, mesmo UUID fixo usado na migration original do multi-grupo).
- Zero impacto visível para o Sul de Minas após o deploy — só muda o comportamento quando o grupo BH estiver ativo (ou quando as credenciais de outro grupo forem cadastradas).
- Projeto não tem suite de testes automatizada — verificação é `npm run type-check` + teste manual.
- Número (`numero`) de vendas/pedidos é globalmente único no sistema (sequência `numero_venda_seq` compartilhada) — o cruzamento de PIX por NF/PV não precisa de ajuste de escopo por grupo.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/db/schema.ts` | Modificar — `grupoId` em `pixRecebimentos` e `conciliacoesCartao` |
| `src/lib/db/migrations/0012_integracoes_por_grupo.sql` | Criar — migration SQL |
| `src/lib/validapix.ts` | Modificar — credenciais por parâmetro, sessão em cache por e-mail |
| `src/app/(dashboard)/pix/page.tsx` | Modificar — credenciais do grupo ativo, grava `grupoId` |
| `src/app/(dashboard)/conciliacao/page.tsx` | Modificar — filtra por `grupoId` do grupo ativo |
| `src/app/(dashboard)/conciliacao/actions.ts` | Modificar — grava `grupoId` no upload; escopa buscas de vincular venda |

---

## Task 1: Banco de dados — `grupoId` em `pix_recebimentos` e `conciliacoes_cartao`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0012_integracoes_por_grupo.sql`

**Interfaces:**
- Produces: `pixRecebimentos.grupoId`, `conciliacoesCartao.grupoId` (colunas Drizzle) — usados nas Tasks 2 e 3.

- [ ] **Step 1: Adicionar `grupoId` em `pixRecebimentos`**

Em `src/lib/db/schema.ts`, dentro de `export const pixRecebimentos = pgTable('pix_recebimentos', { ... })`, adicionar o campo logo após `id`:

```ts
export const pixRecebimentos = pgTable('pix_recebimentos', {
  id:               text('id').primaryKey(),  // endToEndId do ValidaPix
  grupoId:          uuid('grupo_id').notNull().references(() => grupos.id),
  dataPagamento:    timestamp('data_pagamento', { withTimezone: true }).notNull(),
  valor:            numeric('valor', { precision: 12, scale: 2 }).notNull(),
  pagadorNome:      text('pagador_nome'),
  pagadorDocumento: text('pagador_documento'),
  observacao:       text('observacao'),
  vendaId:          uuid('venda_id').references(() => vendas.id),
  pedidoId:         uuid('pedido_id').references(() => pedidosVenda.id),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Adicionar `grupoId` em `conciliacoesCartao`**

Dentro de `export const conciliacoesCartao = pgTable('conciliacoes_cartao', { ... })`, adicionar o campo logo após `id`:

```ts
export const conciliacoesCartao = pgTable('conciliacoes_cartao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  operadora: text('operadora').notNull(),
  dataTransacao: date('data_transacao').notNull(),
  nsu: text('nsu'),
  autorizacao: text('autorizacao'),
  valorBruto: numeric('valor_bruto', { precision: 12, scale: 2 }).notNull(),
  valorLiquido: numeric('valor_liquido', { precision: 12, scale: 2 }),
  parcelas: integer('parcelas').notNull().default(1),
  tipo: text('tipo').notNull().default('credito'),
  status: text('status').notNull().default('aprovado'),
  vendaId: uuid('venda_id').references(() => vendas.id),
  conciliado: boolean('conciliado').notNull().default(false),
  conciliadoEm: timestamp('conciliado_em', { withTimezone: true }),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Criar migration**

Criar `src/lib/db/migrations/0012_integracoes_por_grupo.sql`:

```sql
ALTER TABLE "pix_recebimentos" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "pix_recebimentos" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "pix_recebimentos" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "conciliacoes_cartao" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "conciliacoes_cartao" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "conciliacoes_cartao" ALTER COLUMN "grupo_id" SET NOT NULL;
```

- [ ] **Step 4: Aplicar migration**

Usar a ferramenta Supabase MCP (`apply_migration`) com o conteúdo do arquivo acima. Nome da migration: `integracoes_por_grupo`.

- [ ] **Step 5: Verificar**

Usar `list_tables` no MCP do Supabase e confirmar que `pix_recebimentos` e `conciliacoes_cartao` têm a coluna `grupo_id` (NOT NULL, com FK para `grupos`).

- [ ] **Step 6: Rodar type-check**

Run: `npm run type-check`
Expected: erros de tipo em `pix/page.tsx` e `conciliacao/actions.ts` (os inserts agora exigem `grupoId`) — isso é esperado, será corrigido nas Tasks 2 e 3.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0012_integracoes_por_grupo.sql
git commit -m "feat: grupo_id em pix_recebimentos e conciliacoes_cartao"
```

---

## Task 2: PIX — credenciais e dados por grupo ativo

**Files:**
- Modify: `src/lib/validapix.ts`
- Modify: `src/app/(dashboard)/pix/page.tsx`

**Interfaces:**
- Consumes: `pixRecebimentos.grupoId` (Task 1), `getGrupoAtivo` de `@/lib/grupo`
- Produces: `fetchAllPix(from: Date, to: Date, credenciais: { email: string; password: string }): Promise<PixTransaction[]>` (assinatura alterada — quebra o único chamador existente, corrigido neste mesmo task)

- [ ] **Step 1: Refatorar `src/lib/validapix.ts` para credenciais por parâmetro**

Substituir o conteúdo do arquivo por:

```ts
export interface PixTransaction {
  endToEndId: string
  name: string
  document: string
  id: string
  date: string
  price: string
  pixKey: string | null
  observation: string | null
  inPixChecked: boolean
  checkedDate: string | null
}

interface PixSession {
  accessToken: string
  deviceKey: string
  teamId: number
  expiresAt: number
}

// Cache de sessão por conta — cada grupo pode ter credenciais ValidaPix diferentes.
const sessions = new Map<string, PixSession>()

async function getSession(email: string, password: string): Promise<PixSession> {
  const cached = sessions.get(email)
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached

  const res = await fetch('https://api.validapix.tech/api/v2/auth/signIn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`ValidaPix auth falhou: ${res.status}`)

  const data = await res.json()

  const novaSession: PixSession = {
    accessToken: data.accessToken,
    deviceKey: data.deviceKey,
    teamId: data.teams[0].id,
    expiresAt: new Date(data.accessTokenExp).getTime(),
  }
  sessions.set(email, novaSession)

  return novaSession
}

async function fetchPage(s: PixSession, from: Date, to: Date, page: number, email: string): Promise<{ list: PixTransaction[]; totalPage: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: '100',
    search: '',
    from: from.toISOString(),
    to: to.toISOString(),
    paginate: 'true',
    emergency: 'false',
    exactTimes: 'false',
  })

  const res = await fetch(`https://api.validapix.tech/api/v2/pix?${params}`, {
    headers: {
      Authorization: `Bearer ${s.accessToken}`,
      'x-device-key': s.deviceKey,
      'x-team-id': String(s.teamId),
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (res.status === 401) {
    sessions.delete(email)
    throw new Error('Sessão ValidaPix expirada, recarregue a página')
  }
  if (!res.ok) throw new Error(`ValidaPix erro ${res.status}`)

  return res.json()
}

export async function fetchAllPix(from: Date, to: Date, credenciais: { email: string; password: string }): Promise<PixTransaction[]> {
  const s = await getSession(credenciais.email, credenciais.password)
  const first = await fetchPage(s, from, to, 1, credenciais.email)
  const all = [...first.list]

  for (let p = 2; p <= first.totalPage; p++) {
    const next = await fetchPage(s, from, to, p, credenciais.email)
    all.push(...next.list)
  }

  return all
}

export function parseObservation(obs: string | null): { tipo: 'NF' | 'PV' | 'OS' | null; numero: number | null } {
  if (!obs) return { tipo: null, numero: null }
  const m = obs.trim().match(/^(NF|PV|OS)\s+(\d+)$/i)
  if (!m) return { tipo: null, numero: null }
  return { tipo: m[1].toUpperCase() as 'NF' | 'PV' | 'OS', numero: parseInt(m[2]) }
}
```

- [ ] **Step 2: Atualizar `pix/page.tsx` — buscar credenciais do grupo ativo**

Editar `src/app/(dashboard)/pix/page.tsx`. Trocar o import (linha 2) e adicionar o import de `getGrupoAtivo`:

```tsx
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { fetchAllPix, parseObservation } from '@/lib/validapix'
import { db } from '@/lib/db'
import { vendas, pedidosVenda, lojas, motos, modelos, pixRecebimentos } from '@/lib/db/schema'
import { inArray, eq, sql } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CheckCircle2, AlertCircle, MinusCircle, TrendingUp } from 'lucide-react'
import { PixFiltros } from './components/pix-filtros'
```

Trocar o trecho que busca o PIX (linhas 40-47) por:

```tsx
  const params = await searchParams
  const hoje = new Date()

  const fromDate = params.from ? new Date(params.from + 'T00:00:00.000Z') : new Date('2026-05-28T00:00:00.000Z')
  const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : hoje

  // ── Buscar PIX ──────────────────────────────────────────────────────────────
  const grupo = await getGrupoAtivo(usuario)

  if (!grupo.validapixEmail || !grupo.validapixPassword) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">PIX Recebidos</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <p className="text-sm text-amber-800">
            O grupo <strong>{grupo.nome}</strong> ainda não tem credenciais do ValidaPix configuradas.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Cadastre em Admin → Grupos → editar o grupo.
          </p>
        </div>
      </div>
    )
  }

  let pixList = await fetchAllPix(fromDate, toDate, {
    email: grupo.validapixEmail,
    password: grupo.validapixPassword,
  })
```

- [ ] **Step 3: Gravar `grupoId` no upsert de `pixRecebimentos`**

No mesmo arquivo, localizar o bloco `if (pixList.length > 0) { await db.insert(pixRecebimentos)...}` (próximo ao final da função, antes do `return`) e adicionar `grupoId: grupo.id` a cada linha inserida:

```tsx
  // Persiste/atualiza os PIX no banco para cruzamento com vendas
  if (pixList.length > 0) {
    await db.insert(pixRecebimentos)
      .values(pixList.map(pix => {
        const { tipo, numero } = parseObservation(pix.observation)
        return {
          id:               pix.endToEndId,
          grupoId:          grupo.id,
          dataPagamento:    new Date(pix.date),
          valor:            pix.price,
          pagadorNome:      pix.name || null,
          pagadorDocumento: pix.document || null,
          observacao:       pix.observation || null,
          vendaId:          (tipo === 'NF' && numero ? vendaByNF.get(String(numero))?.id : null) ?? null,
          pedidoId:         (tipo === 'PV' && numero ? pedidoByNum.get(numero)?.id : null) ?? null,
        }
      }))
      .onConflictDoUpdate({
        target: pixRecebimentos.id,
        set: {
          vendaId:  sql`excluded.venda_id`,
          pedidoId: sql`excluded.pedido_id`,
        },
      })
  }
```

Não alterar mais nada no arquivo — o resto da lógica (busca de vendas/pedidos por NF/PV, cálculo de totais, renderização da tabela) continua igual.

- [ ] **Step 4: Rodar type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Rodar `npm run dev`. Com o grupo Sul de Minas ativo (que já deve ter credenciais, se o operador copiar as atuais do `.env` para `/admin/grupos`) ou com credenciais de teste cadastradas, acessar `/pix` e confirmar que a página carrega normalmente. Trocar para o grupo BH sem credenciais cadastradas e confirmar que aparece a mensagem de aviso em vez de erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validapix.ts "src/app/(dashboard)/pix/page.tsx"
git commit -m "feat: pix busca credenciais e grava grupo_id pelo grupo ativo"
```

---

## Task 3: Conciliação de cartão por grupo

**Files:**
- Modify: `src/app/(dashboard)/conciliacao/page.tsx`
- Modify: `src/app/(dashboard)/conciliacao/actions.ts`

**Interfaces:**
- Consumes: `conciliacoesCartao.grupoId` (Task 1), `getGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` de `@/lib/grupo`

- [ ] **Step 1: Gravar `grupoId` no upload (`importarRelatorioAction`)**

Editar `src/app/(dashboard)/conciliacao/actions.ts`. Adicionar o import de `getGrupoAtivo` no topo:

```ts
'use server'
import { db } from '@/lib/db'
import { conciliacoesCartao, pixRecebimentos, vendas, modelos, motos } from '@/lib/db/schema'
import { eq, and, desc, sql, isNull, ilike, inArray } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
```

Em `importarRelatorioAction`, logo após a checagem de permissão, buscar o grupo ativo:

```ts
export async function importarRelatorioAction(formData: FormData) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const operadoraSelecionada = formData.get('operadora') as string
```

No `await db.insert(conciliacoesCartao).values({...})` (dentro do loop `for (const r of rows)`), adicionar `grupoId: grupo.id`:

```ts
    await db.insert(conciliacoesCartao).values({
      grupoId:        grupo.id,
      operadora,
      dataTransacao:  r.dataTransacao,
      nsu:            r.nsu,
      autorizacao:    r.autorizacao,
      valorBruto:     String(r.valorBruto),
      valorLiquido:   r.valorLiquido != null ? String(r.valorLiquido) : null,
      parcelas:       r.parcelas,
      tipo:           r.tipo,
      status:         'aprovado',
      rawData:        { bandeira: r.bandeira, portador: r.portador },
      ...(vendaId ? { vendaId, conciliado: true, conciliadoEm: new Date() } : {}),
    })
```

Também restringir a deduplicação por NSU e por (data/valor/tipo/parcelas) ao grupo ativo, para não bloquear uma transação legítima da BH só porque existe uma coincidência de NSU/valor numa transação antiga do Sul de Minas. Nos dois blocos de deduplicação (dentro do loop), adicionar `eq(conciliacoesCartao.grupoId, grupo.id)` à condição `and(...)`:

```ts
    // Evita duplicata por NSU (Stone, PagueVeloz)
    if (r.nsu) {
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(
          eq(conciliacoesCartao.grupoId, grupo.id),
          eq(conciliacoesCartao.operadora, operadora),
          eq(conciliacoesCartao.nsu, r.nsu),
        ))
        .limit(1)
      if (ex) { duplicadas++; continue }
    } else {
      // InfinityPay: NSU mascarado — deduplica por (operadora, data, valor_bruto, tipo, parcelas)
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(
          eq(conciliacoesCartao.grupoId,        grupo.id),
          eq(conciliacoesCartao.operadora,      operadora),
          isNull(conciliacoesCartao.nsu),
          eq(conciliacoesCartao.dataTransacao,  r.dataTransacao),
          sql`${conciliacoesCartao.valorBruto}::numeric = ${r.valorBruto}`,
          eq(conciliacoesCartao.tipo,           r.tipo),
          eq(conciliacoesCartao.parcelas,       r.parcelas),
        ))
        .limit(1)
      if (ex) { duplicadas++; continue }
    }
```

- [ ] **Step 2: Escopar buscas do fluxo "vincular venda manualmente"**

No mesmo arquivo, atualizar `buscarConciliacoesPorValor`, `buscarVendasParaVincular` e `buscarVendaManual` para restringir ao grupo ativo:

```ts
export async function buscarConciliacoesPorValor(valor: number) {
  const usuario = await getUsuarioLogado()
  const ADMINS  = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  return db
    .select({
      id:            conciliacoesCartao.id,
      operadora:     conciliacoesCartao.operadora,
      autorizacao:   conciliacoesCartao.autorizacao,
      valorBruto:    conciliacoesCartao.valorBruto,
      dataTransacao: conciliacoesCartao.dataTransacao,
      tipo:          conciliacoesCartao.tipo,
      rawData:       conciliacoesCartao.rawData,
    })
    .from(conciliacoesCartao)
    .where(
      and(
        eq(conciliacoesCartao.grupoId, grupo.id),
        sql`${conciliacoesCartao.vendaId} IS NULL`,
        sql`ABS(${conciliacoesCartao.valorBruto}::numeric - ${valor}) <= 0.05`,
      )
    )
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(10)
}

export async function buscarPixDaVenda(vendaId: string) {
  const usuario = await getUsuarioLogado()

  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!venda) return []

  const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel) && venda.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão')
  }

  return db
    .select({
      id:              pixRecebimentos.id,
      dataPagamento:   pixRecebimentos.dataPagamento,
      valor:           pixRecebimentos.valor,
      pagadorNome:     pixRecebimentos.pagadorNome,
      observacao:      pixRecebimentos.observacao,
    })
    .from(pixRecebimentos)
    .where(eq(pixRecebimentos.vendaId, vendaId))
}

export async function buscarVendasParaVincular(valorRef: number) {
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  // Busca vendas onde algum lançamento de cartão tem valor exato (tolerância de R$0,01),
  // restrito às lojas do grupo ativo do usuário.
  return db
    .select({
      id:             vendas.id,
      numero:         vendas.numero,
      dataVenda:      vendas.dataVenda,
      clienteNome:    vendas.clienteNome,
      valor:          vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos:     vendas.pagamentos,
    })
    .from(vendas)
    .where(
      and(
        inArray(vendas.lojaId, lojaIdsGrupo),
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${vendas.pagamentos}) AS p
          WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
          AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
        )`,
      )
    )
    .orderBy(desc(vendas.dataVenda))
    .limit(50)
}

export async function buscarVendaManual(query: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const q = query.trim()
  if (q.length < 2) return []

  const isNumero = /^\d{1,7}$/.test(q)

  return db
    .select({
      id:             vendas.id,
      numero:         vendas.numero,
      dataVenda:      vendas.dataVenda,
      clienteNome:    vendas.clienteNome,
      valor:          vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos:     vendas.pagamentos,
    })
    .from(vendas)
    .where(
      and(
        inArray(vendas.lojaId, lojaIdsGrupo),
        isNumero ? eq(vendas.numero, parseInt(q, 10)) : ilike(vendas.clienteNome, `%${q}%`),
      )
    )
    .orderBy(desc(vendas.dataVenda))
    .limit(15)
}
```

Nota: `buscarConciliacoesDaVenda` (busca conciliações já vinculadas a uma venda específica) não muda — a venda já carrega seu próprio `lojaId`, então já está implicitamente escopada.

Importante: `inArray` precisa estar no import de `drizzle-orm` no topo do arquivo (já adicionado no Step 1 acima).

- [ ] **Step 3: Filtrar `conciliacao/page.tsx` pelo grupo ativo**

Editar `src/app/(dashboard)/conciliacao/page.tsx`. Trocar o import (linhas 1-4):

```tsx
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas } from '@/lib/db/schema'
import { eq, desc, and, isNull, isNotNull } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { UploadRelatorio } from './components/upload-relatorio'
import { VincularVendaButton } from './components/vincular-venda-button'
```

Trocar o corpo da função (a partir de `const { filtro = 'pendentes' } = await searchParams`) para incluir o grupo ativo em todas as queries:

```tsx
  const { filtro = 'pendentes' } = await searchParams
  const grupo = await getGrupoAtivo(usuario)

  const filtroStatus =
    filtro === 'conciliadas' ? eq(conciliacoesCartao.conciliado, true) :
    filtro === 'todas'       ? undefined :
    eq(conciliacoesCartao.conciliado, false)

  const whereClause = and(
    eq(conciliacoesCartao.grupoId, grupo.id),
    filtroStatus,
  )

  const transacoes = await db
    .select({
      id:            conciliacoesCartao.id,
      operadora:     conciliacoesCartao.operadora,
      dataTransacao: conciliacoesCartao.dataTransacao,
      tipo:          conciliacoesCartao.tipo,
      parcelas:      conciliacoesCartao.parcelas,
      valorBruto:    conciliacoesCartao.valorBruto,
      valorLiquido:  conciliacoesCartao.valorLiquido,
      nsu:           conciliacoesCartao.nsu,
      conciliado:    conciliacoesCartao.conciliado,
      vendaId:       conciliacoesCartao.vendaId,
      rawData:       conciliacoesCartao.rawData,
    })
    .from(conciliacoesCartao)
    .where(whereClause)
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(200)

  // Carrega dados das vendas vinculadas
  const vendaIds = [...new Set(transacoes.flatMap(t => t.vendaId ? [t.vendaId] : []))]
  const vendasMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  if (vendaIds.length > 0) {
    const rows = await db
      .select({ id: vendas.id, numero: vendas.numero, clienteNome: vendas.clienteNome, valor: vendas.valor })
      .from(vendas)
    rows.forEach(v => vendasMap.set(v.id, v))
  }

  const [totalPendentes, totalConciliadas] = await Promise.all([
    db.$count(conciliacoesCartao, and(eq(conciliacoesCartao.grupoId, grupo.id), eq(conciliacoesCartao.conciliado, false))),
    db.$count(conciliacoesCartao, and(eq(conciliacoesCartao.grupoId, grupo.id), eq(conciliacoesCartao.conciliado, true))),
  ])
```

Não alterar mais nada — o JSX de renderização (tabela, filtros de UI) permanece idêntico.

- [ ] **Step 4: Rodar type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Com o grupo Sul de Minas ativo, ir em `/conciliacao` e confirmar que as transações já existentes continuam aparecendo normalmente. Trocar para o grupo BH e confirmar que a lista fica vazia (nenhuma transação BH importada ainda). Fazer upload de um extrato de teste com o grupo BH ativo e confirmar que aparece só na aba BH.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/conciliacao"
git commit -m "feat: escopar conciliacao de cartao ao grupo ativo"
```

---

## Verificação final

- [ ] `npm run type-check` limpo.
- [ ] `/pix` busca a conta ValidaPix do grupo ativo (mostra aviso se não configurada, em vez de erro).
- [ ] `/conciliacao` mostra e grava transações só do grupo ativo; upload de extrato grava no grupo certo.
- [ ] Vincular venda manualmente só encontra vendas do grupo ativo.
- [ ] Sul de Minas continua funcionando exatamente como antes (zero impacto visível) desde que as credenciais atuais do `.env` sejam copiadas para o registro do grupo Sul de Minas em `/admin/grupos`.
