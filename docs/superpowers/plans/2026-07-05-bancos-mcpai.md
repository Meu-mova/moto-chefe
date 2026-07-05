# Bancos (mcp.ai / Open Finance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um card "Bancos" no admin que mostra, ao vivo, o saldo das contas bancárias (corrente/poupança) conectadas ao grupo Sul de Minas via a plataforma mcp.ai (Open Finance).

**Architecture:** `src/lib/mcpai.ts` implementa um cliente MCP mínimo (JSON-RPC 2.0 sobre HTTP: `initialize` → `tools/call`) contra a URL guardada em `process.env.MCPAI_ENDPOINT_URL`. Uma nova página `/admin/bancos` (Server Component) chama essa função e renderiza os saldos; o card no dashboard do admin só aparece quando o grupo ativo é "Sul de Minas".

**Tech Stack:** Next.js App Router (Server Component, `fetch` nativo), TypeScript, shadcn/ui Card, lucide-react.

## Global Constraints

- `MCPAI_ENDPOINT_URL` já está configurada em produção (Vercel) e em `.env.local` — **não hardcode a URL/token em nenhum arquivo versionado**
- Só contas `type: "BANK"` (corrente/poupança) — sem cartão de crédito
- Busca ao vivo a cada carregamento de página, sem cache
- Página e card só funcionam/aparecem quando `grupo.nome === 'Sul de Minas'`
- Permissão: `admin_geral` e `admin_socio` (via `AdminGuard`, mesmo padrão das outras páginas do admin)
- Qualquer falha (rede, erro JSON-RPC, ausência de conexões) deve mostrar uma mensagem amigável — a página nunca pode quebrar com uma exceção não tratada

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/mcpai.ts` | Criar — cliente MCP mínimo + `buscarSaldosBancarios()` |
| `src/app/(dashboard)/admin/bancos/page.tsx` | Criar — página que exibe os saldos |
| `src/app/(dashboard)/admin/page.tsx` | Modificar — card "Bancos" condicional ao grupo ativo |

---

## Task 1: Cliente MCP e busca de saldos

**Files:**
- Create: `src/lib/mcpai.ts`

**Interfaces:**
- Produces: `buscarSaldosBancarios(): Promise<ResultadoSaldos>`, `ResultadoSaldos = { ok: true; contas: ContaBancaria[] } | { ok: false; erro: string }`, `ContaBancaria = { id: string; banco: string; tipo: 'corrente' | 'poupanca'; numero: string; saldo: string }` — consumido por Task 2

- [ ] **Step 1: Criar `src/lib/mcpai.ts`**

O servidor mcp.ai fala JSON-RPC 2.0 sobre HTTP (não é REST). Cada chamada
`initialize` retorna um header `Mcp-Session-Id` que deve ser reenviado nas
chamadas seguintes daquela sessão. As respostas vêm em formato
Server-Sent-Events: uma única linha `data: {...json...}` contendo o corpo
JSON-RPC. O `tools/call` de `openfinance_list_accounts` retorna, dentro de
`result.content[0].text`, uma STRING que por sua vez é um JSON com
`{ results: [...] }` — precisa de dois `JSON.parse` em cascata (o SSE e o
texto interno).

```ts
type ContaBancaria = {
  id: string
  banco: string
  tipo: 'corrente' | 'poupanca'
  numero: string
  saldo: string
}

type ResultadoSaldos =
  | { ok: true; contas: ContaBancaria[] }
  | { ok: false; erro: string }

type RespostaMcp = {
  json: { result?: unknown; error?: { message?: string } }
  sessionId: string | null
}

function parseSse(texto: string): RespostaMcp['json'] {
  const linha = texto.split('\n').find(l => l.startsWith('data:'))
  if (!linha) throw new Error('Resposta do mcp.ai sem payload SSE')
  return JSON.parse(linha.slice('data:'.length).trim())
}

async function chamarMcp(sessionId: string | null, body: Record<string, unknown>): Promise<RespostaMcp> {
  const url = process.env.MCPAI_ENDPOINT_URL
  if (!url) throw new Error('MCPAI_ENDPOINT_URL não configurada')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const texto = await res.text()
  const json = parseSse(texto)
  return { json, sessionId: res.headers.get('mcp-session-id') }
}

const SUBTYPE_LABEL: Record<string, 'corrente' | 'poupanca'> = {
  CHECKING_ACCOUNT: 'corrente',
  SAVINGS_ACCOUNT: 'poupanca',
}

export async function buscarSaldosBancarios(): Promise<ResultadoSaldos> {
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

    const chamada = await chamarMcp(init.sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'openfinance_list_accounts',
        arguments: { type: 'BANK' },
      },
    })
    if (chamada.json.error) {
      return { ok: false, erro: chamada.json.error.message ?? 'Erro ao buscar contas no mcp.ai' }
    }

    const result = chamada.json.result as { content?: { text?: string }[] } | undefined
    const conteudo = result?.content?.[0]?.text
    if (!conteudo) return { ok: false, erro: 'Resposta inesperada do mcp.ai' }

    const payload = JSON.parse(conteudo) as { results?: Array<{
      id: string
      bank: string
      subtype: string
      number: string
      balance: string
    }> }
    const resultados = payload.results ?? []

    const contas: ContaBancaria[] = resultados.map(r => ({
      id: r.id,
      banco: r.bank,
      tipo: SUBTYPE_LABEL[r.subtype] ?? 'corrente',
      numero: r.number,
      saldo: r.balance,
    }))

    return { ok: true, contas }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros em `src/lib/mcpai.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcpai.ts
git commit -m "feat: cliente MCP para buscar saldos bancarios via mcp.ai"
```

---

## Task 2: Página `/admin/bancos` e card condicional no admin

**Files:**
- Create: `src/app/(dashboard)/admin/bancos/page.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `buscarSaldosBancarios()` e os tipos `ResultadoSaldos`/`ContaBancaria` de Task 1 (`@/lib/mcpai`); `getGrupoAtivo` de `@/lib/grupo`; `AdminGuard` de `../components/admin-guard`

- [ ] **Step 1: Criar `src/app/(dashboard)/admin/bancos/page.tsx`**

```tsx
import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarSaldosBancarios } from '@/lib/mcpai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TIPO_LABEL = { corrente: 'Conta Corrente', poupanca: 'Poupança' } as const

function fmt(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function BancosConteudo() {
  const resultado = await buscarSaldosBancarios()

  if (!resultado.ok) {
    return <p className="text-sm text-red-600">Não foi possível buscar os saldos: {resultado.erro}</p>
  }

  if (resultado.contas.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma conta conectada.</p>
  }

  const total = resultado.contas.reduce((s, c) => s + Number(c.saldo), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Total</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold text-green-600">{fmt(String(total))}</p></CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resultado.contas.map(c => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.banco}</CardTitle>
              <p className="text-xs text-slate-400">{TIPO_LABEL[c.tipo]} — {c.numero}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{fmt(c.saldo)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default async function BancosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bancos</h1>
          <p className="text-slate-500 text-sm">Saldo das contas conectadas via Open Finance</p>
        </div>

        {grupo.nome !== 'Sul de Minas' ? (
          <p className="text-sm text-slate-500">
            Esta integração está disponível apenas para o grupo Sul de Minas. Troque o grupo ativo para visualizar.
          </p>
        ) : (
          <BancosConteudo />
        )}
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 2: Adicionar o card "Bancos" ao dashboard do admin**

Em `src/app/(dashboard)/admin/page.tsx`, linha 5, trocar:

```tsx
import { Building2, Users, Bike, Settings2, Tags, Megaphone, BarChart3, PackagePlus, ShoppingBag, Tag, FileText, Database, Layers, TrendingDown } from 'lucide-react'
```

por:

```tsx
import { Building2, Users, Bike, Settings2, Tags, Megaphone, BarChart3, PackagePlus, ShoppingBag, Tag, FileText, Database, Layers, TrendingDown, Landmark } from 'lucide-react'
```

Adicionar o import de `getGrupoAtivo` logo após o import de `getUsuarioLogado` (linha 2):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
```

No corpo da função (linhas 7-9), trocar:

```tsx
export default async function AdminPage() {
  const usuario = await getUsuarioLogado()
  const isSuperAdmin = usuario.papel === 'admin_geral'
```

por:

```tsx
export default async function AdminPage() {
  const usuario = await getUsuarioLogado()
  const isSuperAdmin = usuario.papel === 'admin_geral'
  const grupo = await getGrupoAtivo(usuario)
  const mostrarBancos = grupo.nome === 'Sul de Minas'
```

Por fim, adicionar o card condicional logo após o card "Despesas" (antes do card "Comunicados"). Trocar:

```tsx
          <Link href="/despesas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <TrendingDown className="text-slate-600" size={20} />
                <CardTitle className="text-base">Despesas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Despesas operacionais da empresa</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/comunicados">
```

por:

```tsx
          <Link href="/despesas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <TrendingDown className="text-slate-600" size={20} />
                <CardTitle className="text-base">Despesas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Despesas operacionais da empresa</p></CardContent>
            </Card>
          </Link>
          {mostrarBancos && (
            <Link href="/admin/bancos">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex-row gap-3 items-center pb-2">
                  <Landmark className="text-slate-600" size={20} />
                  <CardTitle className="text-base">Bancos</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-slate-500">Saldo das contas conectadas (Open Finance)</p></CardContent>
              </Card>
            </Link>
          )}
          <Link href="/admin/comunicados">
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Testar no browser**

Com `.env.local` já contendo `MCPAI_ENDPOINT_URL` (configurado fora deste plano), rodar `npm run dev` e, logado como `admin_socio` ou `admin_geral` com o grupo ativo "Sul de Minas":
- O card "Bancos" aparece no `/admin`
- `/admin/bancos` mostra o saldo total e as contas (Sicoob, Sicredi) com valores reais
- Trocar o grupo ativo para outro grupo (ex. BH) → o card some do `/admin` e, se acessar `/admin/bancos` diretamente pela URL, aparece a mensagem "disponível apenas para o grupo Sul de Minas"

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/bancos/page.tsx" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat: pagina e card Bancos com saldos ao vivo via mcp.ai"
```
