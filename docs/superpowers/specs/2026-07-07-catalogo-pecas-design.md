# Catálogo de Peças — Design

## Contexto

Segunda parte da reforma de Ordens de Serviço (a primeira, Catálogo de
Serviços, já está em produção — `docs/superpowers/specs/2026-07-07-catalogo-servicos-design.md`).

Hoje, ao adicionar um item de peça a uma OS (`os-itens-panel.tsx`), o valor e
a descrição são digitados livremente, sem nenhuma lista de referência —
mesmo problema que o Catálogo de Serviços resolveu para mão de obra. Este
spec cria o equivalente para peças, para que a próxima etapa (reforma do
formulário de OS) possa oferecer os dois catálogos na aba "Serviços e
Peças".

É estruturalmente idêntico ao Catálogo de Serviços, com duas diferenças
deliberadas: sem `tempoPrevistoMinutos` (não se aplica a peças) e sem
controle de estoque — confirmado explicitamente: é uma lista de referência
(nome + preço padrão), não um módulo de inventário. Baixa de estoque por
peça usada em OS fica fora de escopo.

## Decisões

- **Tabela nova `pecas_catalogo`**, única para o grupo — mesmo padrão do
  Catálogo de Serviços (`servicos_catalogo`), inclusive na justificativa:
  uma lista compartilhada entre lojas do mesmo grupo.
- **Sem controle de estoque.** Uma peça "usada" numa OS não decrementa
  nada — é só uma referência de nome/preço para acelerar o lançamento do
  item. Controle de estoque de peças, se vier a ser necessário, é um
  módulo à parte, não uma extensão deste.
- **`os_itens` ganha `peca_id` (nullable, sem cascade)**, espelhando
  exatamente `servico_id`: `descricao`/`valorUnitario` do item continuam
  sendo a fonte de verdade da OS (cópia congelada no momento da escolha);
  ao montar a OS, valor pré-preenche o item mas é editável antes de salvar;
  excluir/inativar uma peça do catálogo não pode afetar itens de OS já
  lançados.
- **Soft delete via `ativo`**, mesmo padrão: peça fora de linha some da
  lista de seleção em novas OS, mas permanece consultável e mantém a
  referência de OS antigas.
- **Permissão: admin + aux_adm** (`GESTORES`), mesmo grupo que já gerencia
  o Catálogo de Serviços, Agenda e OS.
- **UI espelha `/servicos` ponto a ponto** — mesma estrutura de página,
  dialog e toggle, só sem o campo de tempo previsto.

## Schema

Nova tabela em `src/lib/db/schema.ts`, logo após `servicosCatalogo`:

```ts
export const pecasCatalogo = pgTable('pecas_catalogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Alteração em `osItens`: adicionar

```ts
pecaId: uuid('peca_id').references(() => pecasCatalogo.id),
```

**Migração**: não usar `drizzle-kit generate` — journal local deste repo
está desatualizado (achado documentado no plano do Catálogo de Serviços). A
migração é SQL manual, aplicada via Supabase MCP `apply_migration`, seguindo
o mesmo processo já estabelecido.

## Server actions

Novo arquivo `src/app/(dashboard)/pecas/actions.ts`, mesma estrutura de
`servicos/actions.ts`:

- `listarPecasAction({ apenasAtivos?: boolean })`
- `criarPecaAction({ nome, valor })`
- `atualizarPecaAction(id, { nome, valor })`
- `inativarPecaAction(id)` / `reativarPecaAction(id)`

Restritas a `GESTORES`. Validações: nome obrigatório, valor não pode ser
negativo. `revalidatePath('/pecas')`.

## UI

- `src/app/(dashboard)/pecas/page.tsx`: tabela (Nome, Valor, Status, Ações),
  guard inline igual `/servicos` (não usa `AdminGuard`).
- `src/app/(dashboard)/pecas/components/peca-form.tsx`: dialog de
  criar/editar, mesmo padrão de `servico-form.tsx` (sem o campo de tempo
  previsto).
- `src/app/(dashboard)/pecas/components/peca-ativo-toggle.tsx`: idêntico a
  `servico-ativo-toggle.tsx`.
- Entrada no menu lateral (`sidebar.tsx`), ao lado de "Serviços", mesma
  condição de papel.

## Tratamento de erros

Idêntico ao Catálogo de Serviços: nome obrigatório (client + server), valor
negativo bloqueado no server, ações fora do grupo `GESTORES` recebem "Sem
permissão".

## Verificação

`npm run type-check`, `npm run build`, migração aplicada via Supabase MCP e
confirmada via `list_migrations`/`information_schema`. Teste manual: criar
peça, editar, inativar (confirma que some da listagem padrão mas continua
acessível), reativar.

## Fora de escopo

- Seleção de peças do catálogo dentro da aba "Serviços e Peças" da OS —
  isso é o próximo spec (reforma do formulário de OS), que consome tanto
  este catálogo quanto o de Serviços.
- Controle de estoque/quantidade de peças.
- Categoria de peça, preço por loja.
