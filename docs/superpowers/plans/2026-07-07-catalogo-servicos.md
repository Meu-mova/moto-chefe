# Catálogo de Serviços Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à oficina um cadastro de serviços (nome, tempo previsto, valor) gerenciável por admin/aux_adm, com soft delete, para servir de base à etapa "Serviços realizados" da futura reforma do fluxo de abertura de OS.

**Architecture:** Nova tabela `servicos_catalogo` no schema Drizzle existente + `os_itens.servico_id` como FK opcional para rastreabilidade futura (sem afetar o valor congelado do item já lançado). Server actions em `src/app/(dashboard)/servicos/actions.ts` seguindo exatamente o padrão de permissão `GESTORES` já usado em `agenda/actions.ts` e `caixa/page.tsx`. UI nova em `src/app/(dashboard)/servicos/` espelhando `admin/modelos` (tabela) e `clientes/components/cliente-form.tsx` (dialog de criar/editar).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM + Postgres, `@base-ui/react` (Dialog), Tailwind, `sonner` (toast).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-07-catalogo-servicos-design.md`.
- Permissão em todas as actions: `admin_geral`, `admin_socio`, `aux_adm` (constante `GESTORES`) — mecânico não acessa.
- Catálogo é único para o grupo (não há coluna de loja em `servicos_catalogo`).
- `os_itens.servico_id` não usa `onDelete: 'cascade'` — excluir um serviço do catálogo não pode apagar itens de OS já lançados. A UI não expõe exclusão física, só inativar/reativar (`ativo: boolean`).
- Este projeto não tem suíte de testes automatizada (só `tsc --noEmit` via `npm run type-check`). O "ciclo de teste" de cada tarefa abaixo é: type-check limpo + verificação manual no navegador com passos exatos — não pule os passos manuais achando que o type-check basta.
- Migração de schema: `npm run db:generate` cria o arquivo SQL localmente (seguro, não toca no banco). `npm run db:migrate` aplica no banco real apontado por `DATABASE_URL` — **nunca rode sem confirmação explícita do usuário**, isso é tratado como a última tarefa do plano, não como parte da Tarefa 1.
- Sem uso de props Radix (`asChild`, `onPointerDownOutside`) nos componentes de Dialog — seguir o padrão já usado em `cliente-form.tsx`: trigger é um `<div onClick=...>` envolvendo o elemento passado via prop, não `<DialogTrigger asChild>`.

---

### Task 1: Schema — tabela `servicos_catalogo` e FK em `os_itens`

**Files:**
- Modify: `src/lib/db/schema.ts` (inserir nova tabela antes da seção `─── os_itens ───`, e adicionar coluna em `osItens`)
- Create (gerado por comando, não escrito à mão): `src/lib/db/migrations/0014_*.sql`

**Interfaces:**
- Produces: `servicosCatalogo` (tabela Drizzle) com colunas `id`, `nome`, `tempoPrevistoMinutos`, `valor` (numeric string), `ativo` (boolean), `criadoEm`, `atualizadoEm`. Tarefas seguintes importam `servicosCatalogo` de `@/lib/db/schema`.

- [ ] **Step 1: Adicionar a tabela `servicosCatalogo` ao schema**

Abra `src/lib/db/schema.ts` e localize o comentário `// ─── os_itens ─────` (atualmente por volta da linha 249). Insira o bloco abaixo **imediatamente antes** dele:

```ts
// ─── servicos_catalogo ─────────────────────────────────────────────────────────
export const servicosCatalogo = pgTable('servicos_catalogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tempoPrevistoMinutos: integer('tempo_previsto_minutos'),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

```

Todos os tipos usados (`pgTable`, `uuid`, `text`, `integer`, `numeric`, `boolean`, `timestamp`) já estão importados no topo do arquivo — não precisa mexer no bloco de `import`.

- [ ] **Step 2: Adicionar `servico_id` em `os_itens`**

No mesmo arquivo, dentro da definição de `osItens` (a que já existe, logo após o bloco que você acabou de inserir), adicione a coluna `servicoId` logo depois de `osId`:

```ts
export const osItens = pgTable('os_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  osId: uuid('os_id').notNull().references(() => ordensServico.id, { onDelete: 'cascade' }),
  servicoId: uuid('servico_id').references(() => servicosCatalogo.id),
  tipo: text('tipo').notNull().default('servico'),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('1'),
  valorUnitario: numeric('valor_unitario', { precision: 10, scale: 2 }).notNull().default('0'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
})
```

(Só a linha `servicoId: uuid(...)` é nova — o resto do bloco já existe, não duplique.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Gerar a migração**

Run: `npm run db:generate`
Expected: cria `src/lib/db/migrations/0014_<nome-gerado>.sql` contendo `CREATE TABLE "servicos_catalogo"` e `ALTER TABLE "os_itens" ADD COLUMN "servico_id" uuid`. Abra o arquivo gerado e confirme visualmente que é isso — não rode `db:migrate` ainda (isso é a Tarefa 7, com confirmação do usuário).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat: schema do catálogo de serviços (servicos_catalogo + os_itens.servico_id)"
```

---

### Task 2: Server actions do catálogo

**Files:**
- Create: `src/app/(dashboard)/servicos/actions.ts`

**Interfaces:**
- Consumes: `servicosCatalogo` de `@/lib/db/schema` (Task 1); `getUsuarioLogado` de `@/lib/auth` (já existente, retorna objeto com `.papel: string`).
- Produces:
  - `export type ServicoInput = { nome: string; tempoPrevistoMinutos?: number | null; valor: number }`
  - `listarServicosAction(params?: { apenasAtivos?: boolean }): Promise<Array<typeof servicosCatalogo.$inferSelect>>`
  - `criarServicoAction(input: ServicoInput): Promise<{ id: string }>`
  - `atualizarServicoAction(id: string, input: ServicoInput): Promise<void>`
  - `inativarServicoAction(id: string): Promise<void>`
  - `reativarServicoAction(id: string): Promise<void>`
  - Todas lançam `Error('Sem permissão')` se o usuário logado não estiver em `GESTORES`; `criarServicoAction`/`atualizarServicoAction` lançam `Error('Nome é obrigatório')` ou `Error('Valor não pode ser negativo')` conforme o input.
  - Tarefas 3 e 4 importam essas funções e o tipo `ServicoInput` de `../actions`.

- [ ] **Step 1: Criar o arquivo de actions**

Crie `src/app/(dashboard)/servicos/actions.ts`:

```ts
'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { servicosCatalogo } from '@/lib/db/schema'
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

export type ServicoInput = {
  nome: string
  tempoPrevistoMinutos?: number | null
  valor: number
}

export async function listarServicosAction(params?: { apenasAtivos?: boolean }) {
  await verificarAcesso()
  const todos = await db.select().from(servicosCatalogo).orderBy(asc(servicosCatalogo.nome))
  return params?.apenasAtivos ? todos.filter(s => s.ativo) : todos
}

export async function criarServicoAction(input: ServicoInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const [novo] = await db.insert(servicosCatalogo).values({
    nome,
    tempoPrevistoMinutos: input.tempoPrevistoMinutos || null,
    valor: String(input.valor),
  }).returning({ id: servicosCatalogo.id })

  revalidatePath('/servicos')
  return novo
}

export async function atualizarServicoAction(id: string, input: ServicoInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  await db.update(servicosCatalogo).set({
    nome,
    tempoPrevistoMinutos: input.tempoPrevistoMinutos || null,
    valor: String(input.valor),
    atualizadoEm: new Date(),
  }).where(eq(servicosCatalogo.id, id))

  revalidatePath('/servicos')
}

export async function inativarServicoAction(id: string) {
  await verificarAcesso()
  await db.update(servicosCatalogo)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(eq(servicosCatalogo.id, id))
  revalidatePath('/servicos')
}

export async function reativarServicoAction(id: string) {
  await verificarAcesso()
  await db.update(servicosCatalogo)
    .set({ ativo: true, atualizadoEm: new Date() })
    .where(eq(servicosCatalogo.id, id))
  revalidatePath('/servicos')
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros. (Se a Tarefa 1 ainda não rodou `db:generate`, isso não afeta o type-check — os tipos vêm do `schema.ts`, não da migração SQL.)

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/servicos/actions.ts
git commit -m "feat: server actions do catálogo de serviços"
```

---

### Task 3: Componente `ServicoForm` (dialog de criar/editar)

**Files:**
- Create: `src/app/(dashboard)/servicos/components/servico-form.tsx`

**Interfaces:**
- Consumes: `criarServicoAction`, `atualizarServicoAction`, `type ServicoInput` de `../actions` (Task 2); `CurrencyInput` de `@/components/ui/currency-input` (já existe — recebe/emite `value: string` no formato `"123.45"`).
- Produces: `ServicoForm({ trigger, servicoInicial, onSaved }: Props)` — componente client, onde:
  - `trigger: React.ReactNode` — elemento clicável que abre o dialog.
  - `servicoInicial?: { id: string; nome: string; tempoPrevistoMinutos: number | null; valor: string }` — se presente, abre em modo edição.
  - `onSaved?: () => void` — chamado após salvar com sucesso (Task 5 usa isso para nada além do próprio `revalidatePath` da action, mas o hook fica disponível).

- [ ] **Step 1: Criar o componente**

Crie `src/app/(dashboard)/servicos/components/servico-form.tsx`:

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
import { criarServicoAction, atualizarServicoAction, type ServicoInput } from '../actions'

type ServicoInicial = { id: string; nome: string; tempoPrevistoMinutos: number | null; valor: string }

type Props = {
  trigger: React.ReactNode
  servicoInicial?: ServicoInicial
  onSaved?: () => void
}

type FormState = { nome: string; tempoPrevistoMinutos: string; valor: string }

const FORM_VAZIO: FormState = { nome: '', tempoPrevistoMinutos: '', valor: '' }

function paraFormState(s?: ServicoInicial): FormState {
  if (!s) return FORM_VAZIO
  return { nome: s.nome, tempoPrevistoMinutos: s.tempoPrevistoMinutos?.toString() ?? '', valor: s.valor }
}

export function ServicoForm({ trigger, servicoInicial, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(paraFormState(servicoInicial))

  const isEdit = Boolean(servicoInicial)

  function handleOpen() {
    setForm(paraFormState(servicoInicial))
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
    const input: ServicoInput = {
      nome: form.nome,
      tempoPrevistoMinutos: form.tempoPrevistoMinutos ? parseInt(form.tempoPrevistoMinutos, 10) : null,
      valor: form.valor ? parseFloat(form.valor) : 0,
    }
    setLoading(true)
    try {
      if (isEdit && servicoInicial) {
        await atualizarServicoAction(servicoInicial.id, input)
        toast.success('Serviço atualizado!')
      } else {
        await criarServicoAction(input)
        toast.success('Serviço cadastrado!')
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !servicoInicial) setForm(FORM_VAZIO) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setCampo('nome', e.target.value)}
                placeholder="Ex: Troca de óleo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tempo previsto (min)</Label>
                <Input
                  type="number"
                  value={form.tempoPrevistoMinutos}
                  onChange={e => setCampo('tempoPrevistoMinutos', e.target.value)}
                  placeholder="Ex: 60"
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
git add src/app/\(dashboard\)/servicos/components/servico-form.tsx
git commit -m "feat: dialog de criar/editar serviço do catálogo"
```

---

### Task 4: Componente `ServicoAtivoToggle`

**Files:**
- Create: `src/app/(dashboard)/servicos/components/servico-ativo-toggle.tsx`

**Interfaces:**
- Consumes: `inativarServicoAction`, `reativarServicoAction` de `../actions` (Task 2).
- Produces: `ServicoAtivoToggle({ id, ativo }: { id: string; ativo: boolean })` — botão que alterna o status e mostra um `Badge`. Task 5 usa isso em cada linha da tabela.

- [ ] **Step 1: Criar o componente**

Crie `src/app/(dashboard)/servicos/components/servico-ativo-toggle.tsx`:

```tsx
'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { inativarServicoAction, reativarServicoAction } from '../actions'

export function ServicoAtivoToggle({ id, ativo }: { id: string; ativo: boolean }) {
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      try {
        if (ativo) await inativarServicoAction(id)
        else await reativarServicoAction(id)
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
git add src/app/\(dashboard\)/servicos/components/servico-ativo-toggle.tsx
git commit -m "feat: toggle de ativo/inativo do serviço do catálogo"
```

---

### Task 5: Página `/servicos`

**Files:**
- Create: `src/app/(dashboard)/servicos/page.tsx`

**Interfaces:**
- Consumes: `getUsuarioLogado` (`@/lib/auth`); `db`, `servicosCatalogo` (`@/lib/db`, `@/lib/db/schema` — Task 1); `ServicoForm` (Task 3); `ServicoAtivoToggle` (Task 4).
- Produces: página em `/servicos`, redireciona para `/dashboard` se `usuario.papel` não estiver em `['admin_geral', 'admin_socio', 'aux_adm']`.

- [ ] **Step 1: Criar a página**

Crie `src/app/(dashboard)/servicos/page.tsx`:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { servicosCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { ServicoForm } from './components/servico-form'
import { ServicoAtivoToggle } from './components/servico-ativo-toggle'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

export default async function ServicosPage() {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) redirect('/dashboard')

  const servicos = await db.select().from(servicosCatalogo).orderBy(asc(servicosCatalogo.nome))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Serviços</h1>
          <p className="text-slate-500 text-sm">Serviços disponíveis para uso em Ordens de Serviço</p>
        </div>
        <ServicoForm trigger={
          <span className={buttonVariants({ variant: 'default', size: 'sm' })}>
            <Plus size={15} className="mr-1.5" /> Novo Serviço
          </span>
        } />
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tempo previsto</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicos.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell>{s.tempoPrevistoMinutos ? `${s.tempoPrevistoMinutos} min` : '—'}</TableCell>
                <TableCell>
                  {parseFloat(s.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </TableCell>
                <TableCell>
                  <ServicoAtivoToggle id={s.id} ativo={s.ativo} />
                </TableCell>
                <TableCell>
                  <ServicoForm
                    servicoInicial={{ id: s.id, nome: s.nome, tempoPrevistoMinutos: s.tempoPrevistoMinutos, valor: s.valor }}
                    trigger={
                      <button className="text-slate-400 hover:text-slate-700">
                        <Pencil size={14} />
                      </button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {servicos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  Nenhum serviço cadastrado.
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
git add src/app/\(dashboard\)/servicos/page.tsx
git commit -m "feat: página do catálogo de serviços"
```

---

### Task 6: Entrada no menu lateral

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Nenhuma nova — só adiciona um item de navegação condicional.

- [ ] **Step 1: Adicionar o item de menu**

Em `src/components/layout/sidebar.tsx`, adicione o ícone `ListChecks` (ainda não usado na sidebar) ao import do `lucide-react` (linha 7-12 atual):

```ts
import {
  ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings,
  Wallet, Home, Package, QrCode, Calculator,
  ChevronLeft, ChevronRight, Zap, CreditCard, ClipboardList, Users,
  Radar, CalendarDays, ListChecks,
} from 'lucide-react'
```

Depois, no array `navItems` dentro de `Sidebar`, adicione a entrada condicional a `GESTORES` logo após a linha de `/clientes` (que já usa uma condição parecida):

```ts
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/servicos', label: 'Serviços', icon: ListChecks }] : []),
```

O trecho completo do array de `navItems` (para referência de onde a linha entra) fica:

```ts
  const navItems = [
    ...baseNavItems,
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/caixa',       label: 'Caixa',       icon: Wallet       }] : []),
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/pix',         label: 'PIX',         icon: QrCode       }] : []),
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/conciliacao', label: 'Conciliação', icon: CreditCard   }] : []),
    ...(papel !== 'mecanico'           ? [{ href: '/demandas',    label: 'Demandas',    icon: ClipboardList }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel) ? [{ href: '/clientes', label: 'Clientes', icon: Users }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/servicos', label: 'Serviços', icon: ListChecks }] : []),
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Settings }] : []),
  ]
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: item de menu para o catálogo de serviços"
```

---

### Task 7: Migração no banco + verificação manual completa

Esta é a única tarefa que toca o banco de dados real e por isso é a última — depende de todas as anteriores já commitadas.

**Files:** nenhum arquivo novo — usa o que já foi commitado.

- [ ] **Step 1: Rodar o dev server**

Run: `npm run dev`
Expected: servidor sobe sem erro em `http://localhost:3000`.

- [ ] **Step 2: Confirmar com o usuário antes de migrar**

Pare aqui e pergunte ao usuário: "Vou aplicar a migração `0014_*` (cria `servicos_catalogo`, adiciona `os_itens.servico_id`) no banco real via `npm run db:migrate`. Confirma?" — só prossiga com o Step 3 após confirmação explícita.

- [ ] **Step 3: Aplicar a migração**

Run: `npm run db:migrate`
Expected: log confirma a aplicação da migração `0014_*` sem erro.

- [ ] **Step 4: Verificação manual — criar serviço**

No navegador, logado como `admin_geral` ou `aux_adm`:
1. Abra `/servicos` pelo menu lateral ("Serviços").
2. Clique em "Novo Serviço". Preencha Nome = "Troca de óleo", Tempo previsto = "60", Valor = "80,00". Salvar.
3. Esperado: toast "Serviço cadastrado!", linha nova aparece na tabela com "60 min" e "R$ 80,00", badge "Ativo".

- [ ] **Step 5: Verificação manual — validação de nome vazio**

1. Clique em "Novo Serviço" de novo, deixe Nome vazio, clique Salvar.
2. Esperado: toast de erro "Nome é obrigatório", dialog continua aberto.

- [ ] **Step 6: Verificação manual — editar**

1. Clique no ícone de lápis da linha "Troca de óleo".
2. Altere Valor para "90,00", Salvar.
3. Esperado: toast "Serviço atualizado!", linha mostra "R$ 90,00".

- [ ] **Step 7: Verificação manual — inativar/reativar**

1. Clique no badge "Ativo" da linha.
2. Esperado: badge muda para "Inativo" sem recarregar a página.
3. Clique de novo no badge "Inativo".
4. Esperado: volta para "Ativo".

- [ ] **Step 8: Verificação manual — permissão**

1. Logado como `mecanico`, tente acessar `/servicos` diretamente pela URL.
2. Esperado: redirecionado para `/dashboard`, item "Serviços" não aparece no menu lateral desse usuário.

- [ ] **Step 9: Commit final (se algo precisou de ajuste durante a verificação)**

Se todos os passos acima passaram sem precisar tocar código, não há nada para commitar aqui. Se algum ajuste foi feito durante a verificação manual, commit normalmente com mensagem descrevendo o ajuste.

---

## Fora de escopo deste plano

- Seleção de serviços do catálogo dentro do fluxo de abertura de OS — próximo spec/plano.
- Categoria de serviço, preço por loja, relatórios de produtividade — conforme "Fora de escopo" do spec.
