# Menu Conecta + campo por usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada usuário ganha um link individual (`conecta`) preenchido pelo admin no cadastro; um item de menu "Conecta" abre esse link do usuário logado em nova aba, aparecendo só para quem tem link.

**Architecture:** Nova coluna `conecta` (text nullable) em `usuarios`. O campo é editado no formulário admin de usuários e persistido nas server actions de criar/editar. O layout do dashboard já carrega o usuário logado via `getUsuarioLogado` (que faz `select()` da linha inteira), então `usuario.conecta` fica disponível automaticamente e é passado para a `Sidebar`, que renderiza o item "Conecta" como link externo quando presente.

**Tech Stack:** Next.js (App Router), Drizzle ORM, Supabase (Auth + Postgres via MCP), React client components, lucide-react, @base-ui/react (Select/Dialog wrappers em `@/components/ui`).

## Global Constraints

- **Migrações:** NUNCA usar `db:generate`/`db:migrate` (journal quebrado). Aplicar SQL manual via Supabase MCP `apply_migration`. Espelhar a coluna no `schema.ts` à mão.
- **Idioma:** UI e mensagens em pt-BR.
- **Autorização:** edição de usuário permanece restrita a `admin_geral` (via `assertAdmin`, já existente). Não alterar.
- **Sem test framework:** não existe runner de testes no repo. Verificação = `npm run type-check` (deve passar sem erros) + checagem manual no browser. Não inventar arquivos de teste.
- **Valor vazio → null:** string vazia do input deve ser gravada como `null` na coluna `conecta`.

---

### Task 1: Coluna `conecta` no banco + schema Drizzle

**Files:**
- Migração: via Supabase MCP `apply_migration` (não é arquivo no repo)
- Modify: `src/lib/db/schema.ts:59-65`

**Interfaces:**
- Produces: coluna `usuarios.conecta` (text, nullable) no banco e no schema Drizzle. Consumida pelas Tasks 2, 3 e 4 como `usuarios.conecta` (tipo `string | null`).

- [ ] **Step 1: Aplicar a migração via Supabase MCP**

Usar a ferramenta MCP `apply_migration` (Supabase) com nome `add_conecta_to_usuarios` e o SQL:

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS conecta text;
```

- [ ] **Step 2: Espelhar a coluna no schema Drizzle**

Em `src/lib/db/schema.ts`, dentro de `export const usuarios = pgTable('usuarios', { ... })`, adicionar a coluna após `lojaId`:

```ts
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey(), // vinculado ao Supabase Auth uid
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  papel: papelEnum('papel').notNull(),
  lojaId: uuid('loja_id').references(() => lojas.id), // nullable para admin_geral
  conecta: text('conecta'), // link individual do usuário (menu Conecta); nullable
})
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run type-check`
Expected: PASS (sem erros novos). O tipo inferido de `usuarios` passa a incluir `conecta: string | null`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): coluna conecta em usuarios (link individual)"
```

---

### Task 2: Persistir `conecta` nas server actions

**Files:**
- Modify: `src/app/(dashboard)/admin/usuarios/actions.ts:21-47` (criar) e `:49-87` (editar)

**Interfaces:**
- Consumes: `usuarios.conecta` (Task 1).
- Produces: assinaturas atualizadas —
  - `criarUsuarioAction(dados: { nome, email, senha, papel, lojaId, conecta })`
  - `editarUsuarioAction(id, dados: { nome, email, novaSenha?, papel, lojaId, conecta })`
  onde `conecta: string | null`. Consumidas pela Task 3.

- [ ] **Step 1: Adicionar `conecta` ao input e insert de `criarUsuarioAction`**

Em `src/app/(dashboard)/admin/usuarios/actions.ts`, alterar a assinatura e o `db.insert`:

```ts
export async function criarUsuarioAction(dados: {
  nome: string
  email: string
  senha: string
  papel: string
  lojaId: string | null
  conecta: string | null
}) {
  await assertAdmin()
  const supabase = getAdminClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email: dados.email,
    password: dados.senha,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)

  await db.insert(usuarios).values({
    id: data.user.id,
    nome: dados.nome,
    email: dados.email,
    papel: dados.papel as any,
    lojaId: dados.lojaId,
    conecta: dados.conecta,
  })

  revalidatePath('/admin/usuarios')
}
```

- [ ] **Step 2: Adicionar `conecta` ao input e update de `editarUsuarioAction`**

Alterar a assinatura e o `tx.update(usuarios).set({ ... })`:

```ts
export async function editarUsuarioAction(id: string, dados: {
  nome: string
  email: string
  novaSenha?: string
  papel: string
  lojaId: string | null
  conecta: string | null
}) {
  await assertAdmin()

  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel as any,
      lojaId: dados.lojaId,
      conecta: dados.conecta,
    }).where(eq(usuarios.id, id))
```

(o restante do bloco `db.transaction` — os `tx.execute` de `auth.users` — permanece inalterado.)

- [ ] **Step 3: Verificar typecheck**

Run: `npm run type-check`
Expected: FAIL esperado em `usuarios-table.tsx` (as chamadas ainda não passam `conecta`) — isso é corrigido na Task 3. Em `actions.ts` não deve haver erro. Se o único erro for a falta de `conecta` nas chamadas do form, seguir para a Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/admin/usuarios/actions.ts
git commit -m "feat(usuarios): persistir campo conecta em criar/editar"
```

---

### Task 3: Campo "Conecta" no formulário de usuário

**Files:**
- Modify: `src/app/(dashboard)/admin/usuarios/components/usuarios-table.tsx`
- Modify: `src/app/(dashboard)/admin/usuarios/page.tsx:12-24` (incluir `conecta` no select que alimenta a tabela)

**Interfaces:**
- Consumes: `criarUsuarioAction` / `editarUsuarioAction` com `conecta` (Task 2).
- Produces: form completo funcionando; tipo `Usuario` passa a ter `conecta: string | null`.

- [ ] **Step 1: Incluir `conecta` no select da page**

Em `src/app/(dashboard)/admin/usuarios/page.tsx`, adicionar `conecta` ao objeto do `.select({...})`:

```ts
      .select({
        id:       usuarios.id,
        nome:     usuarios.nome,
        email:    usuarios.email,
        papel:    usuarios.papel,
        lojaId:   usuarios.lojaId,
        lojaNome: lojas.nome,
        conecta:  usuarios.conecta,
      })
```

- [ ] **Step 2: Adicionar `conecta` ao tipo `Usuario` e ao tipo do `onSubmit`**

Em `usuarios-table.tsx`, no tipo `Usuario` (linhas 15-22), adicionar o campo:

```ts
type Usuario = {
  id: string
  nome: string
  email: string
  papel: string
  lojaId: string | null
  lojaNome: string | null
  conecta: string | null
}
```

E na prop `onSubmit` de `FormUsuario` (linha 71), incluir `conecta`:

```ts
  onSubmit: (dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null; conecta: string | null }) => void
```

- [ ] **Step 3: Adicionar estado e submit do campo `conecta` no `FormUsuario`**

Após a linha do estado `lojaId` (linha 79), adicionar o estado:

```ts
  const [conecta, setConecta] = useState(inicial?.conecta ?? '')
```

E no `handleSubmit` (linha 86), incluir `conecta` no payload (vazio vira `null`):

```ts
    onSubmit({ nome: nome.trim(), email: email.trim(), senha, papel, lojaId: lojaId || null, conecta: conecta.trim() || null })
```

- [ ] **Step 4: Renderizar o input Conecta no form**

No JSX do `FormUsuario`, adicionar o campo logo após o bloco da Loja (o `<div className="col-span-2 space-y-1.5">` que termina na linha 134), antes do fechamento `</div>` do grid:

```tsx
        <div className="col-span-2 space-y-1.5">
          <Label>Conecta</Label>
          <Input
            value={conecta}
            onChange={e => setConecta(e.target.value)}
            placeholder="https://checkout.aride.com.br/?org=…&seller=…"
          />
        </div>
```

- [ ] **Step 5: Passar `conecta` no `handleEditar`**

Em `UsuariosTable`, o `handleEditar` monta o objeto passado para `editarUsuarioAction`. Incluir `conecta` (linhas 166-172):

```ts
        await editarUsuarioAction(editando.id, {
          nome:      dados.nome,
          email:     dados.email,
          novaSenha: dados.senha || undefined,
          papel:     dados.papel,
          lojaId:    dados.lojaId,
          conecta:   dados.conecta,
        })
```

Obs.: `handleCriar` repassa `dados` direto para `criarUsuarioAction`, então já inclui `conecta` sem alteração. Ajustar apenas a assinatura de `handleCriar` e `handleEditar` para aceitar `conecta` no tipo do parâmetro `dados`:

```ts
  function handleCriar(dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null; conecta: string | null }) {
```

```ts
  function handleEditar(dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null; conecta: string | null }) {
```

- [ ] **Step 6: Verificar typecheck**

Run: `npm run type-check`
Expected: PASS (sem erros).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/admin/usuarios/components/usuarios-table.tsx src/app/\(dashboard\)/admin/usuarios/page.tsx
git commit -m "feat(usuarios): campo Conecta no formulario de cadastro/edicao"
```

---

### Task 4: Item "Conecta" na sidebar (link externo, só com link)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx:16` (passar `conecta` para a Sidebar)
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `usuario.conecta` (disponível via `getUsuarioLogado`, que faz `select()` da linha inteira — nenhuma mudança em `auth.ts` necessária).
- Produces: item de menu "Conecta" renderizado como `<a target="_blank">` quando `conecta` presente.

- [ ] **Step 1: Passar `conecta` no layout**

Em `src/app/(dashboard)/layout.tsx`, alterar a linha do `<Sidebar>`:

```tsx
        <Sidebar papel={usuario.papel} conecta={usuario.conecta} />
```

- [ ] **Step 2: Aceitar a prop `conecta` e importar o ícone `Link`**

Em `src/components/layout/sidebar.tsx`, adicionar `Link as LinkIcon` ao import de `lucide-react` (linhas 7-12). Atenção: `Link` já é o componente do `next/link` importado no topo — por isso o ícone entra com alias `LinkIcon`:

```ts
import {
  ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings,
  Wallet, Home, Package, QrCode, Calculator,
  ChevronLeft, ChevronRight, Zap, CreditCard, ClipboardList, Users,
  Radar, CalendarDays, ListChecks, Package2, Link as LinkIcon,
} from 'lucide-react'
```

E alterar o tipo `Props` e a assinatura do componente:

```ts
type Props = { papel: string; conecta: string | null }

export function Sidebar({ papel, conecta }: Props) {
```

- [ ] **Step 3: Renderizar o item Conecta como link externo**

Os itens internos são renderizados no `nav` via `navItems.map(...)`. O item Conecta é um link externo (nova aba), então NÃO entra no array `navItems` (que assume rota interna com `<Link>`/`router.push`). Renderizar logo após o `.map` dos itens, ainda dentro do `<nav>` (após a linha 104, antes de `</nav>`).

O `TooltipTrigger` do projeto é o `@base-ui/react` (confirmado em `src/components/ui/tooltip.tsx`) — NÃO suporta `asChild` (prop Radix, ver memory). No modo recolhido, seguir o mesmo padrão dos itens internos: `onClick` com `window.open` direto no `TooltipTrigger`. No modo expandido, usar `<a href target="_blank">`:

```tsx
          {conecta && (() => {
            const linkClass = cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              collapsed && 'justify-center px-0',
              'text-slate-400 hover:bg-slate-800 hover:text-white'
            )
            if (collapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => window.open(conecta!, '_blank', 'noopener')}
                    className={linkClass}
                  >
                    <LinkIcon size={18} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Conecta</TooltipContent>
                </Tooltip>
              )
            }
            return (
              <a href={conecta} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <LinkIcon size={18} className="shrink-0" />
                <span className="truncate">Conecta</span>
              </a>
            )
          })()}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run type-check`
Expected: PASS (sem erros).

- [ ] **Step 5: Verificação manual no browser**

Run: `npm run dev`
- Login como admin → Admin → Usuários → editar um usuário → preencher Conecta com o link de exemplo → salvar.
- Confirmar que o item "Conecta" aparece na sidebar para esse usuário e abre o link em nova aba ao clicar (expandido e recolhido).
- Confirmar que um usuário SEM `conecta` não vê o item na sidebar.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx src/components/layout/sidebar.tsx
git commit -m "feat(sidebar): item Conecta abre link individual do usuario"
```

---

### Task 5: Deploy

**Files:** nenhum (deploy).

- [ ] **Step 1: Push + deploy**

Conforme preferência do projeto (deploy automático ao terminar tarefa):

```bash
git push
```

E deploy Vercel de produção (via skill `vercel:deploy` prod, ou push que dispara o deploy automático).

- [ ] **Step 2: Confirmar em produção**

Verificar em `moto-chefe.vercel.app` que o campo Conecta salva e o menu aparece/abre corretamente.

---

## Self-Review

**Spec coverage:**
- Banco (coluna `conecta`) → Task 1 ✓
- Formulário admin (campo Conecta) → Task 3 ✓
- Server actions (persistência) → Task 2 ✓
- Menu lateral (item Conecta, link externo, só com link) → Task 4 ✓
- Passar `conecta` do usuário logado para Sidebar → Task 4 Step 1 ✓ (via `getUsuarioLogado` que já retorna a linha inteira — confirmado em `auth.ts`)
- Fora de escopo (página interna, QR, edição pelo próprio usuário, lista admin) → não implementados ✓

**Placeholder scan:** sem TBD/TODO; todo passo tem código concreto. A única condicional ("checar suporte a `asChild` no TooltipTrigger") traz as duas variantes de código prontas, não um placeholder.

**Type consistency:** `conecta: string | null` usado de forma consistente em schema (Task 1), actions (Task 2), tipo `Usuario` e payloads do form (Task 3) e prop `Props` da Sidebar (Task 4). `criarUsuarioAction`/`editarUsuarioAction` recebem `conecta` em ambas.
