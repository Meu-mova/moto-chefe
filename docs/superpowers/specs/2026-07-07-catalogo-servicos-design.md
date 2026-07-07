# Catálogo de Serviços — Design

## Contexto

Hoje, ao montar os itens de uma OS (`os_itens`), quem monta digita a
descrição e o valor de cada serviço na hora, sem nenhuma lista de referência.
Isso gera inconsistência de nome/preço entre OS diferentes e não deixa
histórico de quanto tempo cada tipo de serviço costuma levar.

Este é o primeiro de dois specs para melhorar Ordens de Serviço. O segundo
(fluxo de abertura de OS — busca/cadastro de veículo e cliente, campo KM,
checklist de avarias com foto) depende deste, porque a etapa "Serviços
realizados" da nova abertura de OS vai escolher itens deste catálogo.

O catálogo nasce pensado para reuso futuro (relatórios de produtividade,
tempo médio por serviço), então guarda tempo previsto como campo próprio
em vez de embutido na descrição.

## Decisões

- **Tabela nova `servicos_catalogo`**, única para o grupo (Sul de Minas + BH)
  — mesma lista de serviços/preços em qualquer loja, sem duplicar cadastro.
- **Tempo previsto é opcional.** Nem todo serviço tem um tempo padrão
  definido no início; obrigar o campo travaria o cadastro sem necessidade.
- **`os_itens` ganha `servico_id` (nullable, sem cascade)** apontando para o
  catálogo, mas `descricao`/`valorUnitario` do item continuam sendo a fonte
  de verdade da OS — cópia congelada no momento da escolha. Se o preço do
  catálogo mudar depois, OS antigas não mudam junto. Ao montar a OS, valor e
  tempo do catálogo pré-preenchem o item, mas são editáveis antes de salvar.
- **Soft delete via `ativo`.** Serviço "fora de linha" fica inativo — some da
  lista de seleção em novas OS, mas permanece consultável e mantém a
  referência de OS antigas que já o usaram. Sem exclusão física pela UI (a
  coluna `servico_id` em `os_itens` não tem `onDelete: cascade` justamente
  para impedir que isso quebre itens já lançados).
- **Sem categoria por enquanto.** Lista plana (nome, tempo, valor); categoria
  pode ser adicionada depois se a lista crescer demais para navegar.
- **Permissão: admin + aux_adm**, não só admin — mesmo grupo (`GESTORES`) que
  já hoje abre/gerencia OS e Agenda. Por isso a página não fica sob
  `/admin` (bloqueado a `admin_geral`/`admin_socio` pelo `AdminGuard`); tem
  guard próprio.

## Schema

Nova tabela em `src/lib/db/schema.ts`:

```ts
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

Alteração em `osItens` (`src/lib/db/schema.ts`): adicionar

```ts
servicoId: uuid('servico_id').references(() => servicosCatalogo.id),
```

Migração nova via `drizzle-kit generate` (`db:generate`) cobre as duas
mudanças. Aplicar em produção (`db:migrate`) requer confirmação explícita do
usuário antes de rodar.

## Server actions

Novo arquivo `src/app/(dashboard)/servicos/actions.ts`:

- `listarServicosAction({ apenasAtivos?: boolean })`
- `criarServicoAction({ nome, tempoPrevistoMinutos, valor })`
- `atualizarServicoAction(id, { nome, tempoPrevistoMinutos, valor })`
- `inativarServicoAction(id)` / `reativarServicoAction(id)`

Todas restritas ao grupo `GESTORES` (`admin_geral`, `admin_socio`,
`aux_adm`), mesmo padrão de `agenda/actions.ts`. Validações no server: nome
obrigatório (não vazio), valor não pode ser negativo. `revalidatePath` para
`/servicos`.

## UI

- `src/app/(dashboard)/servicos/page.tsx`: tabela nos moldes de
  `admin/modelos/page.tsx` (Nome, Tempo previsto, Valor, Status, Ações),
  guardada por checagem de papel inline (não usa `AdminGuard`).
- `src/app/(dashboard)/servicos/components/servico-form.tsx`: dialog de
  criar/editar, seguindo o padrão de `clientes/components/cliente-form.tsx`.
- Toggle ativo/inativo direto na linha da tabela (inline, como
  `bling-codigo-cell.tsx` faz para código Bling em Modelos).
- Entrada nova no menu lateral (`src/components/layout/sidebar.tsx`),
  visível para admin + aux_adm.

## Tratamento de erros

- Nome obrigatório — validado no client (desabilita salvar) e no server
  (defesa contra chamada direta da action).
- Valor negativo bloqueado no server.
- Ações fora do grupo `GESTORES` recebem erro "Sem permissão", mesma
  mensagem usada em `agenda/actions.ts`.

## Verificação

Projeto não tem suíte automatizada (só `type-check`). Verificação:
`npm run type-check`, gerar e revisar a migração (`db:generate`), teste
manual no navegador — criar serviço, editar, inativar (confirmar que some da
listagem padrão mas continua acessível), reativar.

## Fora de escopo

- Seleção de serviços do catálogo dentro do formulário de abrir/editar OS —
  isso é o próximo spec (fluxo de abertura de OS).
- Categoria de serviço.
- Preço por loja (catálogo é único para o grupo).
- Relatórios de produtividade/tempo médio — os campos ficam prontos para
  isso, mas a construção do relatório em si não é deste spec.
