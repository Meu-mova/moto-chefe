# Folha de Pagamento — Salários, Comissões, Premiação e Ajuda de Custo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novo módulo `/folha-pagamento` (admin-only) onde cada funcionário tem salário fixo, uma taxa de comissão fixa (aplicada à venda de motos pra vendedor, à OS pra mecânico, à venda de peças pra aux_adm), uma premiação mensal por faixa de OTE (só vendedor) e uma ajuda de custo fixa opcional — com uma tela de cálculo mensal consolidado.

**Architecture:** Investigação confirmou que este conceito não existe em lugar nenhum do sistema hoje (nenhuma coluna de salário/comissão em `usuarios`, nenhuma tabela de configuração, nenhum cálculo real — só uma estimativa fixa de 0,5% no Dashboard, não persistida). Duas tabelas novas: `funcionarios_config` (1 linha por usuário — salário, % comissão, ajuda de custo, ativo) e `premiacao_faixas` (várias linhas por grupo — tabela OTE de faixas de venda × valor de prêmio). Sem versionamento histórico de taxa (o usuário descreveu os valores como fixos — se mudar, o admin edita direto, mesmo padrão já usado em `configuracaoTaxas`). O módulo fica isolado num novo item de menu, sem tocar `/admin/usuarios` nem `/precificacao` — três abas: "Funcionários" (config por pessoa), "Premiação (OTE)" (faixas do grupo) e "Folha do Mês" (cálculo consolidado, filtrado por mês, mesma convenção de `/financeiro` e `/despesas`).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Migração de schema: SQL manual via script Node temporário (`node --env-file=.env.local script.mjs`) + mirror manual em `src/lib/db/schema.ts` — nunca `db:generate`/`db:migrate`.
- Só `admin_geral`/`admin_socio` acessam qualquer parte deste módulo — mesmo padrão de `/financeiro`, `/despesas`, `/precificacao` (dados financeiros sensíveis).
- Comissão só se aplica a `vendedor` (motos), `mecanico` (OS concluída) e `aux_adm` (peças) — outros papéis (`admin_geral`, `admin_socio`) podem ter salário/ajuda de custo configurados, mas nunca comissão/premiação calculada.
- Premiação (OTE) só se aplica a `vendedor`.
- Sem versionamento histórico de taxa — um valor "atual" por funcionário, editado in-place quando muda (mesmo padrão de `configuracaoTaxas`).
- Não criar nenhuma integração com Despesas/PIX — este módulo é só configuração + cálculo/relatório, não lança nada automaticamente em nenhum outro módulo.
- Escopo de "funcionário" = `usuarios` cujo `lojaId` está nas lojas do grupo ativo (`listarLojaIdsDoGrupoAtivo`) — isso naturalmente exclui `admin_geral` (sempre `lojaId` nulo) do módulo, o que é o comportamento esperado (donos não são "funcionários" de folha).

---

### Task 1: Schema — `funcionarios_config` + `premiacao_faixas`

**Files:**
- Create (temporário, apagar ao final): `D:\Claude\Teste\_migration_folha_pagamento.mjs`
- Modify: `D:\Claude\Teste\src\lib\db\schema.ts`

**Interfaces:**
- Produces: tabelas Drizzle `funcionariosConfig` (`usuarioId` uuid PK, `salario`, `comissaoPercentual`, `ajudaCusto`, `ativo`, `atualizadoEm`) e `premiacaoFaixas` (`id` uuid PK, `grupoId`, `valorMinimoVendas`, `premiacao`, `criadoEm`) — usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever e rodar a migration SQL**

Criar `D:\Claude\Teste\_migration_folha_pagamento.mjs`:

```js
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

await sql`
  CREATE TABLE IF NOT EXISTS funcionarios_config (
    usuario_id uuid primary key references usuarios(id),
    salario numeric(10,2) not null default 0,
    comissao_percentual numeric(5,2) not null default 0,
    ajuda_custo numeric(10,2),
    ativo boolean not null default true,
    atualizado_em timestamptz not null default now()
  )
`

await sql`
  CREATE TABLE IF NOT EXISTS premiacao_faixas (
    id uuid primary key default gen_random_uuid(),
    grupo_id uuid not null references grupos(id),
    valor_minimo_vendas numeric(12,2) not null,
    premiacao numeric(10,2) not null,
    criado_em timestamptz not null default now()
  )
`

console.log('OK: tabelas criadas')

const check1 = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'funcionarios_config' ORDER BY ordinal_position`
const check2 = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'premiacao_faixas' ORDER BY ordinal_position`
console.log(check1)
console.log(check2)

await sql.end()
```

Rodar:
```bash
cd "D:/Claude/Teste" && node --env-file=.env.local _migration_folha_pagamento.mjs
```

Expected: imprime "OK: tabelas criadas" e as colunas de ambas as tabelas (5 colunas em `funcionarios_config`, 5 em `premiacao_faixas`).

- [ ] **Step 2: Apagar o script**

```bash
rm "D:/Claude/Teste/_migration_folha_pagamento.mjs"
```

- [ ] **Step 3: Mirror no schema.ts**

Em `src/lib/db/schema.ts`, ao final do arquivo (ou logo após a tabela `usuarios`), adicionar:

```ts
// ─── funcionarios_config (folha de pagamento) ─────────────────────────────────
// Uma linha por usuário. Sem versionamento histórico — o valor é sempre o
// "atual"; se mudar, o admin edita in-place (mesmo padrão de configuracaoTaxas).
export const funcionariosConfig = pgTable('funcionarios_config', {
  usuarioId:          uuid('usuario_id').primaryKey().references(() => usuarios.id),
  salario:            numeric('salario', { precision: 10, scale: 2 }).notNull().default('0'),
  comissaoPercentual: numeric('comissao_percentual', { precision: 5, scale: 2 }).notNull().default('0'),
  ajudaCusto:         numeric('ajuda_custo', { precision: 10, scale: 2 }),
  ativo:              boolean('ativo').notNull().default(true),
  atualizadoEm:       timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── premiacao_faixas (tabela OTE — só vendedor) ───────────────────────────────
// Várias linhas por grupo. A premiação aplicável a um vendedor num mês é o
// premiacao da faixa de maior valorMinimoVendas que ele atingiu ou ultrapassou.
export const premiacaoFaixas = pgTable('premiacao_faixas', {
  id:                uuid('id').primaryKey().defaultRandom(),
  grupoId:           uuid('grupo_id').notNull().references(() => grupos.id),
  valorMinimoVendas: numeric('valor_minimo_vendas', { precision: 12, scale: 2 }).notNull(),
  premiacao:         numeric('premiacao', { precision: 10, scale: 2 }).notNull(),
  criadoEm:          timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Confirme que `boolean` já está importado de `drizzle-orm/pg-core` no topo do arquivo (já usado em outras tabelas) antes de assumir que precisa adicionar ao import.

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat: adiciona tabelas funcionarios_config e premiacao_faixas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `folha-pagamento/actions.ts` — mutações

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\folha-pagamento\actions.ts`

**Interfaces:**
- Consumes: `funcionariosConfig`, `premiacaoFaixas` (Task 1).
- Produces: `salvarConfigFuncionarioAction`, `criarFaixaPremiacaoAction`, `editarFaixaPremiacaoAction`, `excluirFaixaPremiacaoAction` — usadas pelas Tasks 4/5.

- [ ] **Step 1: Criar o arquivo**

```ts
'use server'
import { db } from '@/lib/db'
import { funcionariosConfig, premiacaoFaixas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  return getGrupoAtivo(u)
}

export async function salvarConfigFuncionarioAction(usuarioId: string, dados: {
  salario: number
  comissaoPercentual: number
  ajudaCusto: number | null
  ativo: boolean
}) {
  await checarAdmin()
  if (dados.salario < 0 || dados.comissaoPercentual < 0 || (dados.ajudaCusto ?? 0) < 0) {
    throw new Error('Valores não podem ser negativos')
  }
  await db.insert(funcionariosConfig).values({
    usuarioId,
    salario: String(dados.salario),
    comissaoPercentual: String(dados.comissaoPercentual),
    ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
    ativo: dados.ativo,
  }).onConflictDoUpdate({
    target: funcionariosConfig.usuarioId,
    set: {
      salario: String(dados.salario),
      comissaoPercentual: String(dados.comissaoPercentual),
      ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
      ativo: dados.ativo,
      atualizadoEm: new Date(),
    },
  })
  revalidatePath('/folha-pagamento')
}

export async function criarFaixaPremiacaoAction(valorMinimoVendas: number, premiacao: number) {
  const grupo = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.insert(premiacaoFaixas).values({
    grupoId: grupo.id,
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  })
  revalidatePath('/folha-pagamento')
}

export async function editarFaixaPremiacaoAction(id: string, valorMinimoVendas: number, premiacao: number) {
  const grupo = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.update(premiacaoFaixas).set({
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  }).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}

export async function excluirFaixaPremiacaoAction(id: string) {
  const grupo = await checarAdmin()
  await db.delete(premiacaoFaixas).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento/actions.ts"
git commit -m "$(cat <<'EOF'
feat: actions de configuracao de folha de pagamento (funcionarios e premiacao)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Aba "Funcionários" — configuração por pessoa

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\folha-pagamento\components\funcionarios-config-table.tsx`

**Interfaces:**
- Consumes: `salvarConfigFuncionarioAction` (Task 2).
- Produces: `<FuncionariosConfigTable funcionarios={...} />` — usado pela Task 6.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { salvarConfigFuncionarioAction } from '../actions'

export type FuncionarioRow = {
  usuarioId: string
  nome: string
  papel: string
  lojaNome: string
  salario: string
  comissaoPercentual: string
  ajudaCusto: string | null
  ativo: boolean
}

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
}

const PAPEL_COM_COMISSAO = new Set(['vendedor', 'mecanico', 'aux_adm'])

function LinhaFuncionario({ f }: { f: FuncionarioRow }) {
  const [salario, setSalario] = useState(f.salario)
  const [comissao, setComissao] = useState(f.comissaoPercentual)
  const [ajudaCusto, setAjudaCusto] = useState(f.ajudaCusto ?? '')
  const [ativo, setAtivo] = useState(f.ativo)
  const [pending, startTransition] = useTransition()

  function parseNum(v: string): number {
    const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? 0 : n
  }

  function salvar() {
    startTransition(async () => {
      try {
        await salvarConfigFuncionarioAction(f.usuarioId, {
          salario: parseNum(salario),
          comissaoPercentual: parseNum(comissao),
          ajudaCusto: ajudaCusto.trim() ? parseNum(ajudaCusto) : null,
          ativo,
        })
        toast.success(`Configuração de ${f.nome} salva`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  const temComissao = PAPEL_COM_COMISSAO.has(f.papel)

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2">
        <p className="font-medium">{f.nome}</p>
        <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
      </td>
      <td className="px-4 py-2">
        <Input value={salario} onChange={e => setSalario(e.target.value)} className="h-8 text-xs w-28" placeholder="0,00" />
      </td>
      <td className="px-4 py-2">
        {temComissao ? (
          <Input value={comissao} onChange={e => setComissao(e.target.value)} className="h-8 text-xs w-20" placeholder="0,00" />
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <Input value={ajudaCusto} onChange={e => setAjudaCusto(e.target.value)} className="h-8 text-xs w-28" placeholder="Opcional" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="rounded border-slate-300" />
      </td>
      <td className="px-4 py-2">
        <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={salvar}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </td>
    </tr>
  )
}

export function FuncionariosConfigTable({ funcionarios }: { funcionarios: FuncionarioRow[] }) {
  if (funcionarios.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Nenhum funcionário encontrado nas lojas do grupo.</p>
  }
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Salário (R$)</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Comissão (%)</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Ajuda de Custo (R$)</th>
            <th className="text-center px-4 py-2 text-xs font-medium text-slate-600">Ativo</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {funcionarios.map(f => <LinhaFuncionario key={f.usuarioId} f={f} />)}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros (o componente ainda não é importado em lugar nenhum — isso é esperado até a Task 6).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento/components/funcionarios-config-table.tsx"
git commit -m "$(cat <<'EOF'
feat: tabela de configuracao de salario/comissao/ajuda de custo por funcionario

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Aba "Premiação (OTE)" — faixas do grupo

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\folha-pagamento\components\premiacao-faixas-table.tsx`

**Interfaces:**
- Consumes: `criarFaixaPremiacaoAction`, `editarFaixaPremiacaoAction`, `excluirFaixaPremiacaoAction` (Task 2).
- Produces: `<PremiacaoFaixasTable faixas={...} />` — usado pela Task 6.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import { criarFaixaPremiacaoAction, excluirFaixaPremiacaoAction } from '../actions'

export type FaixaRow = { id: string; valorMinimoVendas: string; premiacao: string }

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function parseNum(v: string): number {
  const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export function PremiacaoFaixasTable({ faixas }: { faixas: FaixaRow[] }) {
  const [novoMinimo, setNovoMinimo] = useState('')
  const [novoPremio, setNovoPremio] = useState('')
  const [pending, startTransition] = useTransition()
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const ordenadas = [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas))

  function adicionar() {
    if (!novoMinimo.trim() || !novoPremio.trim()) {
      toast.error('Preencha os dois campos')
      return
    }
    startTransition(async () => {
      try {
        await criarFaixaPremiacaoAction(parseNum(novoMinimo), parseNum(novoPremio))
        toast.success('Faixa adicionada')
        setNovoMinimo('')
        setNovoPremio('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao adicionar faixa')
      }
    })
  }

  function excluir(id: string) {
    setExcluindoId(id)
    startTransition(async () => {
      try {
        await excluirFaixaPremiacaoAction(id)
        toast.success('Faixa removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      } finally {
        setExcluindoId(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Premiação mensal do vendedor de acordo com o valor total vendido no mês (motos). Aplica-se a faixa de maior
        valor mínimo que ele atingiu.
      </p>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Venda mínima no mês</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Premiação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {ordenadas.map(f => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">{fmt(f.valorMinimoVendas)}</td>
                <td className="px-4 py-2 font-medium">{fmt(f.premiacao)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => excluir(f.id)}
                    disabled={pending && excluindoId === f.id}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">Nenhuma faixa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-end gap-2 bg-white border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Venda mínima (R$)</label>
          <Input value={novoMinimo} onChange={e => setNovoMinimo(e.target.value)} className="h-8 text-xs w-36" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Premiação (R$)</label>
          <Input value={novoPremio} onChange={e => setNovoPremio(e.target.value)} className="h-8 text-xs w-36" placeholder="0,00" />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={adicionar}>
          Adicionar faixa
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento/components/premiacao-faixas-table.tsx"
git commit -m "$(cat <<'EOF'
feat: tabela de faixas de premiacao OTE por grupo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `mes-selector-folha.tsx` — filtro de mês

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\folha-pagamento\components\mes-selector-folha.tsx`

**Interfaces:**
- Produces: `<MesSelectorFolha mesAtual={string} />` — usado pela Task 6.

- [ ] **Step 1: Criar o componente**

Mesma mecânica de `src/app/(dashboard)/despesas/components/mes-selector.tsx` (já existente nesta base), adaptado pra rota própria (esse componente só é usado em `/folha-pagamento`, então um path fixo aqui é seguro — não é um componente compartilhado entre rotas, diferente do bug histórico do `PixFiltros`):

```tsx
'use client'
import { useRouter } from 'next/navigation'

export function MesSelectorFolha({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  return (
    <input
      type="month"
      value={mesAtual}
      onChange={e => router.push(`/folha-pagamento?mes=${e.target.value}`)}
      className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
    />
  )
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento/components/mes-selector-folha.tsx"
git commit -m "$(cat <<'EOF'
feat: seletor de mes para folha de pagamento

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `page.tsx` — cálculo mensal + montagem das 3 abas + menu

**Files:**
- Create: `D:\Claude\Teste\src\app\(dashboard)\folha-pagamento\page.tsx`
- Modify: `D:\Claude\Teste\src\components\layout\sidebar.tsx`

**Interfaces:**
- Consumes: `funcionariosConfig`, `premiacaoFaixas` (Task 1), `FuncionariosConfigTable` (Task 3), `PremiacaoFaixasTable` (Task 4), `MesSelectorFolha` (Task 5).

- [ ] **Step 1: Criar `page.tsx`**

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas, funcionariosConfig, premiacaoFaixas, vendas, vendasPecas, ordensServico } from '@/lib/db/schema'
import { eq, inArray, and, gte, lte, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FuncionariosConfigTable } from './components/funcionarios-config-table'
import { PremiacaoFaixasTable } from './components/premiacao-faixas-table'
import { MesSelectorFolha } from './components/mes-selector-folha'

const ADMINS = ['admin_geral', 'admin_socio']
const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Premiação aplicável = a faixa de maior valorMinimoVendas que o total atingiu/ultrapassou.
function calcularPremiacao(totalVendido: number, faixas: { valorMinimoVendas: string; premiacao: string }[]): number {
  const ordenadas = [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas))
  let melhor = 0
  for (const f of ordenadas) {
    if (totalVendido >= parseFloat(f.valorMinimoVendas)) melhor = parseFloat(f.premiacao)
  }
  return melhor
}

export default async function FolhaPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioTs = new Date(`${mesParam}-01T00:00:00Z`)
  const fimTs = new Date(`${ano}-${String(mes + 1).padStart(2, '0')}-01T00:00:00Z`)

  const [funcionariosRaw, configsRaw, faixas, vendasPorVendedor, pecasPorVendedor, osPorMecanico] = await Promise.all([
    db
      .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel, lojaNome: lojas.nome })
      .from(usuarios)
      .innerJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .where(inArray(usuarios.lojaId, lojaIdsGrupo)),

    db.select().from(funcionariosConfig),

    db.select().from(premiacaoFaixas).where(eq(premiacaoFaixas.grupoId, grupo.id)),

    db
      .select({
        vendedorId: vendas.vendedorId,
        total: sql<string>`COALESCE(SUM(${vendas.valor}::numeric), 0)`,
      })
      .from(vendas)
      .where(and(
        inArray(vendas.lojaId, lojaIdsGrupo),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .groupBy(vendas.vendedorId),

    db
      .select({
        vendedorId: vendasPecas.vendedorId,
        total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIdsGrupo),
        gte(vendasPecas.dataVenda, inicioTs),
        lte(vendasPecas.dataVenda, fimTs),
      ))
      .groupBy(vendasPecas.vendedorId),

    db
      .select({
        mecanicoId: ordensServico.mecanicoId,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorTotal}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIdsGrupo),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.mecanicoId),
  ])

  const configPorUsuario = new Map(configsRaw.map(c => [c.usuarioId, c]))
  const vendasPorId = new Map(vendasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total)]))
  const pecasPorId = new Map(pecasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total)]))
  const osPorId = new Map(osPorMecanico.filter(o => o.mecanicoId).map(o => [o.mecanicoId as string, parseFloat(o.total)]))

  const funcionarios = funcionariosRaw.map(f => {
    const config = configPorUsuario.get(f.id)
    const salario = config ? parseFloat(config.salario) : 0
    const comissaoPercentual = config ? parseFloat(config.comissaoPercentual) : 0
    const ajudaCusto = config?.ajudaCusto ? parseFloat(config.ajudaCusto) : 0
    const ativo = config?.ativo ?? true

    const baseComissao =
      f.papel === 'vendedor' ? (vendasPorId.get(f.id) ?? 0) :
      f.papel === 'mecanico' ? (osPorId.get(f.id) ?? 0) :
      f.papel === 'aux_adm'  ? (pecasPorId.get(f.id) ?? 0) :
      0

    const comissao = baseComissao * (comissaoPercentual / 100)
    const premiacao = f.papel === 'vendedor' ? calcularPremiacao(baseComissao, faixas) : 0
    const totalPagar = salario + comissao + premiacao + ajudaCusto

    return {
      id: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario,
      comissaoPercentual,
      ajudaCusto,
      ativo,
      baseComissao,
      comissao,
      premiacao,
      totalPagar,
    }
  })

  const funcionariosAtivos = funcionarios.filter(f => f.ativo)
  const totalSalarios = funcionariosAtivos.reduce((s, f) => s + f.salario, 0)
  const totalComissoes = funcionariosAtivos.reduce((s, f) => s + f.comissao, 0)
  const totalPremiacoes = funcionariosAtivos.reduce((s, f) => s + f.premiacao, 0)
  const totalAjudaCusto = funcionariosAtivos.reduce((s, f) => s + f.ajudaCusto, 0)
  const totalGeral = totalSalarios + totalComissoes + totalPremiacoes + totalAjudaCusto

  const funcionariosParaConfig = funcionariosRaw.map(f => {
    const config = configPorUsuario.get(f.id)
    return {
      usuarioId: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario: config?.salario ?? '0',
      comissaoPercentual: config?.comissaoPercentual ?? '0',
      ajudaCusto: config?.ajudaCusto ?? null,
      ativo: config?.ativo ?? true,
    }
  })

  const faixasParaUI = faixas.map(f => ({ id: f.id, valorMinimoVendas: f.valorMinimoVendas, premiacao: f.premiacao }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Folha de Pagamento</h1>
        <p className="text-slate-500 text-sm">Salários, comissões, premiação e ajuda de custo</p>
      </div>

      <Tabs defaultValue="mes">
        <TabsList>
          <TabsTrigger value="mes">Folha do Mês</TabsTrigger>
          <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          <TabsTrigger value="premiacao">Premiação (OTE)</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <MesSelectorFolha mesAtual={mesParam} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Salários</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalSalarios)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Comissões</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalComissoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Premiações</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalPremiacoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Ajuda de Custo</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalAjudaCusto)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total Geral</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-emerald-700">{fmt(totalGeral)}</p></CardContent>
            </Card>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Base Comissão</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Salário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Comissão</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Premiação</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Ajuda de Custo</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Total a Pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {funcionariosAtivos.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <p className="font-medium">{f.nome}</p>
                      <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{f.baseComissao > 0 ? fmt(f.baseComissao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{fmt(f.salario)}</td>
                    <td className="px-4 py-2 text-right">{f.comissao > 0 ? fmt(f.comissao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{f.premiacao > 0 ? fmt(f.premiacao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{f.ajudaCusto > 0 ? fmt(f.ajudaCusto) : '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(f.totalPagar)}</td>
                  </tr>
                ))}
                {funcionariosAtivos.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nenhum funcionário ativo configurado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-4">
          <FuncionariosConfigTable funcionarios={funcionariosParaConfig} />
        </TabsContent>

        <TabsContent value="premiacao" className="mt-4">
          <PremiacaoFaixasTable faixas={faixasParaUI} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar item no menu**

Ler `src/components/layout/sidebar.tsx` primeiro pra confirmar o formato exato de `baseNavItems` e o padrão de gate por papel usado no item `/admin` (ou similar já restrito a `ADMINS`). Adicionar um novo item logo próximo a `/financeiro` ou `/despesas` (mesmo grupo de módulos financeiros sensíveis), usando o mesmo padrão de gate (`isAdmin` ou `['admin_geral','admin_socio'].includes(papel)`, conforme o que já existe no arquivo) e um ícone de `lucide-react` ainda não usado no arquivo (ex.: `Wallet` ou `HandCoins` — confira quais já estão importados antes de escolher, pra não duplicar/colidir).

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 4: Build**

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, rota `/folha-pagamento` listada normalmente.

- [ ] **Step 5: Checagem manual no navegador**

Logar como admin, confirmar que o item de menu aparece e leva pra `/folha-pagamento`. Na aba "Funcionários", configurar salário/comissão/ajuda de custo de um vendedor e um mecânico, salvar. Na aba "Premiação (OTE)", cadastrar 2-3 faixas (ex: R$0 → R$0, R$20.000 → R$500, R$50.000 → R$1.500). Na aba "Folha do Mês", confirmar que o vendedor configurado aparece com a base de comissão batendo com o total de motos vendidas por ele no mês corrente (comparar com Financeiro), a comissão calculada corretamente (base × %), e a premiação batendo com a faixa correta pro valor vendido. Confirmar que o mecânico aparece com base de comissão vindo de OS concluída no mês. Trocar o mês no seletor e confirmar que os valores mudam.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento/page.tsx" "src/components/layout/sidebar.tsx"
git commit -m "$(cat <<'EOF'
feat: pagina de folha de pagamento com calculo mensal e menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"` e repetir a checagem manual da Task 6/Step 5 direto em produção.
