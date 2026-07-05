# Categorias de Despesa — Design

## Contexto

O módulo Despesas (`/despesas`) usa hoje uma lista fixa de categorias, hardcoded
no componente `despesa-dialog.tsx`:

```
Aluguel, Energia elétrica, Água, Internet, Combustível,
Compra de veículos, Marketing, Salários, Impostos, Manutenção, Outros
```

O módulo Caixa já resolve o mesmo problema para lançamentos de entrada/saída
através de uma tabela `categorias_caixa` gerenciável em
`/admin/categorias-caixa` (CRUD completo: criar, editar, ativar/desativar,
excluir). O pedido é habilitar a mesma capacidade — criar/gerenciar categorias
pelo admin — para Despesas.

## Decisões

- **Tabela nova, não reaproveitar `categorias_caixa`.** Despesa não tem o
  conceito de tipo entrada/saída/ambos que `categorias_caixa.tipo` representa;
  forçar esse campo criaria um valor sem sentido (`saida` sempre) só para
  reaproveitar a tabela. Uma tabela própria e mais simples é mais clara.
- **Escopo global**, igual `categorias_caixa` hoje — uma lista única vale para
  todos os grupos (Sul de Minas + BH). Consistente com o padrão já
  estabelecido; não introduz assimetria entre os dois módulos de categoria.
- **`despesas.categoria` continua sendo texto livre** (denormalizado), do
  mesmo jeito que `lancamentos_caixa.categoria` já é hoje — não vira FK. Isso
  preserva o valor histórico mesmo se a categoria for renomeada/excluída depois.
- **UI: abas na página existente** `/admin/categorias-caixa`, não uma página
  nova. Usa o componente `Tabs` (`@base-ui/react`) já disponível em
  `src/components/ui/tabs.tsx`.
- **Seed de migração**: a tabela nasce populada com as 11 categorias atuais
  (mesma ordem do array hoje), para não quebrar o fluxo de quem já lança
  despesas.

## Schema

Nova tabela em `src/lib/db/schema.ts`, logo após `categoriasCaixa`:

```ts
export const categoriasDespesa = pgTable('categorias_despesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Migração SQL nova (`00XX_categorias_despesa.sql`): `CREATE TABLE` + `INSERT`
das 11 categorias com `ordem` 0..10. Aplicar no banco de produção requer
confirmação explícita do usuário antes de rodar `db:migrate`.

## Server actions

Em `src/app/(dashboard)/admin/categorias-caixa/actions.ts`, adicionar (mesmo
arquivo — mesma área de admin, mesmas regras de permissão):

- `listarCategoriasDespesaAction()`
- `criarCategoriaDespesaAction({ nome })`
- `editarCategoriaDespesaAction(id, { nome })`
- `excluirCategoriaDespesaAction(id)`
- `toggleAtivoDespesaAction(id, ativo)`

Todas restritas a `admin_geral`/`admin_socio` (mesmo `requireAdmin` já
existente). `revalidatePath` para `/admin/categorias-caixa` e `/despesas`.

## UI — Admin

`src/app/(dashboard)/admin/categorias-caixa/page.tsx`:
- Busca `categoriasCaixa` e `categoriasDespesa` em paralelo.
- Renderiza `<Tabs>` com duas abas: "Caixa" (conteúdo atual, sem mudança) e
  "Despesa" (tabela nova).
- Título da página passa a refletir as duas categorias (ex.: "Categorias").

Novo componente `src/app/(dashboard)/admin/categorias-caixa/components/categorias-despesa-table.tsx`,
mirror de `categorias-table.tsx` mas sem o campo/seletor `tipo` (só Nome,
Status, Ações) — dialog de criar/editar só pede Nome.

O card do admin dashboard (`admin/page.tsx`) que hoje aponta para
"Categorias Caixa" mantém o mesmo link (`/admin/categorias-caixa`); ajustar
label/descrição para refletir que cobre também despesas.

## UI — Despesas

`src/app/(dashboard)/despesas/page.tsx`: busca as categorias ativas de
`categoriasDespesa` (mesmo padrão de `caixa/novo/page.tsx` para
categoriasEntrada/Saida) e repassa como prop para `NovaDespesaButton` /
`DespesaDialog` / `EditarDespesaButton`.

`despesa-dialog.tsx`: remove o array `CATEGORIAS` fixo; recebe `categorias:
string[]` via props e usa no `<select>`.

## Fora de escopo

- Não altera o comportamento do módulo Caixa.
- Não migra `despesas.categoria` para FK.
- Não adiciona escopo por grupo às categorias (nem de despesa, nem de caixa).
