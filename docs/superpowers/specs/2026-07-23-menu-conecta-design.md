# Design: Menu Conecta + campo por usuário

Data: 2026-07-23

## Objetivo

Cada usuário passa a ter um link individual (ex.: link de checkout Aride:
`https://checkout.aride.com.br/?org=7DMXd&plan=M8nhy&seller=STAFF_TUDLa&channel=Kawan_Raymundo__Pouso_Alegre`).
Um novo item de menu **"Conecta"** abre esse link do próprio usuário logado em nova aba.

## Decisões

- **Ação do menu:** clicar em "Conecta" abre o link individual do usuário logado em nova aba.
- **Edição do link:** somente admin, no formulário de cadastro/edição de usuários. O próprio usuário não edita.
- **Visibilidade do menu:** o item "Conecta" só aparece na barra lateral para usuários que têm link cadastrado.
- **Ícone:** `Link` (lucide-react). **Label:** "Conecta".

## Escopo

### 1. Banco de dados
- Adicionar coluna `conecta` (text, nullable) na tabela `usuarios`.
- Migração aplicada via Supabase MCP (`apply_migration`) — o repo não usa `db:generate`/`db:migrate`.
- Espelhar a coluna em `src/lib/db/schema.ts`.

### 2. Formulário de cadastro/edição — `src/app/(dashboard)/admin/usuarios/components/usuarios-table.tsx`
- Novo campo **Conecta** no `FormUsuario`: `Input` opcional (URL), com placeholder de exemplo.
- Adicionar `conecta` ao estado do form e aos objetos passados em `onSubmit` (criar e editar).

### 3. Server actions — `src/app/(dashboard)/admin/usuarios/actions.ts`
- Adicionar `conecta` ao `db.insert(usuarios)` em `criarUsuarioAction`.
- Adicionar `conecta` ao `db.update(usuarios)` em `editarUsuarioAction`.
- Autorização inalterada (já exige `admin_geral` via `assertAdmin`).
- Valor vazio (`''`) deve ser gravado como `null`.

### 4. Menu lateral — `src/components/layout/sidebar.tsx`
- Passar o valor `conecta` do usuário logado para a `Sidebar` (o layout já passa `papel`; adicionar `conecta`).
- Renderizar o item **"Conecta"** apenas quando `conecta` estiver preenchido.
- É um **link externo**: `<a href={conecta} target="_blank" rel="noopener noreferrer">`, diferente dos demais itens que são rotas internas (`<Link>`). Precisa de tratamento próprio na renderização (incluindo o modo recolhido com tooltip).
- Ícone `Link` de `lucide-react`.

## Fora de escopo (YAGNI)
- Página interna dedicada / QR code.
- Edição do link pelo próprio usuário (perfil).
- Lista de links de todos os usuários para admin.

## Arquivos afetados
- `src/lib/db/schema.ts`
- `src/app/(dashboard)/admin/usuarios/components/usuarios-table.tsx`
- `src/app/(dashboard)/admin/usuarios/actions.ts`
- `src/components/layout/sidebar.tsx`
- Layout que renderiza a `Sidebar` (para buscar/passar `conecta`) — a confirmar na implementação.
- Migração SQL (Supabase MCP).
