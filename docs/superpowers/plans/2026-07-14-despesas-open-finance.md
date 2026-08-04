# Importação Automática de Despesas via Open Finance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Puxar débitos (saídas) da conta bancária via Open Finance (mcp.ai) para uma tela de revisão em `/despesas`, onde o usuário atribui categoria + loja e a saída vira uma despesa de verdade.

**Architecture:** Nova tabela `despesas_open_finance` guarda cada saída bruta do banco (nasce nula em categoria/loja). Uma nova aba "Importar do Banco" em `/despesas` lista as pendentes; ao lançar (categoria + loja preenchidos), cria a linha em `despesas` e marca a origem como lançada. A sincronização com o mcp.ai reaproveita a mesma listagem de transações já usada por `buscarPixRecebidos` (extraída para uma função compartilhada), agora também filtrando débitos.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript. Sem framework de testes automatizados neste repo — verificação é `tsc --noEmit` (`npm run type-check`), `npm run build`, consultas diretas ao Postgres via script Node temporário, e checagem manual no navegador (Playwright MCP), seguindo o padrão já usado neste projeto.

## Global Constraints

- Migração de schema: SQL manual executado via script Node temporário com o client `postgres` (usando `DATABASE_URL` de `.env.local`) — **nunca** `npm run db:generate`/`db:migrate` neste repo (journal quebrado). Depois de rodar o SQL, o `src/lib/db/schema.ts` é atualizado manualmente para casar com o banco.
- Só `admin_geral`/`admin_socio` podem lançar despesas — mesma regra já usada em `src/app/(dashboard)/despesas/actions.ts`.
- Toda mudança de UI usa `<select>` HTML nativo pra loja/categoria (não o componente `Select` customizado de `@/components/ui/select`) — é o padrão já usado em `despesa-dialog.tsx` e evita um bug conhecido do componente customizado (mostra o value cru em vez do label).
- Todo filtro de data client-side usa `usePathname()` pra montar a URL de navegação, nunca um path fixo — um componente compartilhado (`PixFiltros`) já quebrou por isso nesta sessão.
- Ao final de cada task: `npm run type-check` deve passar limpo antes de seguir pra próxima.

---

### Task 1: Schema — tabela `despesas_open_finance`

**Files:**
- Create (temporário, apagar ao final da task): `D:\Claude\Teste\_migration_despesas_of.mjs`
- Modify: `D:\Claude\Teste\src\lib\db\schema.ts` (adicionar após a tabela `despesas`, linha ~386)

**Interfaces:**
- Produces: tabela Drizzle `despesasOpenFinance` com colunas `id, grupoId, contaId, banco, transacaoId, data, valor, favorecidoNome, descricao, tipoOperacao, categoria, lojaId, despesaId, lancadoPorId, lancadoEm, criadoEm` — usada pelas Tasks 3, 4, 5, 6.

- [ ] **Step 1: Escrever e rodar a migration SQL**

Criar `D:\Claude\Teste\_migration_despesas_of.mjs`:

```js
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

await sql`
  CREATE TABLE IF NOT EXISTS despesas_open_finance (
    id uuid primary key default gen_random_uuid(),
    grupo_id uuid not null references grupos(id),
    conta_id text not null,
    banco text not null,
    transacao_id text not null unique,
    data timestamptz not null,
    valor numeric(12,2) not null,
    favorecido_nome text,
    descricao text,
    tipo_operacao text,
    categoria text,
    loja_id uuid references lojas(id),
    despesa_id uuid references despesas(id),
    lancado_por_id uuid references usuarios(id),
    lancado_em timestamptz,
    criado_em timestamptz not null default now()
  )
`
console.log('OK: despesas_open_finance criada')

const check = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'despesas_open_finance' ORDER BY ordinal_position
`
console.log(check)

await sql.end()
```

Rodar:
```bash
cd "D:/Claude/Teste" && node --env-file=.env.local _migration_despesas_of.mjs
```

Expected: imprime "OK: despesas_open_finance criada" seguido da lista de 15 colunas.

- [ ] **Step 2: Apagar o script de migration**

```bash
rm "D:/Claude/Teste/_migration_despesas_of.mjs"
```

- [ ] **Step 3: Adicionar a tabela no schema.ts**

Em `D:\Claude\Teste\src\lib\db\schema.ts`, logo depois do fechamento da tabela `despesas` (procurar `export const despesas = pgTable('despesas', {` e o `})` que a fecha), adicionar:

```ts
// ─── despesas_open_finance (saídas bancárias puxadas do Open Finance) ─────────
// Nasce sem categoria/loja; vira uma linha em `despesas` quando o usuário
// atribui os dois campos ("lançar"). despesaId é preenchido nesse momento.
export const despesasOpenFinance = pgTable('despesas_open_finance', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  contaId:        text('conta_id').notNull(),
  banco:          text('banco').notNull(),
  transacaoId:    text('transacao_id').notNull().unique(),
  data:           timestamp('data', { withTimezone: true }).notNull(),
  valor:          numeric('valor', { precision: 12, scale: 2 }).notNull(),
  favorecidoNome: text('favorecido_nome'),
  descricao:      text('descricao'),
  tipoOperacao:   text('tipo_operacao'),
  categoria:      text('categoria'),
  lojaId:         uuid('loja_id').references(() => lojas.id),
  despesaId:      uuid('despesa_id').references(() => despesas.id),
  lancadoPorId:   uuid('lancado_por_id').references(() => usuarios.id),
  lancadoEm:      timestamp('lancado_em', { withTimezone: true }),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat: adiciona tabela despesas_open_finance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `src/lib/mcpai.ts` — fetch compartilhado + `buscarSaidasOpenFinance`

**Files:**
- Modify: `D:\Claude\Teste\src\lib\mcpai.ts:75-223` (bloco do comentário sobre formato de descrição até o fim de `buscarPixRecebidos`)

**Interfaces:**
- Consumes: `chamarMcp` (já existe no topo do arquivo, não muda).
- Produces:
  - `buscarPixRecebidos(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoPix>` — mesma assinatura de antes, comportamento idêntico (consumido por `src/app/(dashboard)/pix-mcp/page.tsx`, não muda).
  - `buscarSaidasOpenFinance(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoSaidas>` — nova função, usada pela Task 4.
  - `type TransacaoSaida = { contaId: string; banco: string; transacaoId: string; data: string; valor: string; favorecidoNome: string | null; descricao: string | null; tipoOperacao: string }`

- [ ] **Step 1: Substituir o bloco de `extrairPagadorDaDescricao` até o fim de `buscarPixRecebidos`**

Trocar as linhas 75–223 de `src/lib/mcpai.ts` (do comentário `// Formato da descrição do PIX recebido...` até o `}` que fecha `buscarPixRecebidos`) por:

```ts
// Formato da descrição da transação muda por banco (serve tanto pra PIX
// recebido quanto pra saídas em geral):
// - Sicoob: pseudo-CSV separado por "|@", ex. "PIX RECEBIDO - OUTRA IF -
//   Recebimento Pix|@GISELLE BOTELHO VILAS BOAS|@***.206.316-**|@" — nome
//   é o segmento [1].
// - Sicredi: "RECEBIMENTO PIX <documento sem pontuação> <NOME>" — nome é
//   tudo depois do documento (que costuma vir truncado/abreviado quando
//   comparado ao paymentData, por isso só usamos como fallback).
function extrairContraparteDaDescricao(descricao: string | null | undefined): string | null {
  if (!descricao) return null

  if (descricao.includes('|@')) {
    const nome = descricao.split('|@')[1]?.trim()
    return nome || null
  }

  const match = descricao.match(/^(?:RECEBIMENTO|PAGAMENTO)\s+\S+\s+\S+\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

type TransacaoBruta = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  tipo: string
  operationType: string
  descricao: string | null
  paymentData?: { payer?: string; recipient?: string }
}

type ResultadoTransacoesBrutas =
  | { ok: true; transacoes: TransacaoBruta[] }
  | { ok: false; erro: string }

// Busca TODAS as transações (crédito e débito) das contas do grupo no
// período — usada tanto por buscarPixRecebidos (filtra crédito/PIX) quanto
// por buscarSaidasOpenFinance (filtra débito), pra não bater duas vezes na
// API do mcp.ai pra cada sincronização.
async function listarTransacoesBrutas(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoTransacoesBrutas> {
  try {
    const init = await chamarMcp(null, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'moto-chefe', version: '1.0' },
      },
    })
    if (init.json.error) {
      return { ok: false, erro: init.json.error.message ?? 'Erro ao iniciar sessão com mcp.ai' }
    }
    if (!init.sessionId) {
      return { ok: false, erro: 'mcp.ai não retornou identificador de sessão' }
    }

    const contasChamada = await chamarMcp(init.sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'openfinance_list_accounts',
        arguments: { type: 'BANK' },
      },
    })
    if (contasChamada.json.error) {
      return { ok: false, erro: contasChamada.json.error.message ?? 'Erro ao buscar contas no mcp.ai' }
    }
    const contasResult = contasChamada.json.result as { content?: { text?: string }[] } | undefined
    const contasConteudo = contasResult?.content?.[0]?.text
    if (!contasConteudo) return { ok: false, erro: 'Resposta inesperada do mcp.ai ao listar contas' }

    const contasPayload = JSON.parse(contasConteudo) as {
      results?: Array<{ id: string; bank: string; subtype: string; taxNumber: string }>
    }
    // Cada CNPJ conectado aparece como um "item" próprio no mcp.ai — filtramos
    // pelo CNPJ do grupo ativo pra não misturar contas de grupos diferentes
    // (ex: Sicredi do Sul de Minas vs Sicredi da BH, ambas com o mesmo nome de banco).
    // Sicredi do Sul de Minas não é usada pra receber PIX de venda — só a Sicoob.
    const BANCOS_EXCLUIDOS_POR_CNPJ: Record<string, string[]> = {
      '57.113.017/0001-72': ['Sicredi Empresas'],
    }
    const bancosExcluidos = BANCOS_EXCLUIDOS_POR_CNPJ[cnpjGrupo] ?? []
    const contas = (contasPayload.results ?? []).filter(
      c => c.subtype !== 'SAVINGS_ACCOUNT' && c.taxNumber === cnpjGrupo && !bancosExcluidos.includes(c.bank),
    )

    const inicioMs = dataInicio.getTime()
    const fimMs = dataFim.getTime()
    const transacoes: TransacaoBruta[] = []

    for (const conta of contas) {
      // O mcp.ai não atualiza a conta em tempo real sozinho — sem forçar o
      // sync, transações recebidas/enviadas nas últimas horas não aparecem ainda.
      await chamarMcp(init.sessionId, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'openfinance_force_sync',
          arguments: { account_id: conta.id },
        },
      }).catch(() => {})

      const txChamada = await chamarMcp(init.sessionId, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'openfinance_list_transactions',
          arguments: { account_id: conta.id },
        },
      })
      if (txChamada.json.error) continue

      const txResult = txChamada.json.result as { content?: { text?: string }[] } | undefined
      const txConteudo = txResult?.content?.[0]?.text
      if (!txConteudo) continue

      const txPayload = JSON.parse(txConteudo) as {
        results?: Array<{
          id: string
          date: string
          amount: string
          type: string
          operationType: string
          description: string
          paymentData?: { payer?: string; recipient?: string }
        }>
      }

      for (const tx of txPayload.results ?? []) {
        const dataMs = new Date(tx.date).getTime()
        if (dataMs < inicioMs || dataMs > fimMs) continue

        transacoes.push({
          contaId: conta.id,
          banco: conta.bank,
          transacaoId: tx.id,
          data: tx.date,
          valor: tx.amount,
          tipo: tx.type,
          operationType: tx.operationType,
          descricao: tx.description ?? null,
          paymentData: tx.paymentData,
        })
      }
    }

    return { ok: true, transacoes }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
}

type TransacaoPix = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  pagadorNome: string | null
  descricao: string | null
}

type ResultadoPix =
  | { ok: true; transacoes: TransacaoPix[] }
  | { ok: false; erro: string }

export async function buscarPixRecebidos(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoPix> {
  const bruto = await listarTransacoesBrutas(dataInicio, dataFim, cnpjGrupo)
  if (!bruto.ok) return bruto

  const transacoes = bruto.transacoes
    .filter(t => t.tipo === 'CREDIT' && t.operationType === 'PIX')
    .map(t => ({
      contaId: t.contaId,
      banco: t.banco,
      transacaoId: t.transacaoId,
      data: t.data,
      valor: t.valor,
      pagadorNome: t.paymentData?.payer?.trim() || extrairContraparteDaDescricao(t.descricao),
      descricao: t.descricao,
    }))

  return { ok: true, transacoes }
}

export type TransacaoSaida = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  favorecidoNome: string | null
  descricao: string | null
  tipoOperacao: string
}

type ResultadoSaidas =
  | { ok: true; transacoes: TransacaoSaida[] }
  | { ok: false; erro: string }

export async function buscarSaidasOpenFinance(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoSaidas> {
  const bruto = await listarTransacoesBrutas(dataInicio, dataFim, cnpjGrupo)
  if (!bruto.ok) return bruto

  const transacoes = bruto.transacoes
    .filter(t => t.tipo === 'DEBIT')
    .map(t => ({
      contaId: t.contaId,
      banco: t.banco,
      transacaoId: t.transacaoId,
      data: t.data,
      valor: t.valor,
      favorecidoNome: t.paymentData?.recipient?.trim() || t.paymentData?.payer?.trim() || extrairContraparteDaDescricao(t.descricao),
      descricao: t.descricao,
      tipoOperacao: t.operationType,
    }))

  return { ok: true, transacoes }
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros. Isso confirma que `buscarPixRecebidos` mantém a mesma assinatura/uso em `pix-mcp/page.tsx` (nenhum outro arquivo precisa mudar).

- [ ] **Step 3: Testar contra o mcp.ai de verdade (checagem manual — não é possível mockar esse serviço externo)**

Criar um script temporário `D:\Claude\Teste\_test_saidas.mjs`:

```js
process.loadEnvFile('.env.local')
const { buscarSaidasOpenFinance } = await import('./src/lib/mcpai.ts')
// Se der erro de import direto de .ts, rodar via: npx tsx _test_saidas.mjs
const hoje = new Date()
const seteDias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
const r = await buscarSaidasOpenFinance(seteDias, hoje, '<CNPJ do grupo Sul de Minas>')
console.log(JSON.stringify(r, null, 2).slice(0, 3000))
```

Rodar com `npx tsx _test_saidas.mjs`. **Objetivo:** conferir no output se `favorecidoNome` está vindo preenchido pra pelo menos algumas transações de débito — se `paymentData.recipient` não existir na resposta real da API, ajustar o fallback no Step 1 pra usar o campo correto (ler o JSON bruto impresso pra achar o nome do campo certo). Apagar o script ao final:

```bash
rm "D:/Claude/Teste/_test_saidas.mjs"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcpai.ts
git commit -m "$(cat <<'EOF'
feat: extrai fetch de transacoes compartilhado no mcpai e adiciona buscarSaidasOpenFinance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `despesas/actions.ts` — action de lançamento

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\despesas\actions.ts`

**Interfaces:**
- Consumes: `despesasOpenFinance`, `despesas` (schema, Task 1); `getUsuarioLogado`, `getGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (já importados no arquivo).
- Produces: `lancarDespesaOpenFinanceAction(id: string, categoria: string, lojaId: string | null): Promise<void>` — usada pela Task 5 (componente `LancarDespesaForm`).

- [ ] **Step 1: Adicionar a nova action**

No fim de `D:\Claude\Teste\src\app\(dashboard)\despesas\actions.ts`, atualizar o import do topo:

```ts
import { despesas, despesasOpenFinance } from '@/lib/db/schema'
```

E adicionar ao final do arquivo:

```ts

export async function lancarDespesaOpenFinanceAction(id: string, categoria: string, lojaId: string | null) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  if (!categoria.trim()) throw new Error('Categoria é obrigatória')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdValida = await lojaIdValidaNoGrupo(usuario, lojaId)

  const [linha] = await db.select().from(despesasOpenFinance)
    .where(and(eq(despesasOpenFinance.id, id), eq(despesasOpenFinance.grupoId, grupo.id)))
    .limit(1)
  if (!linha) throw new Error('Saída não encontrada')
  if (linha.despesaId) throw new Error('Essa saída já foi lançada')

  await db.transaction(async (tx) => {
    const [despesaCriada] = await tx.insert(despesas).values({
      grupoId:        grupo.id,
      lojaId:         lojaIdValida,
      usuarioId:      usuario.id,
      categoria,
      descricao:      linha.descricao,
      valor:          linha.valor,
      data:           linha.data.toISOString().split('T')[0],
      formaPagamento: linha.tipoOperacao ?? 'Outro',
      banco:          linha.banco,
    }).returning({ id: despesas.id })

    await tx.update(despesasOpenFinance).set({
      categoria,
      lojaId: lojaIdValida,
      despesaId: despesaCriada.id,
      lancadoPorId: usuario.id,
      lancadoEm: new Date(),
    }).where(eq(despesasOpenFinance.id, id))
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/despesas/actions.ts"
git commit -m "$(cat <<'EOF'
feat: action pra lancar despesa a partir de saida do Open Finance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `despesas/open-finance.ts` — helper de sincronização

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\despesas\open-finance.ts`

**Interfaces:**
- Consumes: `buscarSaidasOpenFinance` (Task 2), `despesasOpenFinance`, `pixMcpSyncStatus` (schema).
- Produces: `sincronizarEBuscarSaidas(grupo: { id: string; cnpj: string }, fromDate: Date, toDate: Date, forcarSync: boolean): Promise<{ linhas: SaidaComDetalhes[]; erroSync: string | null; syncStatusAtual: { ultimaSincronizacao: Date } | null }>` — usada pela Task 6.
  - `type SaidaComDetalhes = typeof despesasOpenFinance.$inferSelect & { lojaNome: string | null; lancadoPorNome: string | null }`

- [ ] **Step 1: Escrever o helper**

Criar `D:\Claude\Teste\src\app\(dashboard)\despesas\open-finance.ts`:

```ts
import { db } from '@/lib/db'
import { despesasOpenFinance, pixMcpSyncStatus, lojas, usuarios } from '@/lib/db/schema'
import { buscarSaidasOpenFinance } from '@/lib/mcpai'
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm'

// Mesma janela de cache do PIX (teste) — é a mesma conexão com o mcp.ai,
// então reaproveita o mesmo controle de staleness (pix_mcp_sync_status).
const JANELA_CACHE_MS = 10 * 60 * 1000

export type SaidaComDetalhes = typeof despesasOpenFinance.$inferSelect & {
  lojaNome: string | null
  lancadoPorNome: string | null
}

export async function sincronizarEBuscarSaidas(
  grupo: { id: string; cnpj: string },
  fromDate: Date,
  toDate: Date,
  forcarSync: boolean,
): Promise<{ linhas: SaidaComDetalhes[]; erroSync: string | null; syncStatusAtual: { ultimaSincronizacao: Date } | null }> {
  const [syncStatus] = await db.select().from(pixMcpSyncStatus).where(eq(pixMcpSyncStatus.grupoId, grupo.id)).limit(1)
  const cacheValido = !forcarSync && syncStatus && (Date.now() - syncStatus.ultimaSincronizacao.getTime()) < JANELA_CACHE_MS

  let erroSync: string | null = null

  if (!cacheValido) {
    const desde = new Date('2025-01-01T00:00:00.000Z')
    const resultado = await buscarSaidasOpenFinance(desde, new Date(), grupo.cnpj)

    if (!resultado.ok) {
      erroSync = resultado.erro
    } else {
      if (resultado.transacoes.length > 0) {
        await db.insert(despesasOpenFinance)
          .values(resultado.transacoes.map(tx => ({
            grupoId: grupo.id,
            contaId: tx.contaId,
            banco: tx.banco,
            transacaoId: tx.transacaoId,
            data: new Date(tx.data),
            valor: tx.valor,
            favorecidoNome: tx.favorecidoNome,
            descricao: tx.descricao,
            tipoOperacao: tx.tipoOperacao,
          })))
          .onConflictDoNothing({ target: despesasOpenFinance.transacaoId })
      }
      await db.insert(pixMcpSyncStatus)
        .values({ grupoId: grupo.id, ultimaSincronizacao: new Date() })
        .onConflictDoUpdate({ target: pixMcpSyncStatus.grupoId, set: { ultimaSincronizacao: new Date() } })
    }
  }

  const [syncStatusAtual] = await db.select().from(pixMcpSyncStatus).where(eq(pixMcpSyncStatus.grupoId, grupo.id)).limit(1)

  const linhasRaw = await db
    .select()
    .from(despesasOpenFinance)
    .where(and(
      eq(despesasOpenFinance.grupoId, grupo.id),
      gte(despesasOpenFinance.data, fromDate),
      lte(despesasOpenFinance.data, toDate),
    ))
    .orderBy(desc(despesasOpenFinance.data))

  const lojaIds = linhasRaw.map(l => l.lojaId).filter((id): id is string => !!id)
  const lancadoPorIds = linhasRaw.map(l => l.lancadoPorId).filter((id): id is string => !!id)

  const [lojasDb, usuariosDb] = await Promise.all([
    lojaIds.length > 0
      ? db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
    lancadoPorIds.length > 0
      ? db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(inArray(usuarios.id, lancadoPorIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
  ])
  const lojaNomeById = new Map(lojasDb.map(l => [l.id, l.nome]))
  const usuarioNomeById = new Map(usuariosDb.map(u => [u.id, u.nome]))

  const linhas: SaidaComDetalhes[] = linhasRaw.map(l => ({
    ...l,
    lojaNome: l.lojaId ? lojaNomeById.get(l.lojaId) ?? null : null,
    lancadoPorNome: l.lancadoPorId ? usuarioNomeById.get(l.lancadoPorId) ?? null : null,
  }))

  return { linhas, erroSync, syncStatusAtual: syncStatusAtual ?? null }
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/despesas/open-finance.ts"
git commit -m "$(cat <<'EOF'
feat: helper de sincronizacao de saidas do Open Finance pra despesas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Componentes de UI — filtro e formulário de lançamento

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\despesas\components\saidas-filtros.tsx`
- Create: `D:\Claude\Teste\src\app\(dashboard)\despesas\components\lancar-despesa-form.tsx`

**Interfaces:**
- Consumes: `lancarDespesaOpenFinanceAction` (Task 3).
- Produces: `<SaidasFiltros defaultFrom={string} defaultTo={string} />`, `<LancarDespesaForm id={string} lojas={{id:string;nome:string}[]} categorias={string[]} jaLancado={{lojaNome:string|null; lancadoPorNome:string|null; lancadoEm:string|null}|null} />` — ambos usados pela Task 6.

- [ ] **Step 1: Criar o filtro de data**

Criar `D:\Claude\Teste\src\app\(dashboard)\despesas\components\saidas-filtros.tsx`:

```tsx
'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw } from 'lucide-react'

export function SaidasFiltros({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  function aplicar() {
    const p = new URLSearchParams(params.toString())
    if (fromRef.current?.value) p.set('sfrom', fromRef.current.value)
    if (toRef.current?.value) p.set('sto', toRef.current.value)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">De</Label>
        <Input ref={fromRef} type="date" defaultValue={defaultFrom} className="w-36 h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Até</Label>
        <Input ref={toRef} type="date" defaultValue={defaultTo} className="w-36 h-8 text-sm" />
      </div>
      <Button size="sm" variant="outline" onClick={aplicar} className="h-8 gap-2">
        <RefreshCw size={14} />
        Atualizar
      </Button>
    </div>
  )
}
```

Nota: usa `sfrom`/`sto` (não `from`/`to`) de propósito — a página já usa `mes` como query param pra aba "Lançamentos"; nomes distintos evitam colisão quando as duas abas compartilham a URL.

- [ ] **Step 2: Criar o formulário de lançamento**

Criar `D:\Claude\Teste\src\app\(dashboard)\despesas\components\lancar-despesa-form.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { lancarDespesaOpenFinanceAction } from '../actions'

type Props = {
  id: string
  lojas: { id: string; nome: string }[]
  categorias: string[]
  jaLancado: { lojaNome: string | null; lancadoPorNome: string | null; lancadoEm: string | null } | null
}

export function LancarDespesaForm({ id, lojas, categorias, jaLancado }: Props) {
  const [pending, startTransition] = useTransition()
  const [categoria, setCategoria] = useState('')
  const [lojaId, setLojaId] = useState('')
  const [lojaEscolhida, setLojaEscolhida] = useState(false)

  if (jaLancado) {
    const quando = jaLancado.lancadoEm
      ? new Date(jaLancado.lancadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null
    return (
      <div className="text-xs">
        <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          Lançada — {jaLancado.lojaNome ?? 'Geral'}
        </span>
        {jaLancado.lancadoPorNome && (
          <p className="text-slate-400 mt-0.5">{jaLancado.lancadoPorNome}{quando ? ` · ${quando}` : ''}</p>
        )}
      </div>
    )
  }

  function lancar() {
    if (!categoria || !lojaEscolhida) {
      toast.error('Escolha categoria e loja')
      return
    }
    startTransition(async () => {
      try {
        await lancarDespesaOpenFinanceAction(id, categoria, lojaId || null)
        toast.success('Despesa lançada!')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar')
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={categoria}
        onChange={e => setCategoria(e.target.value)}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
      >
        <option value="">Categoria...</option>
        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={lojaId}
        onChange={e => { setLojaId(e.target.value); setLojaEscolhida(true) }}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
      >
        <option value="" disabled={!lojaEscolhida}>Loja...</option>
        <option value="">Geral — empresa</option>
        {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      <Button size="sm" className="h-8 text-xs" disabled={pending || !categoria || !lojaEscolhida} onClick={lancar}>
        {pending ? 'Lançando…' : 'Lançar'}
      </Button>
    </div>
  )
}
```

Nota sobre o select de loja: como `""` já é o value de "Geral — empresa" (mesmo padrão do `DespesaDialog`), o placeholder "Loja..." usa `disabled` pra não ser confundido com uma escolha real — só quando `lojaEscolhida` vira `true` (usuário mexeu no select, mesmo escolhendo "Geral") o botão libera.

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros (os dois componentes ainda não são importados em lugar nenhum, então não afetam a build até a Task 6).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/despesas/components/saidas-filtros.tsx" "src/app/(dashboard)/despesas/components/lancar-despesa-form.tsx"
git commit -m "$(cat <<'EOF'
feat: componentes de filtro e lancamento pra saidas do Open Finance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `despesas/page.tsx` — aba "Importar do Banco"

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\despesas\page.tsx`

**Interfaces:**
- Consumes: `sincronizarEBuscarSaidas` (Task 4), `SaidasFiltros`, `LancarDespesaForm` (Task 5).

- [ ] **Step 1: Atualizar os imports do topo do arquivo**

No início de `D:\Claude\Teste\src\app\(dashboard)\despesas\page.tsx`, trocar:

```ts
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios, categoriasDespesa } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { Suspense } from 'react'
```

por:

```ts
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios, categoriasDespesa } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { SaidasFiltros } from './components/saidas-filtros'
import { LancarDespesaForm } from './components/lancar-despesa-form'
import { sincronizarEBuscarSaidas } from './open-finance'
import { Suspense } from 'react'
```

- [ ] **Step 2: Buscar parâmetros e dados das saídas, logo após o cálculo de `ultimoDia`**

Depois da linha `const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]`, adicionar:

```ts
  const hojeDate = new Date()
  const inicioMesAtualDate = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1)
  const sfrom = params.sfrom ? new Date(params.sfrom + 'T00:00:00.000Z') : new Date(inicioMesAtualDate.toISOString().split('T')[0] + 'T00:00:00.000Z')
  const sto = params.sto ? new Date(params.sto + 'T23:59:59.999Z') : hojeDate
  const forcarSyncSaidas = params.sync === '1'

  const { linhas: saidas, erroSync, syncStatusAtual } = await sincronizarEBuscarSaidas(
    { id: grupo.id, cnpj: grupo.cnpj },
    sfrom,
    sto,
    forcarSyncSaidas,
  )
```

- [ ] **Step 3: Calcular os totais de saídas, logo após o bloco de `totalGeral`/`totalLojas`/`totalEmpresa`**

Depois de `const totalEmpresa = ...`, adicionar:

```ts
  const totalSaidas = saidas.reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasLancadas = saidas.filter(l => l.despesaId).reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasPendentes = totalSaidas - totalSaidasLancadas
  const qtdSaidasPendentes = saidas.filter(l => !l.despesaId).length
```

- [ ] **Step 4: Envolver o conteúdo existente em abas**

O `return (...)` atual começa com `<div className="space-y-6">` e contém: o cabeçalho com título/seletor de mês/botão nova despesa, os 3 cards de resumo, e o card de "Lançamentos". Envolver **só a partir dos 3 cards de resumo até o fim do card de Lançamentos** (não o cabeçalho) em:

```tsx
      <Tabs defaultValue="lancamentos">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="banco">
            Importar do Banco
            {qtdSaidasPendentes > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{qtdSaidasPendentes}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-4 space-y-6">
          {/* Cards de resumo + Card de Lançamentos, exatamente como estão hoje */}
        </TabsContent>

        <TabsContent value="banco" className="mt-4 space-y-6">
          {/* Novo conteúdo da Task 6, Step 5 */}
        </TabsContent>
      </Tabs>
```

(o comentário `{/* Cards de resumo + Card de Lançamentos... */}` é só indicação de onde mover o JSX que já existe — mover o JSX de verdade pra dentro do `<TabsContent value="lancamentos">`, não deixar como comentário).

- [ ] **Step 5: Escrever o conteúdo da aba "Importar do Banco"**

Dentro do `<TabsContent value="banco" className="mt-4 space-y-6">`:

```tsx
          {erroSync && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Não foi possível sincronizar com o mcp.ai agora ({erroSync}) — mostrando os dados já salvos.
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <p className="text-xs text-slate-400">
              {syncStatusAtual
                ? `Sincronizado com o banco em ${syncStatusAtual.ultimaSincronizacao.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : 'Ainda não sincronizado'}
            </p>
            <SaidasFiltros
              defaultFrom={sfrom.toISOString().split('T')[0]}
              defaultTo={sto.toISOString().split('T')[0]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total em Saídas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Já Lançadas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-600">{fmt(totalSaidasLancadas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Pendentes de Categorização</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(totalSaidasPendentes)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Data</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Favorecido / Descrição</th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Valor</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Categoria / Loja</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {saidas.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {s.data.toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{s.favorecidoNome || '—'}</p>
                        {s.descricao && <p className="text-xs text-slate-400 truncate max-w-xs" title={s.descricao}>{s.descricao}</p>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(Number(s.valor))}</td>
                      <td className="px-4 py-2">
                        <LancarDespesaForm
                          id={s.id}
                          lojas={lojasOpts}
                          categorias={categoriasAtivas}
                          jaLancado={s.despesaId ? {
                            lojaNome: s.lojaNome,
                            lancadoPorNome: s.lancadoPorNome,
                            lancadoEm: s.lancadoEm ? s.lancadoEm.toISOString() : null,
                          } : null}
                        />
                      </td>
                    </tr>
                  ))}
                  {saidas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-400 py-8">
                        Nenhuma saída no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
```

- [ ] **Step 6: Verificar tipos**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros. Se `params` não tiver `sfrom`/`sto`/`sync` no tipo da função (a assinatura de `searchParams` já é `Promise<Record<string, string | undefined>>` — genérica o suficiente, não precisa mudar tipo).

- [ ] **Step 7: Build completo**

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build passa sem erros, rota `/despesas` listada normalmente.

- [ ] **Step 8: Checagem manual no navegador**

Com o dev server rodando (`npm run dev`), abrir `/despesas` logado como admin:
1. Confirmar que aparecem as duas abas "Lançamentos" e "Importar do Banco".
2. Clicar em "Importar do Banco" — confirmar que sincroniza e lista saídas reais do banco (comparar 2-3 valores com o extrato).
3. Escolher categoria + loja numa linha pendente e clicar "Lançar" — confirmar que ela muda pra "Lançada — <loja>" e que a mesma despesa aparece na aba "Lançamentos" e no Financeiro do mês correspondente.
4. Recarregar a página — confirmar que a linha lançada continua marcada (não voltou a pendente) e que a sincronização não duplicou nenhuma linha (comparar contagem de "Total em Saídas" antes/depois do reload).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/despesas/page.tsx"
git commit -m "$(cat <<'EOF'
feat: aba Importar do Banco em Despesas, com sincronizacao Open Finance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Deploy

**Files:** nenhum (só operação).

- [ ] **Step 1: Push**

```bash
cd "D:/Claude/Teste" && git push origin main
```

- [ ] **Step 2: Deploy produção**

```bash
cd "D:/Claude/Teste" && vercel --prod --yes
```

Expected: `readyState: "READY"`.

- [ ] **Step 3: Checagem pós-deploy**

Repetir o Step 8 da Task 6 direto em `moto-chefe.vercel.app` (não só no dev local) — sincronização com o mcp.ai depende de variáveis de ambiente de produção (`MCPAI_ENDPOINT_URL`), que podem se comportar diferente do `.env.local`.
