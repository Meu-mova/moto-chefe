# WhatsApp Disparador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o transporte dos alertas (venda + pedidos da fábrica) de Telegram para WhatsApp via mcp.ai, e aposentar o Telegram por completo.

**Architecture:** Um cliente WhatsApp fino (`src/lib/whatsapp/client.ts`) fala com o servidor MCP da mcp.ai pelo mesmo padrão do `src/lib/mcpai.ts` (initialize → `tools/call` sobre HTTP+SSE), chamando `whatsapp_send_text`. Os formatadores de texto (puros, testados) migram inalterados; só o envio muda. Destino é um número único por env var. O bot 2-vias do Telegram é removido.

**Tech Stack:** Next.js (App Router), Drizzle ORM (node-postgres), mcp.ai MCP over HTTP/SSE, node:test.

## Global Constraints

- **Segredos só em env, nunca commitados:** `MCPAI_WHATSAPP_URL` (URL+token) e `WHATSAPP_ALERTA_NUMERO` ficam em `.env.local` e na Vercel. Nenhum token ou número real entra em arquivo versionado nem em query string montada em código.
- **Avisos nunca derrubam a operação:** todo envio é best-effort — captura erro, loga com `console.error`, retorna status; nunca `throw` que suba pro fluxo de venda ou pro cron.
- **Texto dos alertas inalterado:** o conteúdo formatado das mensagens é idêntico ao do Telegram (os testes existentes cobrem isso). Só o transporte muda.
- **Antes de escrever código, ler o guia do Next relevante** em `node_modules/next/dist/docs/` (AGENTS.md) quando tocar em rotas/server actions.
- **Rodar testes:** `npm test`. Type-check: `npm run type-check`.

---

### Task 1: Mover o util `normalizar` para fora da pasta telegram

O `normalizar` é genérico (usado pelo Kommo), não é do bot. Precisa sair antes de apagar a pasta telegram.

**Files:**
- Create: `src/lib/texto.ts`
- Create: `src/lib/texto.test.ts`
- Modify: `src/lib/kommo-etapas.ts:1`
- Delete: `src/lib/telegram/texto.ts`

**Interfaces:**
- Produces: `export function normalizar(s: string): string`

- [ ] **Step 1: Criar `src/lib/texto.test.ts` (falha primeiro)**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar } from './texto'

test('minusculas, sem acento, espacos colapsados', () => {
  assert.equal(normalizar('  Ática   ROSA  '), 'atica rosa')
})

test('string nula vira vazia', () => {
  assert.equal(normalizar(undefined as unknown as string), '')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/texto.test.ts`
Expected: FAIL — `Cannot find module './texto'`.

- [ ] **Step 3: Criar `src/lib/texto.ts`** (conteúdo idêntico ao `telegram/texto.ts`)

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

- [ ] **Step 4: Atualizar o import do Kommo**

Em `src/lib/kommo-etapas.ts:1`, trocar:
```ts
import { normalizar } from './telegram/texto'
```
por:
```ts
import { normalizar } from './texto'
```

- [ ] **Step 5: Apagar `src/lib/telegram/texto.ts`**

```bash
git rm src/lib/telegram/texto.ts
```

- [ ] **Step 6: Rodar testes e type-check**

Run: `node --import tsx --test src/lib/texto.test.ts src/lib/kommo-etapas.test.ts && npm run type-check`
Expected: PASS (o `type-check` ainda vai reclamar do `package.json` só no fim; aqui só confirmamos que kommo-etapas compila com o novo import).

- [ ] **Step 7: Commit**

```bash
git add src/lib/texto.ts src/lib/texto.test.ts src/lib/kommo-etapas.ts
git commit -m "refactor(texto): move normalizar para fora da pasta telegram"
```

---

### Task 2: Cliente WhatsApp (`enviarAlertaWhatsapp`)

Fala com a mcp.ai e envia o texto para o número da env. Espelha o `chamarMcp`/`parseSse` do `src/lib/mcpai.ts`.

**Files:**
- Create: `src/lib/whatsapp/client.ts`
- Create: `src/lib/whatsapp/client.test.ts`
- Reference: `src/lib/mcpai.ts:17-42` (padrão a espelhar)

**Interfaces:**
- Produces:
  - `export type ResultadoEnvioWhatsapp = 'enviado' | 'sem_numero' | 'erro'`
  - `export function montarChamadaEnvio(numero: string, texto: string): Record<string, unknown>`
  - `export async function enviarAlertaWhatsapp(texto: string): Promise<ResultadoEnvioWhatsapp>`
- Env consumidas: `MCPAI_WHATSAPP_URL`, `WHATSAPP_ALERTA_NUMERO`.

- [ ] **Step 1: Criar `src/lib/whatsapp/client.test.ts` (falha primeiro)**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarChamadaEnvio } from './client'

test('monta a chamada tools/call de whatsapp_send_text', () => {
  const corpo = montarChamadaEnvio('5535999999999', 'oi')
  assert.deepEqual(corpo, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'whatsapp_send_text', arguments: { to: '5535999999999', text: 'oi' } },
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/whatsapp/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Criar `src/lib/whatsapp/client.ts`**

```ts
type RespostaMcp = {
  json: { result?: unknown; error?: { message?: string } }
  sessionId: string | null
}

function parseSse(texto: string): RespostaMcp['json'] {
  const linha = texto.split('\n').find(l => l.startsWith('data:'))
  if (!linha) throw new Error('Resposta do mcp.ai sem payload SSE')
  return JSON.parse(linha.slice('data:'.length).trim())
}

async function chamarMcp(url: string, sessionId: string | null, body: Record<string, unknown>): Promise<RespostaMcp> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const texto = await res.text()
  return { json: parseSse(texto), sessionId: res.headers.get('mcp-session-id') }
}

/** Corpo JSON-RPC da chamada de envio — puro, é o que o teste cobre. */
export function montarChamadaEnvio(numero: string, texto: string): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'whatsapp_send_text', arguments: { to: numero, text: texto } },
  }
}

export type ResultadoEnvioWhatsapp = 'enviado' | 'sem_numero' | 'erro'

/**
 * Dispara um alerta de texto no WhatsApp via mcp.ai. Nunca lança — aviso é
 * efeito colateral e não pode derrubar venda nem o cron.
 */
export async function enviarAlertaWhatsapp(texto: string): Promise<ResultadoEnvioWhatsapp> {
  const url = process.env.MCPAI_WHATSAPP_URL
  const numero = process.env.WHATSAPP_ALERTA_NUMERO?.trim()
  if (!url) {
    console.error('MCPAI_WHATSAPP_URL não configurada')
    return 'erro'
  }
  if (!numero) return 'sem_numero'

  try {
    const init = await chamarMcp(url, null, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'moto-chefe', version: '1.0' },
      },
    })
    if (init.json.error || !init.sessionId) {
      console.error('whatsapp initialize falhou:', init.json.error?.message ?? 'sem sessão')
      return 'erro'
    }

    const envio = await chamarMcp(url, init.sessionId, montarChamadaEnvio(numero, texto))
    if (envio.json.error) {
      console.error('whatsapp_send_text falhou:', envio.json.error.message)
      return 'erro'
    }
    return 'enviado'
  } catch (e) {
    console.error('envio de whatsapp falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/whatsapp/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Documentar as env vars localmente (não commitar valores)**

Adicionar ao `.env.local` (arquivo gitignored) os dois valores — a URL com token que o Cesar forneceu e o número de destino que ele passou:
```
MCPAI_WHATSAPP_URL=<URL mcp.ai de whatsapp fornecida pelo Cesar>
WHATSAPP_ALERTA_NUMERO=<número com DDI fornecido pelo Cesar>
```
As mesmas variáveis precisam ser setadas na Vercel (Production + Preview) — passo manual do Cesar, anotado no fim do plano. **Não** escrever os valores reais em nenhum arquivo versionado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/client.ts src/lib/whatsapp/client.test.ts
git commit -m "feat(whatsapp): cliente enviarAlertaWhatsapp via mcp.ai"
```

---

### Task 3: Aviso de venda no WhatsApp

Move o formatador (inalterado) e reescreve o notificador para enviar via WhatsApp.

**Files:**
- Create: `src/lib/whatsapp/venda.ts`
- Create: `src/lib/whatsapp/venda.test.ts` (movido de `src/lib/telegram/venda.test.ts`)
- Reference: `src/lib/telegram/venda.ts` (origem)

**Interfaces:**
- Consumes: `enviarAlertaWhatsapp` (Task 2).
- Produces:
  - `export type DadosVendaWhatsapp = { marca: string; modelo: string; valor: number; vendedor: string; loja: string }`
  - `export function formatarAvisoVenda(d: DadosVendaWhatsapp): string`
  - `export type ResultadoAvisoVenda = 'enviado' | 'sem_numero' | 'erro'`
  - `export async function notificarVendaWhatsapp(params: { lojaId: string; modeloId: string; vendedorId: string; valor: number }): Promise<ResultadoAvisoVenda>`

- [ ] **Step 1: Criar `src/lib/whatsapp/venda.test.ts` (falha primeiro)**

Conteúdo idêntico ao `src/lib/telegram/venda.test.ts`, só o import muda de `./venda` (mesmo caminho relativo — o arquivo é o novo `whatsapp/venda.ts`):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarAvisoVenda } from './venda'

test('formata as quatro informacoes pedidas', () => {
  const texto = formatarAvisoVenda({
    marca: 'Shineray', modelo: 'SHI 175', valor: 12500,
    vendedor: 'Kawan Manso', loja: 'Pouso Alegre',
  })
  assert.equal(
    texto,
    '🏍️ Moto vendida\n' +
    'Modelo: Shineray SHI 175\n' +
    'Valor: R$ 12.500,00\n' +
    'Vendedor: Kawan Manso\n' +
    'Loja: Pouso Alegre'
  )
})

test('valor com centavos sai no padrao brasileiro', () => {
  const texto = formatarAvisoVenda({
    marca: 'Honda', modelo: 'Biz', valor: 9899.9,
    vendedor: 'Anne Ester', loja: 'Varginha',
  })
  assert.match(texto, /Valor: R\$ 9\.899,90/)
})

test('nao escapa markdown: modelo com _ sai literal', () => {
  const texto = formatarAvisoVenda({
    marca: '', modelo: 'BIZ_110', valor: 1, vendedor: 'A', loja: 'B',
  })
  assert.match(texto, /Modelo: BIZ_110/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/whatsapp/venda.test.ts`
Expected: FAIL — `Cannot find module './venda'`.

- [ ] **Step 3: Criar `src/lib/whatsapp/venda.ts`**

O `formatarAvisoVenda` é copiado **sem alterar o corpo** (inclusive o comentário sobre o espaço não-quebrável). O notificador perde o join com `grupos`/`telegramChatId` e envia para o número da env.

```ts
import { db } from '@/lib/db'
import { lojas, modelos, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { enviarAlertaWhatsapp } from './client'

export type DadosVendaWhatsapp = {
  marca: string
  modelo: string
  valor: number
  vendedor: string
  loja: string
}

export type ResultadoAvisoVenda = 'enviado' | 'sem_numero' | 'erro'

/**
 * Texto do aviso. Puro de propósito — é o que os testes cobrem.
 * Texto plano (sem markdown), então nome com `_` ou `*` não vira formatação quebrada.
 */
export function formatarAvisoVenda(d: DadosVendaWhatsapp): string {
  // toLocaleString('pt-BR') separa "R$" do número com espaço não-quebrável
  // (U+00A0) — normalizado para espaço comum.
  const valor = d.valor
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ')

  const veiculo = [d.marca, d.modelo].map(s => s.trim()).filter(Boolean).join(' ')

  return [
    '🏍️ Moto vendida',
    `Modelo: ${veiculo}`,
    `Valor: ${valor}`,
    `Vendedor: ${d.vendedor}`,
    `Loja: ${d.loja}`,
  ].join('\n')
}

/**
 * Avisa por WhatsApp sobre uma venda. Os dados de loja/modelo/vendedor saem da
 * LOJA DA MOTO (não do cookie grupoAtivo). Destino é o número único da env.
 * Nunca lança: aviso é efeito colateral e não pode derrubar o registro da venda.
 */
export async function notificarVendaWhatsapp(params: {
  lojaId: string
  modeloId: string
  vendedorId: string
  valor: number
}): Promise<ResultadoAvisoVenda> {
  try {
    const [row] = await db
      .select({
        loja:     lojas.nome,
        marca:    modelos.marca,
        modelo:   modelos.modelo,
        vendedor: usuarios.nome,
      })
      .from(lojas)
      .innerJoin(modelos,  eq(modelos.id,  params.modeloId))
      .innerJoin(usuarios, eq(usuarios.id, params.vendedorId))
      .where(eq(lojas.id, params.lojaId))
      .limit(1)

    if (!row) return 'erro'

    return await enviarAlertaWhatsapp(formatarAvisoVenda({
      marca:    row.marca,
      modelo:   row.modelo,
      valor:    params.valor,
      vendedor: row.vendedor,
      loja:     row.loja,
    }))
  } catch (e) {
    console.error('aviso de venda no whatsapp falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
```

> ⚠️ O caractere ` ` no `.replace` acima é escrito como escape de propósito (o char cru não sobrevive a uma edição de arquivo). Confirme que o teste "valor com centavos" passa — ele é a rede de segurança dessa normalização.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/whatsapp/venda.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/venda.ts src/lib/whatsapp/venda.test.ts
git commit -m "feat(whatsapp): aviso de venda via whatsapp"
```

---

### Task 4: Alerta de pedidos da fábrica no WhatsApp

Move os formatadores (inalterados) e reescreve a rotina de alerta para enviar via WhatsApp, sem depender de `telegramChatId`.

**Files:**
- Create: `src/lib/whatsapp/pedidos-fabrica.ts`
- Create: `src/lib/whatsapp/pedidos-fabrica.test.ts` (movido de `src/lib/telegram/pedidos-fabrica.test.ts`)
- Reference: `src/lib/telegram/pedidos-fabrica.ts` (origem)

**Interfaces:**
- Consumes: `enviarAlertaWhatsapp` (Task 2); `loginFabrica`, `listarPedidosCompraFabrica`, `STATUS_AGUARDANDO_PAGAMENTO`, `PedidoCompraFabrica` de `@/lib/fabrica-scraper`.
- Produces:
  - `export type PedidoAviso = { numeroPedido: string; valor: number | null; metodo: string | null; dataPedido: string | null; diasPendente: number }`
  - `export function formatarAvisoPedidosFabrica(params: { loja: string; novos: PedidoAviso[]; pendentes: PedidoAviso[] }): string | null`
  - `export function diasEntre(de: Date, ate: Date): number`
  - `export type ResultadoLoja = { loja: string; grupo: string; status: 'enviado' | 'nada_pendente' | 'sem_numero' | 'sem_credencial' | 'erro'; novos?: number; pendentes?: number; erro?: string }`
  - `export async function alertarPedidosFabricaDaLoja(loja: {...}, agora: Date): Promise<ResultadoLoja>`
  - `export async function alertarPedidosFabrica(agora?: Date): Promise<ResultadoLoja[]>`
  - `export type { PedidoCompraFabrica }`

- [ ] **Step 1: Criar `src/lib/whatsapp/pedidos-fabrica.test.ts` (falha primeiro)**

Copiar `src/lib/telegram/pedidos-fabrica.test.ts` inteiro para o novo caminho, **sem alterar** as asserções (import `from './pedidos-fabrica'` continua válido no novo diretório).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/lib/whatsapp/pedidos-fabrica.test.ts`
Expected: FAIL — `Cannot find module './pedidos-fabrica'`.

- [ ] **Step 3: Criar `src/lib/whatsapp/pedidos-fabrica.ts`**

Copiar de `src/lib/telegram/pedidos-fabrica.ts` **mantendo inalterados** `formatarValor`, `linhaPedido`, `formatarAvisoPedidosFabrica`, `diasEntre` e `URL_PORTAL`. As mudanças são só no transporte:

1. Trocar o import `import { enviarMensagem } from './api'` por `import { enviarAlertaWhatsapp } from './client'`.
2. No tipo `ResultadoLoja`, trocar o status `'sem_chat'` por `'sem_numero'`.
3. Em `alertarPedidosFabricaDaLoja`: remover o campo `telegramChatId` do param `loja`, remover a leitura `const chatId = ...` e o early-return `if (!chatId) return { ...base, status: 'sem_chat' }`. O envio passa a:

```ts
    const texto = formatarAvisoPedidosFabrica({ loja: loja.nome, novos, pendentes })
    if (!texto) return { ...base, status: 'nada_pendente' }

    const envio = await enviarAlertaWhatsapp(texto)
    if (envio !== 'enviado') {
      // Não grava o controle: pedido segue "novo" e a próxima rodada tenta de novo.
      return { ...base, status: envio === 'sem_numero' ? 'sem_numero' : 'erro' }
    }

    // Só grava depois do envio confirmado.
    for (const p of aguardando) {
      await db.insert(pedidosFabricaAlerta)
        .values({
          grupoId:          loja.grupoId,
          lojaId:           loja.id,
          numeroPedido:     p.numeroPedido,
          valor:            p.valor != null ? String(p.valor) : null,
          dataPedido:       p.dataPedido,
          primeiroAlertaEm: agora,
          ultimoAlertaEm:   agora,
        })
        .onConflictDoUpdate({
          target: [pedidosFabricaAlerta.lojaId, pedidosFabricaAlerta.numeroPedido],
          set:    { ultimoAlertaEm: agora, resolvidoEm: null },
        })
    }

    return { ...base, status: 'enviado', novos: novos.length, pendentes: pendentes.length }
```

4. Em `alertarPedidosFabrica`, remover `telegramChatId: grupos.telegramChatId` do `.select(...)` da query de lojas ativas (o resto — join grupos, filtro `ativo`/`ativa`, orderBy — fica igual). O objeto de loja passado adiante não terá mais `telegramChatId`.

> Nota: `grupos` continua importado porque a query ainda faz `innerJoin(grupos)` para `grupoNome` e o filtro `grupos.ativo`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/lib/whatsapp/pedidos-fabrica.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/pedidos-fabrica.ts src/lib/whatsapp/pedidos-fabrica.test.ts
git commit -m "feat(whatsapp): alerta de pedidos da fabrica via whatsapp"
```

---

### Task 5: Religar os pontos de chamada (venda + cron)

Aponta os call sites para os módulos WhatsApp.

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts` (import linha 13; wrapper ~443; chamadas ~432 e ~1472)
- Modify: `src/app/api/cron/pedidos-fabrica/route.ts:2`

**Interfaces:**
- Consumes: `notificarVendaWhatsapp`, `ResultadoAvisoVenda` (Task 3); `alertarPedidosFabrica` (Task 4).

- [ ] **Step 1: Trocar o import em `vendas/actions.ts:13`**

De:
```ts
import { notificarVendaTelegram, type ResultadoAvisoVenda } from '@/lib/telegram/venda'
```
para:
```ts
import { notificarVendaWhatsapp, type ResultadoAvisoVenda } from '@/lib/whatsapp/venda'
```

- [ ] **Step 2: Renomear o wrapper e a chamada interna (~linhas 439-450)**

```ts
/**
 * Aviso de venda no WhatsApp — best-effort com timeout, igual ao virarLeadKommo:
 * WhatsApp fora do ar não pode fazer a venda falhar depois de já estar gravada.
 */
async function avisarVendaNoWhatsapp(params: {
  lojaId: string; modeloId: string; vendedorId: string; valor: number
}): Promise<void> {
  await Promise.race([
    notificarVendaWhatsapp(params),
    new Promise<ResultadoAvisoVenda>(res => setTimeout(() => res('erro'), 8000)),
  ]).catch(() => 'erro' as const)
}
```

- [ ] **Step 3: Atualizar as duas chamadas do wrapper**

Nas linhas ~432 e ~1472, trocar `await avisarVendaNoTelegram({` por `await avisarVendaNoWhatsapp({` (argumentos inalterados).

- [ ] **Step 4: Trocar o import no cron `route.ts:2`**

De:
```ts
import { alertarPedidosFabrica } from '@/lib/telegram/pedidos-fabrica'
```
para:
```ts
import { alertarPedidosFabrica } from '@/lib/whatsapp/pedidos-fabrica'
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS (nenhuma referência a `notificarVendaTelegram`/`avisarVendaNoTelegram` sobrou).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/vendas/actions.ts" src/app/api/cron/pedidos-fabrica/route.ts
git commit -m "refactor: religa aviso de venda e cron da fabrica para o whatsapp"
```

---

### Task 6: Remover o campo Telegram do Admin → Grupos

Tira o input "Chat do Telegram" e o `telegramChatId` das server actions. A coluna do banco fica (morta).

**Files:**
- Modify: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx` (linhas 21, 43, 53, 109-121)
- Modify: `src/app/(dashboard)/admin/grupos/actions.ts` (linhas 26, 43, 63)

- [ ] **Step 1: `grupo-dialog.tsx` — remover o estado e o campo**

- Remover `telegramChatId: string | null` do tipo do `inicial` (linha ~21).
- Remover `const [telegramChatId, setTelegramChatId] = useState(inicial?.telegramChatId ?? '')` (linha ~43).
- Remover `telegramChatId` do objeto `dados` montado no submit (linha ~53).
- Remover o bloco JSX inteiro do campo Telegram (linhas ~109-121, o `<div>` com `<Label>Telegram — Chat do grupo de avisos</Label>` e o parágrafo de ajuda).

- [ ] **Step 2: `grupos/actions.ts` — remover do tipo e dos writes**

- Remover `telegramChatId?: string` do `type GrupoInput` (linha ~26).
- Remover a linha `telegramChatId: dados.telegramChatId?.trim() || null,` do `.values({...})` em `criarGrupoAction` (~43) e do `.set({...})` em `editarGrupoAction` (~63).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx" "src/app/(dashboard)/admin/grupos/actions.ts"
git commit -m "refactor(grupos): remove config de chat do telegram do admin"
```

---

### Task 7: Apagar o Telegram e ajustar os testes

Nada mais importa a pasta telegram nem a rota do webhook. Remove tudo e conserta o `package.json`.

**Files:**
- Delete: `src/lib/telegram/` (api.ts, api.test.ts, cerebro.ts, perguntas-prontas.ts, perguntas-prontas.test.ts, venda.ts, venda.test.ts, pedidos-fabrica.ts, pedidos-fabrica.test.ts)
- Delete: `src/app/api/telegram/webhook/route.ts` (e a pasta `src/app/api/telegram/` se ficar vazia)
- Modify: `package.json:13` (script `test`)
- Optional cleanup: `src/lib/db/schema.ts:44-45` (marcar coluna como obsoleta)

- [ ] **Step 1: Confirmar que ninguém mais importa `@/lib/telegram`**

Run: `git grep -n "lib/telegram" -- 'src/*'`
Expected: sem resultados fora dos próprios arquivos que vão ser apagados. (Se aparecer algo, resolver antes de seguir.)

- [ ] **Step 2: Apagar a pasta telegram e a rota do webhook**

```bash
git rm -r src/lib/telegram
git rm src/app/api/telegram/webhook/route.ts
```
Se `src/app/api/telegram/` ficar vazia, o `git rm` do arquivo já a remove do índice.

- [ ] **Step 3: Ajustar o script `test` no `package.json`**

No script `test` (linha 13), **remover** os caminhos:
`src/lib/telegram/texto.test.ts`, `src/lib/telegram/perguntas-prontas.test.ts`, `src/lib/telegram/api.test.ts`, `src/lib/telegram/venda.test.ts`, `src/lib/telegram/pedidos-fabrica.test.ts`.

E **adicionar**:
`src/lib/texto.test.ts`, `src/lib/whatsapp/client.test.ts`, `src/lib/whatsapp/venda.test.ts`, `src/lib/whatsapp/pedidos-fabrica.test.ts`.

(Os testes `api.test` e `perguntas-prontas.test` eram do bot e não têm substituto — somem.)

- [ ] **Step 4: (Opcional) Marcar a coluna morta no schema**

Em `src/lib/db/schema.ts:44-45`, atualizar o comentário para deixar claro que está obsoleta:
```ts
  // OBSOLETO: avisos migraram para WhatsApp (env WHATSAPP_ALERTA_NUMERO).
  // Coluna mantida só pra evitar migração de drop; remover numa migração futura.
  telegramChatId:     text('telegram_chat_id'),
```

- [ ] **Step 5: Rodar a suíte inteira e o type-check**

Run: `npm test && npm run type-check`
Expected: PASS — sem referências órfãs ao telegram, todos os testes verdes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(telegram): aposenta bot e disparos do telegram"
```

---

### Task 8: Deploy e validação real

**Files:** nenhum (config + verificação).

- [ ] **Step 1: Setar as env vars na Vercel**

`MCPAI_WHATSAPP_URL` e `WHATSAPP_ALERTA_NUMERO` em Production (e Preview) no projeto da Vercel. Passo do Cesar.

- [ ] **Step 2: Confirmar o WhatsApp pareado na mcp.ai**

Rodar um `whatsapp_list_accounts` no endpoint (ou pedir ao Cesar confirmar no painel da mcp.ai) para garantir que há uma conta pareada. Se houver mais de uma, passar `account` no `montarChamadaEnvio` (ajuste pequeno em `client.ts`).

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
```
Acompanhar o deploy na Vercel até `Ready`.

- [ ] **Step 4: Teste ponta a ponta**

- Disparo manual do cron: `POST /api/cron/pedidos-fabrica` com o header `x-cron-secret` — confere se a mensagem chega no número.
- Registrar uma venda de teste (ou reproduzir o fluxo) e confirmar o aviso de venda no WhatsApp.

- [ ] **Step 5: Passos manuais de encerramento do Telegram (Cesar)**

- Revogar o `@MovaMC_bot` no BotFather.
- Apagar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` das env vars da Vercel.

---

## Self-Review

**Cobertura do spec:**
- Cliente WhatsApp via mcp.ai → Task 2. ✔
- Aviso de venda migrado → Tasks 3, 5. ✔
- Alerta de pedidos da fábrica migrado → Tasks 4, 5. ✔
- Destino por env var (número único) → Task 2 (client lê env). ✔
- Formatadores reaproveitados/movidos → Tasks 3, 4. ✔
- `normalizar` para lugar neutro → Task 1. ✔
- Telegram aposentado (pasta, webhook, admin, testes) → Tasks 6, 7. ✔
- `marketing-canal.ts` e coluna `telegram_chat_id` intocados/obsoletos → Task 7 (só comentário). ✔
- Passos manuais (env Vercel, BotFather) → Tasks 2, 8. ✔

**Consistência de tipos:** `ResultadoAvisoVenda` e `ResultadoEnvioWhatsapp` compartilham os literais `'enviado' | 'sem_numero' | 'erro'`; `ResultadoLoja.status` inclui `'sem_numero'` (substitui `'sem_chat'`). `notificarVendaWhatsapp` e `alertarPedidosFabrica` mantêm as assinaturas que os call sites da Task 5 esperam. ✔

**Placeholders:** nenhum passo com "TBD"/"handle errors" — todo código está explícito; segredos são referenciados por nome de env, nunca valor. ✔
