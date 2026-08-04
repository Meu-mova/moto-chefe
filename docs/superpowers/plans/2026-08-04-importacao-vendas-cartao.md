# Coletor InfinitePay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a venda de cartão da InfinitePay entrar sozinha em `conciliacoes_cartao`, sem ninguém baixar e subir CSV.

**Architecture:** Um script local (Playwright, perfil de navegador persistente) abre o painel da InfinitePay já logado, dispara a chamada da API interna de dentro da própria página — herdando o token que o app renova sozinho — e manda o resultado normalizado para o `POST /api/conciliacao/cartao`, que já existe e já faz toda a conciliação. A lógica de casamento com venda/peça/OS **não é tocada**.

**Tech Stack:** TypeScript, Node 20, `tsx`, `node:test` + `node:assert/strict`, Playwright (novo, só devDependency), Drizzle + postgres.js, Next.js App Router (route handler existente).

Spec: `docs/superpowers/specs/2026-08-04-coletor-infinitepay-design.md`

## Global Constraints

- **Toda funcionalidade nasce escopada por grupo.** Nada global. Os dois grupos hoje: Sul de Minas `57.113.017/0001-72`, BH `63.009.605/0001-63`.
- **Sem migração de banco.** `conciliacoes_cartao` já tem todas as colunas necessárias. Não rodar `db:generate`/`db:migrate` (journal quebrado neste repo).
- **Testes:** `node --import tsx --test`. Todo arquivo `*.test.ts` novo tem que ser **adicionado à mão** ao script `test` do `package.json` — a lista é explícita, não usa glob.
- **Nunca colocar `Date` cru dentro de `` sql`` ``** (postgres.js com `prepare:false` estoura em runtime; o `tsc` não pega). Usar string.
- **Timezone:** BRT é UTC−3 o ano inteiro (sem horário de verão desde 2019).
- **Valor de `operadora` continua `'infinitypay'`** — grafia já gravada no banco. O nome real da empresa é InfinitePay; a divergência é intencional e não deve ser "corrigida".
- **`playwright` é devDependency**, usada só por script local. Nunca importada por código dentro de `src/app/`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/conciliacao-cartao.ts` (criar) | Tipos compartilhados do payload (`TransacaoCartao`, `PayloadConciliacao`) — hoje presos dentro do route handler. Precisam sair de lá para o script poder importá-los sem arrastar `next/server` e o banco junto. |
| `src/lib/conciliacao-infinitepay.ts` (criar) | Tradução pura: venda da API da InfinitePay → `TransacaoCartao`. Sem I/O, sem Playwright. É o único lugar com regra de negócio nova. |
| `src/lib/conciliacao-infinitepay.test.ts` (criar) | Testes do tradutor. |
| `src/app/api/conciliacao/cartao/route.ts` (modificar) | Passa a exigir `grupoCnpj` e a deduplicar por `id` quando não há NSU. |
| `scripts/conciliacao/infinitepay.ts` (criar) | O coletor: navegador, paginação, conferência de serial, envio, avisos. |
| `scripts/conciliacao/infinitypay.mjs` (apagar) | Tentativa anterior, com endpoint e campos chutados. |
| `package.json` (modificar) | `playwright` em devDependencies + novo arquivo de teste na lista. |

---

### Task 1: Tradutor de vendas da InfinitePay

**Files:**
- Create: `src/lib/conciliacao-cartao.ts`
- Create: `src/lib/conciliacao-infinitepay.ts`
- Test: `src/lib/conciliacao-infinitepay.test.ts`
- Modify: `package.json` (lista do script `test`)
- Modify: `src/app/api/conciliacao/cartao/route.ts:6-21` (passa a importar os tipos)

**Interfaces:**
- Produces:
  - `type TransacaoCartao` e `type PayloadConciliacao` em `src/lib/conciliacao-cartao.ts`
  - `type VendaInfinitePay` — o formato cru da API
  - `dataBrt(iso: string): string` — instante ISO → `'YYYY-MM-DD'` no fuso de Brasília
  - `mapearVendasInfinitePay(vendas: VendaInfinitePay[]): TransacaoCartao[]`
  - `chaveDedup(t: TransacaoCartao): { campo: 'nsu' | 'id'; valor: string } | null`
- Consumes: nada (primeira task).

- [ ] **Step 1: Criar o arquivo de tipos compartilhados**

Criar `src/lib/conciliacao-cartao.ts` com o conteúdo movido do route handler, mais o campo novo `grupoCnpj`:

```ts
// Tipos do payload que o coletor de cada operadora manda para
// POST /api/conciliacao/cartao. Ficam aqui, e não dentro do route handler,
// porque os scripts de coleta precisam importá-los sem arrastar next/server
// e a conexão de banco junto.

export type TransacaoCartao = {
  nsu?: string
  autorizacao?: string
  dataTransacao: string   // YYYY-MM-DD
  valorBruto: number
  valorLiquido?: number
  parcelas: number
  tipo: 'credito' | 'debito'
  status: string
  rawData?: Record<string, unknown>
}

export type PayloadConciliacao = {
  operadora: 'infinitypay' | 'stone' | 'pagueveloz'
  // CNPJ do grupo dono das maquininhas, com pontuação, como está em grupos.cnpj.
  grupoCnpj: string
  transacoes: TransacaoCartao[]
}
```

- [ ] **Step 2: Escrever os testes do tradutor (que ainda não existe)**

Criar `src/lib/conciliacao-infinitepay.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataBrt, mapearVendasInfinitePay, chaveDedup, type VendaInfinitePay } from './conciliacao-infinitepay'
import type { TransacaoCartao } from './conciliacao-cartao'

// Venda real capturada do painel em 2026-08-04.
const VENDA_CREDITO: VendaInfinitePay = {
  id: 2611297499,
  datetime: '2026-08-03T19:28:52.425Z',
  type: 'contactless',
  amount: 26000,
  net_amount: 24706,
  brand: 'visa',
  method: 'credit',
  installments: 4,
  serial_number: 'PB1F248T73089',
  status: 'approved',
  nsu: 'SPB1F248T7308922050320260803160002',
  transaction_origin: 'pos',
  fee_percentage: 4.98,
}

test('centavos viram reais', () => {
  const [t] = mapearVendasInfinitePay([VENDA_CREDITO])
  assert.equal(t.valorBruto, 260)
  assert.equal(t.valorLiquido, 247.06)
})

test('crédito e débito viram os nomes usados no banco', () => {
  const [credito] = mapearVendasInfinitePay([VENDA_CREDITO])
  assert.equal(credito.tipo, 'credito')
  const [debito] = mapearVendasInfinitePay([{ ...VENDA_CREDITO, method: 'debit' }])
  assert.equal(debito.tipo, 'debito')
})

test('venda em dinheiro digitada na maquininha é descartada', () => {
  assert.deepEqual(mapearVendasInfinitePay([{ ...VENDA_CREDITO, method: 'money' }]), [])
})

test('venda negada é descartada', () => {
  assert.deepEqual(mapearVendasInfinitePay([{ ...VENDA_CREDITO, status: 'denied' }]), [])
})

test('venda depois das 21h fica no dia certo em Brasília', () => {
  // 01:20Z do dia 04 é 22:20 do dia 03 em Brasília. Usar o dia do UTC jogaria
  // a venda para o dia seguinte e o casamento erraria a janela de ±1 dia.
  assert.equal(dataBrt('2026-08-04T01:20:00.000Z'), '2026-08-03')
})

test('venda no meio da tarde fica no mesmo dia', () => {
  assert.equal(dataBrt('2026-08-03T19:28:52.425Z'), '2026-08-03')
})

test('data inválida estoura em vez de gravar dia errado', () => {
  assert.throws(() => dataBrt('ontem'))
})

test('rawData preserva o que o banco não tem coluna para guardar', () => {
  const [t] = mapearVendasInfinitePay([VENDA_CREDITO])
  assert.equal(t.rawData?.fee_percentage, 4.98)
  assert.equal(t.rawData?.serial_number, 'PB1F248T73089')
  assert.equal(t.rawData?.id, 2611297499)
})

test('status normalizado para a grafia usada no banco', () => {
  const [t] = mapearVendasInfinitePay([VENDA_CREDITO])
  assert.equal(t.status, 'aprovado')
})

test('nsu vazio vira undefined, não string vazia', () => {
  const [t] = mapearVendasInfinitePay([{ ...VENDA_CREDITO, nsu: '' }])
  assert.equal(t.nsu, undefined)
})

test('parcelas ausente ou zero vira 1', () => {
  const [t] = mapearVendasInfinitePay([{ ...VENDA_CREDITO, installments: 0 }])
  assert.equal(t.parcelas, 1)
})

test('dedup usa o nsu quando existe', () => {
  const [t] = mapearVendasInfinitePay([VENDA_CREDITO])
  assert.deepEqual(chaveDedup(t), { campo: 'nsu', valor: 'SPB1F248T7308922050320260803160002' })
})

test('dedup cai no id da operadora quando não há nsu', () => {
  const [t] = mapearVendasInfinitePay([{ ...VENDA_CREDITO, nsu: null }])
  assert.deepEqual(chaveDedup(t), { campo: 'id', valor: '2611297499' })
})

test('sem nsu e sem id não inventa chave', () => {
  const solta: TransacaoCartao = { dataTransacao: '2026-08-03', valorBruto: 10, parcelas: 1, tipo: 'credito', status: 'aprovado' }
  assert.equal(chaveDedup(solta), null)
})
```

- [ ] **Step 3: Registrar o teste no package.json**

Acrescentar `src/lib/conciliacao-infinitepay.test.ts` ao final da lista do script `test` em `package.json` (a lista é explícita — sem isso o teste nunca roda no `npm test`).

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx tsx --test src/lib/conciliacao-infinitepay.test.ts`
Expected: FAIL — `Cannot find module './conciliacao-infinitepay'`

- [ ] **Step 5: Implementar o tradutor**

Criar `src/lib/conciliacao-infinitepay.ts`:

```ts
import type { TransacaoCartao } from './conciliacao-cartao'

// Formato devolvido por sales-index/v1/sales/search, o serviço interno que o
// painel da InfinitePay usa para montar a tela "Suas vendas". Não é API
// pública: pode mudar sem aviso, por isso o coletor valida antes de enviar.
export type VendaInfinitePay = {
  id: number
  datetime: string          // ISO com Z
  amount: number            // centavos, valor bruto
  net_amount: number | null // centavos, já com a taxa descontada
  method: string            // 'credit' | 'debit' | 'money'
  installments: number
  status: string            // 'approved' | 'denied'
  nsu: string | null
  brand?: string
  serial_number?: string | null
  fee_percentage?: number | null
  type?: string
  transaction_origin?: string
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

/**
 * Instante ISO → dia do calendário em Brasília.
 *
 * Uma venda às 01:20Z do dia 04 aconteceu às 22:20 do dia 03 em Brasília.
 * Cortar a string ISO no "T" gravaria dia 04, e o casamento com a venda no
 * MOVA (janela de ±1 dia) passaria a depender de sorte. BRT é UTC−3 fixo
 * desde o fim do horário de verão em 2019.
 */
export function dataBrt(iso: string): string {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) throw new Error(`Data inválida: ${iso}`)
  return new Date(instante.getTime() - TRES_HORAS_MS).toISOString().slice(0, 10)
}

/**
 * Traduz vendas da InfinitePay para o payload da conciliação, descartando o
 * que não é cartão aprovado:
 * - `status !== 'approved'` — negadas (23 em cada 100 na amostra de 30 dias);
 * - `method === 'money'` — venda em dinheiro digitada na maquininha.
 */
export function mapearVendasInfinitePay(vendas: VendaInfinitePay[]): TransacaoCartao[] {
  return vendas
    .filter(v => v.status === 'approved' && v.method !== 'money')
    .map(v => ({
      nsu: v.nsu || undefined,
      dataTransacao: dataBrt(v.datetime),
      valorBruto: v.amount / 100,
      valorLiquido: v.net_amount != null ? v.net_amount / 100 : undefined,
      parcelas: v.installments || 1,
      tipo: v.method === 'debit' ? ('debito' as const) : ('credito' as const),
      status: 'aprovado',
      rawData: v as unknown as Record<string, unknown>,
    }))
}

/**
 * Chave de deduplicação. O NSU é a chave natural, mas se um dia vier vazio a
 * transação entraria de novo a cada rodada — por isso o id da operadora serve
 * de reserva.
 */
export function chaveDedup(t: TransacaoCartao): { campo: 'nsu' | 'id'; valor: string } | null {
  if (t.nsu) return { campo: 'nsu', valor: t.nsu }
  const id = t.rawData?.id
  if (id != null) return { campo: 'id', valor: String(id) }
  return null
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx tsx --test src/lib/conciliacao-infinitepay.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 7: Fazer o route handler usar os tipos do lib**

Em `src/app/api/conciliacao/cartao/route.ts`, apagar as declarações `export type TransacaoCartao` (linhas 6-16) e `export type PayloadConciliacao` (linhas 18-21) e importar do lib:

```ts
import type { PayloadConciliacao } from '@/lib/conciliacao-cartao'
```

- [ ] **Step 8: Conferir que nada quebrou**

Run: `npm run type-check && npm test`
Expected: sem erro de tipo; toda a suíte passa.

- [ ] **Step 9: Commit**

```bash
git add src/lib/conciliacao-cartao.ts src/lib/conciliacao-infinitepay.ts src/lib/conciliacao-infinitepay.test.ts package.json src/app/api/conciliacao/cartao/route.ts
git commit -m "feat(conciliacao): tradutor de vendas da InfinitePay"
```

---

### Task 2: Endpoint escopado por grupo e dedup com chave reserva

**Files:**
- Modify: `src/app/api/conciliacao/cartao/route.ts:25-53` (validação + dedup) e `:118-136` (insert)

**Interfaces:**
- Consumes: `PayloadConciliacao` (com `grupoCnpj`) e `chaveDedup()` da Task 1.
- Produces: endpoint que responde 400 em `grupoCnpj` ausente/desconhecido e grava no grupo certo.

- [ ] **Step 1: Resolver o grupo pelo CNPJ**

Logo depois de ler o body, antes do loop, substituir a validação atual por:

```ts
const { operadora, grupoCnpj, transacoes } = body

if (!operadora || !grupoCnpj || !Array.isArray(transacoes) || transacoes.length === 0) {
  return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
}

// O grupo vem do payload, nunca do dado: cada grupo tem sua própria conta na
// operadora, e adivinhar pelo conteúdo já colocou transação de BH em Sul de
// Minas uma vez.
const [grupo] = await db
  .select({ id: grupos.id })
  .from(grupos)
  .where(eq(grupos.cnpj, grupoCnpj))
  .limit(1)

if (!grupo) {
  return NextResponse.json({ error: `Grupo não encontrado para o CNPJ ${grupoCnpj}` }, { status: 400 })
}
```

Acrescentar `grupos` ao import de `@/lib/db/schema` e, no topo do arquivo:

```ts
import { chaveDedup } from '@/lib/conciliacao-infinitepay'
```

- [ ] **Step 2: Trocar a dedução de duplicata**

Substituir o bloco `if (t.nsu) { ... }` (linhas 47-54) por:

```ts
// Duplicata: NSU é a chave natural; sem ele, o id que a operadora mandou
// (guardado em rawData) evita reinserir a mesma venda a cada rodada.
const chave = chaveDedup(t)
if (chave) {
  const condicao = chave.campo === 'nsu'
    ? eq(conciliacoesCartao.nsu, chave.valor)
    : sql`${conciliacoesCartao.rawData}->>'id' = ${chave.valor}`

  const [existente] = await db
    .select({ id: conciliacoesCartao.id })
    .from(conciliacoesCartao)
    .where(and(eq(conciliacoesCartao.operadora, operadora), condicao))
    .limit(1)
  if (existente) { duplicadas++; continue }
}
```

`chave.valor` já é string — não passar `Date` nem número cru dentro de `` sql`` ``.

- [ ] **Step 3: Usar o grupo resolvido no insert**

Na linha do insert, trocar o UUID fixo e o comentário de 3 linhas acima dele por:

```ts
      grupoId: grupo.id,
```

- [ ] **Step 4: Conferir tipos e testes**

Run: `npm run type-check && npm test`
Expected: passa.

- [ ] **Step 5: Verificar o 400 na prática**

Com o dev server rodando (`npm run dev`), em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/conciliacao/cartao \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"operadora":"infinitypay","grupoCnpj":"00.000.000/0001-00","transacoes":[{"dataTransacao":"2026-08-03","valorBruto":10,"parcelas":1,"tipo":"credito","status":"aprovado"}]}'
```

Expected: `400` (CNPJ inexistente). Repetir com `57.113.017/0001-72` e conferir que responde `200` — e **apagar em seguida** a linha de teste que isso criou em `conciliacoes_cartao` (o valor 10,00 fica pendente e polui a tela).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/conciliacao/cartao/route.ts
git commit -m "fix(conciliacao): grupo vem do payload e dedup nao depende so do NSU"
```

---

### Task 3: O coletor

**Files:**
- Create: `scripts/conciliacao/infinitepay.ts`
- Delete: `scripts/conciliacao/infinitypay.mjs`
- Modify: `package.json` (devDependency `playwright`)

**Interfaces:**
- Consumes: `mapearVendasInfinitePay`, `VendaInfinitePay` (Task 1); endpoint com `grupoCnpj` (Task 2).
- Produces: comando `npx dotenv -e .env.local -- npx tsx scripts/conciliacao/infinitepay.ts --grupo=<slug> [--dias=7 | --desde=YYYY-MM-DD]`.

- [ ] **Step 1: Instalar o Playwright**

```bash
npm install -D playwright
npx playwright install chromium
```

- [ ] **Step 2: Escrever o coletor**

Criar `scripts/conciliacao/infinitepay.ts`:

```ts
/**
 * Coletor de vendas de cartão da InfinitePay.
 *
 * Uso:
 *   npx dotenv -e .env.local -- npx tsx scripts/conciliacao/infinitepay.ts --grupo=sul-de-minas
 *   ...mesmo comando com --dias=30            (janela maior)
 *   ...mesmo comando com --desde=2026-01-01   (carga histórica)
 *
 * PRIMEIRA EXECUÇÃO: uma janela do Chromium abre na tela de QR Code. Escaneie
 * com o app da InfinitePay no celular. A sessão dura 7 dias e fica salva no
 * perfil; nas próximas execuções o login já vem pronto.
 *
 * Por que via navegador e não fetch direto: o Bearer da InfinitePay dura 30
 * minutos e é renovado pelo próprio app. Mantendo o navegador no circuito,
 * nenhuma credencial precisa ser lida, copiada ou guardada em lugar nenhum.
 */

import { chromium } from 'playwright'
import postgres from 'postgres'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { mapearVendasInfinitePay, type VendaInfinitePay } from '../../src/lib/conciliacao-infinitepay'

const GRUPOS = {
  'sul-de-minas': { cnpj: '57.113.017/0001-72', nome: 'Sul de Minas' },
  'bh':           { cnpj: '63.009.605/0001-63', nome: 'BH' },
} as const

type Slug = keyof typeof GRUPOS

const BASE_COLETOR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'mova-coletor')
const ARQUIVO_SERIAIS = path.join(BASE_COLETOR, 'seriais.json')
const URL_VENDAS = 'https://app.infinitepay.io/sales'
const HOST_API = 'https://infinitepay-sales-indexer.services.production.infinitepay.io'

function arg(nome: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${nome}=`))?.split('=')[1]
}

async function avisar(cnpj: string, texto: string): Promise<void> {
  console.error(texto)
  const url = process.env.DATABASE_URL
  if (!url || !process.env.TELEGRAM_BOT_TOKEN) return
  const sql = postgres(url, { prepare: false })
  try {
    const [g] = await sql`select telegram_chat_id from grupos where cnpj = ${cnpj} limit 1`
    if (g?.telegram_chat_id) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: g.telegram_chat_id, text: texto }),
      })
    }
  } catch (e) {
    console.error('aviso no Telegram falhou:', e instanceof Error ? e.message : String(e))
  } finally {
    await sql.end()
  }
}

/**
 * Cada maquininha pertence a um grupo. Se um serial já visto em outro grupo
 * aparecer aqui, o perfil de navegador provavelmente é da conta errada —
 * abortar é melhor do que gravar venda no grupo errado, erro que já aconteceu
 * e é trabalhoso de desfazer.
 */
function conferirSeriais(slug: Slug, vendas: VendaInfinitePay[]): void {
  fs.mkdirSync(BASE_COLETOR, { recursive: true })
  const mapa: Record<string, string> = fs.existsSync(ARQUIVO_SERIAIS)
    ? JSON.parse(fs.readFileSync(ARQUIVO_SERIAIS, 'utf8'))
    : {}

  for (const v of vendas) {
    const serial = v.serial_number
    if (!serial) continue
    if (mapa[serial] && mapa[serial] !== slug) {
      throw new Error(`Maquininha ${serial} está registrada no grupo "${mapa[serial]}" e apareceu em "${slug}". Perfil de navegador errado?`)
    }
    mapa[serial] = slug
  }

  fs.writeFileSync(ARQUIVO_SERIAIS, JSON.stringify(mapa, null, 2))
}

async function main(): Promise<void> {
  const slug = (arg('grupo') || '') as Slug
  const grupo = GRUPOS[slug]
  if (!grupo) {
    console.error(`Use --grupo=<${Object.keys(GRUPOS).join('|')}>`)
    process.exit(1)
  }

  const { MOVA_URL, CRON_SECRET } = process.env
  if (!MOVA_URL || !CRON_SECRET) {
    console.error('MOVA_URL e CRON_SECRET precisam estar no .env.local')
    process.exit(1)
  }

  const desde = arg('desde')
  const dias = Number(arg('dias') || 7)
  const ate = new Date()
  const inicio = desde ? new Date(`${desde}T00:00:00.000Z`) : new Date(ate.getTime() - dias * 24 * 60 * 60 * 1000)

  const perfil = path.join(BASE_COLETOR, `infinitepay-${slug}`)
  const contexto = await chromium.launchPersistentContext(perfil, { headless: false })
  const pagina = contexto.pages()[0] || await contexto.newPage()

  try {
    await pagina.goto(URL_VENDAS, { waitUntil: 'domcontentloaded' })
    await pagina.waitForTimeout(5000)  // o app mina o token logo depois de carregar

    // Sessão vencida: a janela já está aberta no QR, então avisa e dá 3 minutos
    // para alguém escanear ali mesmo, em vez de morrer e obrigar a rodar de
    // novo. process.exit() aqui mataria o navegador antes de dar tempo.
    const precisaLogin = await pagina.getByText('escaneie o QR', { exact: false }).count() > 0
    if (precisaLogin) {
      await avisar(grupo.cnpj, `InfinitePay (${grupo.nome}): sessão expirou. Escaneie o QR Code na janela aberta — a sessão dura 7 dias.`)
      await pagina.waitForURL('**/sales', { timeout: 180_000 })
      await pagina.waitForTimeout(5000)
    }

    // A chamada sai de dentro da página para herdar o token que o app acabou de
    // renovar. Nada de credencial cruza para o lado do Node.
    const vendas: VendaInfinitePay[] = await pagina.evaluate(async ({ host, from, to }) => {
      const token = localStorage.getItem('jwtReadToken')
      if (!token) throw new Error('jwtReadToken ausente — app não terminou de carregar?')

      const todas: unknown[] = []
      let url = `${host}/sales-index/v1/sales/search?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&pg=true&limit=100`

      while (url) {
        const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) throw new Error(`sales/search respondeu ${r.status}`)
        const json = await r.json()
        if (!Array.isArray(json.results)) throw new Error('resposta sem results[] — endpoint mudou?')
        todas.push(...json.results)
        url = json.pagination?.next_page || ''
      }
      return todas
    }, { host: HOST_API, from: inicio.toISOString(), to: ate.toISOString() })

    console.log(`[InfinitePay/${grupo.nome}] ${vendas.length} vendas no período`)

    conferirSeriais(slug, vendas)
    const transacoes = mapearVendasInfinitePay(vendas)
    console.log(`[InfinitePay/${grupo.nome}] ${transacoes.length} aprovadas de cartão para enviar`)
    if (transacoes.length === 0) return

    const resp = await fetch(`${MOVA_URL}/api/conciliacao/cartao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({ operadora: 'infinitypay', grupoCnpj: grupo.cnpj, transacoes }),
    })

    const resultado = await resp.text()
    if (!resp.ok) throw new Error(`MOVA respondeu ${resp.status}: ${resultado}`)
    console.log('[MOVA]', resultado)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await avisar(grupo.cnpj, `InfinitePay (${grupo.nome}): coleta falhou — ${msg}`)
    process.exitCode = 1
  } finally {
    await contexto.close()
  }
}

await main()
```

- [ ] **Step 3: Apagar a tentativa anterior**

```bash
git rm scripts/conciliacao/infinitypay.mjs
```

- [ ] **Step 4: Conferir tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Primeira execução, sem enviar nada**

Rodar com uma janela curta e **`MOVA_URL` apontando para o dev local** (`npm run dev` em outro terminal), para não sujar produção:

```bash
npx dotenv -e .env.local -- npx tsx scripts/conciliacao/infinitepay.ts --grupo=sul-de-minas --dias=2
```

Expected: janela do Chromium abre; se pedir QR, escanear; log mostra a contagem de vendas e o resultado do MOVA. Confirmar no `/conciliacao` local que as transações apareceram.

- [ ] **Step 6: Commit**

```bash
git add scripts/conciliacao/infinitepay.ts package.json package-lock.json
git commit -m "feat(conciliacao): coletor automatico de vendas da InfinitePay"
```

(o `infinitypay.mjs` já saiu do índice no Step 3, com `git rm`)

---

### Task 4: Validação contra o painel e agendamento

**Files:** nenhum arquivo de código — é a verificação de que o número bate e a automação de verdade.

**Interfaces:**
- Consumes: tudo das tasks 1-3.

- [ ] **Step 1: Carga dos últimos 30 dias em produção**

```bash
npx dotenv -e .env.local -- npx tsx scripts/conciliacao/infinitepay.ts --grupo=sul-de-minas --dias=30
```

(com `MOVA_URL=https://moto-chefe.vercel.app` no `.env.local`)

- [ ] **Step 2: Conferir a contagem com o painel**

Abrir `app.infinitepay.io/sales` no mesmo período e comparar o total de vendas **aprovadas** com o número que o script logou em "aprovadas de cartão para enviar". Referência da amostra colhida em 2026-08-04: 166 vendas no período de 30 dias, 77 aprovadas nas 100 primeiras.

Divergência esperada e aceitável: vendas em dinheiro (`money`) contam no painel e não aqui. Qualquer outra diferença é bug — investigar antes de seguir.

- [ ] **Step 3: Conferir a conciliação no MOVA**

Abrir `/conciliacao` em produção e verificar: as transações apareceram, uma parte casou com vendas/OS, e o que ficou pendente faz sentido (venda de cartão que ainda não foi lançada).

- [ ] **Step 4: Rodar duas vezes seguidas**

Repetir o comando do Step 1. Expected: o retorno do MOVA mostra `importadas: 0` e `duplicadas` igual ao total — o dedup está segurando. Se importar de novo, **parar**: há duplicata entrando e a Task 2 está errada.

- [ ] **Step 5: Agendar no Windows**

Criar a tarefa diária às 20h (depois do fechamento das lojas):

```powershell
schtasks /Create /TN "MOVA - Coletor InfinitePay Sul de Minas" /SC DAILY /ST 20:00 /TR "cmd /c cd /d D:\Claude\Teste && npx dotenv -e .env.local -- npx tsx scripts/conciliacao/infinitepay.ts --grupo=sul-de-minas"
```

Testar sem esperar o horário:

```powershell
schtasks /Run /TN "MOVA - Coletor InfinitePay Sul de Minas"
```

- [ ] **Step 6: Registrar o combinado do QR**

O QR precisa ser reescaneado a cada 7 dias. Confirmar que o aviso funciona: rodar o coletor num perfil vazio (`--grupo=bh`, que ainda não tem conta conectada) e verificar que a mensagem "sessão expirou" chega no grupo do Telegram assim que a tela do QR aparece — em vez de o script morrer calado. Depois é só fechar a janela; ele desiste sozinho em 3 minutos.

---

## Fora deste plano

Está no spec como fora de escopo e **não deve ser implementado aqui**: taxa da maquininha no financeiro, cruzamento com o extrato do Open Finance, alerta de venda não lançada no MOVA, Stone/PagueVeloz, e migrar o coletor para a nuvem.
