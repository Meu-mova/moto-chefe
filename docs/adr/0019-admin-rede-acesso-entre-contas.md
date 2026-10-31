# 0019. admin_rede: acesso a grupos de outras Contas liberado pelo admin_geral

- **Status:** Aceita
- **Data da decisão:** 2026-10-29 (decisão do Luis)
- **Fontes:** issue #517 (texto aprovado pelo Luis no comentário da issue); decisão do Luis sobre
  clientes em 2026-10-29
- **Revisa:** [0018](0018-conta-acima-do-grupo.md)

## Contexto

A autorização concedida pela Conta dona (seção "Entre Contas") não atendeu o caso real: quem fecha o acordo com os sócios é o admin_geral, e o pedido chega por fora.

## Decisão

No lugar da autorização concedida pela Conta dona:

- Novo papel **`admin_rede`**, acima do `admin_socio` e abaixo do `admin_geral`.
- Só o **admin_geral** libera grupos para ele, pelo modal de `/admin/usuarios`. A unidade é o grupo inteiro (CNPJ), de qualquer Conta. Loja solta continua descartada.
- Na própria Conta, o `admin_rede` segue a regra do `admin_socio`: vê o grupo da própria loja e os grupos marcados para ele (`grupos_acesso`), sem ver todos automaticamente. Os grupos liberados de outras Contas somam por cima.
- Num grupo liberado ele tem as permissões de `admin_socio`, inclusive aprovar. Lê e grava só os dados da Conta dona daquele grupo (clientes, modelos, maquininhas, categorias), sem misturar com os da Conta dele.
- Num grupo liberado ele cadastra e edita os usuários (funcionários) daquele grupo em `/admin/usuarios`, com as mesmas funções do `admin_socio` (decisão do Luis, 31/10/2026). Quem tem qualquer outro grupo da Conta dona fica fora do alcance dele, e ele não dá acesso a grupo não liberado. O log e os dados pessoais de funcionários continuam fora, porque são da Conta inteira.
- A Conta dona vê quem tem acesso de fora (nome, Conta de origem, data), mas não revoga. Liberar e revogar ficam com o admin_geral, valem na hora e vão para o log de ações sensíveis.
- Grupo bloqueado por falta de pagamento derruba também o acesso de fora. O acesso não é cobrado.
- O `admin_socio` comum continua preso à própria Conta.

Fica substituída a concessão pelo `admin_socio` da Conta dona com aceite. A regra de mover grupo entre Contas é tratada à parte.

## Clientes no grupo liberado (decisão do Luis, 29/10/2026)

- Busca, lista e preenchimento de cliente: só os do grupo liberado (cliente com venda, venda de
  peças, OS ou agendamento nas lojas dele). CPF de cliente de outro grupo da Conta dona não
  preenche nada.
- Gravação por Conta + CPF (o cadastro de cliente é único por Conta) usa o cadastro da Conta
  dona, sem devolver dados dele à tela.

## Por quê

Quem fecha o acordo com os sócios de uma rede é o `admin_geral`, e o pedido chega por fora do
MOVA.

## Alternativas descartadas

- Concessão pelo `admin_socio` da Conta dona com aceite (ADR-0018, "Entre Contas").
- A Conta dona revoga o acesso (ADR-0018 original): liberar e revogar ficam com o `admin_geral`.
- Liberação de loja solta em vez do grupo inteiro.
- Clientes, opção A (só o grupo liberado em tudo, inclusive na gravação): o cliente é único por
  Conta+CPF; vender para um CPF já cadastrado em outro grupo da Conta dona falharia ou exigiria
  duplicar o cadastro e mudar essa regra.
- Clientes, opção C (Conta dona inteira em tudo): o `admin_rede` passaria a buscar e ver os
  clientes de todos os grupos da Conta dona, além do grupo liberado.

## Quando revisar

Não registrado.
