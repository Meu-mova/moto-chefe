# OS: chassi na impressão, múltiplos pagamentos e OS gratuita

Data: 2026-07-21

## Contexto

Três ajustes pontuais no módulo de Ordem de Serviço (OS):

1. O chassi não aparece na impressão da OS quando o veículo é "externo" (digitado na abertura, sem estar no estoque).
2. A OS só aceita uma forma de pagamento por vez, diferente de vendas de moto (que já suporta múltiplas formas somadas, com conciliação individual por forma).
3. OS de valor R$0,00 fica travada como pendente de pagamento/conciliação para sempre quando a forma escolhida é PIX ou Cartão, e não existe um jeito rápido de fechar uma OS gratuita.

## 1. Chassi na impressão da OS

**Situação atual:** `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx` já imprime o chassi quando a OS está vinculada a uma moto do estoque (`os.chassi`, obtido via join com `motos.chassi` em `buildSelect`, `src/lib/queries/ordens-servico.ts`). Quando a OS é de um veículo externo, o chassi é digitado na abertura e gravado em `ordensServico.chassiOs`, mas essa coluna nunca é selecionada em nenhuma query — o bloco "Chassi" da impressão simplesmente não aparece nesses casos.

**Mudança:**
- Adicionar `chassiOs: ordensServico.chassiOs` ao `buildSelect` em `src/lib/queries/ordens-servico.ts`.
- Na página de impressão, trocar a condição `os.chassi && (...)` por usar `os.chassi ?? os.chassiOs`, mantendo o mesmo bloco visual (label "Chassi", fonte monoespaçada).
- Sem mudança de schema — `chassiOs` já existe e já é gravado corretamente em `abrirOSAction`.

## 2. Vários métodos de pagamento na OS

**Situação atual:** `OSPagamentoPanel` (`src/app/(dashboard)/ordens-servico/[id]/components/os-pagamento-panel.tsx`) tem um único campo de valor e um único `<select>` de forma de pagamento. `aplicarPagamentoOS` (`src/app/(dashboard)/ordens-servico/actions.ts`) grava só 1 item em `ordensServico.pagamentos` (jsonb) quando a forma é cartão, ou `null` quando não é. O status de conciliação é calculado por `calcStatusPagamentoUnicoOS` (`src/lib/conciliacao-status.ts`), que decide entre cartão/PIX/nenhum a partir da única `formaPagamento` gravada.

Vendas de moto (`VenderButton`, `src/app/(dashboard)/estoque/components/vender-button.tsx`) já resolve o problema equivalente com uma lista de linhas de pagamento (`Pgto[]`, com `+ Adicionar forma de pagamento` / remover linha), validação de somatório contra o valor total, e campos extras (operadora/parcelas/autorização) por linha quando é cartão. A conciliação usa `calcStatusMultiPagamento`, que separa o total lançado em cartão (contra `conciliacoes_cartao`) e PIX (contra `pix_recebimentos_mcp`) e resolve o status de cada grupo — ou seja, a conciliação individual por forma de pagamento, mesmo com várias linhas, já é suportada por essa função.

O schema e a infraestrutura de conciliação (`src/app/(dashboard)/conciliacao/actions.ts`: `buscarVendasParaVincular`, `buscarVendaManual`, auto-match de CSV por autorização) já tratam `ordensServico.pagamentos` como um array igual ao de vendas — hoje só não é usado assim na prática porque `aplicarPagamentoOS` só grava 1 item.

**Mudanças:**

- **`OSPagamentoPanel`**: reescrever no mesmo padrão do `VenderButton` — lista de linhas `{ tipo, valor, operadora?, parcelas?, autorizacao? }`, botão de adicionar/remover linha, validação de somatório contra o valor total da OS. Tipos internos alinhados aos de vendas: `pix`, `dinheiro`, `cartao_credito`, `cartao_debito`, `transferencia`. Mantém `cortesia` como tipo específico de OS (forma "Cortesia / Garantia") — não entra na soma que exige conciliação (equivalente a `dinheiro`/`financiamento` em `calcStatusMultiPagamento`, que já ignora tipos fora do `TIPOS_CARTAO`/`pix`).
- **`aplicarPagamentoOS` / `registrarPagamentoOSAction`** (`ordens-servico/actions.ts`): passam a receber um array de pagamentos (`DadosPagamentoOS` vira `{ valorTotal: number; pagamentos: PgtoOS[] }`), gravando o array completo em `ordensServico.pagamentos` (hoje só grava quando é cartão). `formaPagamento` (coluna legada, texto) passa a guardar o tipo do primeiro pagamento, só para exibição resumida (mesmo padrão de `vendas.formaPagamento`).
- **Pagamento sensível**: a checagem de aprovação (hoje `TIPOS_PAGAMENTO_SENSIVEL_OS = new Set(['Transferência'])`, comparada com a única forma) passa a checar por linha — `pagamentos.some(p => p.tipo === 'transferencia')` — mesmo padrão de `TIPOS_PAGAMENTO_SENSIVEL` em vendas. Fluxo de aprovação (`aprovacoesVenda`, origem `'os'`) continua igual.
- **`calcStatusPagamentoUnicoOS`**: deixa de ser usada (era exclusiva de OS) e é removida de `src/lib/conciliacao-status.ts`. Os 4 pontos que a usam passam a usar `calcStatusMultiPagamento(..., o.conciliadoValor, o.pixConciliadoValor, o.valorTotal)`, igual a vendas/peças:
  - `src/lib/queries/dashboard.ts`
  - `src/app/(dashboard)/ordens-servico/page.tsx`
  - `src/app/(dashboard)/ordens-servico/components/os-card.tsx`
  - `src/app/(dashboard)/ordens-servico/[id]/components/os-conciliacao-panel.tsx`

  **Compatibilidade com OS antigas:** hoje `ordensServico.pagamentos` só é gravado quando a forma é cartão (`TIPO_CARTAO_OS`); PIX, Dinheiro, Transferência e Cortesia ficam com `pagamentos = null` e só `formaPagamento` (texto em português, ex. `'PIX'`) preenchido. Se os 4 pontos passarem a ler só `o.pagamentos`, OS antigas de PIX perderiam a detecção de pendência (array vazio → `calcStatusMultiPagamento` retorna `'na'` em vez de calcular contra `pixConciliadoValor`), e OS antigas de Dinheiro/Transferência/Cortesia passariam de `'conciliada'` para `'na'` — uma regressão de exibição para dados existentes.

  Para evitar isso, adicionar em `src/lib/conciliacao-status.ts` uma função `pagamentosEfetivosOS(formaPagamento, pagamentos, valorTotal)` que retorna `pagamentos` quando já é um array não vazio, ou sintetiza um array de 1 item a partir do `formaPagamento` legado (mapeando os labels antigos para os tipos internos: `'PIX'→'pix'`, `'Dinheiro'→'dinheiro'`, `'Cartão de Crédito'→'cartao_credito'`, `'Cartão de Débito'→'cartao_debito'`, `'Transferência'→'transferencia'`, `'Cortesia / Garantia'→'cortesia'`) com `valor: valorTotal`, ou `[]` se não houver `formaPagamento`. Os 4 pontos de leitura chamam `calcStatusMultiPagamento(pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal), o.conciliadoValor, o.pixConciliadoValor, o.valorTotal)`.
- **`OSConciliacaoPanel`**: em vez de decidir uma única seção (`ehCartao`/`ehPix`) a partir de `formaPagamento`, passa a olhar o array `pagamentos` e mostrar uma seção "Cartão" se houver alguma linha `cartao_credito`/`cartao_debito`, e uma seção "PIX" se houver alguma linha `pix` — cada uma com seu próprio estado de conciliado/pendente, igual ao comportamento atual mas podendo mostrar as duas ao mesmo tempo.

## 3. OS gratuita (R$ 0,00)

**Bug encontrado:** em `calcStatusPagamentoUnicoOS`/`calcStatusMultiPagamento`, quando o valor total é 0 mas a forma lançada é cartão ou PIX, a checagem `conciliado < 0.01 → 'pendente'` roda antes de comparar com o valor total — então uma OS de R$0,00 nessas formas nunca vira `'conciliada'`.

**Correção:** em `calcStatusMultiPagamento` (única função que sobra após a remoção de `calcStatusPagamentoUnicoOS`), adicionar checagem no topo: se `Number(valorTotal) < 0.01`, retornar `'conciliada'` direto, para qualquer conteúdo de `pagamentos`. Isso também beneficia vendas/peças de valor zero, sem lógica nova — reaproveita a mesma função.

**Fluxo dedicado no painel de pagamento:** em `OSPagamentoPanel`, quando o valor total da OS (soma dos itens, `valorServicos + valorPecas`) é R$0,00, o formulário normal de pagamento (lista de linhas) não é exibido. Em vez disso aparece um único botão **"Concluir OS gratuita"**, que chama `aplicarPagamentoOS` com `pagamentos: []` e `valorTotal: 0`, avançando a OS direto de `pendente_pagamento` para `concluida` sem exigir seleção de forma de pagamento. Como o valor é 0, o status de conciliação já resolve para `'conciliada'` pela correção acima — sem pendência.

Esse botão não passa pelo fluxo de aprovação de pagamento sensível (não há forma sensível envolvida) e está disponível para qualquer papel com permissão de registrar pagamento (`GESTORES`, igual hoje).

## Fora de escopo

- Não altera a abertura da OS, o cálculo de itens (`os_itens`), nem a numeração/valor mínimo de OS (OS nunca teve valor mínimo, diferente de vendas de moto).
- Não adiciona novos tipos de pagamento a vendas de moto (financiamento, link de pagamento continuam exclusivos de lá).
- Não mexe na tela de PIX (`/pix-mcp`) nem no fluxo de importação de relatório de cartão (`conciliacao/actions.ts`) — só consome a mesma infraestrutura já existente.

## Testes

- Impressão: abrir OS de moto do estoque (chassi via `motos`) e OS de veículo externo (chassi via `chassiOs`) e conferir que ambos imprimem o chassi.
- Pagamento múltiplo: registrar OS com 2+ linhas de pagamento (ex.: PIX + Cartão de Crédito) somando o total, conferir que `ordensServico.pagamentos` grava as duas linhas e que o card/lista mostra conciliação pendente até vincular a transação de cada forma.
- Transferência continua exigindo aprovação quando presente em qualquer linha.
- OS gratuita: OS com itens de valor R$0,00 (ou sem itens) mostra o botão dedicado, fecha como concluída, e aparece como conciliada na listagem/dashboard imediatamente.
- Regressão: OS antigas gravadas só com `formaPagamento` (texto, sem array `pagamentos` ou com `pagamentos = null`) continuam com o mesmo status de conciliação de antes, via `pagamentosEfetivosOS` — testar pelo menos um caso de cada forma legada (PIX, Dinheiro, Cartão, Transferência, Cortesia).
