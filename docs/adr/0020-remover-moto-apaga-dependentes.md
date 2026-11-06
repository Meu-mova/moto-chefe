# 0020. Remover moto apaga a moto e tudo o que depende dela

- **Status:** Aceita
- **Data da decisão:** 2026-11-05
- **Fontes:** issue #677; grilling do Luis em 2026-11-05 (decisões registradas na issue)

## Contexto

O MOVA não tinha como tirar uma moto que entrou por engano (NF de entrada errada, chassi trocado,
moto que não é da loja). O pedido chegava ao Luis para apagar direto no banco. A moto é referenciada
por venda, reserva, pedido, transferência, OS, garantia, cupom de revisão e histórico do estoque, e
essas ligações barram o `delete` da moto.

Para moto que deixou de ser da loja sem ter sido vendida existe o **Arquivar moto** (mesma issue),
que guarda o registro. O Remover é para o que nunca devia ter entrado.

## Decisão

- **Remover moto** apaga, numa transação só, a moto e tudo o que depende dela: a venda e o que
  depende da venda (lançamentos de caixa, conciliação de cartão, PIX recebido, demanda, documento de
  assinatura e os arquivos dele no Storage), reserva, pedido, aprovação de venda, transferências,
  OS e itens, garantias, cupons de revisão, histórico do estoque, ficha fiscal e RENAVE.
- A venda sai pela **mesma rotina do Cancelar venda**, extraída para `src/lib` e usada pelos dois.
- Só `admin_socio`, `admin_geral` e `admin_rede` (este só nos grupos liberados, ADR-0019). Motivo
  obrigatório, digitar "CONFIRMAR" e registro no log de ações sensíveis com a contagem do que saiu.
- **Trava**, exceção ao [ADR-0011](0011-avise-nao-bloqueie.md): recusa a moto cuja venda tem NF de
  saída do MOVA viva ou autorizada em produção (mesma regra do
  [ADR-0014](0014-venda-com-nf-autorizada-nao-se-cancela.md), por `src/lib/notagateway/status.ts`)
  ou número de NF de fora do MOVA (Bling ou "Confirmar NF"). A frase orienta cancelar a nota antes.
  NF do MOVA em homologação não trava.
- Mês fechado, comissão já paga, peças usadas em OS e a NF de entrada voltando a "pendente" em Notas
  recebidas: **aviso**, não bloqueio. Peças não voltam ao estoque; folha e fechamento não recalculam.
- **Ficam de propósito:**
  - linhas de `notas_fiscais_saida` (o número da próxima nota sai delas; `AGENTS.md`). As telas de
    notas tratam a venda ausente.
  - `veiculos_historico` (a oficina continua achando o veículo do cliente pelo chassi).
  - `nfe_recebidas` (a NF de entrada volta a "pendente" e a moto pode ser importada de novo).

## Por quê

A moto importada por engano não existe para a loja: guardá-la, mesmo escondida, deixa contagens,
relatórios e buscas com algo que nunca foi real. Apagar os dependentes é o único jeito de o banco
aceitar o `delete`. A nota fiscal viva é a exceção porque o efeito de apagar a venda seria fiscal
(nota válida para venda que não existe), o mesmo risco do ADR-0014, e vale também para a nota emitida
fora do MOVA, que é real na SEFAZ do mesmo jeito.

Reusar a rotina do Cancelar venda evita duas formas de apagar venda que divergem com o tempo e
garante que a selfie e a assinatura do cliente (dado pessoal) saiam do Storage.

## Alternativas descartadas

- **Só arquivar**: não resolve a moto que nunca devia ter entrado; ela continuaria no banco e no
  RADAR.
- **Recusar moto com venda**: deixaria sem saída a moto importada errada que chegou a ser vendida
  no sistema.
- **Rotina própria para apagar a venda**: duplicaria o Cancelar venda e arriscaria deixar arquivos
  de dado pessoal no Storage.
- **Apagar também as linhas de NF de saída**: proibido; a numeração da próxima nota depende delas.

## Quando revisar

Se aparecer necessidade de desfazer uma remoção, ou se a NF de devolução (#75) mudar a forma de
tratar venda com nota fora do prazo de cancelamento.
