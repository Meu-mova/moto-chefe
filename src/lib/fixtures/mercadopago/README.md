# Fixtures do Mercado Pago (Point)

PROVISÓRIO — montado a partir da documentação pública do `/v1/payments`, com valores falsos
(ids 1000000001..., serial `FAKESERIAL01`, nome fictício). Antes do merge, substituir por
pagamentos reais do BH mascarados e conferir os caminhos de `point_of_interaction` e do serial.

Suposição da regra `ehDaMaquininha` (única função, em `conciliacao-mercadopago.ts`): o pagamento
veio da maquininha se `point_of_interaction.type === 'POINT'` ou se há
`point_of_interaction.device.serial_number`. Link de pagamento e checkout não trazem isso.
Se o campo real for outro, ajuste só aquela função e estas fixtures.
