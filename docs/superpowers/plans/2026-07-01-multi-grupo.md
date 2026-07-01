# Multi-Grupo (Multi-Tenant por CNPJ) — Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir a tabela `grupos` (empresas com CNPJ distinto — Sul de Minas / BH), um seletor de grupo ativo para `admin_geral`/`admin_socio`, e escopar **todas** as páginas administrativas e listagens de lojas ao grupo ativo, de forma que os dados de Sul de Minas e BH fiquem completamente isolados na navegação normal do sistema.

**Architecture:** Nova tabela `grupos` + coluna `grupo_id` em `lojas`, `despesas` e `comunicados` (as demais tabelas herdam o isolamento via `loja → grupo`). Um cookie HttpOnly `grupoAtivo` guarda o grupo selecionado pelo admin; um helper central `getGrupoAtivo(usuario)` em `src/lib/grupo.ts` resolve o grupo ativo (via cookie para admins, via `usuario.lojaId → loja.grupoId` para os demais papéis) e é reutilizado por toda página que hoje lista "todas as lojas" sem filtro.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase (Postgres), cookies via `next/headers`, Sonner (toasts), shadcn/ui (Dialog, Table, Badge).

**Fora deste plano (fica para um plano seguinte "Integrações por grupo"):** ValidaPix, Fábrica (peças) e Bling continuam lendo credenciais fixas de `process.env`/`bling_config` (singleton `id=1`), compartilhadas entre todos os grupos — `pixRecebimentos` e `bling_config` **não** ganham `grupo_id` neste plano.

## Global Constraints

- Grupos são completamente isolados entre si na navegação normal; apenas `admin_geral` e `admin_socio` acessam qualquer grupo, via seletor de abas.
- Cookie `grupoAtivo`: HttpOnly, SameSite=Lax, path `/`, guarda o UUID do grupo.
- Todo dado existente hoje pertence ao grupo "Sul de Minas" (CNPJ `57.113.017/0001-72`), migrado automaticamente via SQL — zero impacto na operação atual.
- Grupo "BH" (CNPJ `63.009.605/0001-63`) é criado depois, pela UI `/admin/grupos`, não pela migration.
- `/admin/grupos`: apenas `admin_geral`. `/admin/lojas`: leitura para `admin_geral`+`admin_socio`, escrita só `admin_geral` (padrão já existente).
- Toda página que hoje faz `db.select(...).from(lojas)` sem filtro (dropdown ou listagem "todas as lojas" quando `isAdmin` e nenhum filtro explícito foi escolhido) deve passar a restringir ao grupo ativo — exceto `/admin/lojas`, que é uma página "meta" e continua mostrando lojas de todos os grupos (com coluna Grupo).
- Toast via `sonner`; `revalidatePath` nas rotas afetadas após toda mutation, seguindo o padrão já usado no projeto.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/db/schema.ts` | Modificar — tabela `grupos`, `grupoId` em `lojas`/`despesas`/`comunicados` |
| `src/lib/db/migrations/0011_multi_grupo.sql` | Criar — migration SQL |
| `src/lib/grupo.ts` | Criar — helpers centrais (`getGrupoAtivo`, `listarGruposAtivos`, `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`) |
| `src/components/layout/group-selector.tsx` | Criar — barra de abas |
| `src/components/layout/group-selector-actions.ts` | Criar — Server Action do cookie |
| `src/app/(dashboard)/layout.tsx` | Modificar — inserir `GroupSelector` |
| `src/app/(dashboard)/admin/grupos/page.tsx` | Criar |
| `src/app/(dashboard)/admin/grupos/actions.ts` | Criar |
| `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx` | Criar |
| `src/app/(dashboard)/admin/page.tsx` | Modificar — card "Grupos" |
| `src/app/(dashboard)/admin/lojas/page.tsx` | Modificar — coluna Grupo + botão Nova Loja |
| `src/app/(dashboard)/admin/lojas/actions.ts` | Modificar — `criarLojaAction` recebe `grupoId` |
| `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx` | Criar |
| `src/app/(dashboard)/despesas/actions.ts` | Modificar — `grupoId` no insert |
| `src/app/(dashboard)/despesas/page.tsx` | Modificar — filtro `grupoId` + dropdown |
| `src/app/(dashboard)/admin/comunicados/actions.ts` | Modificar — `grupoId` em criar/importar/listar/não-lidos |
| `src/app/(dashboard)/dashboard/page.tsx`, `src/lib/queries/dashboard.ts` | Modificar |
| `src/app/(dashboard)/vendas/page.tsx`, `src/lib/queries/vendas.ts` | Modificar |
| `src/app/(dashboard)/caixa/page.tsx`, `src/app/(dashboard)/caixa/novo/page.tsx` | Modificar |
| `src/app/(dashboard)/financeiro/page.tsx` | Modificar |
| `src/app/(dashboard)/garantias/page.tsx`, `src/app/garantias-relatorio/page.tsx` | Modificar |
| `src/app/(dashboard)/transferencias/page.tsx`, `src/app/(dashboard)/estoque/page.tsx`, `src/app/(dashboard)/estoque/[id]/page.tsx` | Modificar |
| `src/app/(dashboard)/ordens-servico/page.tsx`, `src/lib/queries/ordens-servico.ts`, `src/app/(dashboard)/demandas/page.tsx` | Modificar |
| `src/app/(dashboard)/compras/page.tsx`, `src/lib/queries/compras.ts`, `src/app/(dashboard)/admin/acoes/page.tsx`, `src/app/(dashboard)/entrada/page.tsx`, `src/app/(dashboard)/agenda/page.tsx` | Modificar |
| `src/app/(dashboard)/admin/usuarios/page.tsx` | Modificar |

---

## Task 1: Banco de dados — tabela `grupos` + `grupoId`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0011_multi_grupo.sql`

**Interfaces:**
- Produces: export `grupos` (Drizzle table), `lojas.grupoId`, `despesas.grupoId`, `comunicados.grupoId` — usados em todas as tasks seguintes.

- [ ] **Step 1: Adicionar tabela `grupos` ao schema, antes de `lojas`**

Em `src/lib/db/schema.ts`, inserir logo antes de `// ─── lojas ───` (linha 24):

```ts
// ─── grupos ──────────────────────────────────────────────────────────────────
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  validapixEmail:     text('validapix_email'),
  validapixPassword:  text('validapix_password'),
  fabricaEmail:       text('fabrica_email'),
  fabricaSenha:       text('fabrica_senha'),
})

```

- [ ] **Step 2: Adicionar `grupoId` em `lojas`**

Em `src/lib/db/schema.ts`, dentro de `export const lojas = pgTable('lojas', { ... })`, adicionar o campo:

```ts
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
})
```

- [ ] **Step 3: Adicionar `grupoId` em `despesas`**

Dentro de `export const despesas = pgTable('despesas', { ... })`, adicionar após `id`:

```ts
export const despesas = pgTable('despesas', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:         uuid('loja_id').references(() => lojas.id),           // null = empresa geral
  usuarioId:      uuid('usuario_id').notNull().references(() => usuarios.id),
  categoria:      text('categoria').notNull(),
  descricao:      text('descricao'),
  valor:          numeric('valor', { precision: 12, scale: 2 }).notNull(),
  data:           date('data').notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  banco:          text('banco').notNull(),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 4: Adicionar `grupoId` em `comunicados`**

Dentro de `export const comunicados = pgTable('comunicados', { ... })`, adicionar após `id`:

```ts
export const comunicados = pgTable('comunicados', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  titulo: text('titulo').notNull(),
  conteudo: text('conteudo').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  papeis: text('papeis').array().notNull().default([]),
  dataPostagem: timestamp('data_postagem', { withTimezone: true }),
  criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 5: Criar arquivo de migration**

Criar `src/lib/db/migrations/0011_multi_grupo.sql`:

```sql
CREATE TABLE "grupos" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"                text NOT NULL,
  "cnpj"                text NOT NULL,
  "ativo"               boolean DEFAULT true NOT NULL,
  "validapix_email"     text,
  "validapix_password"  text,
  "fabrica_email"       text,
  "fabrica_senha"       text
);

INSERT INTO "grupos" ("id", "nome", "cnpj", "ativo")
VALUES ('00000000-0000-4000-8000-000000000001', 'Sul de Minas', '57.113.017/0001-72', true);

ALTER TABLE "lojas" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "lojas" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "lojas" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "despesas" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "despesas" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "despesas" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "comunicados" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "comunicados" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "comunicados" ALTER COLUMN "grupo_id" SET NOT NULL;
```

- [ ] **Step 6: Aplicar migration**

Usar a ferramenta Supabase MCP (`apply_migration`) com o conteúdo do arquivo acima. Nome da migration: `multi_grupo`.

- [ ] **Step 7: Verificar**

Usar `list_tables` no MCP do Supabase e confirmar que `grupos` existe e que `lojas`, `despesas`, `comunicados` têm a coluna `grupo_id` (NOT NULL). Confirmar que `SELECT nome, cnpj FROM grupos` retorna a linha "Sul de Minas".

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0011_multi_grupo.sql
git commit -m "feat: tabela grupos e grupo_id em lojas, despesas, comunicados"
```

---

## Task 2: Helpers centrais de grupo

**Files:**
- Create: `src/lib/grupo.ts`

**Interfaces:**
- Consumes: `grupos`, `lojas` (Task 1), `db` de `@/lib/db`
- Produces:
  - `type Grupo = { id: string; nome: string; cnpj: string; ativo: boolean; validapixEmail: string | null; validapixPassword: string | null; fabricaEmail: string | null; fabricaSenha: string | null }`
  - `getGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<Grupo>`
  - `listarGruposAtivos(): Promise<Grupo[]>`
  - `listarLojasDoGrupoAtivo(usuario: { papel: string; lojaId: string | null }, opts?: { somenteAtivas?: boolean }): Promise<{ id: string; nome: string }[]>`
  - `listarLojaIdsDoGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<string[]>`

- [ ] **Step 1: Criar `src/lib/grupo.ts`**

```ts
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export type Grupo = typeof grupos.$inferSelect

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function getGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<Grupo> {
  if (ADMIN_PAPEIS.includes(usuario.papel)) {
    const cookieStore = await cookies()
    const grupoIdCookie = cookieStore.get('grupoAtivo')?.value

    if (grupoIdCookie) {
      const [grupo] = await db
        .select()
        .from(grupos)
        .where(and(eq(grupos.id, grupoIdCookie), eq(grupos.ativo, true)))
        .limit(1)
      if (grupo) return grupo
    }

    const [primeiro] = await db
      .select()
      .from(grupos)
      .where(eq(grupos.ativo, true))
      .orderBy(grupos.nome)
      .limit(1)
    if (!primeiro) throw new Error('Nenhum grupo ativo cadastrado')
    return primeiro
  }

  if (!usuario.lojaId) throw new Error('Usuário sem loja associada')

  const [loja] = await db
    .select({ grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, usuario.lojaId))
    .limit(1)
  if (!loja) throw new Error('Loja do usuário não encontrada')

  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, loja.grupoId)).limit(1)
  if (!grupo) throw new Error('Grupo da loja não encontrado')
  return grupo
}

export async function listarGruposAtivos(): Promise<Grupo[]> {
  return db.select().from(grupos).where(eq(grupos.ativo, true)).orderBy(grupos.nome)
}

export async function listarLojasDoGrupoAtivo(
  usuario: { papel: string; lojaId: string | null },
  opts?: { somenteAtivas?: boolean },
): Promise<{ id: string; nome: string }[]> {
  const grupo = await getGrupoAtivo(usuario)
  const somenteAtivas = opts?.somenteAtivas ?? true
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(somenteAtivas ? and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)) : eq(lojas.grupoId, grupo.id))
    .orderBy(lojas.nome)
}

export async function listarLojaIdsDoGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<string[]> {
  const grupo = await getGrupoAtivo(usuario)
  const rows = await db.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, grupo.id))
  return rows.map(r => r.id)
}
```

- [ ] **Step 2: Verificar compilação**

Rodar `npm run type-check`. Esperado: sem erros (o arquivo ainda não é consumido por ninguém).

- [ ] **Step 3: Commit**

```bash
git add src/lib/grupo.ts
git commit -m "feat: helpers centrais getGrupoAtivo/listarLojasDoGrupoAtivo"
```

---

## Task 3: Seletor de grupo (cookie + UI no layout)

**Files:**
- Create: `src/components/layout/group-selector-actions.ts`
- Create: `src/components/layout/group-selector.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getGrupoAtivo`, `listarGruposAtivos` (Task 2), `getUsuarioLogado` de `@/lib/auth`
- Produces: `<GroupSelector usuario={...} />` inserido no layout do dashboard

- [ ] **Step 1: Criar a Server Action do cookie**

Criar `src/components/layout/group-selector-actions.ts`:

```ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function trocarGrupoAtivoAction(formData: FormData) {
  const usuario = await getUsuarioLogado()
  if (!ADMIN_PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  const grupoId = formData.get('grupoId')
  if (typeof grupoId !== 'string' || !grupoId) throw new Error('Grupo inválido')

  const cookieStore = await cookies()
  cookieStore.set('grupoAtivo', grupoId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: Criar o componente da barra de abas**

Criar `src/components/layout/group-selector.tsx`:

```tsx
import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { trocarGrupoAtivoAction } from './group-selector-actions'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

type Props = { usuario: { papel: string; lojaId: string | null } }

export async function GroupSelector({ usuario }: Props) {
  if (!ADMIN_PAPEIS.includes(usuario.papel)) return null

  const [gruposList, grupoAtivo] = await Promise.all([
    listarGruposAtivos(),
    getGrupoAtivo(usuario),
  ])

  if (gruposList.length <= 1) return null

  return (
    <div className="flex items-center gap-1 px-6 pt-2 border-b bg-white">
      {gruposList.map(g => (
        <form key={g.id} action={trocarGrupoAtivoAction}>
          <input type="hidden" name="grupoId" value={g.id} />
          <button
            type="submit"
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
              g.id === grupoAtivo.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {g.nome}
          </button>
        </form>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Inserir no layout do dashboard**

Em `src/app/(dashboard)/layout.tsx`, importar e renderizar logo abaixo do `<Header />`:

```tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { GroupSelector } from '@/components/layout/group-selector'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado } from '@/lib/auth'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  const comunicadosNaoLidos = await buscarComunicadosNaoLidosAction()

  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar papel={usuario.papel} />
        <div className="flex-1 flex flex-col">
          <Header />
          <GroupSelector usuario={usuario} />
          <main className="flex-1 p-6 bg-slate-50">
            {children}
          </main>
        </div>
      </div>
      <ComunicadoModal comunicados={comunicadosNaoLidos} />
    </Providers>
  )
}
```

- [ ] **Step 4: Testar manualmente**

Rodar `npm run dev`, logar como `admin_geral`. Como só existe 1 grupo ("Sul de Minas") ainda, o seletor não deve aparecer (`gruposList.length <= 1`). Isso será validado de fato na Task 4, após criar o grupo "BH".

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/group-selector.tsx src/components/layout/group-selector-actions.ts "src/app/(dashboard)/layout.tsx"
git commit -m "feat: seletor de grupo ativo no layout do dashboard"
```

---

## Task 4: Administração de grupos (`/admin/grupos`)

**Files:**
- Create: `src/app/(dashboard)/admin/grupos/page.tsx`
- Create: `src/app/(dashboard)/admin/grupos/actions.ts`
- Create: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `grupos` (Task 1), `SuperAdminGuard` de `../components/admin-guard`
- Produces: `criarGrupoAction`, `editarGrupoAction`, `listarGruposAction`

- [ ] **Step 1: Server Actions**

Criar `src/app/(dashboard)/admin/grupos/actions.ts`:

```ts
'use server'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function listarGruposAction() {
  await assertAdmin()
  return db.select().from(grupos).orderBy(grupos.nome)
}

type GrupoInput = {
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail?: string
  validapixPassword?: string
  fabricaEmail?: string
  fabricaSenha?: string
}

export async function criarGrupoAction(dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.insert(grupos).values({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
  })
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

export async function editarGrupoAction(id: string, dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.update(grupos).set({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
  }).where(eq(grupos.id, id))
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: Dialog de criar/editar**

Criar `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx` (segue o padrão de `DespesaDialog`):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { criarGrupoAction, editarGrupoAction } from '../actions'

type Grupo = {
  id: string
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail: string | null
  validapixPassword: string | null
  fabricaEmail: string | null
  fabricaSenha: string | null
}

type Props = {
  modo: 'criar' | 'editar'
  inicial?: Grupo
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function GrupoDialog({ modo, inicial, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)
  const [validapixEmail, setValidapixEmail] = useState(inicial?.validapixEmail ?? '')
  const [validapixPassword, setValidapixPassword] = useState(inicial?.validapixPassword ?? '')
  const [fabricaEmail, setFabricaEmail] = useState(inicial?.fabricaEmail ?? '')
  const [fabricaSenha, setFabricaSenha] = useState(inicial?.fabricaSenha ?? '')

  async function handleSalvar() {
    if (!nome.trim() || !cnpj.trim()) {
      toast.error('Preencha nome e CNPJ')
      return
    }
    setLoading(true)
    try {
      const dados = { nome, cnpj, ativo, validapixEmail, validapixPassword, fabricaEmail, fabricaSenha }
      if (modo === 'criar') {
        await criarGrupoAction(dados)
        toast.success('Grupo criado!')
      } else {
        await editarGrupoAction(inicial!.id, dados)
        toast.success('Grupo atualizado!')
      }
      onOpenChange?.(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === 'criar' ? 'Novo Grupo' : 'Editar Grupo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: BH" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CNPJ *</Label>
            <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="h-9 text-sm" />
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Integrações (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ValidaPix — E-mail</Label>
                <Input value={validapixEmail} onChange={e => setValidapixEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ValidaPix — Senha</Label>
                <Input type="password" value={validapixPassword} onChange={e => setValidapixPassword(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fábrica — E-mail</Label>
                <Input value={fabricaEmail} onChange={e => setFabricaEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fábrica — Senha</Label>
                <Input type="password" value={fabricaSenha} onChange={e => setFabricaSenha(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Estas credenciais ainda não são usadas pelo sistema — serão ativadas em uma etapa futura.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativo" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            <Label htmlFor="ativo" className="text-xs">Grupo ativo</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NovoGrupoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Novo Grupo
      </Button>
      <GrupoDialog modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}

export function EditarGrupoButton({ grupo }: { grupo: Grupo }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-700 p-1" title="Editar">
        <Pencil size={14} />
      </button>
      <GrupoDialog key={grupo.id} modo="editar" inicial={grupo} open={open} onOpenChange={setOpen} />
    </>
  )
}
```

- [ ] **Step 3: Página**

Criar `src/app/(dashboard)/admin/grupos/page.tsx`:

```tsx
import { SuperAdminGuard } from '../components/admin-guard'
import { listarGruposAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NovoGrupoButton, EditarGrupoButton } from './components/grupo-dialog'

export default async function GruposPage() {
  const lista = await listarGruposAction()

  return (
    <SuperAdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Grupos</h1>
            <p className="text-slate-500 text-sm">Empresas (CNPJs) operadas no sistema</p>
          </div>
          <NovoGrupoButton />
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell>{g.cnpj}</TableCell>
                  <TableCell>
                    <Badge variant={g.ativo ? 'default' : 'secondary'}>{g.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </TableCell>
                  <TableCell><EditarGrupoButton grupo={g} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
```

- [ ] **Step 4: Card no menu Admin**

Em `src/app/(dashboard)/admin/page.tsx`, adicionar `Layers` ao import de `lucide-react` (linha 5) e inserir um novo `<Link>` logo após o card "Lojas" (após a linha 63, `</Link>` de Lojas):

```tsx
          <Link href="/admin/grupos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Layers className="text-slate-600" size={20} />
                <CardTitle className="text-base">Grupos</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Empresas (CNPJs) e integrações</p></CardContent>
            </Card>
          </Link>
```

- [ ] **Step 5: Testar manualmente**

`npm run dev`, logar como `admin_geral`, ir em Admin → Grupos, criar o grupo "BH" com CNPJ `63.009.605/0001-63`. Verificar que a barra de abas (Task 3) agora aparece no topo com "Sul de Minas" e "BH", e que clicar em "BH" troca a aba ativa (a página permanece a mesma, só o cookie muda).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/admin/grupos" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat: administracao de grupos em /admin/grupos"
```

---

## Task 5: `/admin/lojas` — coluna Grupo e criação de loja

**Files:**
- Modify: `src/app/(dashboard)/admin/lojas/page.tsx`
- Modify: `src/app/(dashboard)/admin/lojas/actions.ts`
- Create: `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx`

**Interfaces:**
- Consumes: `listarGruposAtivos` (Task 2), `criarLojaAction` (assinatura estendida)
- Produces: `criarLojaAction(formData)` agora exige `grupoId` no FormData

- [ ] **Step 1: Estender `criarLojaAction`**

Em `src/app/(dashboard)/admin/lojas/actions.ts`, atualizar `criarLojaAction`:

```ts
export async function criarLojaAction(formData: FormData) {
  await assertAdmin()
  const grupoId = formData.get('grupoId') as string
  if (!grupoId) throw new Error('Selecione o grupo')
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    grupoId,
  })
  revalidatePath('/admin/lojas')
}
```

- [ ] **Step 2: Dialog de criação**

Criar `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { criarLojaAction } from '../actions'

type Grupo = { id: string; nome: string }

export function NovaLojaDialog({ grupos, grupoIdDefault }: { grupos: Grupo[]; grupoIdDefault: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [endereco, setEndereco] = useState('')
  const [grupoId, setGrupoId] = useState(grupoIdDefault)

  async function handleSalvar() {
    if (!nome.trim() || !cidade.trim() || !endereco.trim() || !grupoId) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('nome', nome)
      formData.set('cidade', cidade)
      formData.set('endereco', endereco)
      formData.set('grupoId', grupoId)
      await criarLojaAction(formData)
      toast.success('Loja criada!')
      setOpen(false)
      setNome(''); setCidade(''); setEndereco('')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova Loja
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova Loja</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Grupo *</Label>
              <select
                value={grupoId}
                onChange={e => setGrupoId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço *</Label>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: Atualizar a página**

Substituir `src/app/(dashboard)/admin/lojas/page.tsx` inteiro por:

```tsx
import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { db } from '@/lib/db'
import { lojas, grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DesativarLojaButton } from './components/desativar-loja-button'
import { NovaLojaDialog } from './components/nova-loja-dialog'

export default async function LojasPage() {
  const usuario = await getUsuarioLogado()
  const isSuperAdmin = usuario.papel === 'admin_geral'

  const [todas, gruposOpts, grupoAtivo] = await Promise.all([
    db
      .select({
        id: lojas.id, nome: lojas.nome, cidade: lojas.cidade, endereco: lojas.endereco,
        ativa: lojas.ativa, grupoNome: grupos.nome,
      })
      .from(lojas)
      .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
      .orderBy(lojas.nome),
    isSuperAdmin ? listarGruposAtivos() : Promise.resolve([]),
    getGrupoAtivo(usuario),
  ])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lojas</h1>
            {!isSuperAdmin && (
              <p className="text-sm text-slate-400 mt-1">Visualização — alterações restritas ao Admin Geral</p>
            )}
          </div>
          {isSuperAdmin && <NovaLojaDialog grupos={gruposOpts} grupoIdDefault={grupoAtivo.id} />}
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                {isSuperAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {todas.map(loja => (
                <TableRow key={loja.id}>
                  <TableCell className="font-medium">{loja.nome}</TableCell>
                  <TableCell><Badge variant="outline">{loja.grupoNome}</Badge></TableCell>
                  <TableCell>{loja.cidade}</TableCell>
                  <TableCell>{loja.endereco}</TableCell>
                  <TableCell>
                    <Badge variant={loja.ativa ? 'default' : 'secondary'}>
                      {loja.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      {loja.ativa && <DesativarLojaButton lojaId={loja.id} />}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 4: Testar manualmente**

Logado como `admin_geral`, ir em Admin → Lojas, clicar "Nova Loja", selecionar grupo "BH", criar uma loja de teste. Confirmar que ela aparece na tabela com o Badge "BH". Trocar a aba ativa para "BH" (Task 3/4) e confirmar que a nova loja passa a aparecer nos dropdowns de loja das próximas tasks.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/lojas"
git commit -m "feat: criacao de loja vinculada a grupo em /admin/lojas"
```

---

## Task 6: Despesas — isolamento por grupo

**Files:**
- Modify: `src/app/(dashboard)/despesas/actions.ts`
- Modify: `src/app/(dashboard)/despesas/page.tsx`

**Interfaces:**
- Consumes: `despesas.grupoId` (Task 1), `getGrupoAtivo`, `listarLojasDoGrupoAtivo` (Task 2)

- [ ] **Step 1: Gravar `grupoId` ao criar despesa**

Em `src/app/(dashboard)/despesas/actions.ts`, importar `getGrupoAtivo` e usar no insert de `criarDespesaAction`:

```ts
'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
```

E em `criarDespesaAction`:

```ts
export async function criarDespesaAction(dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)
  const grupo = await getGrupoAtivo(usuario)

  await db.insert(despesas).values({
    grupoId:        grupo.id,
    lojaId:         dados.lojaId || null,
    usuarioId:      usuario.id,
    categoria:      dados.categoria,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}
```

`editarDespesaAction` e `excluirDespesaAction` não mudam (operam por `id`, já escopado no momento da criação).

- [ ] **Step 2: Filtrar por grupo na página**

Em `src/app/(dashboard)/despesas/page.tsx`, importar `getGrupoAtivo`, `listarLojasDoGrupoAtivo` e usar:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { Suspense } from 'react'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]

  const [rows, lojasOpts, totaisPorLoja] = await Promise.all([
    db
      .select({
        id:             despesas.id,
        lojaId:         despesas.lojaId,
        lojaNome:       lojas.nome,
        categoria:      despesas.categoria,
        descricao:      despesas.descricao,
        valor:          despesas.valor,
        data:           despesas.data,
        formaPagamento: despesas.formaPagamento,
        banco:          despesas.banco,
        usuarioNome:    usuarios.nome,
      })
      .from(despesas)
      .leftJoin(lojas,    eq(despesas.lojaId,    lojas.id))
      .innerJoin(usuarios, eq(despesas.usuarioId, usuarios.id))
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
      ))
      .orderBy(desc(despesas.data), desc(despesas.criadoEm)),

    listarLojasDoGrupoAtivo(usuario, { somenteAtivas: false }),

    db
      .select({
        lojaId:   despesas.lojaId,
        lojaNome: lojas.nome,
        total:    sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .leftJoin(lojas, eq(despesas.lojaId, lojas.id))
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
      ))
      .groupBy(despesas.lojaId, lojas.nome),
  ])

  const totalGeral   = rows.reduce((s, r) => s + Number(r.valor), 0)
  const totalLojas   = totaisPorLoja.filter(t => t.lojaId !== null).reduce((s, t) => s + Number(t.total), 0)
  const totalEmpresa = totaisPorLoja.filter(t => t.lojaId === null).reduce((s, t) => s + Number(t.total), 0)

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const mesExibicao = new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Despesas Operacionais</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{mesExibicao}</p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}><MesSelector mesAtual={mesParam} /></Suspense>
          <NovaDespesaButton lojas={lojasOpts} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total do Período</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalGeral)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Por Loja</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalLojas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Geral (Empresa)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalEmpresa)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos</CardTitle></CardHeader>
        <CardContent>
          <DespesasTable despesas={rows} lojas={lojasOpts} />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Testar manualmente**

Com o grupo "BH" ativo (Task 4/5), ir em `/despesas`, lançar uma despesa e confirmar que ela some ao trocar de volta para "Sul de Minas".

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/despesas"
git commit -m "feat: isolar despesas por grupo ativo"
```

---

## Task 7: Comunicados — isolamento por grupo

**Files:**
- Modify: `src/app/(dashboard)/admin/comunicados/actions.ts`

**Interfaces:**
- Consumes: `comunicados.grupoId` (Task 1), `getGrupoAtivo` (Task 2)

- [ ] **Step 1: Atualizar `actions.ts`**

Em `src/app/(dashboard)/admin/comunicados/actions.ts`, importar `getGrupoAtivo` e aplicar em todas as funções:

```ts
'use server'
import { db } from '@/lib/db'
import { comunicados, comunicadosLidos } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
  return u
}

export async function listarComunicadosAction() {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  return db
    .select({
      id: comunicados.id,
      titulo: comunicados.titulo,
      conteudo: comunicados.conteudo,
      ativo: comunicados.ativo,
      papeis: comunicados.papeis,
      dataPostagem: comunicados.dataPostagem,
      criadoEm: comunicados.criadoEm,
      totalLidos: sql<number>`(SELECT COUNT(*) FROM comunicados_lidos WHERE comunicado_id = ${comunicados.id})::int`,
    })
    .from(comunicados)
    .where(eq(comunicados.grupoId, grupo.id))
    .orderBy(sql`COALESCE(${comunicados.dataPostagem}, ${comunicados.criadoEm}) DESC`)
}

export async function criarComunicadoAction(dados: {
  titulo: string
  conteudo: string
  ativo: boolean
  papeis: string[]
  dataPostagem: string | null
}) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  if (!dados.titulo.trim()) throw new Error('Título obrigatório')
  if (!dados.conteudo.trim()) throw new Error('Conteúdo obrigatório')
  await db.insert(comunicados).values({
    grupoId: grupo.id,
    titulo: dados.titulo.trim(),
    conteudo: dados.conteudo.trim(),
    ativo: dados.ativo,
    papeis: dados.papeis,
    dataPostagem: dados.dataPostagem ? new Date(dados.dataPostagem) : null,
    criadoPorId: u.id,
  })
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function importarComunicadosAction(itens: {
  titulo: string
  conteudo: string
  ativo: boolean
  dataPostagem: string | null
}[]) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  if (!itens.length) throw new Error('Nenhum item para importar')
  await db.insert(comunicados).values(
    itens.map(i => ({
      grupoId: grupo.id,
      titulo: i.titulo.trim(),
      conteudo: i.conteudo.trim(),
      ativo: i.ativo,
      papeis: [] as string[],
      dataPostagem: i.dataPostagem ? new Date(i.dataPostagem) : null,
      criadoPorId: u.id,
    }))
  )
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db.update(comunicados).set({ ativo }).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function excluirComunicadoAction(id: string) {
  await requireAdmin()
  await db.delete(comunicados).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function marcarComoLidoAction(comunicadoId: string) {
  const u = await getUsuarioLogado()
  await db
    .insert(comunicadosLidos)
    .values({ comunicadoId, usuarioId: u.id })
    .onConflictDoNothing()
  revalidatePath('/', 'layout')
}

export async function buscarComunicadosNaoLidosAction() {
  const u = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(u)
  return db
    .select({ id: comunicados.id, titulo: comunicados.titulo, conteudo: comunicados.conteudo })
    .from(comunicados)
    .where(
      and(
        eq(comunicados.grupoId, grupo.id),
        eq(comunicados.ativo, true),
        sql`(${comunicados.dataPostagem} IS NULL OR ${comunicados.dataPostagem} <= now())`,
        sql`(array_length(${comunicados.papeis}, 1) IS NULL OR ${u.papel} = ANY(${comunicados.papeis}))`,
        sql`${comunicados.id} NOT IN (
          SELECT comunicado_id FROM comunicados_lidos WHERE usuario_id = ${u.id}
        )`
      )
    )
    .orderBy(sql`COALESCE(${comunicados.dataPostagem}, ${comunicados.criadoEm})`)
}
```

- [ ] **Step 2: Testar manualmente**

Criar um comunicado com o grupo "Sul de Minas" ativo; trocar para "BH" e confirmar em `/admin/comunicados` que a lista fica vazia; o modal de não-lidos (`ComunicadoModal`, disparado no layout) também deve respeitar o grupo do usuário logado.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/comunicados/actions.ts"
git commit -m "feat: isolar comunicados por grupo ativo"
```

---

## Task 8: Dashboard — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/lib/queries/dashboard.ts`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `getRankingLojas` aceita filtro de lojaId**

Em `src/lib/queries/dashboard.ts`, alterar a assinatura e o `where` de `getRankingLojas` (linhas 398-415):

```ts
export async function getRankingLojas(filtros: Omit<Filtros, 'vendedorId'>) {
  const { dataInicio, dataFim, lojaId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [gte(vendas.dataVenda, inicio), lte(vendas.dataVenda, fim)]
  if (lojaId?.length) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)

  return db
    .select({
      lojaId: vendas.lojaId,
      loja: lojas.nome,
      totalVendas: count(),
      faturamento: sum(vendas.valor),
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(and(...conditions))
    .groupBy(vendas.lojaId, lojas.nome)
    .orderBy(desc(sum(vendas.valor)))
}
```

- [ ] **Step 2: Escopar `dashboard/page.tsx`**

Em `src/app/(dashboard)/dashboard/page.tsx`:

1. Importar `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` de `@/lib/grupo` e remover o `getLojasOpts` com `unstable_cache` (linhas 31-34), já que agora depende do usuário/grupo:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
```

Remover:
```tsx
const getLojasOpts = unstable_cache(
  () => db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
  ['lojas-opts'], { revalidate: 300 },
)
```

2. Na função `DashboardPage`, trocar o cálculo de `lojaIds` (linhas 220-222):

```tsx
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaIds: string[] = params.loja
    ? [params.loja]
    : (isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : []))
```

3. Trocar a chamada `getLojasOpts()` (linha 243) pela lista de lojas do grupo ativo:

```tsx
  const [lojasOpts, vendedoresOpts] = await withTimeout(
    Promise.all([listarLojasDoGrupoAtivo(usuario), getVendedoresOpts()]),
    8000,
  )
```

4. Em `RankingSection`, passar `lojaId` para `getRankingLojas` — trocar a chamada em `filtrosRanking` (linha 238) para incluir `lojaId`:

```tsx
  const filtrosRanking = { dataInicio, dataFim, lojaId: filtros.lojaId }
```

- [ ] **Step 3: Testar manualmente**

Com o grupo "BH" ativo e ao menos uma loja BH criada (Task 5), acessar `/dashboard` como `admin_geral` sem filtro de loja: os dropdowns e os rankings devem mostrar apenas lojas do grupo BH. Trocar de volta para "Sul de Minas" e confirmar que volta ao normal.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx" "src/lib/queries/dashboard.ts"
git commit -m "feat: escopar dashboard ao grupo ativo"
```

---

## Task 9: Vendas — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/vendas/page.tsx`
- Modify: `src/lib/queries/vendas.ts`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `listarTodosPedidos` aceita filtro opcional de lojaIds**

Em `src/lib/queries/vendas.ts`, alterar `listarTodosPedidos` (linhas 107-131):

```ts
export async function listarTodosPedidos(lojaIds?: string[]) {
  return db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(lojaIds?.length ? inArray(pedidosVenda.lojaId, lojaIds) : undefined)
    .orderBy(pedidosVenda.dataPedido)
}
```

- [ ] **Step 2: Escopar `vendas/page.tsx`**

Importar os helpers e ajustar:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
```

Trocar o cálculo de `lojaValues` (linhas 82-84):

```tsx
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaValues     = params.loja !== undefined
    ? parseParam(params.loja)
    : (isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : []))
```

Trocar a chamada de pedidos (linha 91) e o dropdown de lojas (linha 115):

```tsx
  const [pedidos, vendasList, motosDisponiveis, lojasOpts, modelosOpts, vendedoresOpts] = await Promise.all([
    isAdmin ? listarTodosPedidos(lojaIdsGrupo) : listarPedidosPorLoja(usuario.lojaId!),
    listarVendas({
      lojaId:      lojaValues,
      modeloId:    parseParam(params.modelo),
      vendedorId:  vendedorValues,
      chassiBusca: params.q,
      notaFiscal:  params.nf,
      dataInicio,
      dataFim,
    }),
    db
      .select({
        id:       motos.id,
        chassi:   motos.chassi,
        cor:      motos.cor,
        marca:    modelos.marca,
        modelo:   modelos.modelo,
        lojaNome: lojas.nome,
        lojaId:   motos.lojaId,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .innerJoin(lojas,   eq(motos.lojaId,   lojas.id))
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIdsGrupo.length ? lojaIdsGrupo : lojaValues.length ? lojaValues : [usuario.lojaId ?? '']))),
    listarLojasDoGrupoAtivo(usuario),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, PAPEIS_VENDE as any[]))
      .orderBy(asc(usuarios.nome)),
  ])
```

Nota: a query de `motosDisponiveis` precisa de `and` já importado de `drizzle-orm` — confirmar que `and` está no import de `drizzle-orm` no topo do arquivo (adicionar se faltar): `import { eq, asc, inArray, and } from 'drizzle-orm'`.

- [ ] **Step 3: Testar manualmente**

Com "BH" ativo, ir em `/vendas` como `admin_geral` sem filtro: pedidos, motos disponíveis e dropdown de lojas devem mostrar só BH.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/vendas/page.tsx" "src/lib/queries/vendas.ts"
git commit -m "feat: escopar vendas ao grupo ativo"
```

---

## Task 10: Caixa — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/caixa/page.tsx`
- Modify: `src/app/(dashboard)/caixa/novo/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `caixa/page.tsx`**

Importar os helpers:

```tsx
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
```

Trocar os filtros (linhas 28-32) e o dropdown (linha 68):

```tsx
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []

  const lojaFiltroPadrao = lojaParam
    ? eq(lancamentosCaixa.lojaId, lojaParam)
    : (isAdmin ? inArray(lancamentosCaixa.lojaId, lojaIdsGrupo) : eq(lancamentosCaixa.lojaId, usuario.lojaId!))

  const filtros = and(
    gte(lancamentosCaixa.data, inicioMes),
    lte(lancamentosCaixa.data, ultimoDia),
    lojaFiltroPadrao,
  )

  const aprovadoresTbl = alias(usuarios, 'aprovadores')

  const filtroLojaSaldoAnterior = and(
    lojaFiltroPadrao,
    ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
  )
```

Adicionar `inArray` ao import de `drizzle-orm` no topo do arquivo: `import { eq, desc, and, gte, lte, lt, sql, ne, inArray } from 'drizzle-orm'`.

Trocar a query do dropdown (linha 68):

```tsx
    listarLojasDoGrupoAtivo(usuario),
```

- [ ] **Step 2: `caixa/novo/page.tsx`**

Importar `listarLojasDoGrupoAtivo` e trocar a query de lojas (linha 13):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { categoriasCaixa } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { NovoLancamentoForm } from './components/novo-lancamento-form'

export default async function NovoLancamentoPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const [lojasOpts, cats] = await Promise.all([
    listarLojasDoGrupoAtivo(usuario),
    db.select({ nome: categoriasCaixa.nome, tipo: categoriasCaixa.tipo })
      .from(categoriasCaixa)
      .where(eq(categoriasCaixa.ativo, true))
      .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome)),
  ])
  // ... resto do arquivo inalterado
```

- [ ] **Step 3: Testar manualmente**

Com "BH" ativo, `/caixa` e `/caixa/novo` devem mostrar só lojas BH nos dropdowns, e o saldo anterior/lançamentos sem filtro explícito devem restringir a lojas BH.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/caixa"
git commit -m "feat: escopar caixa ao grupo ativo"
```

---

## Task 11: Financeiro — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/financeiro/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: Escopar todas as queries sem filtro explícito**

Importar os helpers e adicionar `inArray` ao import de drizzle-orm:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { vendas, lancamentosCaixa, lojas, usuarios, motos, modelos, conciliacoesCartao, despesas } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, count, inArray } from 'drizzle-orm'
```

Logo após `if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')`, adicionar:

```tsx
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const grupo = await getGrupoAtivo(usuario)
```

Trocar a definição dos filtros (linhas 38-40):

```tsx
  const lojaFiltroVendas = lojaParam ? eq(vendas.lojaId, lojaParam) : inArray(vendas.lojaId, lojaIdsGrupo)
  const lojaFiltroCaixa = lojaParam ? eq(lancamentosCaixa.lojaId, lojaParam) : inArray(lancamentosCaixa.lojaId, lojaIdsGrupo)
  const lojaCondPagamento = lojaParam
    ? sql`AND ${vendas.lojaId} = ${lojaParam}`
    : sql`AND ${vendas.lojaId} IN (${sql.join(lojaIdsGrupo.map(id => sql`${id}`), sql`, `)})`
```

Trocar a query `resumoPorLoja` (linhas 96-110) para restringir `.from(lojas)` ao grupo, e a query do dropdown (linha 112):

```tsx
    db
      .select({
        lojaId: lojas.id,
        lojaNome: lojas.nome,
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        qtdVendas: count(),
      })
      .from(lojas)
      .leftJoin(vendas, and(
        eq(vendas.lojaId, lojas.id),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .where(inArray(lojas.id, lojaIdsGrupo))
      .groupBy(lojas.id, lojas.nome)
      .orderBy(lojas.nome),

    listarLojasDoGrupoAtivo(usuario),
```

Trocar os filtros de despesas (linhas 145-157 e 159-174), que hoje usam `lojaParam ? sql\`...\` : undefined` (sem filtro de grupo) — usar `grupo.id` (já declarado acima junto com `lojaIdsGrupo`) para restringir ao grupo ativo:

```tsx
    // Total de despesas do período (loja filtrada + gerais)
    db
      .select({
        total: sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
        lojaParam
          ? sql`(${despesas.lojaId} = ${lojaParam} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      )),

    // Despesas agrupadas por categoria
    db
      .select({
        categoria: despesas.categoria,
        total:     sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
        lojaParam
          ? sql`(${despesas.lojaId} = ${lojaParam} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      ))
      .groupBy(despesas.categoria)
      .orderBy(sql`SUM(${despesas.valor}) DESC`),
```

- [ ] **Step 2: Testar manualmente**

Com "BH" ativo, `/financeiro` sem filtro de loja deve mostrar vendas/caixa/despesas apenas das lojas BH; o dropdown de lojas também.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/financeiro/page.tsx"
git commit -m "feat: escopar financeiro ao grupo ativo"
```

---

## Task 12: Garantias — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/garantias/page.tsx`
- Modify: `src/app/garantias-relatorio/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `garantias/page.tsx`**

Importar os helpers e adicionar `inArray` ao import de drizzle-orm:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarGarantias } from '@/lib/queries/garantias'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { motos, modelos, ordensServico, lojas } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
```

`listarGarantias` só aceita `lojaId?: string` (singular). Para o caso "admin sem filtro", não há um único lojaId — a solução é filtrar depois em memória, ou (mais simples e no mesmo padrão do resto do arquivo) restringir a query de motos/lojas do dropdown e passar `undefined` para `listarGarantias` mas então filtrar a lista resultante pelas lojas do grupo. Trocar o trecho (linhas 27-58):

```tsx
  const lojaFiltro   = isAdmin ? params.loja : (usuario.lojaId ?? undefined)
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const statusFiltro = params.status
  const modeloFiltro = params.modelo

  const [listaBruta, motosParaGarantia, ordensAbertas, lojasOpts, modelosOpts] = await Promise.all([
    listarGarantias({
      lojaId:               lojaFiltro,
      status:               statusFiltro,
      chassiBusca:          params.q,
      numeroPedidoFabrica:  params.nf,
      modeloId:             modeloFiltro,
    }),

    isAdmin
      ? db.select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
          .from(motos).innerJoin(modelos, eq(motos.modeloId, modelos.id))
          .where(inArray(motos.status, ['faturada', 'montada', 'disponivel', 'em_garantia']))
      : db.select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
          .from(motos).innerJoin(modelos, eq(motos.modeloId, modelos.id))
          .where(eq(motos.lojaId, usuario.lojaId!)),

    db.select({ id: ordensServico.id, descricao: ordensServico.descricao, motoId: ordensServico.motoId })
      .from(ordensServico)
      .where(inArray(ordensServico.status, ['aberta', 'em_andamento'])),

    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),

    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
  ])

  const lista = isAdmin && !lojaFiltro
    ? listaBruta.filter(g => lojaIdsGrupo.includes(g.lojaId))
    : listaBruta
```

Nenhuma outra parte do arquivo muda — todo uso de `lista` abaixo já referencia a variável renomeada.

- [ ] **Step 2: `garantias-relatorio/page.tsx`**

Importar `listarLojaIdsDoGrupoAtivo`, `listarLojasDoGrupoAtivo`, `getGrupoAtivo` de `@/lib/grupo`. Trocar (linhas 44-58):

```tsx
  const params = await searchParams
  const isAdmin = ADMINS.includes(usuario.papel)
  const lojaIdFiltro = isAdmin ? params.lojaId : (usuario.lojaId ?? undefined)
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const grupo = await getGrupoAtivo(usuario)

  const [rowsBrutas, lojasDb] = await Promise.all([
    exportarRelatorioGarantias({
      status:        params.status        || undefined,
      lojaId:        lojaIdFiltro,
      modeloId:      params.modeloId      || undefined,
      statusFabrica: params.statusFabrica || undefined,
      dataInicio:    params.dataInicio    || undefined,
      dataFim:       params.dataFim       || undefined,
    }),
    isAdmin ? listarLojasDoGrupoAtivo(usuario, { somenteAtivas: false }) : Promise.resolve([]),
  ])

  const rows = isAdmin && !lojaIdFiltro
    ? rowsBrutas.filter(r => lojasDb.some(l => l.nome === r.lojaNome))
    : rowsBrutas
```

E substituir o texto fixo "Moto Chefe Sul de Minas" (linhas 219 e 352) pelo nome do grupo ativo:

```tsx
              <div className="brand-name">Moto Chefe {grupo.nome}</div>
```
```tsx
          <span>MOVA — Sistema de Gestão · Moto Chefe {grupo.nome}</span>
```

- [ ] **Step 3: Testar manualmente**

Com "BH" ativo, `/garantias` e `/garantias-relatorio` (sem filtro de loja) devem mostrar só garantias de lojas BH; o relatório impresso deve exibir "Moto Chefe BH" no cabeçalho.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/garantias/page.tsx" "src/app/garantias-relatorio/page.tsx"
git commit -m "feat: escopar garantias e relatorio ao grupo ativo"
```

---

## Task 13: Transferências e Estoque — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/transferencias/page.tsx`
- Modify: `src/app/(dashboard)/estoque/page.tsx`
- Modify: `src/app/(dashboard)/estoque/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `transferencias/page.tsx`**

`listarTransferencias` já aceita `lojaOrigemId`/`lojaDestinoId` como arrays quando `isAdmin`, hoje `undefined` (mostra tudo). Importar os helpers e trocar:

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarTransferencias } from '@/lib/queries/transferencias'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { motos, modelos } from '@/lib/db/schema'
import { eq, inArray, asc } from 'drizzle-orm'
```

Trocar (linhas 26-42):

```tsx
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []

  const [lista, todasLojas, motosTransferiveis, modelosOpts] = await Promise.all([
    listarTransferencias({
      lojaId:        !isAdmin ? (usuario.lojaId ?? undefined) : undefined,
      lojaOrigemId:  isAdmin ? (parseParam(params.origem).length ? parseParam(params.origem) : lojaIdsGrupo)  : undefined,
      lojaDestinoId: isAdmin ? (parseParam(params.destino).length ? parseParam(params.destino) : lojaIdsGrupo) : undefined,
      modeloId:      parseParam(params.modelo),
      status:        parseParam(params.status),
      chassiBusca:   params.q,
    }),
    listarLojasDoGrupoAtivo(usuario),
    db
      .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo, lojaId: motos.lojaId })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(inArray(motos.status, ['caixa', 'faturada', 'montada', 'disponivel', 'reservada', 'em_garantia'])),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
  ])
```

> Nota: `motosTransferiveis` continua sem filtro de loja pois já é filtrado visualmente por origem/destino nos componentes; se notar vazamento entre grupos ao testar, restrinja com `.where(and(inArray(motos.status, [...]), inArray(motos.lojaId, lojaIdsGrupo)))` (import `and` adicional).

- [ ] **Step 2: `estoque/page.tsx`**

Importar `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`. Trocar (linhas 31-57):

```tsx
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaParam = parseParam(params.loja)
  const lojaValues = lojaParam.length > 0
    ? lojaParam
    : (isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : []))

  const validOrds = ['modelo', 'cor', 'loja', 'status', 'disponibilidade'] as const
  type Ord = typeof validOrds[number]
  const ord = validOrds.includes(params.ord as Ord) ? (params.ord as Ord) : 'modelo'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'

  const [motosList, lojasOpts, modelosOpts, coresOpts, usuariosOpts, mecanicosOpts] = await Promise.all([
    listarMotos({
      status:          parseParam(params.status),
      disponibilidade: dispValues.length ? dispValues : undefined,
      excluirVendidas: true,
      chassiBusca:     params.q,
      lojaId:          lojaValues,
      modeloId:        parseParam(params.modelo),
      cor:             parseParam(params.cor),
      ord,
      dir,
    }),
    listarLojasDoGrupoAtivo(usuario),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
    db.selectDistinct({ cor: motos.cor }).from(motos).orderBy(motos.cor),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).orderBy(usuarios.nome),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'mecanico')).orderBy(usuarios.nome),
  ])
```

- [ ] **Step 3: `estoque/[id]/page.tsx`**

Importar `listarLojasDoGrupoAtivo`. Trocar a query de lojas (linha 30):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
```

```tsx
  const [mecanicos, lojasOpts, usuariosOpts, modelosOpts, precRow, taxasRow] = await Promise.all([
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'mecanico')),
    listarLojasDoGrupoAtivo(usuario),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).orderBy(usuarios.nome),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
    db.select({ valorMinimo: precificacao.valorMinimo })
      .from(precificacao)
      .where(and(eq(precificacao.nome, moto.modelo), eq(precificacao.ativo, true)))
      .limit(1),
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.id, 1)),
  ])
```

(`usuario` já está disponível na função via `getUsuarioLogado()` na linha 24 do arquivo original.)

- [ ] **Step 4: Testar manualmente**

Com "BH" ativo: `/transferencias`, `/estoque` e o detalhe de uma moto BH devem mostrar apenas lojas/motos do grupo BH nos dropdowns e listagens padrão.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/transferencias/page.tsx" "src/app/(dashboard)/estoque"
git commit -m "feat: escopar transferencias e estoque ao grupo ativo"
```

---

## Task 14: Ordens de Serviço e Demandas — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/page.tsx`
- Modify: `src/lib/queries/ordens-servico.ts`
- Modify: `src/app/(dashboard)/demandas/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `listarTodasOS` aceita filtro de lojaIds**

Em `src/lib/queries/ordens-servico.ts`, alterar `listarTodasOS` (linhas 61-90) para aceitar `lojaId?: string[]`:

```ts
export async function listarTodasOS(filtros?: {
  status?: string[]
  tipoOs?: string[]
  busca?: string
  lojaId?: string[]
}) {
  const mecanico = alias(usuarios, 'mecanico')
  return db
    .select(buildSelect(mecanico))
    .from(ordensServico)
    .innerJoin(lojas,    eq(ordensServico.lojaId,    lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor,  usuarios.id))
    .leftJoin(motos,     eq(ordensServico.motoId,    motos.id))
    .leftJoin(modelos,   eq(motos.modeloId,          modelos.id))
    .leftJoin(mecanico,  eq(ordensServico.mecanicoId, mecanico.id))
    .leftJoin(clientes,  eq(ordensServico.clienteId,  clientes.id))
    .where(and(
      filtros?.status?.length   ? inArray(ordensServico.status, filtros.status as any[]) : undefined,
      filtros?.tipoOs?.length   ? inArray(ordensServico.tipoOs, filtros.tipoOs) : undefined,
      filtros?.lojaId?.length   ? inArray(ordensServico.lojaId, filtros.lojaId) : undefined,
      filtros?.busca?.trim()    ? or(
        ilike(motos.chassi,             `%${filtros.busca}%`),
        ilike(ordensServico.marcaExterna,  `%${filtros.busca}%`),
        ilike(ordensServico.modeloExterno, `%${filtros.busca}%`),
        ilike(ordensServico.placa,         `%${filtros.busca}%`),
        ilike(clientes.nome,              `%${filtros.busca}%`),
        ilike(ordensServico.clienteNomeExterno, `%${filtros.busca}%`),
        sql`${ordensServico.numero}::text ILIKE ${'%' + filtros.busca + '%'}`,
      ) : undefined,
    ))
    .orderBy(desc(ordensServico.dataAbertura))
}
```

- [ ] **Step 2: `ordens-servico/page.tsx`**

Importar `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`. Trocar (linhas 29-36):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarOSPorLoja, listarTodasOS } from '@/lib/queries/ordens-servico'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
```

```tsx
  const [lista, mecanicos, lojasOpts] = await Promise.all([
    isAdmin
      ? listarTodasOS({ status: statusFiltro, tipoOs: tipoFiltro, busca: params.q, lojaId: await listarLojaIdsDoGrupoAtivo(usuario) })
      : listarOSPorLoja(usuario.lojaId!),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios).where(inArray(usuarios.papel, ['mecanico', 'aux_adm', 'admin_geral', 'admin_socio'] as any[])),
    listarLojasDoGrupoAtivo(usuario),
  ])
```

- [ ] **Step 3: `demandas/page.tsx`**

Importar `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`, adicionar `inArray` ao import de drizzle-orm. Trocar (linhas 14-22):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { demandas, lojas, usuarios } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
```

```tsx
  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  const where = isAdmin
    ? inArray(demandas.lojaId, await listarLojaIdsDoGrupoAtivo(usuario))
    : (usuario.lojaId ? eq(demandas.lojaId, usuario.lojaId) : undefined)
```

- [ ] **Step 4: Testar manualmente**

Com "BH" ativo: `/ordens-servico` e `/demandas` sem filtro devem mostrar só registros de lojas BH; dropdowns idem.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico" "src/lib/queries/ordens-servico.ts" "src/app/(dashboard)/demandas"
git commit -m "feat: escopar ordens de servico e demandas ao grupo ativo"
```

---

## Task 15: Compras, Ações Admin, Entrada e Agenda — escopo por grupo

**Files:**
- Modify: `src/app/(dashboard)/compras/page.tsx`
- Modify: `src/lib/queries/compras.ts`
- Modify: `src/app/(dashboard)/admin/acoes/page.tsx`
- Modify: `src/app/(dashboard)/entrada/page.tsx`
- Modify: `src/app/(dashboard)/agenda/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo` (Task 2)

- [ ] **Step 1: `listarDadosCompras` aceita lista de lojas do grupo**

Em `src/lib/queries/compras.ts`, alterar a assinatura e as duas condições de `lojaId` (linhas 32, 47-50, 65-68):

```ts
export async function listarDadosCompras(lojaId: string | undefined, grupoLojaIds: string[]): Promise<GrupoCompra[]> {
  const quinzeDiasAtras = new Date()
  quinzeDiasAtras.setDate(quinzeDiasAtras.getDate() - 15)

  const lojaCond = lojaId ? eq(motos.lojaId, lojaId) : inArray(motos.lojaId, grupoLojaIds)

  const [estoqueRows, vendasRows] = await Promise.all([
    db
      .select({
        modeloId: motos.modeloId,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        qtd: sql<number>`count(*)::int`,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        sql`(${motos.status}::text != 'vendida' AND ${motos.disponibilidade} IS DISTINCT FROM 'vendida'::disponibilidade_moto)`,
        lojaCond,
      ))
      .groupBy(motos.modeloId, modelos.modelo, modelos.marca, motos.cor),

    db
      .select({
        modeloId: motos.modeloId,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        qtd: sql<number>`count(*)::int`,
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        gte(vendas.dataVenda, quinzeDiasAtras),
        lojaCond,
      ))
      .groupBy(motos.modeloId, modelos.modelo, modelos.marca, motos.cor),
  ])
  // ... resto do arquivo inalterado
```

Adicionar `inArray` ao import de `drizzle-orm` no topo: `import { eq, and, gte, sql, inArray } from 'drizzle-orm'`.

- [ ] **Step 2: `compras/page.tsx`**

Importar `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`. Trocar (linhas 121-130):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarDadosCompras } from '@/lib/queries/compras'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
```

```tsx
  const lojaFiltro = isAdmin ? params.loja : (usuario.lojaId ?? undefined)

  const [grupos, lojasOpts] = await Promise.all([
    listarDadosCompras(lojaFiltro, isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : (usuario.lojaId ? [usuario.lojaId] : [])),
    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),
  ])
```

- [ ] **Step 3: `admin/acoes/page.tsx`**

Esta página é `SuperAdminGuard` (só `admin_geral`); vamos escopá-la ao grupo ativo para não misturar motos/lojas de outro grupo na reatribuição. Importar `getUsuarioLogado`, `listarLojasDoGrupoAtivo`, `listarLojaIdsDoGrupoAtivo`:

```tsx
import { SuperAdminGuard as AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { motos, modelos } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { ReatribuirLojaForm } from './components/reatribuir-loja-form'

export default async function AcoesAdminPage() {
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [motosFaturadas, todasLojas] = await Promise.all([
    db
      .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, marca: modelos.marca, modelo: modelos.modelo })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(eq(motos.status, 'faturada'), inArray(motos.lojaId, lojaIdsGrupo))),
    listarLojasDoGrupoAtivo(usuario),
  ])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Ações Administrativas</h1>
        <ReatribuirLojaForm motos={motosFaturadas} lojas={todasLojas} />
      </div>
    </AdminGuard>
  )
}
```

Adicionar `and` ao import de `drizzle-orm`: `import { eq, and, inArray } from 'drizzle-orm'`.

- [ ] **Step 4: `entrada/page.tsx`**

Importar `listarLojasDoGrupoAtivo`. Trocar (linhas 11-20):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { modelos } from '@/lib/db/schema'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { EntradaForm } from './components/entrada-form'

export default async function EntradaPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')

  const [modelosOpts, lojasOpts] = await Promise.all([
    db
      .select({ id: modelos.id, modelo: modelos.modelo, marca: modelos.marca, precoCompraPadrao: modelos.precoCompraPadrao })
      .from(modelos)
      .orderBy(modelos.marca, modelos.modelo),
    listarLojasDoGrupoAtivo(usuario),
  ])
```

- [ ] **Step 5: `agenda/page.tsx`**

Importar `listarLojasDoGrupoAtivo`. Trocar a query de lojas (linha 43):

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarAgendamentos } from '@/lib/queries/agendamentos'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
```

```tsx
  const [lista, mecanicos, lojasOpts] = await Promise.all([
    listarAgendamentos({ lojaId: lojaFiltro ?? undefined, dataInicio, dataFim }),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, ['mecanico', 'aux_adm', 'admin_geral', 'admin_socio'] as any[])),
    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),
  ])
```

- [ ] **Step 6: Testar manualmente**

Com "BH" ativo: `/compras`, `/admin/acoes`, `/entrada`, `/agenda` devem mostrar só lojas/dados BH.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/compras" "src/lib/queries/compras.ts" "src/app/(dashboard)/admin/acoes" "src/app/(dashboard)/entrada" "src/app/(dashboard)/agenda"
git commit -m "feat: escopar compras, acoes admin, entrada e agenda ao grupo ativo"
```

---

## Task 16: Admin Usuários — dropdown de lojas por grupo

**Files:**
- Modify: `src/app/(dashboard)/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `listarLojasDoGrupoAtivo` (Task 2)

- [ ] **Step 1: Escopar o dropdown de lojas**

A tabela de usuários continua listando todos os usuários do sistema (útil para `admin_geral` gerenciar ambos os grupos de um só lugar); apenas o dropdown de lojas ao criar/editar um usuário passa a refletir o grupo ativo. Substituir `src/app/(dashboard)/admin/usuarios/page.tsx` por:

```tsx
import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { UsuariosTable } from './components/usuarios-table'

export default async function UsuariosPage() {
  const usuario = await getUsuarioLogado()

  const [todos, lojasOpts] = await Promise.all([
    db
      .select({
        id:       usuarios.id,
        nome:     usuarios.nome,
        email:    usuarios.email,
        papel:    usuarios.papel,
        lojaId:   usuarios.lojaId,
        lojaNome: lojas.nome,
      })
      .from(usuarios)
      .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .orderBy(asc(usuarios.nome)),
    listarLojasDoGrupoAtivo(usuario),
  ])

  return (
    <SuperAdminGuard>
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie os acessos ao sistema</p>
        </div>
        <UsuariosTable usuarios={todos} lojas={lojasOpts} />
      </div>
    </SuperAdminGuard>
  )
}
```

- [ ] **Step 2: Testar manualmente**

Com "BH" ativo, `/admin/usuarios` → criar/editar usuário: o select de loja deve mostrar apenas lojas BH.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/usuarios/page.tsx"
git commit -m "feat: escopar dropdown de lojas em admin/usuarios ao grupo ativo"
```

---

## Verificação final

- [ ] Rodar `npm run type-check` — sem erros em todo o projeto.
- [ ] Rodar `npm run dev`, criar o grupo "BH" com uma loja de teste, e navegar por: dashboard, vendas, caixa, financeiro, despesas, garantias, garantias-relatorio, transferências, estoque, ordens de serviço, demandas, compras, admin/acoes, entrada, agenda, admin/usuarios, admin/comunicados — alternando entre as abas "Sul de Minas" e "BH" — confirmando que nenhum dado de um grupo aparece no outro.
- [ ] Confirmar que um usuário não-admin (ex: vendedor de uma loja Sul de Minas) continua vendo exatamente os mesmos dados de antes, sem qualquer seletor de grupo visível.
