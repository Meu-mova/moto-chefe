# Origem do cliente na venda — design

Data: 2026-07-29
Status: **SUBSTITUÍDA** por `2026-08-08-origem-venda-design.md` — nunca implementada.
Dois erros dela: afirma que `criarVendaTx` é o único insert em `vendas` (a RPC `efetivar_venda`
também insere) e manda migrar pelo MCP do Supabase, que não autentica mais. Mantida como
histórico das decisões que continuam valendo.

## Problema

Não há como saber por qual canal o cliente chegou (Instagram, Google, indicação, …). Sem isso, não é possível avaliar o trabalho de marketing: nem qual canal traz volume, nem qual traz faturamento.

## Objetivo

Tornar a origem do cliente um campo **obrigatório para fechar venda de moto** e ter uma página de Marketing que mostre vendas e faturamento por origem, por período e por loja.

## Decisões tomadas (com o Cesar, nesta ordem)

1. **Origem é por venda**, não por cliente. Um cliente que volta pode ter vindo do Instagram na primeira compra e por indicação na segunda; é a origem da venda que mede campanha num período.
2. **Catálogo editável no Admin**, não enum fixo. O Cesar acrescenta "TikTok" ou "Campanha Black Friday" sem depender de deploy, e desativar uma origem antiga não apaga histórico.
   - **Por grupo.** Eu havia proposto catálogo global; o Cesar estabeleceu a regra de que toda funcionalidade nova nasce separada por grupo.
3. **Detalhe por origem**: cada origem tem um flag "pede detalhe". Ligado em Indicação, o vendedor é obrigado a dizer quem indicou.
4. **Escopo: só venda de moto.** Reserva, demanda, peças e OS não perguntam origem.
5. **Relatório em página própria de Marketing**, não no Financeiro nem no Dashboard.
6. **Obrigatoriedade na aplicação, não via constraint de banco** (abordagem A das três avaliadas). A coluna aceita nulo por causa do histórico; nenhum caminho de escrita novo deixa passar.

## Modelo de dados

Nova tabela, espelhando `categorias_caixa` (catálogo simples que já existe no Admin):

```sql
create table origens_cliente (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references grupos(id),
  nome         text not null,
  pede_detalhe boolean not null default false,
  ativo        boolean not null default true,
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);
create unique index origens_cliente_nome_unq
  on origens_cliente (grupo_id, lower(trim(nome)));
```

Catálogo **por grupo**, seguindo a regra do Cesar de que toda funcionalidade nasce separada por grupo: cada bandeira mantém suas próprias origens e pode ter campanha que a outra não tem. O select da venda mostra as origens do grupo da loja da moto; o Admin edita as do grupo ativo. O índice único é por grupo + nome normalizado, evitando "Instagram" e "instagram" na mesma bandeira.

O seed abaixo é aplicado **para cada grupo ativo**.

`vendas` ganha:

```sql
alter table vendas
  add column origem_id      uuid references origens_cliente(id),
  add column origem_detalhe text;
create index vendas_origem_id_idx on vendas (origem_id);
```

FK em vez de texto solto para que desativar uma origem não apague histórico. Consequência aceita de propósito: renomear no catálogo muda o rótulo retroativamente — desejável para corrigir grafia, e não é dado fiscal.

Seed inicial (editável no Admin depois):

| nome | pede_detalhe |
| --- | --- |
| Instagram | não |
| Google | não |
| Facebook | não |
| WhatsApp | não |
| Indicação | **sim** |
| Passou na loja | não |
| Cliente antigo / recompra | não |
| Outro | **sim** |

Migração via Supabase MCP (`apply_migration`), nunca `db:generate`/`db:migrate` — o journal do drizzle neste repo está quebrado.

## Fluxo de venda

### O ponto crítico

`criarVendaTx` (`src/app/(dashboard)/vendas/actions.ts:157`) é o **único** lugar que insere em `vendas`, e é chamado por dois caminhos:

- `registrarVendaCompletaAction` — venda direta;
- `aprovarVendaAction` — venda que passou por aprovação de valor mínimo, reprocessando o `aprovacoes_venda.dados_venda` (jsonb) gravado na solicitação.

Portanto a origem tem de fazer parte de `DadosVendaCompleta`. Se ficar só como parâmetro solto da action direta, **toda venda aprovada perde a origem sem erro visível** — o relatório nasceria com um buraco silencioso justamente nas vendas negociadas.

### Alterações

- `DadosVendaCompleta` ganha `origemId: string` e `origemDetalhe?: string`.
- `criarVendaTx` grava `origem_id` e `origem_detalhe` no insert.
- `vender-button.tsx`: campo no bloco "Dados do cliente". **`<select>` nativo**, não o `<Select>` do `@base-ui/react` — o value é UUID e o label é o nome, que é exatamente o caso em que o componente mostra o value cru na tela. O input de detalhe só é renderizado quando a origem escolhida tem `pede_detalhe`.
- Validação no formulário: sem origem, o submit não passa; se a origem pede detalhe, detalhe vazio também barra.
- Validação no servidor, em `registrarVendaCompletaAction` **e** em `solicitarAprovacaoVendaAction`: `origemId` tem de existir, estar `ativo` **e pertencer ao grupo da loja da moto** (senão um payload forjado grava venda de BH com origem do Sul de Minas), e o detalhe tem de vir quando a origem exige. Retorno no padrão atual (`{ error: '...' }`). Validar também na solicitação evita gravar um `dados_venda` inválido que só quebraria na hora de aprovar.
- `editarVendaAction` passa a permitir corrigir origem e detalhe: campo obrigatório que só pode ser errado uma vez e para sempre produz dado ruim de propósito.

A venda que nasce de uma reserva passa pelo mesmo dialog, então a origem é perguntada ali — sem precisar mexer no fluxo de reserva.

## Admin — catálogo de origens

Página `/admin/origens`, no padrão de `/admin/categorias-caixa`: tabela com criar/editar/ativar-desativar, campos nome, "pede detalhe", ordem. Atrás de `AdminGuard` (admin_geral / admin_socio). Card novo na grade de `/admin`. Opera sobre o **grupo ativo** (cookie `grupoAtivo`, via `getGrupoAtivo`), com o nome do grupo no título para não haver dúvida de qual bandeira está sendo editada.

Desativar origem não a remove do histórico; ela só deixa de aparecer no select da venda. Não há exclusão — apenas `ativo = false` — porque `vendas.origem_id` referencia a linha.

## Página de Marketing

Rota `/marketing`, item no sidebar, liberada para `admin_geral`, `admin_socio` e `aux_adm` (mesma régua de `/atendimento`). Escopada pelo grupo ativo, como as outras telas multi-grupo, e com filtro de período e de loja.

Conteúdo:

- **Cobertura** — % das vendas do período com origem informada. É a primeira coisa da página: sem ela, todos os outros números enganam. Vendas antigas entram como "Não informado".
- **Vendas por origem** — quantidade, faturamento e ticket médio, ordenado por faturamento, com "Não informado" como faixa separada e nunca diluída nas outras.
- **Origem × loja** e **origem × vendedor** — para ver se um canal funciona em uma praça e não em outra.
- **Evolução mês a mês** por origem.
- **Indicação** — lista dos detalhes preenchidos, agrupados por quem indicou, para reconhecer quem mais indica.

Queries novas em `src/lib/queries/marketing.ts`, seguindo o formato de `src/lib/queries/atendimento.ts`. Atenção a dois erros já conhecidos deste repo: nunca passar `Date` cru dentro de `sql` (o postgres.js com `prepare:false` estoura em runtime e o `tsc` não pega — usar string ISO), e escopar por `lojaId in (lojas do grupo)` para não vazar dados entre grupos.

## Histórico

Sem backfill. Vendas anteriores ficam com `origem_id` nulo e aparecem como "Não informado" no relatório. A obrigatoriedade vale a partir do deploy. Inventar origem para venda passada produziria número de marketing falso, que é pior que número faltando.

## Testes

O repo roda `node --test` com `tsx` e a lista de arquivos é **explícita** em `package.json` (`"test"`), então todo arquivo novo de teste tem de ser acrescentado nessa lista, senão nunca roda.

Testes unitários puros, sem banco, para a regra que concentra o risco:

- `validarOrigemVenda(origem, detalhe)` extraída como função pura: aceita origem ativa sem detalhe quando `pede_detalhe = false`; recusa origem ausente; recusa origem inativa; recusa detalhe vazio ou só espaços quando `pede_detalhe = true`.

Verificação manual antes de dar por pronto: fechar uma venda normal com origem; tentar fechar sem origem (deve barrar no formulário e, forçando o payload, na action); fechar uma venda de valor mínimo pelo fluxo de aprovação e confirmar que a origem sobreviveu ao round-trip do `dados_venda`; conferir os números da página de Marketing contra o total de vendas do período.

## Fora de escopo

- Reserva, demanda, venda de peças e OS.
- Origem na ficha do cliente (`clientes`) — decidido que fica só na venda.
- Cruzar origem com os leads do Kommo. Faz sentido depois, mas exige casar lead com venda e é projeto próprio.
- Constraint de banco com data de corte (abordagem B). Se algum dia venda entrar por fora do app, subir para ela.
