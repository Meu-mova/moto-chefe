# Relatório de Fechamento Mensal (no app)

**Data:** 2026-08-31
**Status:** aprovado, a implementar

## Problema

O fechamento mensal (vendas, metas, vendedores, modelos, origem, pagamento,
serviços, resultado) hoje só existe como análise avulsa (artifact). Os sócios
querem isso **dentro do MOVA, atrás do login**, gerável para **qualquer mês**,
por grupo, com números que batem com o resto do sistema.

## Escopo e acesso

- Rota nova `/relatorios/fechamento`, escopada ao **grupo ativo** do usuário.
- **Acesso: só sócios** — `admin_geral` e `admin_socio`. NÃO aux_adm nem time
  (traz financeiro/DRE). Consequência aceita: a conta aux_adm do Cesar não vê;
  ele valida com a conta de sócio.
- Seletor de **mês** (querystring `?mes=YYYY-MM`, default = mês corrente).
- Um relatório por grupo: Sul de Minas mostra as 5 lojas com drill-down; BH
  mostra a loja única.

## Dados — reaproveitar para os números baterem

- **Metas × realizado:** `queries/metas.ts` (`metasDoMes`, `realizadoDoMes`).
- **Resultado oficial:** `queries/dre.ts` (`dreDoMes`) — lucro líquido do mês,
  igual ao `/admin/dre`.
- **Agregações operacionais:** novo `queries/fechamento.ts`, parametrizado por
  `(lojaIds, ano, mes)`, com: consolidado (qtd, faturamento, ticket, clientes)
  ago vs mês anterior; por loja; por vendedor; por modelo; por origem; por forma
  de pagamento (jsonb); ritmo diário; OS concluídas; peças de balcão; garantias;
  estoque snapshot. Tudo com as janelas de mês no fuso de Brasília (reusar
  `data-venda.ts`).

## Estrutura

- `page.tsx` (server): gate de sócio (`navegacao.ts` + `usuarioPodeAcessar`),
  resolve grupo+lojaIds, lê o mês da querystring, busca tudo em paralelo, passa
  pro client.
- `components/fechamento-client.tsx` (client): seletor de mês, e o **drill-down
  por loja** (abas), reaproveitando o layout do artifact adaptado ao Tailwind do
  app. Botão imprimir.
- `queries/fechamento.ts`: as agregações puras-de-SQL; funções pequenas e
  isoladas, uma por dimensão.
- Menu/permissão em `navegacao.ts` (categoria adequada), item visível só a sócio.

## Componentes de UI (reaproveitados do artifact)

KPIs, ritmo diário (barras), metas por loja (barras + marca de 100%), tabela de
desempenho por loja, ranking de vendedores, mix de modelos, origem, pagamento,
minis de serviços/estoque, drill-down por loja, e a faixa do **DRE** (receita,
custos, despesas, resultado). Comparativo com o mês anterior onde faz sentido.

## Testes

- Helpers puros testados: `%` de meta e classe (batida/perto/abaixo), variação
  vs mês anterior, montagem do objeto por-loja, formatação BRL/mês.
- Queries seguem o padrão do projeto (sem teste unitário de SQL, como as demais).

## Fora de escopo (por ora)

Versão operacional pro time (sem financeiro); export PDF server-side;
comparativo multi-mês (o DRE já tem evolução em `/admin/dre`).
