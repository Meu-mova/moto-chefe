# Categorias de Despesa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que admins criem/editem/desativem categorias de Despesa pelo painel administrativo, substituindo a lista fixa hoje hardcoded em `despesa-dialog.tsx`.

**Architecture:** Nova tabela `categorias_despesa` (mirror de `categorias_caixa`, sem o campo `tipo`), gerenciada por novas Server Actions e exibida como uma segunda aba na página `/admin/categorias-caixa` (usando o componente `Tabs` já existente em `src/components/ui/tabs.tsx`). O módulo Despesas passa a buscar as categorias ativas do banco em vez do array fixo.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase (Postgres via MCP `apply_migration`), Sonner (toasts), Lucide, `@base-ui/react` Tabs, shadcn/ui (Table, Dialog, Badge, Button).

## Global Constraints

- Apenas `admin_geral` e `admin_socio` podem criar/editar/excluir/ativar categorias (mesma regra de `requireAdmin` já usada em `categorias-caixa/actions.ts`)
- Categorias de despesa são globais (compartilhadas entre todos os grupos/lojas), igual `categorias_caixa` hoje — não têm `grupoId`
- `despesas.categoria` continua sendo texto livre (não vira FK) — mesmo padrão de `lancamentos_caixa.categoria`
- A tabela nasce populada com as 11 categorias atuais, na mesma ordem do array hoje, para não quebrar o fluxo de lançamento
- Diálogos usam `sm:max-w-*` (nunca `max-w-*` sem prefixo) para controlar largura
- `revalidatePath('/admin/categorias-caixa')` e `revalidatePath('/despesas')` após toda mutation de categoria de despesa
- Este projeto **não usa** `drizzle-kit generate`/`migrate` para aplicar migrations (o journal em `src/lib/db/migrations/meta` está desatualizado desde a migration 0003) — migrations são arquivos SQL escritos à mão e aplicados via ferramenta MCP do Supabase (`apply_migration`), seguindo o padrão de `0010_despesas.sql`
- Aplicar uma migration no banco é uma ação em produção (`moto-chefe.vercel.app` ativo) — **pausar e confirmar com o usuário antes de rodar `apply_migration`**

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/db/schema.ts` | Modificar — adicionar tabela `categoriasDespesa` |
| `src/lib/db/migrations/0013_categorias_despesa.sql` | Criar — migration SQL (create + seed) |
| `src/app/(dashboard)/admin/categorias-caixa/actions.ts` | Modificar — adicionar 5 actions de categoria de despesa |
| `src/app/(dashboard)/admin/categorias-caixa/components/categorias-despesa-table.tsx` | Criar — tabela + dialogs de categoria de despesa |
| `src/app/(dashboard)/admin/categorias-caixa/page.tsx` | Modificar — abas Caixa/Despesa |
| `src/app/(dashboard)/admin/page.tsx` | Modificar — atualizar label/descrição do card |
| `src/app/(dashboard)/despesas/page.tsx` | Modificar — buscar categorias ativas do banco |
| `src/app/(dashboard)/despesas/components/despesas-table.tsx` | Modificar — repassar prop `categorias` |
| `src/app/(dashboard)/despesas/components/despesa-dialog.tsx` | Modificar — remover array fixo, usar prop `categorias` |

---

## Task 1: Banco de dados — tabela `categorias_despesa`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0013_categorias_despesa.sql`

**Interfaces:**
- Produces: export `categoriasDespesa` (Drizzle table) usado em Tasks 2 e 4

- [ ] **Step 1: Adicionar tabela ao schema Drizzle**

Em `src/lib/db/schema.ts`, logo após o bloco `categoriasCaixa` (linhas 295-303) e antes do comentário `// ─── despesas ───`, adicionar:

```ts
// ─── categorias_despesa ───────────────────────────────────────────────────────
export const categoriasDespesa = pgTable('categorias_despesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Criar arquivo de migration**

Criar `src/lib/db/migrations/0013_categorias_despesa.sql` com o conteúdo:

```sql
CREATE TABLE "categorias_despesa" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"       text NOT NULL,
  "ativo"      boolean DEFAULT true NOT NULL,
  "ordem"      integer DEFAULT 0 NOT NULL,
  "criado_em"  timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "categorias_despesa" ("nome", "ordem") VALUES
  ('Aluguel', 0),
  ('Energia elétrica', 1),
  ('Água', 2),
  ('Internet', 3),
  ('Combustível', 4),
  ('Compra de veículos', 5),
  ('Marketing', 6),
  ('Salários', 7),
  ('Impostos', 8),
  ('Manutenção', 9),
  ('Outros', 10);
```

- [ ] **Step 3: Confirmar com o usuário antes de aplicar em produção**

Este banco é o de produção (`moto-chefe.vercel.app` ativo). Antes do próximo step, confirmar explicitamente com o usuário que pode aplicar a migration agora.

- [ ] **Step 4: Aplicar migration no banco**

Usar a ferramenta Supabase MCP (`apply_migration`) com o conteúdo do arquivo acima. Nome da migration: `categorias_despesa`.

- [ ] **Step 5: Verificar tabela criada e populada**

Usar `list_tables` no MCP do Supabase e confirmar que `categorias_despesa` aparece na lista. Rodar (via `execute_sql` do MCP, apenas leitura):

```sql
SELECT nome, ordem, ativo FROM categorias_despesa ORDER BY ordem;
```

Esperado: 11 linhas, na ordem Aluguel(0) .. Outros(10), todas com `ativo = true`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0013_categorias_despesa.sql
git commit -m "feat: tabela categorias_despesa no schema e migration"
```

---

## Task 2: Server Actions

**Files:**
- Modify: `src/app/(dashboard)/admin/categorias-caixa/actions.ts`

**Interfaces:**
- Consumes: `categoriasDespesa` (tabela Drizzle de Task 1), `requireAdmin()` já existente no arquivo
- Produces:
  - `listarCategoriasDespesaAction(): Promise<{ id: string; nome: string; tipo?: never; ativo: boolean; ordem: number; criadoEm: Date }[]>` (shape real: `{ id, nome, ativo, ordem, criadoEm }`)
  - `criarCategoriaDespesaAction(dados: { nome: string }): Promise<void>`
  - `editarCategoriaDespesaAction(id: string, dados: { nome: string }): Promise<void>`
  - `excluirCategoriaDespesaAction(id: string): Promise<void>`
  - `toggleAtivoDespesaAction(id: string, ativo: boolean): Promise<void>`

- [ ] **Step 1: Atualizar o import do schema**

Em `src/app/(dashboard)/admin/categorias-caixa/actions.ts`, linha 3, trocar:

```ts
import { categoriasCaixa } from '@/lib/db/schema'
```

por:

```ts
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
```

- [ ] **Step 2: Adicionar as 5 actions de categoria de despesa**

No final do arquivo (após `toggleAtivoAction`), adicionar:

```ts
export async function listarCategoriasDespesaAction() {
  return db
    .select()
    .from(categoriasDespesa)
    .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
}

export async function criarCategoriaDespesaAction(dados: { nome: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')

  await db.insert(categoriasDespesa).values({
    nome: dados.nome.trim(),
  })
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function editarCategoriaDespesaAction(id: string, dados: { nome: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')

  await db
    .update(categoriasDespesa)
    .set({ nome: dados.nome.trim() })
    .where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function excluirCategoriaDespesaAction(id: string) {
  await requireAdmin()
  await db.delete(categoriasDespesa).where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function toggleAtivoDespesaAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db
    .update(categoriasDespesa)
    .set({ ativo })
    .where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}
```

Nota: `eq` e `asc` já estão importados no topo do arquivo (linha 4: `import { eq, asc } from 'drizzle-orm'`) — não precisa adicionar import novo.

- [ ] **Step 3: Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros relacionados a `categorias-caixa/actions.ts`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/categorias-caixa/actions.ts"
git commit -m "feat: server actions de categorias de despesa (criar, editar, excluir, toggle)"
```

---

## Task 3: UI de Admin — aba "Despesa" em Categorias

**Files:**
- Create: `src/app/(dashboard)/admin/categorias-caixa/components/categorias-despesa-table.tsx`
- Modify: `src/app/(dashboard)/admin/categorias-caixa/page.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: actions de Task 2 (`criarCategoriaDespesaAction`, `editarCategoriaDespesaAction`, `excluirCategoriaDespesaAction`, `toggleAtivoDespesaAction`), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` de `@/components/ui/tabs`
- `CategoriasDespesaTable` props: `{ categorias: { id: string; nome: string; ativo: boolean; ordem: number }[] }`

- [ ] **Step 1: Criar categorias-despesa-table.tsx**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  criarCategoriaDespesaAction,
  editarCategoriaDespesaAction,
  excluirCategoriaDespesaAction,
  toggleAtivoDespesaAction,
} from '../actions'

type CategoriaDespesa = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
}

function CategoriaDespesaDialog({
  open,
  onClose,
  inicial,
}: {
  open: boolean
  onClose: () => void
  inicial?: CategoriaDespesa
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [pending, startTransition] = useTransition()

  function handleSalvar() {
    startTransition(async () => {
      try {
        if (inicial) {
          await editarCategoriaDespesaAction(inicial.id, { nome })
          toast.success('Categoria atualizada')
        } else {
          await criarCategoriaDespesaAction({ nome })
          toast.success('Categoria criada')
        }
        onClose()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Aluguel" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={pending || !nome.trim()}>
            {pending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmarExclusaoDespesaDialog({
  categoria,
  onClose,
}: {
  categoria: CategoriaDespesa | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()

  function handleExcluir() {
    if (!categoria) return
    startTransition(async () => {
      try {
        await excluirCategoriaDespesaAction(categoria.id)
        toast.success('Categoria excluída')
        onClose()
      } catch {
        toast.error('Erro ao excluir')
      }
    })
  }

  return (
    <Dialog open={!!categoria} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Excluir categoria?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          A categoria <strong>{categoria?.nome}</strong> será removida permanentemente.
          Despesas já lançadas não serão afetadas.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleExcluir}
            disabled={pending}
          >
            {pending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CategoriasDespesaTable({ categorias }: { categorias: CategoriaDespesa[] }) {
  const [editando, setEditando] = useState<CategoriaDespesa | null>(null)
  const [criando, setCriando] = useState(false)
  const [excluindo, setExcluindo] = useState<CategoriaDespesa | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(cat: CategoriaDespesa) {
    startTransition(async () => {
      try {
        await toggleAtivoDespesaAction(cat.id, !cat.ativo)
        toast.success(cat.ativo ? 'Categoria desativada' : 'Categoria ativada')
      } catch {
        toast.error('Erro ao alterar status')
      }
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCriando(true)} size="sm">
          <Plus size={16} className="mr-1.5" /> Nova Categoria
        </Button>
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.map(cat => (
              <TableRow key={cat.id} className={!cat.ativo ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{cat.nome}</TableCell>
                <TableCell>
                  <button
                    onClick={() => handleToggle(cat)}
                    disabled={pending}
                    className="cursor-pointer"
                  >
                    <Badge variant={cat.ativo ? 'default' : 'secondary'}>
                      {cat.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditando(cat)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setExcluindo(cat)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {criando && (
        <CategoriaDespesaDialog open onClose={() => setCriando(false)} />
      )}
      {editando && (
        <CategoriaDespesaDialog open onClose={() => setEditando(null)} inicial={editando} />
      )}
      <ConfirmarExclusaoDespesaDialog
        categoria={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </>
  )
}
```

- [ ] **Step 2: Atualizar page.tsx com abas**

Substituir todo o conteúdo de `src/app/(dashboard)/admin/categorias-caixa/page.tsx` por:

```tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CategoriasTable } from './components/categorias-table'
import { CategoriasDespesaTable } from './components/categorias-despesa-table'

export default async function CategoriasCaixaPage() {
  const [categorias, categoriasDespesaLista] = await Promise.all([
    db
      .select()
      .from(categoriasCaixa)
      .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome)),
    db
      .select()
      .from(categoriasDespesa)
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome)),
  ])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Categorias</h1>
          <p className="text-slate-500 text-sm">Gerencie as categorias usadas nos lançamentos de caixa e nas despesas</p>
        </div>
        <Tabs defaultValue="caixa">
          <TabsList>
            <TabsTrigger value="caixa">Caixa</TabsTrigger>
            <TabsTrigger value="despesa">Despesa</TabsTrigger>
          </TabsList>
          <TabsContent value="caixa">
            <div className="space-y-4 pt-4">
              <CategoriasTable categorias={categorias} />
            </div>
          </TabsContent>
          <TabsContent value="despesa">
            <div className="space-y-4 pt-4">
              <CategoriasDespesaTable categorias={categoriasDespesaLista} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 3: Atualizar o card no dashboard de admin**

Em `src/app/(dashboard)/admin/page.tsx`, linhas 93-101, trocar:

```tsx
          <Link href="/admin/categorias-caixa">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Tags className="text-slate-600" size={20} />
                <CardTitle className="text-base">Categorias Caixa</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Categorias de entrada e saída</p></CardContent>
            </Card>
          </Link>
```

por:

```tsx
          <Link href="/admin/categorias-caixa">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Tags className="text-slate-600" size={20} />
                <CardTitle className="text-base">Categorias</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Categorias de caixa e de despesa</p></CardContent>
            </Card>
          </Link>
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros nos arquivos modificados/criados desta task.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/categorias-caixa/" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat: aba de categorias de despesa no admin de Categorias"
```

---

## Task 4: Módulo Despesas usando categorias do banco

**Files:**
- Modify: `src/app/(dashboard)/despesas/page.tsx`
- Modify: `src/app/(dashboard)/despesas/components/despesas-table.tsx`
- Modify: `src/app/(dashboard)/despesas/components/despesa-dialog.tsx`

**Interfaces:**
- Consumes: `categoriasDespesa` (schema de Task 1)
- `NovaDespesaButton` props: `{ lojas: Loja[]; categorias: string[] }`
- `EditarDespesaButton` props: `{ lojas: Loja[]; despesa: DespesaRow; categorias: string[] }`
- `DespesaDialog` props: `{ lojas: Loja[]; categorias: string[]; modo: 'criar' | 'editar'; inicial?: DespesaRow; open?: boolean; onOpenChange?: (v: boolean) => void }`
- `DespesasTable` props: `{ despesas: DespesaRow[]; lojas: Loja[]; categorias: string[] }`

- [ ] **Step 1: Buscar categorias ativas em despesas/page.tsx**

Em `src/app/(dashboard)/despesas/page.tsx`, linha 4, trocar:

```ts
import { despesas, lojas, usuarios } from '@/lib/db/schema'
```

por:

```ts
import { despesas, lojas, usuarios, categoriasDespesa } from '@/lib/db/schema'
```

Linha 5, trocar:

```ts
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'
```

por:

```ts
import { eq, desc, and, gte, lte, sql, asc } from 'drizzle-orm'
```

No `Promise.all` (linhas 31-71), adicionar uma quarta entrada e ajustar a desestruturação. Trocar:

```ts
  const [rows, lojasOpts, totaisPorLoja] = await Promise.all([
```

por:

```ts
  const [rows, lojasOpts, totaisPorLoja, categoriasAtivas] = await Promise.all([
```

E, ao final do array (após a query de `totaisPorLoja`, antes do `])` que fecha o `Promise.all`), adicionar:

```ts
    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.ativo, true))
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
      .then(rows => rows.map(r => r.nome)),
```

Por fim, repassar a prop `categorias` para `NovaDespesaButton`. Trocar:

```tsx
          <NovaDespesaButton lojas={lojasOpts} />
```

por:

```tsx
          <NovaDespesaButton lojas={lojasOpts} categorias={categoriasAtivas} />
```

E trocar:

```tsx
          <DespesasTable despesas={rows} lojas={lojasOpts} />
```

por:

```tsx
          <DespesasTable despesas={rows} lojas={lojasOpts} categorias={categoriasAtivas} />
```

- [ ] **Step 2: Repassar categorias em despesas-table.tsx**

Em `src/app/(dashboard)/despesas/components/despesas-table.tsx`, linha 14, trocar:

```ts
type Props = { despesas: DespesaRow[]; lojas: Loja[] }
```

por:

```ts
type Props = { despesas: DespesaRow[]; lojas: Loja[]; categorias: string[] }
```

Linha 24, trocar:

```ts
export function DespesasTable({ despesas, lojas }: Props) {
```

por:

```ts
export function DespesasTable({ despesas, lojas, categorias }: Props) {
```

Dentro da função, a variável local `categorias` (linhas 31-34, derivada via `useMemo` das despesas já lançadas, usada só no filtro) fica com o mesmo nome e colide com a prop. Renomear a variável local para `categoriasFiltro`. Trocar:

```ts
  const categorias = useMemo(() =>
    [...new Set(despesas.map(d => d.categoria))].sort(),
    [despesas]
  )
```

por:

```ts
  const categoriasFiltro = useMemo(() =>
    [...new Set(despesas.map(d => d.categoria))].sort(),
    [despesas]
  )
```

E, no JSX do filtro (linha 82), trocar:

```tsx
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
```

por:

```tsx
            {categoriasFiltro.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
```

Por fim, repassar a prop para `EditarDespesaButton` (linha 141). Trocar:

```tsx
                  <EditarDespesaButton lojas={lojas} despesa={d} />
```

por:

```tsx
                  <EditarDespesaButton lojas={lojas} despesa={d} categorias={categorias} />
```

- [ ] **Step 3: Usar a prop categorias em despesa-dialog.tsx**

Em `src/app/(dashboard)/despesas/components/despesa-dialog.tsx`, remover o array fixo (linhas 15-18):

```ts
const CATEGORIAS = [
  'Aluguel', 'Energia elétrica', 'Água', 'Internet', 'Combustível',
  'Compra de veículos', 'Marketing', 'Salários', 'Impostos', 'Manutenção', 'Outros',
]

```

(deixar apenas `FORMAS_PAGAMENTO` e `BANCOS`, que continuam fixos).

Atualizar o tipo `Props` (linhas 27-33). Trocar:

```ts
type Props = {
  lojas: Loja[]
  modo: 'criar' | 'editar'
  inicial?: DespesaRow
  open?: boolean
  onOpenChange?: (v: boolean) => void
}
```

por:

```ts
type Props = {
  lojas: Loja[]
  categorias: string[]
  modo: 'criar' | 'editar'
  inicial?: DespesaRow
  open?: boolean
  onOpenChange?: (v: boolean) => void
}
```

Atualizar a assinatura da função (linha 35). Trocar:

```tsx
export function DespesaDialog({ lojas, modo, inicial, open, onOpenChange }: Props) {
```

por:

```tsx
export function DespesaDialog({ lojas, categorias, modo, inicial, open, onOpenChange }: Props) {
```

No JSX do select de categoria (linha 124), trocar:

```tsx
              {CATEGORIAS.map(c => (
```

por:

```tsx
              {categorias.map(c => (
```

Atualizar `NovaDespesaButton` (linhas 196-206). Trocar:

```tsx
export function NovaDespesaButton({ lojas }: { lojas: Loja[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova Despesa
      </Button>
      <DespesaDialog lojas={lojas} modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}
```

por:

```tsx
export function NovaDespesaButton({ lojas, categorias }: { lojas: Loja[]; categorias: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova Despesa
      </Button>
      <DespesaDialog lojas={lojas} categorias={categorias} modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}
```

Atualizar `EditarDespesaButton` (linhas 208-226). Trocar:

```tsx
export function EditarDespesaButton({ lojas, despesa }: { lojas: Loja[]; despesa: DespesaRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-slate-400 hover:text-slate-700 p-1"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <DespesaDialog
        key={`${despesa.id}-${despesa.valor}-${despesa.data}`}
        lojas={lojas} modo="editar" inicial={despesa} open={open} onOpenChange={setOpen}
      />
    </>
  )
}
```

por:

```tsx
export function EditarDespesaButton({ lojas, despesa, categorias }: { lojas: Loja[]; despesa: DespesaRow; categorias: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-slate-400 hover:text-slate-700 p-1"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <DespesaDialog
        key={`${despesa.id}-${despesa.valor}-${despesa.data}`}
        lojas={lojas} categorias={categorias} modo="editar" inicial={despesa} open={open} onOpenChange={setOpen}
      />
    </>
  )
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros. Confirma em especial que a variável `categorias` (prop de `DespesasTable`) e `categoriasFiltro` (local) não colidem mais.

- [ ] **Step 5: Testar no browser**

Abrir `/admin/categorias-caixa` logado como admin:
- Aba "Despesa" lista as 11 categorias seed, todas "Ativa"
- Criar uma categoria nova (ex: "Teste") → aparece na tabela
- Desativar a categoria "Teste" → badge muda para "Inativa"
- Editar o nome de uma categoria → nome atualiza na tabela

Abrir `/despesas`:
- Botão "Nova Despesa" → select de Categoria mostra as categorias ativas do banco (sem "Teste" se foi desativada)
- Registrar uma despesa com uma categoria existente → salva normalmente
- Editar uma despesa já lançada → select de Categoria abre com o valor atual selecionado

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/despesas/"
git commit -m "feat: despesas usam categorias cadastradas no admin em vez de lista fixa"
```
