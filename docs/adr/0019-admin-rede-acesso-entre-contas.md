# 0019. admin_rede: acesso a grupos de outras Contas liberado pelo admin_geral

- **Status:** Aceita
- **Data da decisão:** 2026-10-29 (decisão do Luis)
- **Fontes:** issue #517 (texto aprovado pelo Luis no comentário da issue e as duas correções
  dele); decisões do Luis sobre clientes em 2026-10-29 e 2026-10-31
- **Revisa:** [0018](0018-conta-acima-do-grupo.md)

## Contexto

A autorização concedida pela Conta dona (seção "Entre Contas") não atendeu o caso real: quem fecha o acordo com os sócios é o admin_geral, e o pedido chega por fora.

## Decisão

No lugar da autorização concedida pela Conta dona:

- Novo papel **`admin_rede`**, acima do `admin_socio` e abaixo do `admin_geral`.
- Só o **admin_geral** libera grupos para ele, pelo modal de `/admin/usuarios`. A unidade é o grupo inteiro (CNPJ), de qualquer Conta. Loja solta continua descartada.
- Na própria Conta, o `admin_rede` segue a regra do `admin_socio`: vê o grupo da própria loja e os grupos marcados para ele (`grupos_acesso`), sem ver todos automaticamente. Os grupos liberados de outras Contas somam por cima.
- Num grupo liberado ele tem as permissões de `admin_socio`, inclusive aprovar. Lê e grava só os dados da Conta dona daquele grupo: catálogos (modelos, peças, maquininhas, categorias) da Conta dona inteira; clientes, vendas, estoque, caixa, OS, lojas e usuários só do grupo liberado. Nunca mistura com os da Conta dele.
- Aprovação do `admin_rede` (decisão do Luis, 31/10/2026): ele aprova nos grupos da Conta da loja dele e nos grupos liberados em que o `admin_geral` marcar "Aprovação de venda" (e "Aprova transferência bancária"). Ele só aprova num grupo, inclusive liberado, se estiver marcado em "Aprovação de venda" (decisão do Luis, 31/10/2026): a persona deixa de aprovar sozinha no grupo liberado. Grupo de outra Conta sem liberação (não revogada) é recusado no servidor; grupo liberado mas bloqueado por mensalidade ou inativo continua gravável, e o bloqueio vale no uso. Revogar a liberação tira a aprovação naquele grupo. "Empresas que este usuário enxerga" segue só a Conta da loja; os de fora entram por "Grupos de outras Contas".
- Num grupo liberado ele cadastra e edita os usuários (funcionários) daquele grupo em `/admin/usuarios`, com as mesmas funções do `admin_socio` (decisão do Luis, 31/10/2026). Como fica acima do `admin_socio`, alcança também o sócio do grupo liberado: edita, troca o papel, troca a senha e desativa (decisão do Luis). Não alcança `admin_geral` nem outro `admin_rede`, e não dá esses dois papéis. Quem tem qualquer outro grupo da Conta dona fica fora do alcance dele, e ele não dá acesso a grupo não liberado. O log e os dados pessoais de funcionários continuam fora, porque são da Conta inteira.
- A Conta dona vê quem tem acesso de fora (nome, Conta de origem, data), mas não revoga. Liberar e revogar ficam com o admin_geral, valem na hora e vão para o log de ações sensíveis.
- Grupo bloqueado por falta de pagamento derruba também o acesso de fora. O acesso não é cobrado.
- O `admin_socio` comum continua preso à própria Conta.

Fica substituída a concessão pelo `admin_socio` da Conta dona com aceite. A regra de mover grupo entre Contas é tratada à parte.

## Clientes no grupo liberado (decisões do Luis, 29/10 e 31/10/2026)

- Busca, lista e preenchimento de cliente: só os do grupo liberado (cliente com venda, venda de
  peças, OS ou agendamento nas lojas dele). CPF de cliente de outro grupo da Conta dona não
  preenche nada.
- Gravação também só no grupo liberado. O cadastro de cliente é único por Conta + CPF: vendendo
  para um CPF já cadastrado em outro grupo da Conta dona, a venda grava com os dados do comprador
  nela mesma, mas o cadastro do outro grupo não é atualizado, nem ligado à venda, nem mostrado.
- Cadastrar ou editar cliente com um CPF que a Conta dona já tem recebe a mesma frase neutra
  ("Não foi possível cadastrar este cliente. Fale com o administrador."), esteja o cliente no grupo liberado ou em
  outro grupo dela: "já cadastrado" revelaria que ele existe em outro grupo. Fora da persona, a
  frase continua "CPF/CNPJ já cadastrado".

## Por quê

Quem fecha o acordo com os sócios de uma rede é o `admin_geral`, e o pedido chega por fora do
MOVA.

## Alternativas descartadas

- Concessão pelo `admin_socio` da Conta dona com aceite (ADR-0018, "Entre Contas").
- A Conta dona revoga o acesso (ADR-0018 original): liberar e revogar ficam com o `admin_geral`.
- Liberação de loja solta em vez do grupo inteiro.
- Clientes, gravar pelo cadastro da Conta dona inteira (decisão de 29/10, trocada em 31/10): a
  venda no grupo liberado sobrescrevia o cadastro de um cliente de outro grupo da Conta dona.
- Clientes, recusar a venda quando o CPF já está em outro grupo da Conta dona: travaria a venda e
  revelaria que o cliente existe lá. Duplicar o cadastro exigiria mudar a regra de CPF único por
  Conta.
- Clientes, opção C (Conta dona inteira em tudo): o `admin_rede` passaria a buscar e ver os
  clientes de todos os grupos da Conta dona, além do grupo liberado.

## Quando revisar

Não registrado.
