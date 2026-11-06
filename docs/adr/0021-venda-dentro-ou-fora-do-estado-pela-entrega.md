# 0021. Venda dentro ou fora do estado pela Entrega, não pela UF do cliente

- **Status:** Aceita
- **Data da decisão:** 2026-11-05
- **Fontes:** issue-mãe #682 (grilling Q1 e decisões de 05/11/2026), #725; respostas escritas do
  contador de Teresina (05/11/2026, comentário de 05/11 na #682) e do suporte da Nota Gateway (Hermes, 05/11/2026)

## Contexto

O MOVA decidia se a NF de saída é de venda dentro ou fora do estado comparando a UF do endereço do
cliente com a UF do emitente. A venda não guardava onde a moto chega ao cliente.

- Em Teresina, a NF 22 (venda #32088), de cliente com endereço no Maranhão que levou a moto da loja,
  foi recusada em 01/11/2026 com a rejeição 697.
- O contorno em uso era pôr um CEP de dentro do estado no endereço do cliente. A nota saía, mas o
  DANFE e o contrato mostravam o endereço da loja como se fosse o do cliente.

A página de emissão da Nota Gateway (https://docs.notagateway.com.br/v2/reference/emitir-nota-fiscal-nfe,
`updatedAt 2026-06-16`) separa `cliente.endereco` de `transporte.enderecoEntrega`, mas **não diz** de
qual dos dois sai a operação interna ou interestadual. O suporte respondeu por escrito (05/11/2026):
*"Nossa infraestrutura não define esse ponto automaticamente, mas os campos que você enviar na
requisição [...] vão definir se é dentro ou fora do estado: CFOP, endereço de entrega ou do tomador."*
A decisão é do MOVA.

## Decisão

- A venda guarda a **Entrega da venda** (`vendas.entrega`, copiada do pedido; migração 0175).
- **Retira na loja** = venda dentro do estado, com o endereço real do cliente em `cliente.endereco`
  e sem `transporte.enderecoEntrega`, **exceto** quando o cliente é de outra UF e:
  - a moto se emplaca (categoria ciclomotor, a mesma regra de `exigeRenave`): o contador escreveu
    que *"o estado não aceita, considera venda interestadual"*;
  - o cliente tem inscrição estadual (indicador "contribuinte"): *"deve ser feita VENDA INTERESTADUAL"*.
  Nesses dois casos a nota sai interestadual, ainda sem `enderecoEntrega`.
- **Entregar** (#726) compara a UF da entrega com a do emitente.
- **Venda sem Entrega** (anterior à 0175) segue a regra antiga, pela UF do cliente; a prévia avisa.
- A modalidade do frete vai sempre explícita na venda com Entrega; sem ela a prévia avisa e a nota
  não sai.
- Uma função pura decide (`operacaoDaVenda`, `src/lib/notagateway/entrega.ts`); payload, prévia e
  tela usam a mesma.

## Por quê

O contador de Teresina respondeu que, para a pessoa física que retira na loja, *"o que define a
tributação nesse caso não é o domicílio do comprador, mas o fato da mercadoria ter sido entregue e
retirada fisicamente dentro do seu estado"*. O MOC 7.0, Anexo I
(https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf), regra
I08-70 (rejeição 521, trecho citado na #682 em 05/11/2026), só aceita operação interna com
destinatário contribuinte de outra UF se a venda for presencial e sem frete;
como o contador manda o contribuinte de outra UF para interestadual, a 521 não se aplica. Guardar a
Entrega na venda tira o CEP falso do endereço do cliente.

## Alternativas descartadas

- **Continuar pela UF do cliente com o contorno do CEP**: o DANFE e o contrato saem com o endereço errado.
- **Deduzir a Entrega sozinho** (ex.: venda presencial = retirada): o MOVA não sabe se a moto foi
  entregue; quem vende informa.
- **Supor a Entrega das vendas antigas**: decisão do Luis (Q7); vendas antigas ficam vazias, sem backfill.

## Quando revisar

Se o contador ou a SEFAZ de outro estado mudarem a regra da retirada por cliente de outra UF, ou se a
alíquota por UF de destino (#150) mudar o que a nota interestadual leva.

Se o MOVA deixar de mandar `consumidorFinal: true` (`payload.ts`): a retirada de cliente de outra UF como
venda dentro do estado passaria a cair na rejeição 773. O MOC 7.0, Anexo I, regra E12-40 (p. 84-85 do
[PDF oficial](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf)),
rejeita a NF de saída com *"operação é Interna no Estado (tag:idDest = 1) e operação não é com Consumidor
final: UF do destinatário (tag: enderDest/UF) difere da UF do emitente"* (773: *"Operação Interna e UF de
destino difere da UF de origem"*). Hoje toda nota vai como consumidor final, e a regra não se aplica.
