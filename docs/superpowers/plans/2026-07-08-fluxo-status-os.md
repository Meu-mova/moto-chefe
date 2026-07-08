# Fluxo de Status da OS com Permissão por Papel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir o status da OS de 3 para 6 etapas (Aberta, Oficina, Em Andamento, Finalizada, Pendente de Pagamento, Concluída), cada transição validada no servidor por papel responsável, com "Concluída" disparada automaticamente ao registrar o pagamento (gatilho temporário até a Parte 2 trocar por conciliação real).

**Architecture:** Extensão do enum Postgres `os_status` (sem remover valores existentes). `atualizarStatusOSAction` passa a validar sequência + papel responsável por transição, em vez de aceitar qualquer status de qualquer `EDITORES`. `registrarPagamentoOSAction` ganha efeito colateral de fechar a OS. Todos os lugares que hoje assumem só 3 status (`os-status-bar.tsx`, `os-card.tsx`, `os-filtros.tsx`, listagem) precisam reconhecer os 3 novos — sem isso, OS que avançam além de "Em Andamento" desaparecem silenciosamente da listagem (ela hoje só agrupa `aberta`/`em_andamento`/`concluida`).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM + Postgres (Supabase), Tailwind.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-08-fluxo-status-os-design.md`.
- 6 status, nesta ordem: `aberta`, `oficina`, `em_andamento`, `finalizada`, `pendente_pagamento`, `concluida`. Nenhum valor existente é removido ou renomeado.
- Responsável por transição: `oficina`/`em_andamento`/`finalizada` → só papel `mecanico`. `pendente_pagamento` → só `GESTORES` (admin_geral/admin_socio/aux_adm). `concluida` → automático via `registrarPagamentoOSAction`, nunca um botão manual.
- Sem restrição por mecânico designado (`mecanicoId`) — qualquer usuário com papel `mecanico` pode avançar as etapas de oficina.
- **Não usar `npm run db:generate` nem `npm run db:migrate`** — SQL manual, aplicado via Supabase MCP `apply_migration` (`project_id: "bzlaradpofaecqzawyym"`), com confirmação do usuário — última tarefa deste plano.
- Este projeto não tem suíte de testes automatizada — só `tsc --noEmit` via `npm run type-check`. Ciclo de verificação por tarefa: type-check limpo + verificação manual descrita no passo.

---

### Task 1: Schema — estender o enum `os_status`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0017_status_os_expandido.sql`

**Interfaces:**
- Produces: `osStatusEnum` com 6 valores. Tarefas seguintes usam os 3 novos nomes (`oficina`, `finalizada`, `pendente_pagamento`) como strings literais — não há export de tipo TS específico a consumir além do enum já existente.

- [ ] **Step 1: Atualizar o enum no schema**

Em `src/lib/db/schema.ts`, localize:

```ts
export const osStatusEnum = pgEnum('os_status', ['aberta', 'em_andamento', 'concluida'])
```

Troque por:

```ts
export const osStatusEnum = pgEnum('os_status', [
  'aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida',
])
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros (o enum do Drizzle é só uma lista de strings; adicionar valores não quebra nada que já usa os 3 antigos).

- [ ] **Step 3: Escrever a migração manualmente**

Crie `src/lib/db/migrations/0017_status_os_expandido.sql`:

```sql
ALTER TYPE "os_status" ADD VALUE 'oficina' AFTER 'aberta';
ALTER TYPE "os_status" ADD VALUE 'finalizada' AFTER 'em_andamento';
ALTER TYPE "os_status" ADD VALUE 'pendente_pagamento' AFTER 'finalizada';
```

Não rode `db:generate` nem `db:migrate` — aplicação real é a última tarefa deste plano, via Supabase MCP `apply_migration`, com confirmação do usuário.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0017_status_os_expandido.sql
git commit -m "feat: estender enum os_status com oficina, finalizada e pendente_pagamento"
```

---

### Task 2: Backend — validar transição por papel; pagamento fecha a OS

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/actions.ts`

**Interfaces:**
- Consumes: `GESTORES`, `verificarAcessoOS`, `EDITORES` (já existentes no mesmo arquivo).
- Produces: `atualizarStatusOSAction(osId, novoStatus)` mantém a mesma assinatura, mas agora lança `Error('Sem permissão')` se a transição não for a próxima da sequência ou o papel não for o responsável. `registrarPagamentoOSAction` mantém a mesma assinatura, sem mudança de tipo de retorno.

- [ ] **Step 1: Reescrever `atualizarStatusOSAction`**

Em `src/app/(dashboard)/ordens-servico/actions.ts`, localize a função atual (por volta da linha 75-85):

```ts
export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  await verificarAcessoOS(osId, EDITORES)
  await db.update(ordensServico)
    .set({
      status: novoStatus as any,
      ...(novoStatus === 'concluida' ? { dataConclusao: new Date() } : {}),
    })
    .where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}
```

Substitua por:

```ts
const SEQUENCIA_STATUS = ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida'] as const

const RESPONSAVEL_TRANSICAO: Record<string, readonly string[]> = {
  oficina:            ['mecanico'],
  em_andamento:       ['mecanico'],
  finalizada:         ['mecanico'],
  pendente_pagamento: GESTORES,
}

export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  const usuario = await getUsuarioLogado()

  const [os] = await db
    .select({ status: ordensServico.status, lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

  const isAdmin = (ADMINS as readonly string[]).includes(usuario.papel)
  if (!isAdmin && os.lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  const idxAtual = SEQUENCIA_STATUS.indexOf(os.status as typeof SEQUENCIA_STATUS[number])
  const proximoEsperado = SEQUENCIA_STATUS[idxAtual + 1]
  if (novoStatus !== proximoEsperado) {
    throw new Error('Transição de status inválida')
  }

  const responsaveis = RESPONSAVEL_TRANSICAO[novoStatus]
  if (!responsaveis || !responsaveis.includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  await db.update(ordensServico)
    .set({ status: novoStatus as any })
    .where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}
```

(`concluida` propositalmente não está em `RESPONSAVEL_TRANSICAO` — como não tem responsável cadastrado, `novoStatus !== proximoEsperado` já barra qualquer tentativa de chamar essa action com `'concluida'` antes de `SEQUENCIA_STATUS` chegar lá, e mesmo chegando, a ausência de entrada em `RESPONSAVEL_TRANSICAO` faz cair no `if (!responsaveis...)` e barrar. `concluida` só é atingida via `registrarPagamentoOSAction`, no próximo passo.)

- [ ] **Step 2: `registrarPagamentoOSAction` fecha a OS**

Localize a função atual (por volta da linha 112-122):

```ts
export async function registrarPagamentoOSAction(osId: string, dados: {
  valorTotal: number
  formaPagamento: string
}) {
  await verificarAcessoOS(osId, GESTORES)
  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
  }).where(eq(ordensServico.id, osId))
  revalidatePath(`/ordens-servico/${osId}`)
}
```

Substitua por:

```ts
export async function registrarPagamentoOSAction(osId: string, dados: {
  valorTotal: number
  formaPagamento: string
}) {
  await verificarAcessoOS(osId, GESTORES)

  const [osAtual] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
    ...(osAtual?.status === 'pendente_pagamento'
      ? { status: 'concluida' as any, dataConclusao: new Date() }
      : {}),
  }).where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/actions.ts
git commit -m "feat: validar transição de status da OS por papel; pagamento fecha a OS automaticamente"
```

---

### Task 3: `os-status-bar.tsx` — 6 etapas com texto passivo por papel

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/components/os-status-bar.tsx`

**Interfaces:**
- Consumes: `atualizarStatusOSAction` (Task 2, mesma assinatura).
- Produces: `OSStatusBar({ osId, status, podeEditar, papel })` — ganha a prop nova `papel: string`. Task 6 (`[id]/page.tsx`) passa essa prop.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```tsx
'use client'
import { useTransition } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { atualizarStatusOSAction } from '../../actions'
import { toast } from 'sonner'

const STEPS = [
  { key: 'aberta',              label: 'Aberta' },
  { key: 'oficina',              label: 'Oficina' },
  { key: 'em_andamento',        label: 'Em Andamento' },
  { key: 'finalizada',          label: 'Finalizada' },
  { key: 'pendente_pagamento',  label: 'Pendente de Pagamento' },
  { key: 'concluida',           label: 'Concluída' },
]

const RESPONSAVEL_TRANSICAO: Record<string, readonly string[]> = {
  oficina:            ['mecanico'],
  em_andamento:       ['mecanico'],
  finalizada:         ['mecanico'],
  pendente_pagamento: ['admin_geral', 'admin_socio', 'aux_adm'],
}

const RESPONSAVEL_LABEL: Record<string, string> = {
  mecanico: 'mecânico',
  admin_geral: 'admin', admin_socio: 'admin', aux_adm: 'admin',
}

type Props = { osId: string; status: string; podeEditar: boolean; papel: string }

export function OSStatusBar({ osId, status, podeEditar, papel }: Props) {
  const [pending, start] = useTransition()
  const currentIdx = STEPS.findIndex(s => s.key === status)
  const next = STEPS[currentIdx + 1]

  const responsaveis = next ? RESPONSAVEL_TRANSICAO[next.key] : undefined
  const ehUltimaAutomatica = next?.key === 'concluida'
  const podeAvancar = podeEditar && !!next && !ehUltimaAutomatica && !!responsaveis?.includes(papel)

  function avancar() {
    if (!next) return
    start(async () => {
      try {
        await atualizarStatusOSAction(osId, next.key)
        toast.success(`Status atualizado: ${next.label}`)
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx
        const current = idx === currentIdx
        const isLast  = idx === STEPS.length - 1

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-[110px]">
            <div className={`flex flex-col items-center flex-1 py-3 px-2 rounded-lg border transition-colors ${
              current ? 'bg-blue-50 border-blue-300' :
              done    ? 'bg-green-50 border-green-200' :
                        'bg-slate-50 border-slate-100'
            }`}>
              {done
                ? <CheckCircle2 size={18} className="text-green-500" />
                : current && pending
                  ? <Loader2 size={18} className="text-blue-500 animate-spin" />
                  : <Circle size={18} className={current ? 'text-blue-500' : 'text-slate-300'} />
              }
              <span className={`text-xs font-medium mt-1 text-center ${
                current ? 'text-blue-700' : done ? 'text-green-700' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
            {!isLast && <div className={`h-px w-3 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />}
          </div>
        )
      })}

      {next && !ehUltimaAutomatica && (
        podeAvancar ? (
          <button
            onClick={avancar}
            disabled={pending}
            className="ml-4 px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {pending ? 'Salvando…' : `→ ${next.label}`}
          </button>
        ) : (
          <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
            Aguardando {RESPONSAVEL_LABEL[responsaveis?.[0] ?? ''] ?? 'responsável'}
          </span>
        )
      )}

      {ehUltimaAutomatica && (
        <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
          Aguardando pagamento
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros — mas o componente vai quebrar em tempo de execução até a Task 6 passar a prop `papel`, que ainda não existe na chamada atual. Isso é esperado nesta etapa (type-check não pega prop faltando se o chamador ainda não foi atualizado neste commit — TypeScript vai sim acusar erro no `[id]/page.tsx` porque a prop `papel` passou a ser obrigatória. Se isso acontecer, é esperado: anote no relatório e não corrija `[id]/page.tsx` aqui, é a Task 6).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/components/os-status-bar.tsx"
git commit -m "feat: barra de status da OS com 6 etapas e permissão por papel"
```

---

### Task 4: `os-card.tsx` e `os-filtros.tsx` — reconhecer os 3 status novos

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/components/os-card.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/components/os-filtros.tsx`

**Interfaces:** nenhuma nova — só completa mapas de cor/label já existentes.

- [ ] **Step 1: `os-card.tsx` — cores e labels dos 6 status**

Troque:

```ts
const statusColor: Record<string, string> = {
  aberta:       'bg-amber-100 text-amber-700 border-amber-200',
  em_andamento: 'bg-blue-100 text-blue-700 border-blue-200',
  concluida:    'bg-green-100 text-green-700 border-green-200',
}
const statusLabel: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em Andamento', concluida: 'Concluída',
}
```

Por:

```ts
const statusColor: Record<string, string> = {
  aberta:              'bg-amber-100 text-amber-700 border-amber-200',
  oficina:             'bg-sky-100 text-sky-700 border-sky-200',
  em_andamento:        'bg-blue-100 text-blue-700 border-blue-200',
  finalizada:          'bg-indigo-100 text-indigo-700 border-indigo-200',
  pendente_pagamento:  'bg-orange-100 text-orange-700 border-orange-200',
  concluida:           'bg-green-100 text-green-700 border-green-200',
}
const statusLabel: Record<string, string> = {
  aberta: 'Aberta', oficina: 'Oficina', em_andamento: 'Em Andamento',
  finalizada: 'Finalizada', pendente_pagamento: 'Pendente de Pagamento', concluida: 'Concluída',
}
```

- [ ] **Step 2: `os-filtros.tsx` — chips de status**

Troque:

```ts
const STATUS_OPTS = [
  { value: 'aberta',       label: 'Aberta' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida',    label: 'Concluída' },
]
```

Por:

```ts
const STATUS_OPTS = [
  { value: 'aberta',              label: 'Aberta' },
  { value: 'oficina',             label: 'Oficina' },
  { value: 'em_andamento',        label: 'Em Andamento' },
  { value: 'finalizada',          label: 'Finalizada' },
  { value: 'pendente_pagamento',  label: 'Pendente de Pagamento' },
  { value: 'concluida',           label: 'Concluída' },
]
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/components/os-card.tsx src/app/\(dashboard\)/ordens-servico/components/os-filtros.tsx
git commit -m "feat: cores, labels e filtro reconhecem os 6 status da OS"
```

---

### Task 5: Listagem (`page.tsx`) — agrupar pelos 6 status

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/page.tsx`

**Interfaces:** nenhuma nova — só estende agrupamento/stat cards já existentes. Sem essa tarefa, qualquer OS em `oficina`, `finalizada` ou `pendente_pagamento` some da listagem (hoje só agrupa `aberta`/`em_andamento`/`concluida`).

- [ ] **Step 1: Substituir os agrupamentos e a UI de stats/seções**

Troque o bloco (atualmente linhas 40-42):

```ts
  const abertas      = lista.filter(o => o.status === 'aberta')
  const emAndamento  = lista.filter(o => o.status === 'em_andamento')
  const concluidas   = lista.filter(o => o.status === 'concluida')
```

Por:

```ts
  const abertas             = lista.filter(o => o.status === 'aberta')
  const oficina              = lista.filter(o => o.status === 'oficina')
  const emAndamento         = lista.filter(o => o.status === 'em_andamento')
  const finalizadas         = lista.filter(o => o.status === 'finalizada')
  const pendentePagamento   = lista.filter(o => o.status === 'pendente_pagamento')
  const concluidas          = lista.filter(o => o.status === 'concluida')
```

Troque o bloco de Stats (atualmente linhas 54-68):

```tsx
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Abertas</p>
          <p className="text-3xl font-bold text-amber-700 mt-0.5">{abertas.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Em Andamento</p>
          <p className="text-3xl font-bold text-blue-700 mt-0.5">{emAndamento.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Concluídas</p>
          <p className="text-3xl font-bold text-green-700 mt-0.5">{concluidas.length}</p>
        </div>
      </div>
```

Por:

```tsx
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Abertas</p>
          <p className="text-3xl font-bold text-amber-700 mt-0.5">{abertas.length}</p>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">Oficina</p>
          <p className="text-3xl font-bold text-sky-700 mt-0.5">{oficina.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Em Andamento</p>
          <p className="text-3xl font-bold text-blue-700 mt-0.5">{emAndamento.length}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Finalizadas</p>
          <p className="text-3xl font-bold text-indigo-700 mt-0.5">{finalizadas.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Pend. Pagamento</p>
          <p className="text-3xl font-bold text-orange-700 mt-0.5">{pendentePagamento.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Concluídas</p>
          <p className="text-3xl font-bold text-green-700 mt-0.5">{concluidas.length}</p>
        </div>
      </div>
```

Troque as seções de listagem (atualmente linhas 76-104, os três blocos `{abertas.length > 0 && (...)}`, `{emAndamento.length > 0 && (...)}`, `{concluidas.length > 0 && (...)}`):

```tsx
      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Abertas ({abertas.length})
          </h2>
          {abertas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Em Andamento ({emAndamento.length})
          </h2>
          {emAndamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {concluidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Concluídas ({concluidas.length})
          </h2>
          {concluidas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}
```

Por (mesmo padrão, 6 seções):

```tsx
      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Abertas ({abertas.length})
          </h2>
          {abertas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {oficina.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
            Oficina ({oficina.length})
          </h2>
          {oficina.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Em Andamento ({emAndamento.length})
          </h2>
          {emAndamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {finalizadas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            Finalizadas ({finalizadas.length})
          </h2>
          {finalizadas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {pendentePagamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            Pendente de Pagamento ({pendentePagamento.length})
          </h2>
          {pendentePagamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {concluidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Concluídas ({concluidas.length})
          </h2>
          {concluidas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/page.tsx
git commit -m "feat: listagem de OS agrupa pelos 6 status"
```

---

### Task 6: `[id]/page.tsx` — passar `papel` e condicionar painel de pagamento

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/page.tsx`

**Interfaces:**
- Consumes: `OSStatusBar` com prop `papel` (Task 3).

- [ ] **Step 1: Passar `papel` para `OSStatusBar`**

Troque:

```tsx
      <OSStatusBar osId={id} status={os.status} podeEditar={podeEditar} />
```

Por:

```tsx
      <OSStatusBar osId={id} status={os.status} podeEditar={podeEditar} papel={usuario.papel} />
```

- [ ] **Step 2: Condicionar `OSPagamentoPanel` por status**

Troque:

```tsx
      {podeFechar && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          formaPagamento={os.formaPagamento ?? ''}
        />
      )}
```

Por:

```tsx
      {podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status) && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          formaPagamento={os.formaPagamento ?? ''}
        />
      )}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros — este é o commit que resolve o erro de prop faltando deixado pela Task 3.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/page.tsx"
git commit -m "feat: passar papel para a barra de status; painel de pagamento só a partir de pendente_pagamento"
```

---

### Task 7: Migração no banco + verificação

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 2: Confirmar com o usuário antes de migrar**

Pare aqui e pergunte ao usuário: "Vou aplicar `0017_status_os_expandido.sql` (adiciona `oficina`, `finalizada`, `pendente_pagamento` ao enum `os_status`) no banco real via Supabase MCP `apply_migration`. Confirma?" — só prossiga com o Step 3 após confirmação explícita.

- [ ] **Step 3: Aplicar a migração**

Use `mcp__plugin_supabase_supabase__apply_migration` com `project_id: "bzlaradpofaecqzawyym"`, `name: "status_os_expandido"`, e `query` com o conteúdo exato de `src/lib/db/migrations/0017_status_os_expandido.sql`.

Expected: retorno de sucesso. Confirme com uma query em `pg_enum`/`pg_type` que `os_status` agora tem os 6 valores, na ordem certa:

```sql
select enumlabel from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'os_status'
order by e.enumsortorder;
```

- [ ] **Step 4: Verificação manual**

No navegador, na listagem `/ordens-servico`: confirmar que aparecem 6 stat cards e que a barra de status de uma OS aberta mostra 6 etapas. Sem credenciais de mecânico/admin separadas para testar a permissão de cada transição interativamente — quando possível, testar: logado como admin, confirmar que o botão de avançar NÃO aparece em "Aberta → Oficina" (deveria mostrar "Aguardando mecânico"); logado como mecânico, confirmar que o botão aparece nessa transição mas não aparece em "Finalizada → Pendente de Pagamento".

---

## Fora de escopo deste plano

- Integração real com o módulo de Conciliação (cartão/PIX) — segunda parte, spec separado. Nesta parte, "Concluída" é disparada pelo registro manual de pagamento que já existe.
- Checklist de avarias com foto — ainda pendente, spec separado.
