# Comunicados Internos — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Canal de comunicação interna com modal bloqueante ao logar, confirmação LIDO registrada em banco, e gestão via /admin/comunicados.

**Architecture:** Duas novas tabelas no banco (comunicados + comunicados_lidos). Layout do dashboard consulta comunicados não lidos e renderiza Client Component modal. Server Actions para criar/gerenciar comunicados e marcar como lido.

**Tech Stack:** Drizzle ORM, Next.js Server Components + Server Actions, shadcn/ui Dialog, Supabase MCP para migration.

## Global Constraints
- Apenas `admin_geral` e `admin_socio` gerenciam comunicados (usar `requireAdmin()` padrão)
- Modal bloqueante: sem botão fechar, apenas LIDO
- Múltiplos comunicados: exibir um por vez, avançar após LIDO
- Após confirmação, nunca mais mostra para aquele usuário
- Seguir padrões do projeto: Drizzle, Server Actions com revalidatePath

---

### Task 1: Schema + Migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Migration via Supabase MCP

- [ ] **Step 1: Adicionar tabelas ao schema.ts**

No final de `src/lib/db/schema.ts`, adicionar:

```ts
// ─── comunicados ─────────────────────────────────────────────────────────────
export const comunicados = pgTable('comunicados', {
  id: uuid('id').primaryKey().defaultRandom(),
  titulo: text('titulo').notNull(),
  conteudo: text('conteudo').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── comunicados_lidos ───────────────────────────────────────────────────────
export const comunicadosLidos = pgTable('comunicados_lidos', {
  comunicadoId: uuid('comunicado_id').notNull().references(() => comunicados.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  lidoEm: timestamp('lido_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.comunicadoId, t.usuarioId] }),
}))
```

Adicionar `primaryKey` ao import do drizzle-orm/pg-core no topo do schema.

- [ ] **Step 2: Aplicar migration via Supabase MCP**

SQL da migration:

```sql
CREATE TABLE comunicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por_id uuid REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comunicados_lidos (
  comunicado_id uuid NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comunicado_id, usuario_id)
);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: schema comunicados e comunicados_lidos"
```

---

### Task 2: Server Actions

**Files:**
- Create: `src/app/(dashboard)/admin/comunicados/actions.ts`

- [ ] **Step 1: Criar actions.ts**

```ts
'use server'
import { db } from '@/lib/db'
import { comunicados, comunicadosLidos } from '@/lib/db/schema'
import { eq, and, notInArray, count, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
  return u
}

export async function listarComunicadosAction() {
  return db
    .select({
      id: comunicados.id,
      titulo: comunicados.titulo,
      conteudo: comunicados.conteudo,
      ativo: comunicados.ativo,
      criadoEm: comunicados.criadoEm,
      totalLidos: sql<number>`(SELECT COUNT(*) FROM comunicados_lidos WHERE comunicado_id = ${comunicados.id})::int`,
    })
    .from(comunicados)
    .orderBy(sql`${comunicados.criadoEm} DESC`)
}

export async function criarComunicadoAction(dados: { titulo: string; conteudo: string; ativo: boolean }) {
  const u = await requireAdmin()
  if (!dados.titulo.trim()) throw new Error('Título obrigatório')
  if (!dados.conteudo.trim()) throw new Error('Conteúdo obrigatório')
  await db.insert(comunicados).values({
    titulo: dados.titulo.trim(),
    conteudo: dados.conteudo.trim(),
    ativo: dados.ativo,
    criadoPorId: u.id,
  })
  revalidatePath('/admin/comunicados')
  revalidatePath('/dashboard')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db.update(comunicados).set({ ativo }).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/dashboard')
}

export async function excluirComunicadoAction(id: string) {
  await requireAdmin()
  await db.delete(comunicados).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/dashboard')
}

export async function marcarComoLidoAction(comunicadoId: string) {
  const u = await getUsuarioLogado()
  await db
    .insert(comunicadosLidos)
    .values({ comunicadoId, usuarioId: u.id })
    .onConflictDoNothing()
  revalidatePath('/dashboard')
}

export async function buscarComunicadosNaoLidosAction(usuarioId: string) {
  const lidos = db
    .select({ comunicadoId: comunicadosLidos.comunicadoId })
    .from(comunicadosLidos)
    .where(eq(comunicadosLidos.usuarioId, usuarioId))

  return db
    .select({ id: comunicados.id, titulo: comunicados.titulo, conteudo: comunicados.conteudo })
    .from(comunicados)
    .where(
      and(
        eq(comunicados.ativo, true),
        sql`${comunicados.id} NOT IN (${lidos})`,
      )
    )
    .orderBy(comunicados.criadoEm)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/admin/comunicados/actions.ts
git commit -m "feat: server actions de comunicados"
```

---

### Task 3: Modal Client Component

**Files:**
- Create: `src/app/(dashboard)/components/comunicado-modal.tsx`

- [ ] **Step 1: Criar comunicado-modal.tsx**

```tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { marcarComoLidoAction } from '@/app/(dashboard)/admin/comunicados/actions'

type Comunicado = { id: string; titulo: string; conteudo: string }

export function ComunicadoModal({ comunicados }: { comunicados: Comunicado[] }) {
  const [indice, setIndice] = useState(0)
  const [aberto, setAberto] = useState(comunicados.length > 0)
  const [loading, setLoading] = useState(false)

  if (!aberto || comunicados.length === 0) return null

  const atual = comunicados[indice]

  async function handleLido() {
    setLoading(true)
    await marcarComoLidoAction(atual.id)
    if (indice + 1 < comunicados.length) {
      setIndice(i => i + 1)
    } else {
      setAberto(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{atual.titulo}</DialogTitle>
          {comunicados.length > 1 && (
            <p className="text-xs text-slate-400">{indice + 1} de {comunicados.length}</p>
          )}
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap py-2">
          {atual.conteudo}
        </div>
        <DialogFooter>
          <Button onClick={handleLido} disabled={loading} className="w-full">
            {loading ? 'Registrando...' : 'LIDO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/components/comunicado-modal.tsx
git commit -m "feat: ComunicadoModal — modal bloqueante de comunicados"
```

---

### Task 4: Integrar Modal no Layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Atualizar layout.tsx**

```tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado } from '@/lib/auth'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  const comunicadosNaoLidos = await buscarComunicadosNaoLidosAction(usuario.id)

  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar papel={usuario.papel} />
        <div className="flex-1 flex flex-col">
          <Header />
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

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: integrar ComunicadoModal no dashboard layout"
```

---

### Task 5: Página de Gestão /admin/comunicados

**Files:**
- Create: `src/app/(dashboard)/admin/comunicados/page.tsx`
- Create: `src/app/(dashboard)/admin/comunicados/components/comunicado-form.tsx`
- Create: `src/app/(dashboard)/admin/comunicados/components/comunicados-table.tsx`

- [ ] **Step 1: Criar comunicado-form.tsx**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { criarComunicadoAction } from '../actions'

export function ComunicadoForm({ onSuccess }: { onSuccess?: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      await criarComunicadoAction({ titulo, conteudo, ativo })
      setTitulo('')
      setConteudo('')
      setAtivo(true)
      onSuccess?.()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Título</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Novo procedimento de venda" required />
      </div>
      <div className="space-y-1">
        <Label>Mensagem</Label>
        <Textarea value={conteudo} onChange={e => setConteudo(e.target.value)} rows={5} placeholder="Escreva a mensagem completa..." required />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="ativo" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-4 w-4" />
        <Label htmlFor="ativo">Publicar imediatamente</Label>
      </div>
      {erro && <p className="text-sm text-red-500">{erro}</p>}
      <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Criar Comunicado'}</Button>
    </form>
  )
}
```

- [ ] **Step 2: Criar comunicados-table.tsx**

```tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleAtivoAction, excluirComunicadoAction } from '../actions'

type Comunicado = {
  id: string
  titulo: string
  conteudo: string
  ativo: boolean
  criadoEm: Date
  totalLidos: number
}

export function ComunicadosTable({ comunicados }: { comunicados: Comunicado[] }) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleToggle(id: string, ativo: boolean) {
    setLoading(id)
    await toggleAtivoAction(id, !ativo)
    setLoading(null)
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este comunicado? Todos os registros de confirmação também serão apagados.')) return
    setLoading(id)
    await excluirComunicadoAction(id)
    setLoading(null)
  }

  if (comunicados.length === 0) {
    return <p className="text-sm text-slate-400">Nenhum comunicado criado ainda.</p>
  }

  return (
    <div className="divide-y">
      {comunicados.map(c => (
        <div key={c.id} className="py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{c.titulo}</span>
              <Badge variant={c.ativo ? 'default' : 'secondary'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
            </div>
            <p className="text-xs text-slate-500 line-clamp-2">{c.conteudo}</p>
            <p className="text-xs text-slate-400 mt-1">
              {new Date(c.criadoEm).toLocaleDateString('pt-BR')} · {c.totalLidos} confirmação{c.totalLidos !== 1 ? 'ões' : ''}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={loading === c.id}
              onClick={() => handleToggle(c.id, c.ativo)}
            >
              {c.ativo ? 'Desativar' : 'Ativar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading === c.id}
              onClick={() => handleExcluir(c.id)}
              className="text-red-500 hover:text-red-700"
            >
              Excluir
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Criar page.tsx**

```tsx
import { AdminGuard } from '../../components/admin-guard'
import { listarComunicadosAction } from './actions'
import { ComunicadoForm } from './components/comunicado-form'
import { ComunicadosTable } from './components/comunicados-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ComunicadosPage() {
  const lista = await listarComunicadosAction()

  return (
    <AdminGuard>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Comunicados</h1>
          <p className="text-slate-500 text-sm">Canal oficial de comunicação interna</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Comunicado</CardTitle>
          </CardHeader>
          <CardContent>
            <ComunicadoForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comunicados</CardTitle>
          </CardHeader>
          <CardContent>
            <ComunicadosTable comunicados={lista} />
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/admin/comunicados/
git commit -m "feat: página /admin/comunicados com listagem e formulário"
```

---

### Task 6: Link no /admin

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1: Adicionar import e card de Comunicados**

Adicionar `Megaphone` ao import de lucide-react e inserir o card na grade:

```tsx
import { Building2, Users, Bike, Settings2, Tags, Megaphone } from 'lucide-react'
```

Card (visível para `admin_geral` e `admin_socio`, inserir após o card de Categorias Caixa):

```tsx
<Link href="/admin/comunicados">
  <Card className="hover:shadow-md transition-shadow cursor-pointer">
    <CardHeader className="flex-row gap-3 items-center pb-2">
      <Megaphone className="text-slate-600" size={20} />
      <CardTitle className="text-base">Comunicados</CardTitle>
    </CardHeader>
    <CardContent><p className="text-sm text-slate-500">Canal de comunicação interna</p></CardContent>
  </Card>
</Link>
```

O card deve aparecer para `admin_geral` e `admin_socio` (ambos já têm acesso ao AdminGuard).

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/admin/page.tsx
git commit -m "feat: link Comunicados na página de Admin"
```
