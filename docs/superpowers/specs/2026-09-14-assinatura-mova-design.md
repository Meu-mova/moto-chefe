# Assinatura do MOVA — cobrança mensal dos lojistas

**Data:** 2026-09-14
**Status:** Revisada em 2026-10-17 (#166), à luz do contrato de adesão (#165) e da Conta (#164, ADR-0018)
**Decisões do Cesar:** cobrança **PIX/boleto mensal** (não recorrência no cartão);
**bloqueio 5 dias** após o vencimento; preço **por CNPJ (grupo)**; bloqueado **não
vê nada** além da tela de pagamento; **o dono continua entrando, só para pagar**;
os grupos do Cesar nascem **isentos**.

### Revisão de 2026-10-17

Decisões da call com o Cesar (16/10) e do grilling da #166 (17/10). Onde o texto abaixo divergir,
vale esta seção.

- **Nomes**: as tabelas viram `mensalidade_config`, `mensalidades` e
  `mensalidade_webhook_eventos`. "Assinatura" no código já é a assinatura eletrônica
  (`src/lib/assinatura/`).
- **Valores vêm da adesão** (`adesoes_mova.valor_mensal` e `taxa_implantacao`), que passa a
  apontar para o grupo que gerou. A taxa de implantação vai junto da 1ª mensalidade.
- **Vencimento** (contrato 4.1): o 1º vence 30 dias após o 1º acesso de um usuário do grupo que
  não seja `admin_geral` (`grupos.primeiro_acesso_em`). Os seguintes vencem no mesmo dia dos meses
  seguintes; se esse dia for 29, 30 ou 31, vencem no dia 28. O `dia_vencimento` da adesão sai de uso.
- **Quando a cobrança nasce**: o cron diário cria a cobrança quando faltam 10 dias ou menos
  para o vencimento. O link **vale até ser pago**.
- **Aviso**: e-mail (Resend) ao responsável do contrato quando a cobrança nasce e no vencimento,
  mais um aviso no topo do sistema com o botão de pagar.
- **Atraso** (contrato 4.4): numa cobrança vencida, o link é refeito com multa de 2% e juros de
  1% ao mês, pro rata dia. A preferência antiga é cancelada.
- **Pagamento**: PIX, boleto e cartão de crédito ou débito no link do Mercado Pago. O MOVA nunca
  guarda dado de cartão.
- **Quem paga no sistema**: o `admin_socio` da Conta vê e paga as cobranças de todos os grupos
  dela. Os demais usuários de um grupo bloqueado veem "fale com o responsável".
- **Bloqueio** (contrato 4.5): 5 dias corridos após o vencimento, como na seção 6. Quem entra
  no grupo por autorização de outra Conta também perde o acesso (ADR-0018).
- **Sem NFS-e da mensalidade**: a cláusula saiu do contrato. Se algum cliente pedir, a gente vê.
- **Conta do Mercado Pago**: da Infinity Fit (a contratada), que absorve as taxas.
- **Staging** usa as credenciais **de teste** do Mercado Pago, que não precisam de ativação, e uma
  URL de webhook própria do modo teste. O handler confere `live_mode`. A aprovação se testa com
  cartão de teste (titular `APRO`); PIX e boleto em teste ficam em "pendente". Fontes:
  [credenciais](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials),
  [compras de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchases),
  [webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).
- **Ordem**: o motor (cobrança, webhook, bloqueio) não depende da Conta e se testa no staging.
  Cobrar cliente de fora espera a #193.
- **Issues**: #207 (1º acesso e vínculo), #208 (cobrança automática), #209 (bloqueio e tela).

---

## 1. Contexto e objetivo

O MOVA vira produto vendido a lojistas de fora (ver [[project_mova_produto_dominio]]).
Isso exige cobrar mensalidade — e é a primeira vez que o sistema tem **cliente
pagante**, não só usuário interno.

O objetivo é o mínimo que sustenta uma venda: cobrança mensal automática por CNPJ,
pagamento por PIX ou boleto sem ninguém cadastrar cartão, baixa automática quando
o dinheiro cai, e corte de acesso para quem não paga.

### O que este design NÃO resolve, e precisa ser dito

O MOVA é multi-tenant **no mesmo banco e no mesmo deploy**, com isolamento feito
na aplicação, página por página. Enquanto os inquilinos eram empresas do próprio
Cesar, uma falha de isolamento era problema interno. Com lojista de fora pagando,
é vazamento entre concorrentes.

Existe pelo menos uma brecha **documentada e nunca corrigida** desde julho/2026:
`/estoque/[id]` não confere se a moto pertence ao grupo do usuário — quem tiver o
link vê moto de outro CNPJ ([[project_multi_grupo]], pendência 1). A recomendação
de rodar uma revisão de segurança dedicada está registrada e nunca foi executada.

**Cobrar não depende de consertar isso. Vender, sim.** Fica registrado aqui porque
esta spec é o documento que marca a virada de sistema interno para produto.

---

## 2. Por que não o "Assinaturas" do Mercado Pago

O produto de assinatura deles (`preapproval`) cobra sozinho, mas exige **cartão
guardado**. A escolha foi PIX/boleto, que vende melhor para lojista pequeno — logo
o caminho é **cobrança avulsa gerada todo mês**:

`POST /checkout/preferences` cria um link que aceita PIX, boleto e cartão, com
`external_reference` (nosso id de cobrança), `notification_url` (nosso webhook) e
`date_of_expiration`. O preço disso é que **a recorrência é nossa**: o MOVA gera a
cobrança, acompanha o vencimento e corta o acesso. É trabalho que o `preapproval`
faria sozinho.

### O exemplo que o Mercado Pago forneceu, e o que nele não serve

Em 14/09/2026 o suporte deles mandou um exemplo de **Payment Brick com cartão**
(checkout transparente, com `token` gerado no frontend). Foi avaliado e **o
caminho escolhido continua sendo o link de pagamento** (opção A): é o caminho mais
curto até cobrar, e nenhum dado de cartão passa pelo MOVA. O Brick fica para
quando a assinatura virar rotina.

Três defeitos daquele exemplo, registrados para não serem copiados:

1. **`idempotencyKey: randomUUID()` dentro do handler não protege de nada.** Uma
   chave nova a cada requisição significa que clique duplo ou reenvio do navegador
   criam **dois pagamentos**. A chave tem que derivar do que está sendo pago — o
   id da cobrança do mês — para a segunda tentativa devolver o mesmo pagamento.
2. **O exemplo é Express.** Aqui é rota do Next: `export async function POST(req)`,
   corpo por `await req.json()`, sem `express.json()` e sem `dotenv`.
3. **`console.error(error)` cru vaza dado.** O erro do SDK deles carrega o corpo da
   requisição. Logar o motivo, nunca o objeto inteiro.

---

## 3. Modelo de dados

**`mensalidade_config`** — uma por grupo:
`grupo_id` (único), `adesao_id`, `valor_mensal`, `taxa_implantacao`, `isento` (bool),
`status` (`ativa` | `inadimplente` | `bloqueada`), `bloqueia_em` (timestamptz,
nulo quando em dia), `criado_em`.

**`mensalidades`** — uma por mês por grupo:
`grupo_id`, `competencia` (`AAAA-MM`), `valor`, `taxa_implantacao` (só na 1ª), `vencimento` (date),
`status` (`aberta` | `paga` | `cancelada`), `mp_preference_id`, `mp_payment_id`,
`link_pagamento`, `pago_em`, `criado_em`.
**Único em `(grupo_id, competencia)`** — é o que impede cobrar duas vezes o mesmo
mês quando o cron roda duas vezes.

**`mensalidade_webhook_eventos`** — log cru do que o Mercado Pago mandou:
`mp_notification_id` (único), `tipo`, `action`, `data_id`, `recebido_em`,
`processado_em`, `erro`. Existe por dois motivos: **idempotência** (o Mercado Pago
reenvia a mesma notificação quando não recebe 200 a tempo) e diagnóstico — sem o
cru guardado, "o cliente diz que pagou e não deu baixa" vira dedução.

---

## 4. Fluxo de cobrança

1. **Cron diário** varre grupos com assinatura não isenta e sem cobrança aberta
   para a competência corrente; cria a cobrança e a preferência no Mercado Pago,
   guardando `link_pagamento`. Usa `X-Idempotency-Key` na chamada.
2. **O lojista vê** na própria tela um aviso com vencimento e botão de pagar.
3. **Ele paga** por PIX, boleto ou cartão, no checkout do Mercado Pago.
4. **O Mercado Pago chama** `POST https://meumova.com/api/webhooks/mercadopago`.
5. **O MOVA valida, consulta e dá baixa** (seção 5).
6. **Sem pagamento**, `bloqueia_em` = vencimento + 5 dias. Passada a data, o grupo
   entra em `bloqueada` (seção 6).

O corte é por **vencimento + 5 dias corridos**, não por dias úteis — mais simples
de explicar ao cliente e de conferir.

---

## 5. Webhook: o que a segurança exige

A notificação **não traz valor nem status**. Ela diz `{ type, action, data.id }`.
Quem confirma o pagamento é uma consulta à API do Mercado Pago com aquele `data.id`
e o access token da nossa aplicação. **Nunca marcar como paga com base no corpo da
notificação** — sem a consulta, quem descobrir a URL declara qualquer pagamento
aprovado.

**Validação de assinatura, obrigatória.** O header `x-signature` traz `ts` e `v1`.
O manifesto é `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;` e o
`v1` é o HMAC-SHA256 desse texto com o segredo do webhook (painel do Mercado Pago).
Comparação em **tempo constante**. Assinatura inválida → 401, sem processar.

**Responder 200 em até 22 segundos**, senão eles reenviam. Na Vercel a função
congela ao responder, então o trabalho acontece **antes** do retorno — é rápido:
uma consulta à API deles e uma escrita.

**Idempotência**: a mesma notificação chega mais de uma vez. O `mp_notification_id`
único em `mensalidade_webhook_eventos` resolve — evento já processado devolve 200
sem refazer nada. Pagar duas vezes a mesma cobrança não pode gerar dois créditos.

**Credenciais por ambiente**: `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` em variável
de ambiente. Diferente do certificado da SEFAZ, isto é credencial **do MOVA**, não
de cada grupo — não vai para a tabela de grupos.

---

## 6. Bloqueio

**Onde:** no `src/app/(dashboard)/layout.tsx`, que roda em toda página e **já tem
exatamente este padrão** (a trava que manda para `/completar-cadastro` quem não
preencheu o cadastro). O bloqueado é redirecionado para `/assinatura`.

**Quem escapa, e por quê:**
- **`admin_geral`** — mesma válvula que já existe na trava de cadastro: precisa
  sobrar alguém que consiga entrar e corrigir se a trava tiver defeito.
- **Grupos isentos** — os do Cesar.
- **A própria `/assinatura`** e as rotas de pagamento, obviamente.

**O que o bloqueado vê:** nada do sistema. Só `/assinatura`.
- **O dono da loja** (papel de admin daquele grupo) vê a tela com o valor, o
  vencimento, o link/QR de pagamento e o histórico das últimas cobranças.
- **Os demais usuários** veem "o acesso está suspenso, fale com o responsável" —
  sem valor e sem link. Cobrança da empresa não é assunto de vendedor.

**Fail-open deliberado:** se a consulta do status da assinatura falhar ou estourar
timeout, **deixa passar**. O layout já segue essa filosofia. Bloquear cliente
pagante porque o banco piscou é pior do que dar alguns minutos de acesso a um
inadimplente.

**O bloqueio cobre as páginas, não as server actions nem as rotas de API.** Quem
souber montar a chamada continua escrevendo. É aceitável porque o bloqueado é um
cliente, não um invasor — mas está escrito aqui para ninguém confundir com trava
de segurança.

---

## 7. Isenção

`mensalidade_config.isento = true` nos três grupos do Cesar (Sul de Minas, BH, Vale).
Grupo isento não gera cobrança, não bloqueia e não aparece na lista de
inadimplentes. Marcável por `admin_geral` na tela de administração.

---

## 8. Riscos

| Risco | Tratamento |
|---|---|
| **Marcar como paga sem consultar a API** | Nunca confiar no corpo da notificação. A consulta com o `data.id` é obrigatória |
| **Webhook reenviado gera baixa dupla** | `mp_notification_id` único + cobrança única por `(grupo, competência)` |
| **Cron roda duas vezes e cobra duas vezes** | Único em `(grupo_id, competencia)`; a segunda tentativa não cria nada |
| **Cliente paga e o webhook não chega** | Tela de administração com botão "conferir agora", que consulta a API pelo `external_reference`. Sem isso, a única saída é acesso ao banco |
| **Bloqueio derruba cliente em dia por erro de status** | Fail-open na consulta + isenção + `admin_geral` sempre entra |
| **Dono bloqueado não consegue pagar** | Ele entra e chega em `/assinatura`; é o único caminho aberto |
| **Token do Mercado Pago vazado em log** | Nunca logar corpo de requisição para a API deles nem o header de autorização |

## 9. Fora de escopo

- **Recorrência automática no cartão** (`preapproval`) — descartada nesta fase.
- **Onboarding self-service** de lojista novo (criar grupo, primeiro usuário,
  primeira loja). Hoje isso é manual, feito pelo `admin_geral`.
- **Nota fiscal da mensalidade** — o MOVA emitir NFS-e da própria assinatura é
  outro projeto ([[project_nfe_propria_enotas]]).
- **Planos diferentes, desconto, cupom, trial.** Um valor por grupo, só.
- **Correção do isolamento entre CNPJs** (seção 1) — necessário para vender, mas
  é trabalho próprio, com escopo próprio.

## 10. Critérios de aceite

- Um grupo não isento, sem cobrança do mês, ganha cobrança e link ao rodar o cron.
- Rodar o cron duas vezes no mesmo dia **não** cria duas cobranças.
- Pagar o link dá baixa automática em menos de um minuto, sem ninguém mexer.
- A mesma notificação entregue duas vezes é processada **uma** vez.
- Notificação com assinatura inválida é recusada com 401 e não muda nada.
- No sexto dia após o vencimento, o grupo bloqueia: usuário comum vê o aviso, o
  dono vê a tela de pagamento, e `admin_geral` continua entrando em tudo.
- Pagar depois de bloqueado devolve o acesso sem intervenção manual.
- Os três grupos do Cesar nunca geram cobrança nem bloqueiam.
