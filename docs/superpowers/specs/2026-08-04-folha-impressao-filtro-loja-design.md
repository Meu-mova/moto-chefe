# Folha de pagamento: filtro por loja e impressão

**Data:** 2026-08-04
**Status:** aprovado

## Problema

A folha de pagamento hoje mostra todos os funcionários do grupo numa tela só, e
não tem como imprimir. A contabilidade precisa receber o fechamento **separado
por loja**, em papel (ou PDF), e hoje isso é feito na mão.

## Escopo

Duas entregas:

1. **Filtro por loja** na tela da folha.
2. **Botão de imprimir**, gerando a folha consolidada da loja filtrada.

Fora de escopo, por decisão explícita: recibo individual com assinatura,
exportação para Excel, e envio por e-mail ou WhatsApp.

## Filtro por loja

Query param `?loja=<id>`, o mesmo padrão que o dashboard e a tela de OS já usam.
Um seletor ao lado do seletor de mês, com "Todas as lojas" como padrão.

**O filtro entra antes das consultas, não depois.** Restringe `lojaIdsGrupo` à
loja escolhida logo no começo da página. Isso não é detalhe de implementação: a
base de comissão de vários `aux_adm` incide sobre o total da **loja**
(`BASES_COMISSAO` em `@/lib/folha`), então filtrar a lista já calculada daria o
valor certo por pessoa e o total errado. Filtrando na origem, os cinco cards de
totais recalculam sozinhos e passam a significar "o que esta loja custa no mês".

O filtro vale para a aba **Folha do Mês** e para a aba **Funcionários** — as duas
são listas de pessoas. As abas Premiação (faixas são do grupo) e Ajustes (já tem
escopo próprio) não mudam.

A página inteira é restrita a admins (`ADMINS`, `page.tsx:54`), então não existe
a questão de um gerente ver só a própria loja.

## Impressão

Rota nova `(print)/folha-pagamento/imprimir`, aberta num separador novo por um
botão com `window.open`, exatamente como `/relatorio-fabrica` já faz. O
`PrintButton` daquela tela (`src/app/(dashboard)/relatorio-fabrica/print-button.tsx`)
tem a rota fixa no código; passa a receber `href` por parâmetro e serve às duas.

A rota recebe `?mes=` e `?loja=` e **refaz o mesmo cálculo da tela**. Os números
não viajam por querystring: dado financeiro em URL é frágil, some no primeiro
reload e é adulterável por quem tem o link.

O papel: cabeçalho com nome do grupo, mês por extenso e a loja (ou "Todas as
lojas"); a tabela com as mesmas sete colunas da tela — funcionário, base de
comissão, salário, comissão, premiação, ajuda de custo, total a pagar — mais uma
coluna de **CPF**, que a contabilidade precisa para identificar cada pessoa;
linha de totais no rodapé; data de emissão no pé. Sem menu e sem botões, com
`@media print` para caber em A4 retrato.

O CPF vem de `usuarios_dados`, preenchido pelo próprio funcionário em
`/completar-cadastro`. Quem ainda não preencheu aparece com "—" no lugar do
número: o papel sai assim mesmo, sinalizando quem falta, em vez de esconder a
pessoa da folha. O CPF entra **só na impressão** — a tela continua sem ele, para
não espalhar dado pessoal por quem só quer conferir totais.

## A refatoração que isso exige

O cálculo da folha vive inteiro dentro de `page.tsx` — cerca de 200 linhas de
consultas e agregação. Se a rota de impressão copiar esse cálculo, as duas
versões envelhecem separadas e um dia a folha impressa deixa de bater com a da
tela. Como o papel vai para a contabilidade, essa divergência custaria caro.

O cálculo sai para `src/lib/queries/folha.ts`, numa função
`calcularFolhaDoMes({ mes, lojaIds, grupoId })` que devolve a lista de
funcionários com seus valores e os cinco totais. Tela e impressão passam a
chamar a mesma função.

**Trava de segurança, porque o Cesar está fechando julho neste momento:** antes
de mover qualquer linha, os números de julho/2026 de todas as lojas são gravados
num arquivo. Depois da extração, o mesmo cálculo roda de novo e é comparado
valor a valor. Qualquer diferença, mesmo de um centavo, reverte a refatoração.
A extração só é aceita se a saída for idêntica.

## Testes

`calcularFolhaDoMes` passa a ter teste — hoje esse cálculo, que decide quanto
cada pessoa recebe, não tem nenhum. Os casos que importam:

- vendedor com comissão sobre as próprias vendas;
- `aux_adm` cuja base é o total da **loja**, não o que ele vendeu (o caso que o
  filtro por loja pode quebrar);
- mecânico comissionando só sobre mão de obra, não sobre as peças da OS;
- mês sem venda nenhuma (tudo zero, sem `NaN` e sem divisão por zero);
- funcionário inativo fora do resultado.

Os testes usam dados montados na entrada da função, sem banco — a função recebe
os números já buscados e faz a agregação, para poder ser testada assim.

A impressão é conferida abrindo a rota e comparando número por número com a
tela, no mesmo mês e na mesma loja.

## Riscos

- **Refatoração em código em uso agora.** Mitigado pela comparação antes/depois
  descrita acima; sem números idênticos, não vai.
- **A folha muda sozinha com o tempo.** A base usa valor líquido de cartão, que
  só desconta a taxa das transações **já conciliadas** — conciliar mais cartão
  depois muda o número de um mês já impresso. Não é introduzido por esta
  entrega, mas quem receber o papel precisa saber que ele é uma fotografia do
  momento. Por isso a data de emissão no rodapé.
