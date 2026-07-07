# Catálogo de Peças Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à oficina um cadastro de peças (nome, valor) gerenciável por admin/aux_adm, com soft delete, para servir de base à aba "Serviços e Peças" da OS — mesmo padrão do Catálogo de Serviços, sem tempo previsto e sem controle de estoque.

**Architecture:** Nova tabela `pecas_catalogo` no schema Drizzle, estruturalmente idêntica a `servicos_catalogo` (já em produção) menos o campo de tempo previsto. `os_itens.peca_id` como FK opcional, espelhando `servico_id`. Server actions, componentes e página são cópias adaptadas ponto a ponto de `src/app/(dashboard)/servicos/`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM + Postgres (Supabase), `@base-ui/react` (Dialog), Tailwind, `sonner` (toast).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-07-catalogo-pecas-design.md`.
- Permissão em todas as actions: `admin_geral`, `admin_socio`, `aux_adm` (constante `GESTORES`) — mecânico não acessa.
- Catálogo é único para o grupo (não há coluna de loja em `pecas_catalogo`).
- Sem `tempoPrevistoMinutos` e sem controle de estoque — só nome, valor, ativo.
- `os_itens.peca_id` não usa `onDelete: 'cascade'` — excluir uma peça do catálogo não pode apagar itens de OS já lançados.
- Este projeto não tem suíte de testes automatizada (só `tsc --noEmit` via `npm run type-check`). O ciclo de verificação de cada tarefa é: type-check limpo + verificação manual — não pule os passos manuais.
- **Migração de schema — não use `npm run db:generate` nem `npm run db:migrate`.** O journal local do Drizzle está desatualizado neste repo (achado documentado em `docs/superpowers/plans/2026-07-07-catalogo-servicos.md`). Escreva o SQL manualmente e aplique via **Supabase MCP `apply_migration`** (`project_id: "bzlaradpofaecqzawyym"`), sempre com confirmação do usuário antes de aplicar em produção — tratado na última tarefa deste plano.
- Sem uso de props Radix (`asChild`, `onPointerDownOutside`) nos componentes de Dialog — trigger é um `<div onClick=...>` envolvendo o elemento passado via prop (padrão já usado em `servico-form.tsx`/`cliente-form.tsx`).

---

### Task 1: Schema — tabela `pecas_catalogo` e FK em `os_itens`

**Files:**
- Modify: `src/lib/db/schema.ts` (inserir nova tabela logo após `servicosCatalogo`, atualmente linhas 249-258, e adicionar coluna em `osItens`)
- Create: `src/lib/db/migrations/0015_catalogo_pecas.sql` (SQL manual, não gerado)

**Interfaces:**
- Produces: `pecasCatalogo` (tabela Drizzle) com colunas `id`, `nome`, `valor` (numeric string), `ativo` (boolean), `criadoEm`, `atualizadoEm`. Tarefas seguintes importam `pecasCatalogo` de `@/lib/db/schema`.

- [ ] **Step 1: Adicionar a tabela `pecasCatalogo` ao schema**

Abra `src/lib/db/schema.ts` e localize o fim do bloco `servicosCatalogo` (fecha com `})` seguido de linha em branco, antes do comentário `// ─── os_itens ─────`, atualmente por volta da linha 258-260). Insira o bloco abaixo **imediatamente depois** do fechamento de `servicosCatalogo` e **antes** do comentário `// ─── os_itens ───`:

```ts
// ─── pecas_catalogo ────────────────────────────────────────────────────────────
export const pecasCatalogo = pgTable('pecas_catalogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

```

Todos os tipos usados (`pgTable`, `uuid`, `text`, `numeric`, `boolean`, `timestamp`) já estão importados no topo do arquivo.

- [ ] **Step 2: Adicionar `peca_id` em `os_itens`**

No mesmo arquivo, dentro da definição de `osItens` (logo abaixo do bloco que você acabou de inserir), adicione a coluna `pecaId` logo depois de `servicoId`:

```ts
export const osItens = pgTable('os_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  osId: uuid('os_id').notNull().references(() => ordensServico.id, { onDelete: 'cascade' }),
  servicoId: uuid('servico_id').references(() => servicosCatalogo.id),
  pecaId: uuid('peca_id').references(() => pecasCatalogo.id),
  tipo: text('tipo').notNull().default('servico'),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('1'),
  valorUnitario: numeric('valor_unitario', { precision: 10, scale: 2 }).notNull().default('0'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
})
```

(Só a linha `pecaId: uuid(...)` é nova — o resto do bloco já existe, não duplique.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Escrever a migração manualmente**

Crie `src/lib/db/migrations/0015_catalogo_pecas.sql`, no mesmo estilo enxuto de `0014_catalogo_servicos.sql` (DDL puro, sem comentários):

```sql
CREATE TABLE "pecas_catalogo" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"           text NOT NULL,
  "valor"          numeric(10, 2) DEFAULT '0' NOT NULL,
  "ativo"          boolean DEFAULT true NOT NULL,
  "criado_em"      timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em"  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "os_itens" ADD COLUMN "peca_id" uuid REFERENCES "pecas_catalogo"("id");
```

Não rode `db:generate` nem `db:migrate` — a aplicação real acontece na última tarefa deste plano, via Supabase MCP `apply_migration`, com confirmação do usuário.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0015_catalogo_pecas.sql
git commit -m "feat: schema do catálogo de peças (pecas_catalogo + os_itens.peca_id)"
```

---

### Task 2: Server actions do catálogo de peças

**Files:**
- Create: `src/app/(dashboard)/pecas/actions.ts`

**Interfaces:**
- Consumes: `pecasCatalogo` de `@/lib/db/schema` (Task 1); `getUsuarioLogado` de `@/lib/auth`.
- Produces:
  - `export type PecaInput = { nome: string; valor: number }`
  - `listarPecasAction(params?: { apenasAtivos?: boolean }): Promise<Array<typeof pecasCatalogo.$inferSelect>>`
  - `criarPecaAction(input: PecaInput): Promise<{ id: string }>`
  - `atualizarPecaAction(id: string, input: PecaInput): Promise<void>`
  - `inativarPecaAction(id: string): Promise<void>`
  - `reativarPecaAction(id: string): Promise<void>`
  - Todas lançam `Error('Sem permissão')` se o usuário não estiver em `GESTORES`; `criarPecaAction`/`atualizarPecaAction` lançam `Error('Nome é obrigatório')` ou `Error('Valor não pode ser negativo')`.
  - Tarefas 3 e 4 importam essas funções e o tipo `PecaInput` de `../actions`.

- [ ] **Step 1: Criar o arquivo de actions**

Crie `src/app/(dashboard)/pecas/actions.ts`:

```ts
'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm'] as const

async function verificarAcesso() {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  return usuario
}

export type PecaInput = {
  nome: string
  valor: number
}

export async function listarPecasAction(params?: { apenasAtivos?: boolean }) {
  await verificarAcesso()
  const todas = await db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome))
  return params?.apenasAtivos ? todas.filter(p => p.ativo) : todas
}

export async function criarPecaAction(input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const [nova] = await db.insert(pecasCatalogo).values({
    nome,
    valor: String(input.valor),
  }).returning({ id: pecasCatalogo.id })

  revalidatePath('/pecas')
  return nova
}

export async function atualizarPecaAction(id: string, input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  await db.update(pecasCatalogo).set({
    nome,
    valor: String(input.valor),
    atualizadoEm: new Date(),
  }).where(eq(pecasCatalogo.id, id))

  revalidatePath('/pecas')
}

export async function inativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}

export async function reativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: true, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pecas/actions.ts
git commit -m "feat: server actions do catálogo de peças"
```

---

### Task 3: Componente `PecaForm` (dialog de criar/editar)

**Files:**
- Create: `src/app/(dashboard)/pecas/components/peca-form.tsx`

**Interfaces:**
- Consumes: `criarPecaAction`, `atualizarPecaAction`, `type PecaInput` de `../actions` (Task 2); `CurrencyInput` de `@/components/ui/currency-input`.
- Produces: `PecaForm({ trigger, pecaInicial, onSaved }: Props)` — componente client, onde:
  - `trigger: React.ReactNode`
  - `pecaInicial?: { id: string; nome: string; valor: string }` — se presente, modo edição.
  - `onSaved?: () => void`

- [ ] **Step 1: Criar o componente**

Crie `src/app/(dashboard)/pecas/components/peca-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { criarPecaAction, atualizarPecaAction, type PecaInput } from '../actions'

type PecaInicial = { id: string; nome: string; valor: string }

type Props = {
  trigger: React.ReactNode
  pecaInicial?: PecaInicial
  onSaved?: () => void
}

type FormState = { nome: string; valor: string }

const FORM_VAZIO: FormState = { nome: '', valor: '' }

function paraFormState(p?: PecaInicial): FormState {
  if (!p) return FORM_VAZIO
  return { nome: p.nome, valor: p.valor }
}

export function PecaForm({ trigger, pecaInicial, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(paraFormState(pecaInicial))

  const isEdit = Boolean(pecaInicial)

  function handleOpen() {
    setForm(paraFormState(pecaInicial))
    setOpen(true)
  }

  function setCampo(campo: keyof FormState, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    const input: PecaInput = {
      nome: form.nome,
      valor: form.valor ? parseFloat(form.valor) : 0,
    }
    setLoading(true)
    try {
      if (isEdit && pecaInicial) {
        await atualizarPecaAction(pecaInicial.id, input)
        toast.success('Peça atualizada!')
      } else {
        await criarPecaAction(input)
        toast.success('Peça cadastrada!')
      }
      setOpen(false)
      onSaved?.()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={handleOpen} className="inline-flex cursor-pointer">
        {trigger}
      </div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !pecaInicial) setForm(FORM_VAZIO) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Peça' : 'Nova Peça'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setCampo('nome', e.target.value)}
                placeholder="Ex: Pastilha de freio dianteira"
              />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput
                value={form.valor}
                onChange={v => setCampo('valor', v)}
                placeholder="0,00"
              />
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleSalvar} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pecas/components/peca-form.tsx
git commit -m "feat: dialog de criar/editar peça do catálogo"
```

---

### Task 4: Componente `PecaAtivoToggle`

**Files:**
- Create: `src/app/(dashboard)/pecas/components/peca-ativo-toggle.tsx`

**Interfaces:**
- Consumes: `inativarPecaAction`, `reativarPecaAction` de `../actions` (Task 2).
- Produces: `PecaAtivoToggle({ id, ativo }: { id: string; ativo: boolean })`.

- [ ] **Step 1: Criar o componente**

Crie `src/app/(dashboard)/pecas/components/peca-ativo-toggle.tsx`:

```tsx
'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { inativarPecaAction, reativarPecaAction } from '../actions'

export function PecaAtivoToggle({ id, ativo }: { id: string; ativo: boolean }) {
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      try {
        if (ativo) await inativarPecaAction(id)
        else await reativarPecaAction(id)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar status')
      }
    })
  }

  return (
    <button onClick={toggle} disabled={pending} className="disabled:opacity-50" title={ativo ? 'Clique para inativar' : 'Clique para reativar'}>
      <Badge variant={ativo ? 'default' : 'outline'}>
        {pending ? '...' : ativo ? 'Ativo' : 'Inativo'}
      </Badge>
    </button>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pecas/components/peca-ativo-toggle.tsx
git commit -m "feat: toggle de ativo/inativo da peça do catálogo"
```

---

### Task 5: Página `/pecas`

**Files:**
- Create: `src/app/(dashboard)/pecas/page.tsx`

**Interfaces:**
- Consumes: `getUsuarioLogado` (`@/lib/auth`); `db`, `pecasCatalogo` (`@/lib/db`, `@/lib/db/schema` — Task 1); `PecaForm` (Task 3); `PecaAtivoToggle` (Task 4).
- Produces: página em `/pecas`, redireciona para `/dashboard` se `usuario.papel` não estiver em `['admin_geral', 'admin_socio', 'aux_adm']`.

- [ ] **Step 1: Criar a página**

Crie `src/app/(dashboard)/pecas/page.tsx`:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { PecaForm } from './components/peca-form'
import { PecaAtivoToggle } from './components/peca-ativo-toggle'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

export default async function PecasPage() {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) redirect('/dashboard')

  const pecas = await db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Peças</h1>
          <p className="text-slate-500 text-sm">Peças disponíveis para uso em Ordens de Serviço</p>
        </div>
        <PecaForm trigger={
          <span className={buttonVariants({ variant: 'default', size: 'sm' })}>
            <Plus size={15} className="mr-1.5" /> Nova Peça
          </span>
        } />
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pecas.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>
                  {parseFloat(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </TableCell>
                <TableCell>
                  <PecaAtivoToggle id={p.id} ativo={p.ativo} />
                </TableCell>
                <TableCell>
                  <PecaForm
                    pecaInicial={{ id: p.id, nome: p.nome, valor: p.valor }}
                    trigger={
                      <button className="text-slate-400 hover:text-slate-700">
                        <Pencil size={14} />
                      </button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {pecas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  Nenhuma peça cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pecas/page.tsx
git commit -m "feat: página do catálogo de peças"
```

---

### Task 6: Entrada no menu lateral

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Nenhuma nova — só adiciona um item de navegação condicional.

- [ ] **Step 1: Adicionar o item de menu**

Em `src/components/layout/sidebar.tsx`, adicione o ícone `Package2` (ainda não usado — `Package` já está em uso para "Showroom") ao import do `lucide-react` (linha 7-12 atual, atualmente termina em `Radar, CalendarDays, ListChecks,`):

```ts
import {
  ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings,
  Wallet, Home, Package, QrCode, Calculator,
  ChevronLeft, ChevronRight, Zap, CreditCard, ClipboardList, Users,
  Radar, CalendarDays, ListChecks, Package2,
} from 'lucide-react'
```

Depois, no array `navItems` dentro de `Sidebar`, adicione a entrada condicional logo após a linha de `/servicos` (atualmente linha 43):

```ts
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/pecas', label: 'Peças', icon: Package2 }] : []),
```

O trecho completo do array de `navItems` (para referência) fica:

```ts
  const navItems = [
    ...baseNavItems,
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/caixa',       label: 'Caixa',       icon: Wallet       }] : []),
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/pix',         label: 'PIX',         icon: QrCode       }] : []),
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/conciliacao', label: 'Conciliação', icon: CreditCard   }] : []),
    ...(papel !== 'mecanico'           ? [{ href: '/demandas',    label: 'Demandas',    icon: ClipboardList }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel) ? [{ href: '/clientes', label: 'Clientes', icon: Users }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/servicos', label: 'Serviços', icon: ListChecks }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/pecas', label: 'Peças', icon: Package2 }] : []),
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Settings }] : []),
  ]
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: item de menu para o catálogo de peças"
```

---

### Task 7: Migração no banco + verificação

**Files:** nenhum arquivo novo — usa o que já foi commitado.

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build limpo, `/pecas` aparece na lista de rotas.

- [ ] **Step 2: Confirmar com o usuário antes de migrar**

Pare aqui e pergunte ao usuário: "Vou aplicar `0015_catalogo_pecas.sql` (cria `pecas_catalogo`, adiciona `os_itens.peca_id`) no banco real via Supabase MCP `apply_migration`. Confirma?" — só prossiga com o Step 3 após confirmação explícita. (Se o usuário já autorizou execução automática nesta sessão, essa autorização vale como confirmação — mas registre isso explicitamente no relatório.)

- [ ] **Step 3: Aplicar a migração**

Use a ferramenta MCP `mcp__plugin_supabase_supabase__apply_migration` com `project_id: "bzlaradpofaecqzawyym"`, `name: "catalogo_pecas"`, e o conteúdo exato de `src/lib/db/migrations/0015_catalogo_pecas.sql` como `query`.

Expected: retorno de sucesso. Confirme com `mcp__plugin_supabase_supabase__list_migrations` (mesmo `project_id`) que `catalogo_pecas` aparece na lista, e com uma consulta a `information_schema.columns` que as colunas de `pecas_catalogo` batem com o schema.

- [ ] **Step 4: Verificação manual — criar peça**

No navegador, logado como `admin_geral` ou `aux_adm`:
1. Abra `/pecas` pelo menu lateral ("Peças").
2. Clique em "Nova Peça". Preencha Nome = "Pastilha de freio dianteira", Valor = "120,00". Salvar.
3. Esperado: toast "Peça cadastrada!", linha nova na tabela com "R$ 120,00", badge "Ativo".

- [ ] **Step 5: Verificação manual — validação, editar, inativar/reativar**

Repita os mesmos passos já validados no Catálogo de Serviços: nome vazio deve mostrar erro e não salvar; editar deve atualizar o valor exibido; clicar no badge deve alternar Ativo/Inativo sem recarregar a página.

- [ ] **Step 6: Verificação manual — permissão**

Logado como `mecanico`, acessar `/pecas` diretamente pela URL deve redirecionar para `/dashboard`, e o item "Peças" não deve aparecer no menu lateral desse usuário.

---

## Fora de escopo deste plano

- Seleção de peças do catálogo dentro da aba "Serviços e Peças" da OS — isso é o próximo spec/plano (reforma do formulário de OS).
- Controle de estoque/quantidade de peças.
- Categoria de peça, preço por loja.
