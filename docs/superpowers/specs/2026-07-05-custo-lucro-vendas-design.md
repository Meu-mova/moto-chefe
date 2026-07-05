# Custo e Lucro das Motos Vendidas no Financeiro — Design

## Contexto

O usuário quer saber, dentro do módulo `/financeiro`, quanto foi investido para
vender as motos do período — ou seja, o custo de aquisição das motos vendidas,
comparado com a receita, para enxergar lucro por venda/modelo. Hoje o
Financeiro mostra Faturamento Bruto, Receita Líquida (pós-taxa de cartão) e
Despesas Operacionais, mas nenhum dado de custo de aquisição de moto.

O campo `motos.precoCompra` já existe e é preenchido obrigatoriamente na
Entrada (manual) ou herdado do `modelos.precoCompraPadrao` (importação em
lote) — não é preciso criar nada novo no banco.

## Decisões

- **Custo = `motos.precoCompra`, sem rateio de despesas.** Ratear despesas
  operacionais (aluguel, marketing etc.) por venda exigiria um critério
  arbitrário de rateio; o pedido do usuário é especificamente sobre o valor
  investido na aquisição da moto.
- **Lucro Bruto = Receita Líquida − Custo Total.** Usa a receita líquida
  (já existente, pós-taxa de cartão quando conciliada) em vez do faturamento
  bruto, para refletir o que realmente sobra da venda.
- **Moto sem `precoCompra` registrado conta como custo R$ 0,00**, mas gera um
  aviso visível (contagem de vendas afetadas) para não mascarar lucro
  inflado silenciosamente.
- **Granularidade por modelo é resolvida pela tabela de vendas existente**,
  adicionando colunas Custo e Lucro a cada linha (que já mostra o modelo) —
  não é criado um bloco agregado "por modelo" separado, para não duplicar
  informação que a tabela já carrega.
- **Mesmos filtros já existentes** (mês e loja) se aplicam a custo/lucro,
  sem filtros novos.

## Dados

Reaproveita a query `totaisVendas` já existente em
`src/app/(dashboard)/financeiro/page.tsx`, adicionando `innerJoin` com
`motos` (mesmo padrão já usado na query `vendasMes` do mesmo arquivo) e três
colunas agregadas:

- `totalCusto`: `SUM(motos.precoCompra)` (COALESCE para `'0'`)
- `qtdSemCusto`: `COUNT(*) FILTER (WHERE motos.precoCompra IS NULL)`

A query `vendasMes` (que alimenta a tabela "Vendas Realizadas") ganha duas
colunas por linha:

- `precoCompra`: `motos.precoCompra`
- `valorLiquido`: mesma expressão `valorLiquidoExpr()` já usada na agregação,
  aplicada por linha (a expressão já é correlacionada por `vendas.id`, então
  funciona tanto em agregação quanto em seleção linha a linha)

## UI

**Cards no topo** (`financeiro/page.tsx`, no grid de cards existente):
- "Custo Total (Motos Vendidas)": `fmt(totalCusto)`, cor neutra/vermelha
  (é uma saída de caixa histórica, não do período).
- "Lucro Bruto": `fmt(receitaLiquida - totalCusto)`, verde se ≥ 0, vermelho
  se negativo — mesmo padrão visual do card "Saldo Caixa" já existente.
- Se `qtdSemCusto > 0`, um texto pequeno abaixo do grid de cards: "⚠ {qtdSemCusto}
  venda(s) sem custo de moto registrado (contam como R$ 0,00 no cálculo)."

**Tabela "Vendas Realizadas"** (`vendas-table.tsx`): duas colunas novas entre
"Pagamento" e "Valor" — "Custo" (preço de compra da moto, ou "—" se nulo) e
"Lucro" (receita líquida da venda − custo, colorido verde/vermelho conforme
sinal).

## Fora de escopo

- Não altera o fluxo de Entrada nem o preenchimento de `precoCompra`.
- Não cria bloco agregado "Custo x Lucro por Modelo" (a tabela de vendas já
  cobre a visão por modelo/unidade).
- Não rateia despesas operacionais no cálculo de lucro.
