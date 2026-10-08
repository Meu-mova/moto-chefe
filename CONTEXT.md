# MOVA

Sistema de gestão das lojas MotoChefe (motos elétricas): estoque, vendas, oficina, financeiro,
fiscal e RH de vários grupos (CNPJs) no mesmo sistema. Este arquivo é o glossário: um nome por
conceito, como o negócio fala. Decisões de arquitetura ficam em `docs/adr/`.

## Organização

**Grupo**:
Um CNPJ com suas lojas, contas e integrações próprias. Hoje: Sul de Minas, BH e Vale. Os dados
de um grupo não aparecem para outro.
_Evitar_: bandeira (no sentido de grupo; "bandeira" do cartão é outra coisa), tenant

**Loja**:
Ponto físico de um grupo. Toda moto está em uma loja, e todo funcionário de loja pertence a uma.

**Galpão Matriz**:
Loja do grupo Sul de Minas que funciona como estoque central de chegada; qualquer vendedor pode
reservar ou vender moto que está nela.
_Evitar_: galpão (sozinho), que se confunde com o galpão da fábrica

**Galpão da fábrica**:
Depósito da fábrica onde a loja retira peças compradas.

## Pessoas e papéis

**Papel**:
A função de quem usa o sistema, que define o que ele pode fazer: `admin_geral`, `admin_socio`,
`aux_adm`, vendedor, mecânico ou motorista. Papéis extras só somam permissão.

**Administrador geral** (`admin_geral`):
Administrador do sistema: o único que mexe em grupos, usuários e certificados.

**Sócio** (`admin_socio`):
Sócio. Acompanha e aprova, mas não opera a rotina da loja.
_Evitar_: adm, para se referir a ele

**Auxiliar administrativo** (`aux_adm`):
Quem opera a loja no dia a dia: muda o estado físico das motos e finaliza vendas.
Quando se diz "adm", quase sempre é o aux_adm.

**Motorista**:
Funcionário que entra no sistema só para pegar o holerite.

**Funcionário**:
A pessoa que trabalha no grupo, vista pelo lado do RH (salário, dados pessoais). É a mesma pessoa
do usuário que faz login.

**Cliente**:
Quem compra (pessoa física ou jurídica). O cadastro é único no sistema inteiro, por CPF ou CNPJ,
e não pertence a um grupo.

**Representante legal**:
A pessoa que assina o contrato de venda em nome de um cliente pessoa jurídica. É da venda, não do
cliente: a mesma empresa pode mandar pessoas diferentes em cada compra.

## Estoque de motos

**Modelo**:
Produto do catálogo (ex.: X12, GIGA), com marca e categoria (autopropelido, ciclomotor,
triciclo, bike, brinquedo, patinete).

**Moto**:
Unidade física, identificada pelo chassi, que sempre está em uma loja e entrou por uma nota
de entrada.
_Evitar_: veículo

**Moto somente garantia**:
Moto vendida fora do sistema, cadastrada só para registrar garantia. Nunca é estoque.

**Status**:
Onde a moto está fisicamente: na caixa, montada, em garantia ou vendida.

**Na caixa**:
Status da moto que chegou e ainda não foi montada. A tela mostra "Caixa".
_Evitar_: caixa (sozinho), que é o dinheiro da loja; faturada (status legado, sem motos hoje)

**Montagem**:
Desembalar a moto e deixá-la pronta, com mecânico responsável e data.

**Vendida**:
Status final da moto que saiu da loja por uma venda.

**Disponibilidade**:
Situação comercial da moto: disponível, reservada ou aguardando aprovação enquanto está à venda.
Depois da venda, só diz se a NF de saída já saiu: a tela mostra "Ag. NF Saída" até a nota ser
emitida.

**Showroom**:
O conjunto de motos do grupo à venda, com status e disponibilidade.
_Evitar_: estoque, quando a intenção é "o que está à venda"

**Transferência**:
Solicitação para mudar uma moto de loja, que a loja de destino aceita ou recusa.

**Entrada de motos**:
Recebimento das motos de uma nota de entrada no estoque da loja (tela "Entrada").

**RADAR**:
Busca de qualquer moto pelo chassi, inclusive as vendidas.
_Evitar_: Radar Fiscal (é a tela de notas recebidas)

## Venda

**Reserva**:
Moto separada para um cliente mediante a entrada da reserva, com data prevista para finalizar a
venda. Termina convertida em venda ou cancelada.

**Entrada da reserva**:
O dinheiro que o cliente paga para reservar uma moto, com um valor mínimo. A tela chama de
"Valor da Entrada".
_Evitar_: valor da reserva; "entrada" sozinha, que também é entrada de motos, entrada de caixa e
entrada do financiamento

**Venda**:
O registro definitivo da venda de uma moto: cliente, valor, formas de pagamento, origem da venda
e NF de saída. A tela chama o ato de "finalizar" ou "registrar" venda.

**Venda faturada**:
Venda cuja NF de saída foi autorizada em produção e não foi cancelada.
_Evitar_: faturada, para moto (status legado)

**Pedido de venda**:
Registro interno que numera a venda. Não é uma etapa do negócio: toda venda já nasce com o
pedido efetivado. Quando um PIX recebido aponta para um "pedido", é este.
_Evitar_: pedido (sozinho), que se confunde com o pedido da fábrica

**Precificação**:
Tabela de preços de cada modelo no grupo, com as taxas de cada meio de pagamento. É de onde sai o
preço mínimo.

**Preço mínimo**:
Menor valor pelo qual um modelo pode ser vendido no grupo, conforme a precificação.

**Desconto**:
Quanto o valor líquido da venda (depois das taxas do meio de pagamento) ficou abaixo do preço
mínimo.

**Aprovação**:
Venda (ou OS, ou venda de peça) retida até alguém autorizado aprovar ou recusar. Há dois tipos:
valor mínimo e pagamento sensível.
_Evitar_: pedido de aprovação

**Aprovação de valor mínimo**:
Exigida quando a venda fica abaixo do preço mínimo; aprova um sócio ou o admin do grupo.

**Aprovação de pagamento sensível**:
Exigida por certos meios de pagamento (transferência bancária na venda de moto, financiamento
na venda de peça); aprova só quem tem essa permissão.

**Origem da venda**:
Por onde chegou quem comprou, escolhida pelo vendedor ao fechar a venda, num catálogo de cada
grupo. É da venda, não do cliente.
_Evitar_: origem (sozinho), canal

**Demanda**:
Encomenda de um modelo e cor que a loja não tem no estoque. Pode ter sinal pago e termina
atendida quando vira venda.

**Sinal**:
O dinheiro que o cliente adianta numa demanda, com recibo. Na reserva, o equivalente se chama
entrada da reserva.

## Comercial

**Lead**:
Contato no funil de atendimento (Kommo), antes de comprar.

**Canal**:
Por onde o lead entrou no Kommo (anúncio, WhatsApp, perfil). Mede quem chegou; a origem da venda
mede quem comprou.
_Evitar_: origem

**Comunicado**:
Aviso do grupo para os funcionários, filtrado por papel, com controle de leitura.

**Calendário**:
Eventos de gestão do grupo (reuniões, datas), diferente da agenda da oficina.

## Oficina

**OS (ordem de serviço)**:
Atendimento de uma moto na oficina, da abertura até a conclusão e o pagamento. Pode ser cancelada
enquanto não tem pagamento.

**Agendamento**:
Horário marcado na agenda da oficina, que vira OS quando o cliente chega.

**Garantia**:
Período de cobertura de uma moto vendida, ativo ou encerrado. A peça trocada na garantia pode
ser solicitada à fábrica.

**Serviço**:
Mão de obra do catálogo, cobrada numa OS.

**Peça**:
Item do catálogo de peças e acessórios, com quantidade em estoque.

**Venda de peça**:
Venda de balcão de peças e acessórios, sem nota fiscal.

**Cupom de revisão**:
Desconto emitido à mão que abate só a mão de obra de uma OS; vence numa data.

**Pedido da fábrica**:
Compra de peças feita pela loja no portal da fábrica.

**Retirada de peças**:
Peças de pedidos da fábrica já separados que a loja busca no galpão da fábrica. As demais a
fábrica envia pelos Correios.

**Histórico de veículos**:
Relação de todas as motos já comercializadas (chassi, modelo, cor, ano), importada para
completar os dados da moto ao abrir uma OS.

## Financeiro

**Caixa**:
O dinheiro da loja: lançamentos de entrada e saída do dia, com aprovação.
_Evitar_: caixa, para o status da moto (use "na caixa")

**Despesa**:
Saída de dinheiro do grupo, com categoria. Pode ou não contar como custo operacional (compra de
moto e retirada de sócio não contam).

**Conta a pagar**:
Compromisso agendado (único, recorrente ou calculado sobre uma base), que gera uma ocorrência por
mês. Não é o pagamento em si.

**Beneficiário**:
Sócio que recebe retirada ou pró-labore.

**Conciliação de cartão**:
Conferir cada transação da operadora de cartão contra a venda, OS ou venda de peça que ela paga.

**PIX recebido**:
PIX ou TED que entrou na conta do grupo (via Open Finance), ligado à venda, OS ou peça que paga.

## Fiscal

**Nota de entrada**:
NF da fábrica para o grupo, que dá origem à moto no estoque.

**Ficha fiscal**:
Os dados fiscais de cada moto, copiados da nota de entrada. O nome do produto vai literal para a
NF de saída.

**NF de saída**:
Nota fiscal que o grupo emite ao vender a moto, pela Nota Gateway.
_Evitar_: nota, nota fiscal (sozinhos), quando houver dúvida entre entrada e saída

**Cancelamento da NF de saída**:
Anulação de uma NF de saída autorizada junto à SEFAZ, possível só dentro do prazo legal (24h,
na regra geral da SEFAZ). Em produção, a venda continua e volta a aguardar NF de saída.
_Evitar_: cancelar a venda (é outra coisa: desfaz a venda inteira); excluir a nota

**NF de devolução**:
Nota que registra o retorno da moto vendida, referenciando a NF de saída original. Depois do
prazo de cancelamento, é a saída usual; a outra é o cancelamento extemporâneo, pedido à SEFAZ.
_Evitar_: nota de estorno

**Homologação**:
Ambiente de teste da emissão fiscal: a nota não vale e não fatura a venda.

**Origem fiscal**:
Código de procedência da mercadoria na nota (nacional, importada…), que vem da nota de entrada.
_Evitar_: origem (sozinho)

**Certificado A1**:
Certificado digital do grupo que autoriza emitir nota e consultar a SEFAZ em nome do CNPJ.

**Notas recebidas**:
NF-e emitidas por terceiros contra o CNPJ do grupo, lidas da SEFAZ (tela "Notas Recebidas").
_Evitar_: Radar, que é a busca de moto pelo chassi

**Contrato de venda**:
Documento que o cliente assina, digitalmente ou no papel. A NF de saída só sai com o contrato
assinado ou com liberação justificada.

## RH

**Folha**:
O que cada funcionário recebe no mês: salário, comissão e premiação, menos adiantamentos.

**Comissão**:
Percentual sobre uma base (vendas próprias, peças da loja etc.), definido por regra.

**Premiação percentual**:
Regra de premiação calculada como percentual sobre uma base, cadastrada junto das comissões.
_Evitar_: premiação (sozinho)

**Premiação OTE**:
Valor fixo que o vendedor ganha ao atingir uma faixa de vendas no mês.
_Evitar_: premiação (sozinho)

**Adiantamento**:
Valor pago antes do fechamento da folha (eventual ou fixo mensal) e descontado dela.

**Holerite**:
Comprovante de pagamento que a contabilidade gera e o funcionário baixa no sistema.

**Ajuste de base**:
Venda real que não foi lançada no sistema e só entra no cálculo da folha.

**Meta**:
Faturamento mensal esperado de uma loja.
