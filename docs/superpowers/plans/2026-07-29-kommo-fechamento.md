# Kommo — leads em negociação sem tarefa agendada · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alertar vendedor e gestor sobre leads que estão nas etapas finais do funil do Kommo ("tem interesse" / "em negociação") sem nenhuma tarefa em aberto.

**Architecture:** Dois novos syncs contra a API v4 do Kommo (catálogo de etapas dos funis e tarefas abertas), gravados em duas tabelas novas; uma query de "foto do agora" que cruza leads em etapa de fechamento com tarefas abertas; e dois pontos de UI — card em destaque no dashboard do vendedor e bloco gerencial na página Atendimento.

**Tech Stack:** Next.js 16 (App Router, Server Components), Drizzle ORM + postgres.js (Supabase), Tailwind, lucide-react, `node:test` + `tsx` para testes de função pura.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-kommo-fechamento-design.md`.
- **Migrações:** SQL manual em `src/lib/db/migrations/` + aplicação via **Supabase MCP** (`apply_migration`). **NUNCA** rodar `npm run db:generate` / `npm run db:migrate` neste repo — o journal do drizzle-kit está quebrado.
- **Drizzle + postgres.js (`prepare:false`)**: nunca interpolar `Date` dentro de `` sql`` `` — usar string ISO (`.toISOString()`). O `tsc` não pega isso; quebra só em runtime.
- **Tarefa de fechamento = qualquer tarefa em aberto** (`is_completed = 0`), de qualquer tipo. Tarefa com prazo vencido **conta como coberta**.
- **Etapa de fechamento** = nome normalizado (minúsculo, sem acento) que contenha `interesse` **ou** `negocia`.
- A métrica **ignora filtro de período** — é foto do estado atual.
- Textos de UI em **pt-BR**.
- Isolamento multi-grupo: toda query filtra por `usuarios.loja_id IN (lojaIds do grupo ativo)`, igual `slaAtendimento`.
- Novos syncs **não podem derrubar** o sync existente se falharem.
- Commits em pt-BR, prefixo `feat(kommo):` / `test(kommo):`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/kommo-etapas.ts` (novo) | Função pura `etapaDeFechamento(nome)` — sem import de DB, para ser testável isoladamente |
| `src/lib/kommo-etapas.test.ts` (novo) | Teste da função pura (`node:test`) |
| `src/lib/db/migrations/0035_kommo_fechamento.sql` (novo) | DDL: coluna `nome` em `kommo_leads`, tabelas `kommo_stages` e `kommo_tarefas_abertas` |
| `src/lib/db/schema.ts` (modificar) | Espelho Drizzle das tabelas novas |
| `src/lib/kommo.ts` (modificar) | `sincronizarEtapasKommo()`, `sincronizarTarefasAbertas()`, nome do lead no upsert, engate no `sincronizarSeNecessario()` |
| `src/lib/queries/atendimento.ts` (modificar) | `fechamentoSemTarefa()`, `funisSemEtapaDetectada()` |
| `src/app/(dashboard)/dashboard/components/alerta-fechamento.tsx` (novo) | Card em destaque do vendedor |
| `src/app/(dashboard)/dashboard/page.tsx` (modificar) | `FechamentoSection` dentro do bloco `isVendedor` |
| `src/app/(dashboard)/atendimento/page.tsx` (modificar) | KPI de cobertura + bloco por colaborador + aviso de funil |
| `package.json` (modificar) | Registrar o novo arquivo de teste no script `test` |

---

### Task 1: Detecção da etapa de fechamento (função pura + teste)

**Files:**
- Create: `src/lib/kommo-etapas.ts`
- Test: `src/lib/kommo-etapas.test.ts`
- Modify: `package.json:13` (script `test`)

**Interfaces:**
- Consumes: `normalizar(s: string): string` de `src/lib/telegram/texto.ts` (já existe — minúsculas, sem acento, espaços colapsados).
- Produces: `etapaDeFechamento(nome: string | null | undefined): boolean` — usada na Task 3 (sync) para marcar `kommo_stages.etapa_fechamento`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/kommo-etapas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etapaDeFechamento } from './kommo-etapas'

test('reconhece as etapas finais do funil', () => {
  assert.equal(etapaDeFechamento('Tem interesse'), true)
  assert.equal(etapaDeFechamento('Em negociação'), true)
  assert.equal(etapaDeFechamento('EM NEGOCIACAO'), true)
  assert.equal(etapaDeFechamento('  Em   Negociação  '), true)
  assert.equal(etapaDeFechamento('Negociação final'), true)
})

test('ignora as etapas iniciais e as de fecho do Kommo', () => {
  assert.equal(etapaDeFechamento('Contato inicial'), false)
  assert.equal(etapaDeFechamento('Pré qualificado'), false)
  assert.equal(etapaDeFechamento('Qualificado'), false)
  assert.equal(etapaDeFechamento('Venda ganha'), false)
  assert.equal(etapaDeFechamento('Venda perdida'), false)
})

test('trata nome ausente', () => {
  assert.equal(etapaDeFechamento(null), false)
  assert.equal(etapaDeFechamento(undefined), false)
  assert.equal(etapaDeFechamento(''), false)
})
```

- [ ] **Step 2: Registrar o teste no script `test`**

Em `package.json`, trocar a linha do script `test` por:

```json
"test": "node --import tsx --test src/lib/telegram/texto.test.ts src/lib/telegram/perguntas-prontas.test.ts src/lib/telegram/api.test.ts src/lib/kommo-etapas.test.ts"
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Rodar: `npm test`
Esperado: FALHA — `Cannot find module './kommo-etapas'`.

- [ ] **Step 4: Implementar o mínimo**

Criar `src/lib/kommo-etapas.ts`:

```ts
import { normalizar } from '@/lib/telegram/texto'

// Etapas finais do funil no Kommo: "tem interesse" e "em negociação".
// Casamos pelo nome (normalizado) para que funil novo entre sozinho, sem
// configuração. Se a etapa for renomeada, a página Atendimento avisa que o
// funil ficou sem etapa de fechamento detectada.
export function etapaDeFechamento(nome: string | null | undefined): boolean {
  const n = normalizar(nome ?? '')
  return n.includes('interesse') || n.includes('negocia')
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Rodar: `npm test`
Esperado: PASS (todos os testes, inclusive os do telegram).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kommo-etapas.ts src/lib/kommo-etapas.test.ts package.json
git commit -m "test(kommo): deteccao de etapa de fechamento pelo nome"
```

---

### Task 2: Migração e schema

**Files:**
- Create: `src/lib/db/migrations/0035_kommo_fechamento.sql`
- Modify: `src/lib/db/schema.ts` (bloco Kommo, após `kommoLossReasons` ~linha 623)

**Interfaces:**
- Consumes: nada.
- Produces: tabelas Drizzle `kommoStages` e `kommoTarefasAbertas`, e a coluna `kommoLeads.nome` — usadas nas Tasks 3 e 4.

- [ ] **Step 1: Escrever a migração**

Criar `src/lib/db/migrations/0035_kommo_fechamento.sql`:

```sql
-- Fase 4 do Atendimento (Kommo): leads nas etapas finais sem tarefa agendada.

-- Nome do lead no cache (para listar o lead no card do vendedor).
ALTER TABLE kommo_leads ADD COLUMN IF NOT EXISTS nome text;

-- Catálogo de funis/etapas do Kommo. etapa_fechamento é calculado no sync a
-- partir do nome ("tem interesse" / "em negociação"). Os status 142/143
-- (ganho/perdido) são globais e não entram aqui.
CREATE TABLE IF NOT EXISTS kommo_stages (
  status_id        bigint PRIMARY KEY,
  pipeline_id      text,
  pipeline_nome    text,
  nome             text NOT NULL,
  sort             integer NOT NULL DEFAULT 0,
  etapa_fechamento boolean NOT NULL DEFAULT false
);

-- Tarefas em aberto (is_completed = 0) vinculadas a leads. Substituída a cada
-- sync — assim tarefa concluída/deletada some sozinha.
CREATE TABLE IF NOT EXISTS kommo_tarefas_abertas (
  id            bigint PRIMARY KEY,
  lead_id       bigint NOT NULL,
  kommo_user_id text,
  prazo         timestamptz,
  texto         text
);

CREATE INDEX IF NOT EXISTS kommo_tarefas_abertas_lead_idx ON kommo_tarefas_abertas (lead_id);
```

- [ ] **Step 2: Aplicar a migração no banco**

Aplicar via **Supabase MCP** (`apply_migration`, nome `0035_kommo_fechamento`), colando o SQL acima. Se o MCP pedir login, autenticar antes.
**Não** rodar `npm run db:migrate`.
Esperado: sucesso, sem erro de sintaxe.

- [ ] **Step 3: Espelhar no schema Drizzle**

Em `src/lib/db/schema.ts`, adicionar `nome: text('nome'),` como primeiro campo depois de `leadId` em `kommoLeads`:

```ts
export const kommoLeads = pgTable('kommo_leads', {
  leadId:       bigint('lead_id', { mode: 'number' }).primaryKey(),
  nome:         text('nome'),
  kommoUserId:  text('kommo_user_id'),
  // ... resto inalterado
```

E, logo após o bloco `kommoLossReasons`, adicionar:

```ts
// Catálogo de funis/etapas do Kommo — Fase 4 (etapa_fechamento vem do nome)
export const kommoStages = pgTable('kommo_stages', {
  statusId:        bigint('status_id', { mode: 'number' }).primaryKey(),
  pipelineId:      text('pipeline_id'),
  pipelineNome:    text('pipeline_nome'),
  nome:            text('nome').notNull(),
  sort:            integer('sort').notNull().default(0),
  etapaFechamento: boolean('etapa_fechamento').notNull().default(false),
})

// Tarefas em aberto por lead — Fase 4 (substituída a cada sync)
export const kommoTarefasAbertas = pgTable('kommo_tarefas_abertas', {
  id:          bigint('id', { mode: 'number' }).primaryKey(),
  leadId:      bigint('lead_id', { mode: 'number' }).notNull(),
  kommoUserId: text('kommo_user_id'),
  prazo:       timestamp('prazo', { withTimezone: true }),
  texto:       text('texto'),
})
```

Conferir no topo do arquivo se `boolean` e `integer` já estão importados de `drizzle-orm/pg-core`; se `boolean` não estiver, adicionar ao import.

- [ ] **Step 4: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/0035_kommo_fechamento.sql src/lib/db/schema.ts
git commit -m "feat(kommo): schema de etapas do funil e tarefas abertas"
```

---

### Task 3: Sync das etapas e das tarefas abertas

**Files:**
- Modify: `src/lib/kommo.ts` (imports no topo; `sincronizarLeadsKommo` ~linha 232; novas funções antes de `sincronizarSeNecessario` ~linha 416)

**Interfaces:**
- Consumes: `etapaDeFechamento` (Task 1); `kommoStages`, `kommoTarefasAbertas`, `kommoLeads.nome` (Task 2); `kommoRequest` (já existe no arquivo).
- Produces: `sincronizarEtapasKommo(): Promise<{ etapas: number }>` e `sincronizarTarefasAbertas(): Promise<{ tarefas: number }>`, ambas chamadas dentro de `sincronizarSeNecessario()`.

- [ ] **Step 1: Ajustar os imports**

No topo de `src/lib/kommo.ts`, incluir as tabelas novas e o helper:

```ts
import { kommoConfig, kommoLeads, kommoSyncStatus, kommoUserMap, kommoAtividadeDiaria, kommoLossReasons, kommoStages, kommoTarefasAbertas } from '@/lib/db/schema'
import { etapaDeFechamento } from '@/lib/kommo-etapas'
```

- [ ] **Step 2: Guardar o nome do lead no sync existente**

Em `src/lib/kommo.ts`, no tipo `LeadKommo` (~linha 204), adicionar `name?: string | null` logo após `id: number`.

Em `sincronizarLeadsKommo`, no objeto retornado pelo `leads.map(...)`, adicionar após `leadId: l.id`:

```ts
        nome: l.name ?? null,
```

E no `set:` do `onConflictDoUpdate` (logo após `target: kommoLeads.leadId,`), adicionar:

```ts
        nome:         sql`excluded.nome`,
```

- [ ] **Step 3: Implementar os dois syncs**

Em `src/lib/kommo.ts`, logo antes de `sincronizarSeNecessario` (~linha 416), inserir:

```ts
type PipelineKommo = {
  id: number
  name?: string
  _embedded?: { statuses?: { id: number; name?: string; sort?: number }[] }
}

// Catálogo de funis/etapas. Os status 142 (ganho) e 143 (perdido) são globais e
// se repetem em todo funil — ficam de fora para não colidir na PK.
export async function sincronizarEtapasKommo(): Promise<{ etapas: number }> {
  const data = await kommoRequest('/api/v4/leads/pipelines') as
    { _embedded?: { pipelines?: PipelineKommo[] } } | null
  const rows = (data?._embedded?.pipelines ?? []).flatMap(p =>
    (p._embedded?.statuses ?? [])
      .filter(s => s.id !== KOMMO_STATUS_GANHO && s.id !== KOMMO_STATUS_PERDIDO)
      .map(s => ({
        statusId: s.id,
        pipelineId: String(p.id),
        pipelineNome: p.name ?? null,
        nome: s.name ?? '',
        sort: s.sort ?? 0,
        etapaFechamento: etapaDeFechamento(s.name),
      })),
  )
  if (rows.length === 0) return { etapas: 0 }
  await db.insert(kommoStages).values(rows).onConflictDoUpdate({
    target: kommoStages.statusId,
    set: {
      pipelineId:      sql`excluded.pipeline_id`,
      pipelineNome:    sql`excluded.pipeline_nome`,
      nome:            sql`excluded.nome`,
      sort:            sql`excluded.sort`,
      etapaFechamento: sql`excluded.etapa_fechamento`,
    },
  })
  return { etapas: rows.length }
}

type TarefaKommo = {
  id: number
  entity_id?: number
  entity_type?: string
  responsible_user_id?: number
  complete_till?: number | null
  text?: string | null
}

// Tarefas em aberto de leads. Replace-all: o conjunto é pequeno e assim tarefa
// concluída, reagendada ou deletada some sem precisar de evento.
export async function sincronizarTarefasAbertas(): Promise<{ tarefas: number }> {
  const out: TarefaKommo[] = []
  for (let page = 1; page <= 200; page++) {
    const data = await kommoRequest(
      `/api/v4/tasks?limit=250&page=${page}&filter[is_completed]=0`,
    ) as { _embedded?: { tasks?: TarefaKommo[] }; _links?: { next?: unknown } } | null
    const tasks = data?._embedded?.tasks ?? []
    out.push(...tasks)
    if (!data?._links?.next) break
  }
  const rows = out
    .filter(t => t.entity_type === 'leads' && t.entity_id)
    .map(t => ({
      id: t.id,
      leadId: t.entity_id as number,
      kommoUserId: t.responsible_user_id != null ? String(t.responsible_user_id) : null,
      prazo: toDate(t.complete_till),
      texto: t.text ?? null,
    }))

  await db.delete(kommoTarefasAbertas)
  // Lotes de 500 para não estourar o limite de parâmetros do postgres.js
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(kommoTarefasAbertas).values(rows.slice(i, i + 500))
  }
  return { tarefas: rows.length }
}
```

- [ ] **Step 4: Engatar no sync geral**

Em `sincronizarSeNecessario`, dentro do `try`, depois de `await sincronizarAtividadeKommo()`, adicionar (mesmo padrão tolerante a falha usado em `sincronizarMotivosPerda`):

```ts
    await sincronizarEtapasKommo().catch(() => {})
    await sincronizarTarefasAbertas().catch(() => {})
```

- [ ] **Step 5: Verificar tipos e build**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kommo.ts
git commit -m "feat(kommo): sync de etapas do funil, tarefas abertas e nome do lead"
```

---

### Task 4: Query da métrica

**Files:**
- Modify: `src/lib/queries/atendimento.ts` (adicionar ao final do arquivo)

**Interfaces:**
- Consumes: tabelas da Task 2, preenchidas pela Task 3.
- Produces:
  - `type LeadDescoberto = { leadId: number; nome: string; etapa: string; valor: number; dias: number; colaborador: string }`
  - `type FechamentoColaborador = { usuarioId: string | null; kommoUserId: string; nome: string; naEtapa: number; semTarefa: number; valorParado: number; cobertura: number; leads: LeadDescoberto[] }`
  - `fechamentoSemTarefa(lojaIds: string[], usuarioId?: string): Promise<{ porColaborador: FechamentoColaborador[]; naEtapa: number; semTarefa: number; valorParado: number; cobertura: number; leads: LeadDescoberto[] }>`
  - `funisSemEtapaDetectada(): Promise<string[]>`
  - Consumidas pelas Tasks 5 e 6.

- [ ] **Step 1: Escrever as funções**

Adicionar ao final de `src/lib/queries/atendimento.ts`:

```ts
export type LeadDescoberto = {
  leadId: number
  nome: string
  etapa: string
  valor: number
  dias: number
  colaborador: string
}

export type FechamentoColaborador = {
  usuarioId: string | null
  kommoUserId: string
  nome: string
  naEtapa: number
  semTarefa: number
  valorParado: number
  cobertura: number
  leads: LeadDescoberto[]
}

// Foto do AGORA (ignora período): leads parados nas etapas finais do funil
// ("tem interesse" / "em negociação") sem nenhuma tarefa em aberto. Tarefa
// vencida conta como coberta. Filtra pelo grupo ativo via usuarios.loja_id.
export async function fechamentoSemTarefa(lojaIds: string[], usuarioId?: string) {
  const vazio = { porColaborador: [] as FechamentoColaborador[], naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1, leads: [] as LeadDescoberto[] }
  if (lojaIds.length === 0) return vazio

  const rows = await db.execute(sql`
    SELECT
      l.lead_id                                   as lead_id,
      coalesce(l.nome, '(sem nome)')              as nome,
      s.nome                                      as etapa,
      l.price::float8                             as valor,
      greatest(0, floor(extract(epoch from (now() - coalesce(l.atualizado_em, l.criado_em, now()))) / 86400))::int as dias,
      k.kommo_user_id                             as kommo_user_id,
      k.usuario_id                                as usuario_id,
      coalesce(u.nome, k.nome_kommo, '—')         as colaborador,
      (t.id is not null)                          as tem_tarefa
    FROM kommo_leads l
    JOIN kommo_stages s   ON s.status_id = l.status_id AND s.etapa_fechamento
    JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
    JOIN usuarios u       ON u.id = k.usuario_id
    LEFT JOIN LATERAL (SELECT id FROM kommo_tarefas_abertas ta WHERE ta.lead_id = l.lead_id LIMIT 1) t ON true
    WHERE u.loja_id in ${lojaIds}
      ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
    ORDER BY dias DESC
  `) as unknown as {
    lead_id: number; nome: string; etapa: string; valor: number; dias: number
    kommo_user_id: string; usuario_id: string | null; colaborador: string; tem_tarefa: boolean
  }[]

  const porUser = new Map<string, FechamentoColaborador>()
  for (const r of rows) {
    const c = porUser.get(r.kommo_user_id) ?? {
      usuarioId: r.usuario_id, kommoUserId: r.kommo_user_id, nome: r.colaborador,
      naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1, leads: [],
    }
    c.naEtapa += 1
    if (!r.tem_tarefa) {
      c.semTarefa += 1
      c.valorParado += Number(r.valor) || 0
      c.leads.push({
        leadId: Number(r.lead_id),
        nome: r.nome,
        etapa: r.etapa,
        valor: Number(r.valor) || 0,
        dias: Number(r.dias) || 0,
        colaborador: r.colaborador,
      })
    }
    porUser.set(r.kommo_user_id, c)
  }

  const porColaborador = [...porUser.values()]
    .map(c => ({ ...c, cobertura: c.naEtapa ? (c.naEtapa - c.semTarefa) / c.naEtapa : 1 }))
    .sort((a, b) => b.semTarefa - a.semTarefa)

  const naEtapa = porColaborador.reduce((a, c) => a + c.naEtapa, 0)
  const semTarefa = porColaborador.reduce((a, c) => a + c.semTarefa, 0)
  return {
    porColaborador,
    naEtapa,
    semTarefa,
    valorParado: porColaborador.reduce((a, c) => a + c.valorParado, 0),
    cobertura: naEtapa ? (naEtapa - semTarefa) / naEtapa : 1,
    leads: porColaborador.flatMap(c => c.leads).sort((a, b) => b.dias - a.dias),
  }
}

// Funis em que nenhuma etapa casou com "interesse"/"negocia" — provavelmente
// etapa renomeada no Kommo. Alimenta o aviso na página Atendimento.
export async function funisSemEtapaDetectada(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT coalesce(pipeline_nome, '(sem nome)') as funil
    FROM kommo_stages
    GROUP BY pipeline_id, pipeline_nome
    HAVING bool_or(etapa_fechamento) = false
    ORDER BY 1
  `) as unknown as { funil: string }[]
  return rows.map(r => r.funil)
}
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/atendimento.ts
git commit -m "feat(kommo): query de leads em etapa final sem tarefa aberta"
```

---

### Task 5: Card em destaque no dashboard do vendedor

**Files:**
- Create: `src/app/(dashboard)/dashboard/components/alerta-fechamento.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx` (imports no topo; helper perto de `PlacarSection` ~linha 216; render dentro de `{isVendedor && ...}` ~linha 328)

**Interfaces:**
- Consumes: `fechamentoSemTarefa` e `LeadDescoberto` (Task 4); `getKommoStatus` de `@/lib/kommo` (para o subdomínio do link); `listarLojaIdsDoGrupoAtivo` (já importado na página).
- Produces: componente `AlertaFechamento({ dados, subdominio })`.

- [ ] **Step 1: Criar o componente**

Criar `src/app/(dashboard)/dashboard/components/alerta-fechamento.tsx`:

```tsx
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'

type Lead = { leadId: number; nome: string; etapa: string; valor: number; dias: number }
type Dados = { naEtapa: number; semTarefa: number; valorParado: number; leads: Lead[] }

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function AlertaFechamento({ dados, subdominio }: { dados: Dados; subdominio: string | null }) {
  const link = (id: number) => subdominio ? `https://${subdominio}.kommo.com/leads/detail/${id}` : null

  if (dados.semTarefa === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 size={16} className="shrink-0" />
        <span>Todos os {dados.naEtapa} lead(s) seus em interesse/negociação têm tarefa agendada. Segue o jogo.</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle size={26} className="text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-red-700 leading-tight">
            {dados.semTarefa} lead(s) prestes a fechar SEM tarefa agendada
          </h2>
          <p className="text-sm text-red-800 mt-0.5">
            {fmtBRL(dados.valorParado)} parados em interesse/negociação sem próximo passo marcado.
            Todo lead nessas etapas precisa de uma tarefa de fechamento — agende agora no Kommo.
          </p>

          <ul className="mt-3 divide-y divide-red-200 rounded-lg bg-white border border-red-200">
            {dados.leads.map(l => {
              const href = link(l.leadId)
              return (
                <li key={l.leadId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.nome}</p>
                    <p className="text-xs text-slate-500">
                      {l.etapa} · parado há {l.dias} dia(s){l.valor > 0 ? ` · ${fmtBRL(l.valor)}` : ''}
                    </p>
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                       className="shrink-0 inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-xs font-medium px-2.5 h-8 hover:bg-red-700">
                      Abrir <ExternalLink size={12} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ligar na página do dashboard**

Em `src/app/(dashboard)/dashboard/page.tsx`:

Nos imports do topo, junto do import de `placarVendedor` (~linha 15):

```ts
import { placarVendedor, fechamentoSemTarefa } from '@/lib/queries/atendimento'
import { PlacarVendedor } from './components/placar-vendedor'
import { AlertaFechamento } from './components/alerta-fechamento'
import { getKommoStatus } from '@/lib/kommo'
```

Logo depois da função `PlacarSection` (~linha 224), adicionar:

```tsx
// Leads em interesse/negociação sem tarefa agendada — foto do agora, ignora o
// filtro de período. Só lê o cache, não sincroniza.
async function FechamentoSection({ usuario }: { usuario: { id: string; papel: string; lojaId: string | null } }) {
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  const [dados, status] = await Promise.all([
    fechamentoSemTarefa(lojaIds, usuario.id),
    getKommoStatus(),
  ])
  if (!status.conectado || dados.naEtapa === 0) return null
  return <AlertaFechamento dados={dados} subdominio={status.subdominio} />
}
```

Dentro do bloco `{isVendedor && (...)}` (~linha 328), **antes** do bloco do placar, adicionar:

```tsx
      {isVendedor && (
        <SectionErrorBoundary label="o alerta de fechamento">
          <Suspense fallback={null}>
            <FechamentoSection usuario={usuario} />
          </Suspense>
        </SectionErrorBoundary>
      )}
```

(sem `key={filtroKey}` — a seção não depende do filtro de período)

- [ ] **Step 3: Verificar tipos e build**

Rodar: `npm run type-check && npm run build`
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/components/alerta-fechamento.tsx" "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(kommo): alerta de leads sem tarefa de fechamento no dashboard do vendedor"
```

---

### Task 6: Visão do gestor na página Atendimento

**Files:**
- Modify: `src/app/(dashboard)/atendimento/page.tsx` (imports ~linha 6-9; carga de dados ~linha 49-55; KPIs ~linha 121-126; novo bloco após o alerta de valor não informado ~linha 148)

**Interfaces:**
- Consumes: `fechamentoSemTarefa`, `funisSemEtapaDetectada` (Task 4); `status.subdominio` de `getKommoStatus()` (já carregado na página).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Carregar os dados na página**

Em `src/app/(dashboard)/atendimento/page.tsx`, ajustar o import das queries (~linha 6):

```ts
import { metricasAtendimento, slaAtendimento, motivosDePerda, fechamentoSemTarefa, funisSemEtapaDetectada } from '@/lib/queries/atendimento'
```

E o import de ícones (~linha 9):

```ts
import { Headset, RefreshCw, AlertTriangle, TriangleAlert, CheckCircle2, ExternalLink } from 'lucide-react'
```

Trocar o bloco de carga (~linhas 49-55) por:

```ts
  const [linhas, sla, perdas, fechamento, funisSemEtapa] = status.conectado
    ? await Promise.all([
        metricasAtendimento(inicio, fim, de, ate, lojaIds),
        slaAtendimento(inicio, fim, lojaIds),
        motivosDePerda(inicio, fim, lojaIds),
        fechamentoSemTarefa(lojaIds),
        funisSemEtapaDetectada(),
      ])
    : [[], { sla5: 0, sla15: 0, sla60: 0, slaMais: 0, semResposta: 0, respondidos: 0 }, { motivos: [], total: 0, semMotivo: 0 },
       { porColaborador: [], naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1, leads: [] }, []]
```

Logo abaixo de `const pct = ...` (~linha 68), adicionar:

```ts
  const coberturaPct = Math.round(fechamento.cobertura * 100)
  const linkLead = (id: number) => status.subdominio ? `https://${status.subdominio}.kommo.com/leads/detail/${id}` : null
```

- [ ] **Step 2: Adicionar o KPI de cobertura**

No grid de KPIs (~linha 121), trocar `md:grid-cols-4` por `md:grid-cols-5` e adicionar como quinto card, depois do "Valor ganho":

```tsx
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Cobertura de fechamento</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${fechamento.semTarefa > 0 ? 'text-red-600' : 'text-green-600'}`}>{coberturaPct}%</p>
                <p className="text-xs text-slate-400">{fechamento.semTarefa} de {fechamento.naEtapa} sem tarefa</p>
              </CardContent>
            </Card>
```

- [ ] **Step 3: Adicionar o bloco em destaque**

Logo depois do bloco "Alerta de valor não informado" (~linha 148), inserir:

```tsx
          {/* Aviso de configuração: funil sem etapa de fechamento detectada */}
          {funisSemEtapa.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Funil sem etapa de fechamento detectada: {funisSemEtapa.join(', ')}.</p>
                <p className="text-xs mt-0.5">O sistema reconhece as etapas pelo nome (&quot;tem interesse&quot; / &quot;em negociação&quot;). Renomeie a etapa no Kommo para voltar a medir esse funil.</p>
              </div>
            </div>
          )}

          {/* Leads em interesse/negociação sem tarefa agendada — situação atual */}
          <Card className={fechamento.semTarefa > 0 ? 'border-2 border-red-500' : undefined}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {fechamento.semTarefa > 0
                  ? <><AlertTriangle size={18} className="text-red-600" /> <span className="text-red-700">Leads prestes a fechar sem tarefa agendada</span></>
                  : <><CheckCircle2 size={18} className="text-green-600" /> Leads prestes a fechar sem tarefa agendada</>}
                <span className="text-xs font-normal text-slate-400">· situação atual, não depende do período</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fechamento.naEtapa === 0 ? (
                <p className="text-sm text-slate-400">Nenhum lead nas etapas de interesse/negociação no momento.</p>
              ) : fechamento.semTarefa === 0 ? (
                <p className="text-sm text-green-700">Todos os {fechamento.naEtapa} leads em interesse/negociação têm tarefa agendada.</p>
              ) : (
                <>
                  <p className="text-sm text-red-800">
                    <strong>{fechamento.semTarefa}</strong> de {fechamento.naEtapa} leads nessas etapas estão sem próximo passo marcado
                    — <strong>{fmtBRL(fechamento.valorParado)}</strong> parados.
                  </p>
                  {fechamento.porColaborador.filter(c => c.semTarefa > 0).map(c => (
                    <div key={c.kommoUserId} className="rounded-lg border">
                      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-sm border-b">
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-slate-500 text-xs">
                          {c.semTarefa} de {c.naEtapa} sem tarefa · {Math.round(c.cobertura * 100)}% de cobertura · {fmtBRL(c.valorParado)}
                        </span>
                      </div>
                      <ul className="divide-y">
                        {c.leads.map(l => {
                          const href = linkLead(l.leadId)
                          return (
                            <li key={l.leadId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="truncate">{l.nome}</p>
                                <p className="text-xs text-slate-500">{l.etapa} · parado há {l.dias} dia(s){l.valor > 0 ? ` · ${fmtBRL(l.valor)}` : ''}</p>
                              </div>
                              {href && (
                                <a href={href} target="_blank" rel="noopener noreferrer"
                                   className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 underline">
                                  Abrir <ExternalLink size={12} />
                                </a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 4: Atualizar a legenda do rodapé**

No parágrafo de legenda (~linha 255), adicionar ao final, antes de `</p>`:

```tsx
{' '}<strong>Cobertura de fechamento</strong> = % dos leads que estão hoje nas etapas
&quot;tem interesse&quot; e &quot;em negociação&quot; com pelo menos uma tarefa em aberto no Kommo (de qualquer tipo).
```

- [ ] **Step 5: Verificar tipos e build**

Rodar: `npm run type-check && npm run build`
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/atendimento/page.tsx"
git commit -m "feat(kommo): cobertura de fechamento e leads descobertos na pagina Atendimento"
```

---

### Task 7: Verificação final e deploy

**Files:** nenhum (verificação).

**Interfaces:** nenhuma.

- [ ] **Step 1: Rodar a bateria completa**

Rodar: `npm test && npm run type-check && npm run build`
Esperado: testes PASS, sem erro de tipo, build concluído.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Deploy e verificação em produção**

Deploy na Vercel (padrão do repo: push + deploy ao terminar). Depois, em produção:
1. Abrir `/atendimento` como gestor e clicar em **"Atualizar agora"** (força o sync das etapas e das tarefas).
2. Conferir o KPI "Cobertura de fechamento" e o bloco de leads descobertos.
3. Se aparecer "Funil sem etapa de fechamento detectada", conferir o nome real das etapas no Kommo e reportar ao usuário — pode ser etapa com nome diferente do combinado.
4. Abrir o dashboard como vendedor e conferir o card em destaque.
