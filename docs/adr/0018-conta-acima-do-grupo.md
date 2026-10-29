# 0018. Conta acima do grupo: isolamento por cliente do MOVA

- **Status:** Aceita
- **Data da decisão:** 2026-10-17
- **Fontes:** issue #164; call do Luis com o Cesar em 2026-10-16 ("Contrato e Operação do Mova",
  Read.ai); grilling da #164 em 2026-10-17 (decisões nos comentários da issue)
- **Revisa:** [0007](0007-multi-tenant-por-cnpj.md)

## Contexto

O MOVA passa a ser vendido a outros lojistas (#164, #165, #166). O ADR-0007 isola por grupo
(1 CNPJ), sem nível acima: os 3 grupos do Cesar só se ligam porque usuários têm
`usuarios.grupos_acesso` com mais de um grupo, sem registro de quem autorizou. Várias tabelas e
configurações são globais e apareceriam para qualquer cliente novo.

## Decisão

- **Conta** é o cliente do MOVA. Uma Conta tem um ou mais grupos; cada grupo pertence a uma só
  Conta. Os 3 grupos do Cesar são uma Conta, isenta, com o Cesar como `admin_socio` dela; os poderes
  dele entre os grupos (transferir, aprovar) passam a vir daí.
- **Usuário** tem exatamente uma Conta de origem.
- **Dentro da Conta**, o `admin_socio` dela administra: vê todos os grupos da Conta e define, pelo
  `grupos_acesso`, o que cada usuário vê. `admin_socio` deixa de ser global e fica preso à Conta.
  `admin_geral` (Luis e Cesar, sócios do MOVA) continua vendo tudo.
- **Entre Contas**, só por **autorização de acesso**: o `admin_socio` da Conta dona concede um
  grupo inteiro com um papel existente a um usuário de outra Conta, pelo e-mail. O pedido chega por
  fora (WhatsApp); não há fluxo de pedido no sistema. A autorização guarda quem concedeu, para quem,
  grupo, papel, quando e quando foi revogada, com o aceite, por clique, de um texto fixo pelo
  `admin_socio` que concede. Vale até ser revogada; a revogação corta o acesso na hora.
  Não gera cobrança; o bloqueio do grupo por falta de pagamento derruba também quem entra por ela.
- **Adesão de CNPJ novo**: o `admin_geral` escolhe "Conta nova" ou "Conta existente". O lojista
  não escolhe.
- **Isolamento**: banco único, filtro por Conta/grupo no app e RLS por Conta como segunda camada.
- **Antes do 1º cliente de fora**: filtro por Conta no app, #16 e `/estoque/[id]` checando o grupo.
  A RLS vem em seguida, sem bloquear.
- **Log**: acesso (quem, quando, grupo, IP) e ações sensíveis (cancelar venda, emitir ou cancelar
  NF, conceder ou revogar autorização, mudar permissão), incluindo a entrada de `admin_geral` em
  grupo de outra Conta. O `admin_socio` vê o log da própria Conta; o `admin_geral`, tudo. Guarda
  de 12 meses. O mesmo registro de acesso conta o 1º acesso para a cobrança (#166).

### Dono de cada coisa que hoje é global

| Item | Dono |
|---|---|
| `clientes` (compradores) | Conta |
| `servicos_catalogo`, `pecas_catalogo`, `categorias_caixa`, `categorias_despesa`, `simulador_precos` | Conta (cliente novo começa com cópia padrão) |
| `modelos` | Plataforma, mais os modelos próprios de cada Conta (ver adendos #287 e #321/#322) |
| `funcionarios_config`, folha e holerites | Grupo (conferir as FKs na execução) |
| `WHATSAPP_ALERTA_NUMERO` | Grupo, configurado pelo admin da Conta |
| Permissões por e-mail fixo no código | `/admin/usuarios`, por Conta (o sócio gerencia os da Conta; adendo #321/#322) |
| `CERT_MASTER_KEY`, Resend, `MCPAI_WHATSAPP_URL`, `BLING_REDIRECT_URI` | Plataforma |
| `MCPAI_ENDPOINT_URL` | Já é por grupo (ADR-0010). Conta de fora tem de cadastrar a própria chave; a env de fallback não vale para ela |
| Cron `/api/cron/pedidos-fabrica` | Plataforma, roda só para grupos com portal da fábrica |
| Kommo (`kommo_*`, `KOMMO_*`) | Fora do produto: CRM oculto por decisão do Cesar |

Buckets do Storage não foram inventariados nesta rodada.

## Por quê

- Conta, e não "cliente": "Cliente" já é o comprador no `CONTEXT.md`.
- Autorização entre Contas, e não juntar CNPJs numa Conta: é o que o Cesar descreveu ("termo de
  autorização", "quem permite é o administrador da empresa").
- Reaproveitar `admin_socio` evita mexer nas cerca de 250 ocorrências dele em ~130 arquivos de
  `src/` (contadas em 2026-10-19); muda só o escopo.
- Banco único: o app já filtra por grupo em tudo; schema ou projeto por cliente multiplicam
  migrações manuais e custo.

## Alternativas descartadas

- **Schema por Conta** e **projeto Supabase por Conta**: migração e deploy por cliente.
- **Autorização assinada eletronicamente** (fluxo do contrato de adesão): pesada para algo que se
  concede e revoga a qualquer hora.
- **Autorização por módulo ou por loja**: sistema novo de permissão sem pedido de cliente.
- **Validade automática da autorização**: só geraria renovações.
- **Auditoria de toda alteração** (antes e depois): custo no banco e no código sem pedido.
- **RLS como pré-requisito do 1º cliente**: grande demais; o risco residual é o mesmo de hoje entre
  os grupos do Cesar.

## Adendo de 2026-10-21: o sócio vê o que está marcado (#193)

Decisão do Luis: o `admin_socio` **não** vê todos os grupos da Conta automaticamente. Ele vê o
grupo da própria loja e os grupos marcados para ele em `/admin/usuarios` (`grupos_acesso`), como
antes; é para isso que a marcação existe. A Conta entra como trava: grupo de outra Conta nunca
aparece nem abre, mesmo marcado, e o cadastro recusa marcar um. Usuário sem Conta (só o
`admin_geral` deve estar assim) não vê grupo nenhum, salvo o próprio `admin_geral`. A regra fica em
`src/lib/acesso-grupo.ts`.

Na criação, a Conta dos grupos que já existiam saiu da ligação por usuários (loja e
`grupos_acesso`), migração `0133_contas.sql`. Grupo criado em `/admin/grupos` nasce numa Conta nova;
escolher uma Conta existente fica para quando for preciso (#263).

## Adendo de 2026-10-21: marcas de moto por Conta (#287)

O primeiro cliente de fora só trabalha com uma marca e via, em toda lista de modelo, as marcas
dos grupos do Cesar. O cadastro de `modelos` **continua da Plataforma** e único: apagar não serve
(os grupos do Cesar usam as outras marcas), e um catálogo por Conta duplicaria modelo, apelido da
NF e ficha fiscal. O que passa a ser da Conta é **a visibilidade das marcas** (`conta_marcas`,
migração `0138`), escolhida pelo `admin_geral` em `/admin/modelos`.

- Conta criada em `/admin/grupos` nasce vendo só MotoChefe; o `admin_geral` amplia depois.
- Conta sem nenhuma marca escolhida vê todas. A Conta do Cesar ficou assim, sem backfill.
- O filtro vale só nas **listas de escolha** (entrada, venda, demandas, transferências, garantias,
  filtros do estoque). Moto já gravada com modelo de marca escondida continua aparecendo em
  estoque, vendas e relatórios.
- Na importação de XML, modelo que só casaria com marca escondida aparece como não cadastrado.
- A regra fica em `src/lib/modelos-da-conta.ts`.

## Adendo de 2026-10-22: o sócio cadastra usuários e modelos da Conta (#321, #322)

O lojista de fora dependia da plataforma para cada contratação e para cada modelo fora do
catálogo. Decisões do Luis:

**Usuários (#322).** O `admin_socio` gerencia em `/admin/usuarios` os usuários **dos grupos que
ele vê** (adendo #193), não da Conta inteira: um sócio marcado só num grupo não mexe em quem é de
outro grupo da mesma Conta.

- Cria qualquer papel menos `admin_geral`, inclusive outro sócio. Loja, `grupos_acesso`,
  aprovações e liberações por item ficam limitados ao que ele mesmo tem.
- Define a senha inicial; o usuário troca no primeiro login (`must_change_password`).
- Só desativa e reativa. Excluir de vez continua do `admin_geral` (o histórico de vendas e OS
  aponta para o usuário). Não desativa nem rebaixa a si mesmo, para a Conta não ficar sem sócio.
- O `aux_adm` não gerencia usuários.

**Modelos (#321).** Revê em parte o adendo #287, que tinha descartado catálogo por Conta. O
catálogo da plataforma continua único; a Conta **acrescenta** modelos próprios
(`modelos.conta_id`; nulo = plataforma), visíveis só para ela, e não altera os da plataforma.
Os riscos que o #287 apontou ficaram menores: a ficha fiscal vem da NF de entrada de cada moto,
não do modelo, e o apelido da NF passa a ser único dentro da Conta.

- Só o `admin_socio` cadastra. Marca livre; o modelo da Conta aparece para ela mesmo fora das
  marcas escolhidas.
- Nome igual a um da plataforma: avisa e deixa gravar.
- Exclui só enquanto nenhuma moto ou demanda usa o modelo; depois, só edita.
- Modelo da Conta nasce sem código Bling (o Bling vai ser desligado; cliente novo emite pela Nota
  Gateway).
- O `admin_geral` vê e edita todos, com a Conta de cada um.

**Ajuste dos modelos da plataforma por Conta (#476).** Complementa o adendo #321. O modelo da
plataforma continua único e nenhuma Conta o altera; o `admin_socio` **ajusta por cima**, só na
visão da própria Conta, os modelos que ela recebeu.

- O ajuste mora em `modelo_ajustes` (`conta_id`, `modelo_id`, um campo nulável por item
  ajustável). Leitura por um ponto só: o campo ajustado mostra o valor da Conta; o resto acompanha
  a plataforma. "Voltar ao da MotoChefe" apaga o campo ajustado.
- Ajustáveis: nome, categoria, potência, motor, velocidade, foto e preço de compra padrão. Marca não.
- Motos e demandas não trocam de modelo; reimpressão mostra o nome ajustado. Documento assinado
  (`html_snapshot`) e NF de saída (`x_prod`) não mudam.
- O sócio pode ocultar um modelo da plataforma das listas da Conta.
- Só `admin_socio` e `admin_geral` ajustam modelos.
- Nome repetido: avisa e deixa gravar.
- "Cód. Bling" e "Apelidos na NF" aparecem só para a Conta que usa Bling, nunca por nome ou CNPJ
  no código. Derivado do dado: a Conta usa Bling se algum grupo dela tem credencial do Bling, sem
  flag nova.
- Conta sem esses campos casa o XML pela própria entrada: produto que não casa com nenhum nome
  oferece "associar a um modelo" ou "criar modelo com este nome"; a escolha grava o apelido da
  Conta sem mostrar o campo. Associar: quem acessa a entrada; criar modelo novo: só o sócio. Ordem do casamento: apelido da Conta, nome ajustado, nome original.

## Adendo de 2026-10-27: cargos da Conta (#449)

O `admin_socio` cria cargos próprios da Conta: escreve o nome e marca os módulos que o cargo
acessa. Os papéis fixos não mudam. Decisões do Luis:

- O cargo pertence à Conta (`cargos.conta_id`). Outra Conta não vê, não usa e não edita.
  O usuário só recebe cargo da própria Conta, e o servidor confere isso.
- Uma permissão é um módulo de `src/lib/navegacao.ts`, com o menu e a rota dele. O sócio só
  oferece os módulos que ele mesmo vê, e o servidor recusa qualquer outro. Quem tem o cargo vê
  só os módulos marcados, mais os que todos veem (Dashboard, Meus Documentos, Calendário).
- O cargo não tem papel base na tela. Quem tem cargo recebe o papel interno `cargo`, que
  sozinho não dá poder nenhum. As ações de rotina de um módulo passam a aceitar quem acessa o
  módulo. O que hoje é só de admin ou do `aux_adm` (aprovar, cancelar venda, caixa, telas
  `soPeloPapel` e `soAdminGeral`) fica fora do cargo.
- A lista de módulos que o sócio pode marcar só tem os módulos cujas ações já foram adaptadas
  e testadas para o papel `cargo`. Ela cresce a cada PR.
- Editar o cargo vale na hora para todos os usuários dele. Cargo com usuário não se apaga
  ("Cargo em uso por N usuários").
- A exceção por pessoa (`modulos_extras` e `modulos_bloqueados`) continua valendo por cima do
  cargo.
- O nome é único dentro da Conta e não repete o nome de um papel fixo.
- Quem gerencia: o `admin_socio` (nos grupos que ele vê, como no adendo #322) e o
  `admin_geral`. O `aux_adm` não.
- A tela é um diálogo aberto por um botão na lista de `/admin/usuarios`, no mesmo padrão dos
  diálogos de usuário. O cargo aparece na escolha de papel do usuário.

## Quando revisar

Se um cliente exigir isolamento físico por contrato ou lei, ou pedir acesso recortado por módulo.
