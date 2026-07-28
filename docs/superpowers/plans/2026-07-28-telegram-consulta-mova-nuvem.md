# Bot de Consulta ao MOVA na Nuvem (Telegram) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um segundo bot no Telegram que responde perguntas do negócio (só
leitura), 24/7, rodando dentro do MOVA na Vercel — sem depender do PC.

**Architecture:** Um webhook Next.js recebe as mensagens do bot novo; confere
segurança (senha do webhook + allow-list de chat_id); tenta casar com uma das 9
**perguntas prontas** (SQL fixo, grátis); se não casar, cai no **cérebro Claude**
(tool use). Toda consulta passa pela função compartilhada `consultaSomenteLeitura`
(transação `transaction_read_only = on`). 100% aditivo — nada do OpenJarvis/PC é
tocado.

**Tech Stack:** Next.js 16.2.6 (App Router, route handlers), `postgres.js`
(`@/lib/db`), `@anthropic-ai/sdk`, runner de teste nativo do Node via `tsx`.

## Global Constraints

- **Route handlers seguem EXATAMENTE o padrão já existente** em
  `src/app/api/jarvis/consulta/route.ts`: `import { NextRequest, NextResponse } from 'next/server'`,
  `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`,
  `export async function POST/GET`.
- **AGENTS.md:** este Next tem mudanças; antes de mexer em convenção de rota,
  conferir `node_modules/next/dist/docs/`. As rotas Jarvis existentes são a
  fonte de verdade do padrão neste repo.
- **pt-BR** em toda string voltada ao usuário.
- **Só leitura** é garantido pela transação read-only do Postgres — **nunca** por
  blocklist de palavras.
- **Fuso `America/Sao_Paulo`** em toda lógica de data (nunca `current_date` cru).
- Dinheiro: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Reusar o `client` de `@/lib/db` (não abrir outra conexão).
- Segredos só em env da Vercel; nenhum hardcode.

---

### Task 1: Consulta só-leitura compartilhada (refactor, sem mudar contrato)

Extrai a lógica de SELECT read-only da rota para uma função reutilizável. A rota
`/api/jarvis/consulta` mantém o mesmo comportamento externo (o bot do PC segue
usando sem alteração).

**Files:**
- Create: `src/lib/jarvis/consulta-readonly.ts`
- Modify: `src/app/api/jarvis/consulta/route.ts`

**Interfaces:**
- Produces:
  - `consultaSomenteLeitura(sqlBruto: string): Promise<{ rows: unknown[]; rowCount: number; truncated: boolean }>`
  - `class ConsultaError extends Error { tipo: 'vazio'|'nao_select'|'multiplos'|'timeout'|'erro'; detalhe: string }`
  - `const CAP = 200`

- [ ] **Step 1: Criar `src/lib/jarvis/consulta-readonly.ts`**

```ts
import { client } from '@/lib/db'

export const CAP = 200

export type ConsultaTipoErro = 'vazio' | 'nao_select' | 'multiplos' | 'timeout' | 'erro'

export class ConsultaError extends Error {
  constructor(public tipo: ConsultaTipoErro, public detalhe = '') {
    super(tipo)
    this.name = 'ConsultaError'
  }
}

export interface ResultadoConsulta {
  rows: unknown[]
  rowCount: number
  truncated: boolean
}

/** Roda UM SELECT sob transação read-only (nada escreve, nunca). */
export async function consultaSomenteLeitura(sqlBruto: string): Promise<ResultadoConsulta> {
  const sqlText = String(sqlBruto ?? '').trim()
  if (!sqlText) throw new ConsultaError('vazio')
  if (!/^select\b/i.test(sqlText)) throw new ConsultaError('nao_select')
  if (sqlText.includes(';')) throw new ConsultaError('multiplos')

  try {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe('SET LOCAL transaction_read_only = on')
      await tx.unsafe('SET LOCAL statement_timeout = 5000')
      return await tx.unsafe(`SELECT * FROM ( ${sqlText} ) AS _jarvis_sub LIMIT ${CAP + 1}`)
    })
    const arr = Array.from(rows as Iterable<unknown>)
    const truncated = arr.length > CAP
    return { rows: arr.slice(0, CAP), rowCount: Math.min(arr.length, CAP), truncated }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro'
    if (/statement timeout|canceling statement/i.test(msg)) {
      throw new ConsultaError('timeout', msg.slice(0, 200))
    }
    throw new ConsultaError('erro', msg.slice(0, 200))
  }
}
```

- [ ] **Step 2: Reescrever `src/app/api/jarvis/consulta/route.ts` para usar a função**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { tokenValido } from '@/lib/jarvis-auth'
import { consultaSomenteLeitura, ConsultaError } from '@/lib/jarvis/consulta-readonly'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: Record<string, number> = { vazio: 400, nao_select: 400, multiplos: 400, timeout: 408, erro: 400 }
const MSG: Record<string, string> = {
  vazio: 'sql vazio',
  nao_select: 'apenas SELECT e permitido',
  multiplos: 'apenas um comando (sem ;)',
  timeout: 'consulta demorou demais',
  erro: 'erro na consulta',
}

export async function POST(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  let sql = ''
  try {
    sql = String((await req.json())?.sql ?? '')
  } catch {
    return NextResponse.json({ erro: 'json invalido' }, { status: 400 })
  }
  try {
    return NextResponse.json(await consultaSomenteLeitura(sql))
  } catch (e) {
    if (e instanceof ConsultaError) {
      return NextResponse.json(
        { erro: MSG[e.tipo], detalhe: e.detalhe || undefined },
        { status: STATUS[e.tipo] },
      )
    }
    return NextResponse.json({ erro: 'erro na consulta' }, { status: 400 })
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Provar que a trava read-only continua de pé**

Run: `node scripts/test-readonly.mjs`
Expected: imprime que a escrita foi BLOQUEADA (comportamento inalterado — o
script bate direto no banco, provando a garantia de nível Postgres).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jarvis/consulta-readonly.ts src/app/api/jarvis/consulta/route.ts
git commit -m "refactor(jarvis): extrai consultaSomenteLeitura compartilhada"
```

---

### Task 2: Normalização de texto + runner de testes

Base pura pra roteamento das perguntas. Também instala o runner de testes.

**Files:**
- Create: `src/lib/telegram/texto.ts`
- Create: `src/lib/telegram/texto.test.ts`
- Modify: `package.json` (devDep `tsx` + script `test`)

**Interfaces:**
- Produces: `normalizar(s: string): string` — minúsculas, sem acento, espaços colapsados.

- [ ] **Step 1: Adicionar `tsx` e o script de teste no `package.json`**

No bloco `devDependencies`, acrescentar:
```json
    "tsx": "^4.19.2",
```
No bloco `scripts`, acrescentar:
```json
    "test": "node --import tsx --test src/lib/telegram/texto.test.ts src/lib/telegram/perguntas-prontas.test.ts",
```
Depois: `npm install` (instala o tsx).

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/telegram/texto.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar } from './texto.ts'

test('minúsculas e sem acento', () => {
  assert.equal(normalizar('Vendas HOJE'), 'vendas hoje')
  assert.equal(normalizar('Ranking de Vendedôres'), 'ranking de vendedores')
})

test('colapsa espaços e apara', () => {
  assert.equal(normalizar('  vendas   por  loja '), 'vendas por loja')
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL (módulo `./texto.ts` não existe).

- [ ] **Step 4: Implementar `src/lib/telegram/texto.ts`**

```ts
/** minúsculas, sem acento, espaços colapsados — base do roteamento. */
export function normalizar(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS nos testes de texto (o arquivo de perguntas ainda não existe —
ver Step 6).

- [ ] **Step 6: Contornar o teste ainda-inexistente do catálogo**

O script `test` referencia `perguntas-prontas.test.ts` (Task 3). Até lá, rode
só o de texto para verde local:
Run: `node --import tsx --test src/lib/telegram/texto.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/telegram/texto.ts src/lib/telegram/texto.test.ts
git commit -m "feat(telegram): normalizar texto + runner de testes (tsx)"
```

---

### Task 3: Catálogo das 9 perguntas prontas (SQL + roteamento + formatação)

O coração do "grátis": reconhece a pergunta, roda o SQL fixo, formata.

**Files:**
- Create: `src/lib/telegram/perguntas-prontas.ts`
- Create: `src/lib/telegram/perguntas-prontas.test.ts`

**Interfaces:**
- Consumes: `normalizar` (Task 2).
- Produces:
  - `interface Pergunta { id: string; titulo: string; casa: (t: string) => boolean; sql: string; formatar: (rows: any[]) => string }`
  - `const CATALOGO: Pergunta[]`
  - `acharPergunta(texto: string): Pergunta | undefined` (normaliza e devolve a 1ª que casa)
  - `porId(id: string): Pergunta | undefined`

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/telegram/perguntas-prontas.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharPergunta, porId, CATALOGO } from './perguntas-prontas.ts'

test('roteamento das 9', () => {
  assert.equal(acharPergunta('quantas vendas hoje?')?.id, 'vendas_hoje')
  assert.equal(acharPergunta('vendas no mês')?.id, 'vendas_mes')
  assert.equal(acharPergunta('vendas por vendedor')?.id, 'vendas_por_vendedor')
  assert.equal(acharPergunta('vendas por loja')?.id, 'vendas_por_loja')
  assert.equal(acharPergunta('vendas por modelo')?.id, 'vendas_por_modelo')
  assert.equal(acharPergunta('ranking de vendedores')?.id, 'ranking_vendedores')
  assert.equal(acharPergunta('ranking de motos vendidas')?.id, 'ranking_motos')
  assert.equal(acharPergunta('ranking de lojas')?.id, 'ranking_lojas')
  assert.equal(acharPergunta('estoque por modelo')?.id, 'estoque_por_modelo')
})

test('fora do catálogo não casa (cai no Claude)', () => {
  assert.equal(acharPergunta('qual a previsão do tempo?'), undefined)
})

test('porId acha e todas têm SELECT sem ;', () => {
  assert.equal(porId('vendas_hoje')?.id, 'vendas_hoje')
  for (const p of CATALOGO) {
    assert.match(p.sql.trim(), /^select/i)
    assert.ok(!p.sql.includes(';'))
  }
})

test('formatação em R$ e contagem', () => {
  const hoje = porId('vendas_hoje')!
  const txt = hoje.formatar([{ qtd: 6, total: '48000.00' }])
  assert.match(txt, /6/)
  assert.match(txt, /R\$/)

  const rank = porId('ranking_vendedores')!
  const t2 = rank.formatar([
    { vendedor: 'Ana', qtd: 4, total: '40000' },
    { vendedor: 'Beto', qtd: 2, total: '20000' },
  ])
  assert.match(t2, /1\..*Ana/)
  assert.match(t2, /2\..*Beto/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL (`./perguntas-prontas.ts` não existe).

- [ ] **Step 3: Implementar `src/lib/telegram/perguntas-prontas.ts`**

```ts
import { normalizar } from './texto'

export interface Pergunta {
  id: string
  titulo: string
  casa: (t: string) => boolean
  sql: string
  formatar: (rows: any[]) => string
}

const brl = (v: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const tem = (t: string, ...ps: string[]) => ps.every((p) => t.includes(p))

// mês corrente, fuso São Paulo — reaproveitado por várias perguntas
const NO_MES = `(v.data_venda AT TIME ZONE 'America/Sao_Paulo') >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))`

const SQL_POR_VENDEDOR = `
SELECT u.nome AS vendedor, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN usuarios u ON u.id = v.vendedor_id
WHERE ${NO_MES}
GROUP BY u.nome ORDER BY total DESC`.trim()

const SQL_POR_LOJA = `
SELECT l.nome AS loja, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN lojas l ON l.id = v.loja_id
WHERE ${NO_MES}
GROUP BY l.nome ORDER BY total DESC`.trim()

const SQL_POR_MODELO = `
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN motos m ON m.id = v.moto_id JOIN modelos mo ON mo.id = m.modelo_id
WHERE ${NO_MES}
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC`.trim()

// formatadores reutilizáveis
const linhas = (rows: any[], rotulo: (r: any) => string, comValor: boolean) =>
  rows.length === 0
    ? 'Nada encontrado no período.'
    : rows
        .map((r) => `• ${rotulo(r)} — ${r.qtd} venda(s)${comValor ? ` — ${brl(r.total)}` : ''}`)
        .join('\n')

const ranking = (rows: any[], rotulo: (r: any) => string, comValor: boolean) =>
  rows.length === 0
    ? 'Nada encontrado no período.'
    : rows
        .map((r, i) => `${i + 1}. ${rotulo(r)} — ${r.qtd} venda(s)${comValor ? ` — ${brl(r.total)}` : ''}`)
        .join('\n')

const totalPeriodo = (titulo: string) => (rows: any[]) => {
  const r = rows[0] ?? { qtd: 0, total: 0 }
  return `${titulo}: ${r.qtd} venda(s), ${brl(r.total)}.`
}

export const CATALOGO: Pergunta[] = [
  // específicas primeiro (primeira que casa vence)
  {
    id: 'estoque_por_modelo',
    titulo: 'Estoque por modelo',
    casa: (t) => t.includes('estoque') || tem(t, 'unidade', 'modelo'),
    sql: `
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd
FROM motos m JOIN modelos mo ON mo.id = m.modelo_id
WHERE m.status IN ('montada', 'caixa')
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC`.trim(),
    formatar: (rows) =>
      rows.length === 0
        ? 'Sem motos em estoque (montada/caixa).'
        : `🏍️ Estoque (montada + caixa):\n` +
          rows.map((r) => `• ${r.modelo} — ${r.qtd} un`).join('\n') +
          `\nTotal: ${rows.reduce((s, r) => s + Number(r.qtd), 0)} un`,
  },
  {
    id: 'ranking_vendedores',
    titulo: 'Ranking de vendedores (mês)',
    casa: (t) => tem(t, 'ranking', 'vendedor'),
    sql: SQL_POR_VENDEDOR,
    formatar: (rows) => `🏆 Ranking de vendedores (mês):\n` + ranking(rows, (r) => r.vendedor, true),
  },
  {
    id: 'ranking_lojas',
    titulo: 'Ranking de lojas (mês)',
    casa: (t) => tem(t, 'ranking', 'loja'),
    sql: SQL_POR_LOJA,
    formatar: (rows) => `🏆 Ranking de lojas (mês):\n` + ranking(rows, (r) => r.loja, true),
  },
  {
    id: 'ranking_motos',
    titulo: 'Ranking de motos vendidas (mês)',
    casa: (t) => t.includes('ranking') && (t.includes('moto') || t.includes('modelo') || t.includes('vendida')),
    sql: SQL_POR_MODELO,
    formatar: (rows) => `🏆 Motos mais vendidas (mês):\n` + ranking(rows, (r) => r.modelo, false),
  },
  {
    id: 'vendas_por_vendedor',
    titulo: 'Vendas por vendedor (mês)',
    casa: (t) => tem(t, 'venda', 'vendedor'),
    sql: SQL_POR_VENDEDOR,
    formatar: (rows) => `Vendas por vendedor (mês):\n` + linhas(rows, (r) => r.vendedor, true),
  },
  {
    id: 'vendas_por_loja',
    titulo: 'Vendas por loja (mês)',
    casa: (t) => tem(t, 'venda', 'loja'),
    sql: SQL_POR_LOJA,
    formatar: (rows) => `Vendas por loja (mês):\n` + linhas(rows, (r) => r.loja, true),
  },
  {
    id: 'vendas_por_modelo',
    titulo: 'Vendas por modelo (mês)',
    casa: (t) => t.includes('venda') && (t.includes('modelo') || t.includes('moto')),
    sql: SQL_POR_MODELO,
    formatar: (rows) => `Vendas por modelo (mês):\n` + linhas(rows, (r) => r.modelo, true),
  },
  {
    id: 'vendas_hoje',
    titulo: 'Vendas hoje',
    casa: (t) => tem(t, 'venda', 'hoje'),
    sql: `
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`.trim(),
    formatar: totalPeriodo('Vendas hoje'),
  },
  {
    id: 'vendas_mes',
    titulo: 'Vendas no mês',
    casa: (t) => t.includes('venda') && (t.includes('mes') || t.includes('mês')),
    sql: `
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo') >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))`.trim(),
    formatar: totalPeriodo('Vendas no mês'),
  },
]

export function acharPergunta(texto: string): Pergunta | undefined {
  const t = normalizar(texto)
  return CATALOGO.find((p) => p.casa(t))
}

export function porId(id: string): Pergunta | undefined {
  return CATALOGO.find((p) => p.id === id)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (texto + perguntas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/perguntas-prontas.ts src/lib/telegram/perguntas-prontas.test.ts
git commit -m "feat(telegram): catalogo das 9 perguntas prontas (SQL + roteamento + formatacao)"
```

---

### Task 4: Wrappers da API do Telegram

Envio de mensagens/ações e o teclado do /menu.

**Files:**
- Create: `src/lib/telegram/api.ts`
- Create: `src/lib/telegram/api.test.ts`

**Interfaces:**
- Consumes: `CATALOGO` (Task 3).
- Produces:
  - `enviarMensagem(chatId: string | number, texto: string, teclado?: object): Promise<void>`
  - `responderCallback(callbackId: string, texto?: string): Promise<void>`
  - `enviarAcaoDigitando(chatId: string | number): Promise<void>`
  - `tecladoMenu(): object` — inline_keyboard com um botão por pergunta.

- [ ] **Step 1: Teste que falha (parte pura: o teclado)**

`src/lib/telegram/api.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tecladoMenu } from './api.ts'
import { CATALOGO } from './perguntas-prontas.ts'

test('tecladoMenu tem um botão por pergunta, callback_data = id', () => {
  const kb = tecladoMenu() as any
  const botoes = kb.inline_keyboard.flat()
  assert.equal(botoes.length, CATALOGO.length)
  for (const p of CATALOGO) {
    assert.ok(botoes.some((b: any) => b.callback_data === p.id && b.text === p.titulo))
  }
})
```
Acrescente o arquivo ao script `test` no `package.json`:
```json
    "test": "node --import tsx --test src/lib/telegram/texto.test.ts src/lib/telegram/perguntas-prontas.test.ts src/lib/telegram/api.test.ts",
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL (`./api.ts` não existe).

- [ ] **Step 3: Implementar `src/lib/telegram/api.ts`**

```ts
import { CATALOGO } from './perguntas-prontas'

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function chamar(metodo: string, corpo: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API()}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch (e) {
    console.error(`telegram ${metodo} falhou:`, e)
  }
}

export async function enviarMensagem(
  chatId: string | number,
  texto: string,
  teclado?: object,
): Promise<void> {
  await chamar('sendMessage', {
    chat_id: chatId,
    text: texto,
    ...(teclado ? { reply_markup: teclado } : {}),
  })
}

export async function responderCallback(callbackId: string, texto?: string): Promise<void> {
  await chamar('answerCallbackQuery', { callback_query_id: callbackId, ...(texto ? { text: texto } : {}) })
}

export async function enviarAcaoDigitando(chatId: string | number): Promise<void> {
  await chamar('sendChatAction', { chat_id: chatId, action: 'typing' })
}

/** Teclado inline do /menu: um botão por pergunta pronta (callback_data = id). */
export function tecladoMenu(): object {
  const linhas = CATALOGO.map((p) => [{ text: p.titulo, callback_data: p.id }])
  return { inline_keyboard: linhas }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/api.ts src/lib/telegram/api.test.ts package.json
git commit -m "feat(telegram): wrappers da API + teclado do /menu"
```

---

### Task 5: Cérebro Claude (coringa para perguntas fora do catálogo)

Loop de tool use: o Claude vê o schema e escreve UM SELECT, sempre via
`consultaSomenteLeitura`.

**Files:**
- Create: `src/lib/telegram/cerebro.ts`
- Modify: `package.json` (mover `@anthropic-ai/sdk` de devDependencies → dependencies)

**Interfaces:**
- Consumes: `consultaSomenteLeitura`, `ConsultaError` (Task 1), `client` (`@/lib/db`).
- Produces: `responderComClaude(pergunta: string): Promise<string>`

- [ ] **Step 1: Mover o SDK para dependencies**

No `package.json`, remover `"@anthropic-ai/sdk": "^0.106.0"` de `devDependencies`
e adicioná-lo em `dependencies`. Depois: `npm install`.

- [ ] **Step 2: Implementar `src/lib/telegram/cerebro.ts`**

> Antes de codar, conferir a forma da API em `@anthropic-ai/sdk` instalado
> (messages.create, blocos `tool_use`/`tool_result`, `stop_reason`). Se a versão
> divergir do abaixo, ajustar conforme o SDK. (Doc: context7 `@anthropic-ai/sdk`.)

```ts
import Anthropic from '@anthropic-ai/sdk'
import { client } from '@/lib/db'
import { consultaSomenteLeitura, ConsultaError } from '@/lib/jarvis/consulta-readonly'

const MODELO = 'claude-haiku-4-5-20251001' // barato; suba para 'claude-sonnet-5' se errar SQL

const SISTEMA = [
  'Voce e o assistente de consultas do ERP MOVA (motos), SOMENTE LEITURA.',
  'Para responder sobre o negocio: primeiro chame schema_mova para ver tabelas/colunas,',
  'depois consultar_mova com UM unico SELECT (sem ";"). Datas em America/Sao_Paulo',
  '(use "AT TIME ZONE \'America/Sao_Paulo\'"; nao use current_date cru).',
  'Responda em portugues do Brasil, curto, com o numero e — em uma linha — a consulta usada.',
].join(' ')

const TOOLS: Anthropic.Tool[] = [
  { name: 'schema_mova', description: 'Lista tabelas e colunas do MOVA.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'consultar_mova',
    description: 'Roda UM SELECT (sem ;) somente-leitura e devolve as linhas em JSON.',
    input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
]

async function schemaTexto(): Promise<string> {
  const linhas = await client<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`
  const schema: Record<string, string[]> = {}
  for (const l of linhas) (schema[l.table_name] ??= []).push(`${l.column_name}:${l.data_type}`)
  return JSON.stringify(schema).slice(0, 6000)
}

async function executarTool(nome: string, input: any): Promise<string> {
  if (nome === 'schema_mova') return await schemaTexto()
  if (nome === 'consultar_mova') {
    try {
      const r = await consultaSomenteLeitura(String(input?.sql ?? ''))
      return JSON.stringify(r.rows).slice(0, 4000)
    } catch (e) {
      return e instanceof ConsultaError ? `erro (${e.tipo}): ${e.detalhe}` : 'erro na consulta'
    }
  }
  return 'tool desconhecida'
}

export async function responderComClaude(pergunta: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return 'Cerebro indisponivel (sem chave). Tenta uma pergunta do /menu.'
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pergunta }]

  for (let i = 0; i < 6; i++) {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: SISTEMA,
      tools: TOOLS,
      messages,
    })
    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content })
      const resultados: Anthropic.ToolResultBlockParam[] = []
      for (const bloco of resp.content) {
        if (bloco.type === 'tool_use') {
          resultados.push({
            type: 'tool_result',
            tool_use_id: bloco.id,
            content: await executarTool(bloco.name, bloco.input),
          })
        }
      }
      messages.push({ role: 'user', content: resultados })
      continue
    }
    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    return texto || '(sem resposta)'
  }
  return 'Nao consegui concluir a consulta. Tenta reformular ou usa o /menu.'
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros (ajustar nomes de tipo do SDK se necessário).

- [ ] **Step 4: Commit**

```bash
git add src/lib/telegram/cerebro.ts package.json package-lock.json
git commit -m "feat(telegram): cerebro Claude (tool use) para perguntas fora do catalogo"
```

---

### Task 6: Webhook (junta tudo + segurança)

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`

**Interfaces:**
- Consumes: `acharPergunta`, `porId` (Task 3); `consultaSomenteLeitura` (Task 1);
  `responderComClaude` (Task 5); `enviarMensagem`, `responderCallback`,
  `enviarAcaoDigitando`, `tecladoMenu` (Task 4).

- [ ] **Step 1: Implementar `src/app/api/telegram/webhook/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { acharPergunta, porId } from '@/lib/telegram/perguntas-prontas'
import { consultaSomenteLeitura } from '@/lib/jarvis/consulta-readonly'
import { responderComClaude } from '@/lib/telegram/cerebro'
import {
  enviarMensagem,
  responderCallback,
  enviarAcaoDigitando,
  tecladoMenu,
} from '@/lib/telegram/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = process.env.TELEGRAM_ALLOWED_CHAT_ID ?? ''

function webhookAutorizado(req: NextRequest): boolean {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET
  return !!segredo && req.headers.get('x-telegram-bot-api-secret-token') === segredo
}

async function responder(texto: string): Promise<string> {
  const p = acharPergunta(texto)
  if (p) return p.formatar((await consultaSomenteLeitura(p.sql)).rows as any[])
  return await responderComClaude(texto)
}

export async function POST(req: NextRequest) {
  if (!webhookAutorizado(req)) return NextResponse.json({ ok: false }, { status: 401 })

  let update: any
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update?.message
  const cq = update?.callback_query
  try {
    if (msg) {
      const chatId = msg.chat?.id
      if (String(chatId) !== ALLOWED) return NextResponse.json({ ok: true }) // ignora estranhos
      const texto = String(msg.text ?? '').trim()
      if (!texto) return NextResponse.json({ ok: true })
      if (texto === '/start' || texto === '/menu') {
        await enviarMensagem(
          chatId,
          texto === '/start'
            ? 'Sou o consultor do MOVA (só leitura). Toque /menu ou pergunte à vontade.'
            : 'Escolha uma consulta:',
          tecladoMenu(),
        )
        return NextResponse.json({ ok: true })
      }
      await enviarAcaoDigitando(chatId)
      await enviarMensagem(chatId, await responder(texto))
    } else if (cq) {
      const fromId = cq.from?.id
      if (String(fromId) !== ALLOWED) {
        await responderCallback(cq.id, 'Nao autorizado')
        return NextResponse.json({ ok: true })
      }
      await responderCallback(cq.id)
      const p = porId(String(cq.data ?? ''))
      if (p) {
        const destino = cq.message?.chat?.id ?? fromId
        await enviarMensagem(destino, p.formatar((await consultaSomenteLeitura(p.sql)).rows as any[]))
      }
    }
  } catch (e) {
    console.error('telegram/webhook erro:', e)
    const destino = msg?.chat?.id ?? cq?.from?.id
    if (destino && String(destino) === ALLOWED) {
      await enviarMensagem(destino, 'Deu um erro ao consultar agora. Tenta de novo em instantes?')
    }
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verificar tipos + build local**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts
git commit -m "feat(telegram): webhook (perguntas prontas + Claude + seguranca)"
```

---

### Task 7: Deploy, segredos, registro do webhook e validação E2E

Passos de integração. Alguns exigem ações do Cesar (criar o bot, colar
segredos) — o executor deve PARAR e pedir quando marcado 👤.

**Files:**
- Create: `scripts/set-telegram-webhook.mjs` (conveniência para registrar/remover o webhook)

- [ ] **Step 1: 👤 Cesar cria o bot novo no @BotFather** e passa o **token**.
  (Nome sugerido: algo como "MOVA Consulta"; @username à escolha dele.)

- [ ] **Step 2: Gerar o segredo do webhook**

Run: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
Guardar a saída como `TELEGRAM_WEBHOOK_SECRET`.

- [ ] **Step 3: 👤 Cesar cola as 4 env vars na Vercel** (Project → Settings →
  Environment Variables, ambiente Production), e o executor confirma os nomes:
  - `TELEGRAM_BOT_TOKEN` = token do bot novo
  - `TELEGRAM_WEBHOOK_SECRET` = o segredo do Step 2
  - `TELEGRAM_ALLOWED_CHAT_ID` = `8908388069`
  - `ANTHROPIC_API_KEY` = a chave Claude (a mesma do vault do Jarvis)

- [ ] **Step 4: Deploy**

```bash
git push -u origin feat/telegram-consulta-nuvem
```
Aguardar o deploy de produção concluir na Vercel (o webhook precisa da env
`Production`; garantir que a branch vá para produção — merge na `main` se o
projeto só publica a `main`).

- [ ] **Step 5: Criar `scripts/set-telegram-webhook.mjs`**

```js
// Uso: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/set-telegram-webhook.mjs
// Remover:  ... node scripts/set-telegram-webhook.mjs --delete
const token = process.env.TELEGRAM_BOT_TOKEN
const segredo = process.env.TELEGRAM_WEBHOOK_SECRET
const url = 'https://mova.motochefesuldeminas.com.br/api/telegram/webhook'
if (!token) { console.error('faltou TELEGRAM_BOT_TOKEN'); process.exit(1) }

const base = `https://api.telegram.org/bot${token}`
const r = process.argv.includes('--delete')
  ? await fetch(`${base}/deleteWebhook`, { method: 'POST' })
  : await fetch(`${base}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: segredo, allowed_updates: ['message', 'callback_query'] }),
    })
console.log(await r.json())
```

- [ ] **Step 6: Registrar o webhook**

Run (com o token e o segredo no ambiente):
`node scripts/set-telegram-webhook.mjs`
Expected: `{ ok: true, result: true, description: 'Webhook was set' }`.
Conferir: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` → mostra a URL
e `pending_update_count`.

- [ ] **Step 7: Smoke test da segurança (sem o header secreto)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://mova.motochefesuldeminas.com.br/api/telegram/webhook \
  -H "Content-Type: application/json" -d '{"message":{"chat":{"id":1},"text":"oi"}}'
```
Expected: `401` (sem o header secreto, rejeita).

- [ ] **Step 8: Validação E2E pelo celular** 👤

Cesar manda no bot novo, uma a uma, e confere se batem com o MOVA:
- `/menu` → aparecem os 9 botões; tocar "Vendas hoje" → responde.
- "vendas no mês" · "ranking de vendedores" · "estoque por modelo" (perguntas prontas).
- Uma pergunta fora do catálogo (ex.: "qual vendedor vendeu mais no ano?") → o
  Claude responde (mostrando a consulta).
Conferir os números contra a tela do MOVA.

- [ ] **Step 9: Finalizar**

Usar **superpowers:finishing-a-development-branch** (rodar `npm test` + `npm run
type-check`, apresentar as opções de merge). Ao concluir, seguir a preferência
do Cesar de **push + deploy** e atualizar a memória `project-jarvis-local`.

## Self-Review (feita)

- **Cobertura da spec:** webhook ✅, segurança (segredo+allow-list+read-only) ✅,
  9 perguntas prontas com SQL exato ✅, cérebro Claude ✅, reaproveitamento
  read-only ✅, fuso SP ✅, estoque=montada+caixa ✅, testes ✅, deploy+webhook ✅.
- **Placeholders:** nenhum — todo passo tem código/comando real.
- **Consistência de tipos:** `acharPergunta/porId/CATALOGO/Pergunta` usados igual
  entre Task 3/4/6; `consultaSomenteLeitura/ConsultaError` entre Task 1/5/6;
  `responderComClaude` entre Task 5/6; wrappers do Telegram entre Task 4/6.
- **Ponto de atenção:** confirmar a forma da API do `@anthropic-ai/sdk` instalado
  (Task 5 Step 2) e que a branch vai para **produção** na Vercel (Task 7 Step 4).
