# Mensalidade do MOVA: cobrança mensal dos lojistas

**Data:** 2026-09-14, reescrita em 2026-10-19
**Status:** implementada nos PRs #211 a #220 (aguardando merge na `dev`)
**Issues:** #166 (épica), #207 (1º acesso e vínculo), #208 (cobrança), #209 (bloqueio e tela)
**Fontes:** comentários da #166 (call do Luis com o Cesar em 2026-10-16 e grilling de
2026-10-17); contrato de adesão, cláusula 4 (`src/lib/assinatura/contrato-adesao.ts`);
ADR-0018 (Conta acima do grupo).

O nome do arquivo ficou "assinatura" por causa das referências antigas. No código e na
conversa o nome é **mensalidade**: "assinatura" no MOVA é a assinatura eletrônica de documento
(`src/lib/assinatura/`).

---

## 1. Objetivo

O MOVA passa a ser vendido a lojistas de fora (#164). Cada CNPJ (grupo) contratado paga uma
mensalidade. O mínimo que sustenta isso:

- cobrança mensal criada sozinha, por grupo;
- pagamento por PIX ou boleto, sem ninguém cadastrar cartão;
- baixa automática quando o pagamento é aprovado;
- corte de acesso de quem não paga, e volta automática quando paga.

Cobrar não depende do isolamento entre Contas; vender, sim. Antes do 1º lojista de fora valem os
pré-requisitos do ADR-0018 (#193, #194, #16).

## 2. Decisões

| Tema | Decisão | Fonte |
|---|---|---|
| Meio de pagamento | Só **PIX e boleto**, por link do Mercado Pago (Checkout Pro). Cartões excluídos | Cesar, 17/10; contrato 4.2 |
| Saldo da conta Mercado Pago | Continua disponível: a API recusa excluir (`account_money cannot be excluded`) | teste de 17/10 |
| Boleto | Vence em 3 dias, o padrão do Mercado Pago | Luis, 17/10 |
| Recorrência | Nenhuma. O MOVA cria uma cobrança avulsa por mês | Cesar, 16/10 |
| Conta recebedora | Mercado Pago da Infinity Fit (a contratada), que absorve as taxas | Cesar, 16/10 |
| Preço e bloqueio | Por CNPJ (grupo) | Cesar, 16/10 |
| Valores | Da adesão ligada ao grupo: mensalidade e taxa de implantação (padrão 499/999; franqueado 399/799; editáveis) | #166, 16/10 |
| 1º vencimento | 30 dias após o 1º acesso de um usuário do grupo que não seja `admin_geral` | contrato 4.1 |
| Vencimentos seguintes | Mesmo dia dos meses seguintes; dia 29, 30 ou 31 vira 28 | contrato 4.1 |
| Implantação | Cobrada junto com a 1ª mensalidade | Cesar, 16/10 |
| Quando a cobrança nasce | Quando faltam 10 dias ou menos para o vencimento | Cesar, 16/10 |
| Validade do link | Até ser pago | grilling 17/10 |
| Aviso | E-mail ao responsável da adesão quando a cobrança nasce e no dia do vencimento, mais faixa no topo do sistema | grilling 17/10 |
| Atraso | Multa de 2% e juros de 1% ao mês, pro rata dia, cobrados ao refazer o link | contrato 4.4 |
| Bloqueio | No 6º dia após o vencimento sem pagamento; dados não são apagados; volta sozinho ao pagar | contrato 4.5 |
| Quem paga no sistema | O `admin_socio` (e o `admin_geral`). Os demais veem "fale com o responsável" | grilling 17/10 |
| Isenção | Os grupos do Cesar | Cesar, 16/10 |
| NFS-e da mensalidade | Não há. Fora de escopo; reavaliar se um lojista pedir | Cesar, 17/10 |

## 3. Por que link avulso (Checkout Pro)

O produto de assinatura do Mercado Pago (`preapproval`) cobra sozinho, mas exige cartão guardado,
e o Cesar não quer recorrência: o cartão vence e ninguém fica sabendo. Por isso o MOVA cria uma
**cobrança avulsa por mês** com `POST /checkout/preferences`. O preço é que a recorrência fica com o
MOVA: criar a cobrança, acompanhar o vencimento e cortar o acesso.

O link (Checkout Pro) foi escolhido em vez de Bricks ou Checkout Transparente: o lojista paga na
página do Mercado Pago, nenhum dado de pagamento passa pelo MOVA e não há tela de pagamento para
construir. O mesmo link vai no e-mail e no aviso, e quem está bloqueado paga por ele.

Do exemplo de Payment Brick que o suporte do Mercado Pago mandou em 14/09/2026, três defeitos ficam
registrados para não serem copiados:

1. `idempotencyKey: randomUUID()` no handler não protege de nada. A chave tem de derivar do que se
   paga; aqui, `mensalidade-<id>-<valor>`.
2. O exemplo é Express. Aqui é Route Handler do Next.
3. `console.error(error)` cru vaza dado: o erro do SDK carrega o corpo da requisição. Logar o
   motivo, nunca o objeto inteiro.

## 4. Modelo de dados

| Tabela / coluna | Para quê | Migração |
|---|---|---|
| `grupos.primeiro_acesso_em` | Início da contagem do 1º vencimento. Gravado uma vez | 0126 |
| `adesoes_mova.grupo_id` | Adesão que gerou o grupo; os valores vêm dela. Único por grupo | 0127 |
| `mensalidade_config` | Uma por grupo: `isento` e, se preciso, `valor_mensal` e `taxa_implantacao`, que valem sobre os da adesão | 0128 |
| `mensalidades` | Uma por grupo e competência (`AAAA-MM`, único): `valor`, `taxa_implantacao`, `acrescimo`, `vencimento`, `status` (`aberta`, `paga`, `cancelada`), `mp_preference_id`, `mp_payment_id`, `link_pagamento`, `pago_em` | 0128 |
| `mensalidades.aviso_vencimento_em` | E-mail do dia do vencimento já enviado | 0129 |
| `mensalidade_webhook_eventos` | Log cru das notificações, com `mp_notification_id` único: idempotência e diagnóstico | 0128 |

`mensalidade_config.status` e `bloqueia_em` existem na 0128 e **não são usados**: o bloqueio é
calculado na hora a partir das mensalidades abertas, o que faz o pagamento devolver o acesso sem
nenhum passo a mais. Saem numa migração futura.

As três tabelas têm RLS ligada e nenhuma policy: só o servidor lê e grava.

## 5. Regras

Regras puras, com testes, em `src/lib/mensalidade/regras.ts`:

- `vencimento(primeiroAcesso, n)`: o dia é contado no fuso de Brasília.
- `cobrancasDevidas(primeiroAcesso, hoje)`: todas as cobranças com vencimento até hoje + 10 dias,
  inclusive as atrasadas, para um cron que ficou parado recriar o que faltou.
- `valorBase(n, mensal, implantacao)`: implantação só na 1ª.
- `acrescimoAtraso(valor, vencimento, hoje)`: 2% + 1% ao mês × dias/30.
- `estaBloqueado(vencimentosEmAberto, hoje)`: alguma aberta com hoje ≥ vencimento + 6.
- `podePagarMensalidade(papel)`: `admin_socio` ou `admin_geral`.

Grupo cobrável: ativo, com 1º acesso, não isento e com valor (da configuração ou da adesão). Grupo
sem linha em `mensalidade_config` não é isento.

## 6. Fluxo

1. **1º acesso:** o layout do painel grava `grupos.primeiro_acesso_em` no primeiro acesso de um
   usuário de loja que não seja `admin_geral` (um `UPDATE` que não casa nada depois da primeira
   vez; timeout de 3 s, sem travar a página).
2. **Cron diário** (`/api/cron/mensalidades`, 08h de Brasília, protegido pelo `CRON_SECRET`):
   - cria as cobranças devidas (`on conflict do nothing` na unicidade grupo e competência);
   - para cada cobrança aberta sem link, cria a preferência e grava o link. Se o Mercado Pago
     falhar, a próxima rodada tenta de novo;
   - manda o e-mail da cobrança (valor, vencimento, link) ao e-mail da adesão;
   - manda o e-mail do dia do vencimento, marcando `aviso_vencimento_em` antes de enviar;
   - um grupo com erro não para os outros.
3. **Link:** `external_reference` = id da mensalidade; `notification_url` = webhook do próprio
   deploy (`urlBase()`); cartões em `excluded_payment_types`.
4. **Aviso no topo:** enquanto houver mensalidade aberta, quem paga vê uma faixa com o valor
   atualizado, o vencimento e o link para `/mensalidade`.
5. **Pagamento:** o Mercado Pago chama o webhook (seção 7).
6. **Sem pagamento:** no 6º dia o grupo bloqueia (seção 8).

## 7. Webhook

`POST /api/webhooks/mercadopago`.

- **Assinatura HMAC obrigatória.** O header `x-signature` traz `ts` e `v1`. O manifesto é
  `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;` (parte ausente sai). `v1` é o
  HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparado em tempo constante. Inválida → 401.
- **Idempotência:** uma linha por notificação. Reenvio → 200 sem refazer nada.
- **Ambiente:** a produção só aceita `live_mode` verdadeiro; o staging, só falso.
- **Baixa só depois de consultar a API** (`GET /v1/payments/{id}`). A notificação não traz valor
  nem status; marcar como paga pelo corpo dela deixaria qualquer um declarar pagamento. A baixa
  exige status `approved` e valor pago ≥ valor devido (`valor + acrescimo`). Pendente ou
  recusado não muda nada.
- **Erros:** 4xx do Mercado Pago (pagamento inexistente) fica registrado e responde 200. Falha
  passageira responde 500 e apaga o registro, para o reenvio deles ser processado.
- **Responder em até 22 s**, senão eles reenviam. Na Vercel a função congela ao responder, então o
  trabalho (uma consulta e uma escrita) acontece antes do retorno.

## 8. Bloqueio e tela `/mensalidade`

**Onde:** no layout do painel (`src/app/(dashboard)/layout.tsx`), na mesma consulta do aviso do
topo. Bloqueado vai para `/mensalidade`, que fica fora do layout do painel. O nome não é
`/assinatura` porque o matcher do middleware exclui tudo que começa com `assinar`.

**Quem escapa:** o `admin_geral` (precisa sobrar alguém para corrigir se a trava tiver defeito) e
os grupos isentos.

**Fail-open:** se a consulta falhar ou passar de 3 s, deixa entrar. Bloquear quem paga porque o
banco piscou é pior que deixar entrar quem deve.

**O bloqueio cobre as páginas, não as server actions nem as rotas de API.** O bloqueado é um
lojista, não um invasor; isto não é trava de segurança.

**A tela:**
- O `admin_socio` vê as mensalidades abertas, com o valor atualizado, e o botão **Pagar**.
- Os demais veem "Acesso suspenso" e "fale com o responsável da sua empresa".
- Tem **Sair** e, sem bloqueio, **Voltar ao sistema**.

**Link refeito com multa:** ao clicar em Pagar numa cobrança vencida, o link é recriado com o
acréscimo do dia e a preferência antiga é encerrada no Mercado Pago. Se encerrar falhar, o webhook
recusa a baixa do valor antigo, porque ele é menor que o devido.

## 9. Admin: `/admin/mensalidades`

Só `admin_geral`, no menu Configuração.

- **Por grupo:** situação (isento, bloqueado, vencida, em aberto, em dia, sem 1º acesso), valor
  mensal, data do 1º acesso e as mensalidades abertas.
- **Inadimplentes:** grupos não isentos com mensalidade vencida, no topo.
- **Isentar / Voltar a cobrar**, com confirmação.
- **Conferir agora:** procura no Mercado Pago (`/v1/payments/search` pelo `external_reference`)
  um pagamento aprovado e dá baixa com a mesma regra do webhook. É a saída quando o lojista pagou e
  o aviso não chegou. No sandbox a busca não lista pendentes nem recusados (visto em 17/10), por
  isso a resposta fala só do aprovado.

## 10. Isenção

A 0128 marca como isento **todo grupo que existe na hora em que roda**, partindo de que todos são
do Cesar. Antes de aplicar na produção, conferir que nenhum grupo é de lojista de fora. Depois,
isentar ou voltar a cobrar é pela tela do admin.

## 11. Credenciais e ambientes

- `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` são credenciais do MOVA (conta da Infinity), em variável
  de ambiente, não por grupo. Nunca logar o corpo das chamadas nem o header de autorização.
- **Staging:** credenciais de **teste** (não precisam de ativação) no `.env.local` e no Preview da
  Vercel. Webhook de teste no painel do Mercado Pago, configurado pelo Cesar, apontando para
  `https://dev.meumova.com/api/webhooks/mercadopago`. A proteção da Vercel nos previews está
  desligada desde 17/10 para o aviso chegar (`docs/infra/staging.md`).
- **Produção:** token e webhook de produção, configurados pelo Cesar no painel da Infinity.
- Doc oficial:
  [credenciais](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials),
  [compras de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchases),
  [webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).

## 12. Riscos

| Risco | Tratamento |
|---|---|
| Marcar como paga sem consultar a API | A consulta com o `data.id` é obrigatória |
| Notificação repetida gera baixa dupla | `mp_notification_id` único e baixa só de mensalidade `aberta` |
| Cron roda duas vezes e cobra duas vezes | Único em grupo e competência; e-mail do vencimento marcado antes de enviar |
| Lojista paga o link antigo, sem multa | Preferência antiga encerrada; se falhar, valor menor que o devido não dá baixa |
| Lojista paga e o aviso não chega | "Conferir agora" na tela do admin |
| Bloqueio derruba lojista em dia por falha | Fail-open, isenção e `admin_geral` sempre entra |
| Bloqueado não consegue pagar | `/mensalidade` fica aberta; o link do e-mail também serve |
| Token vazado em log | O erro do cliente do Mercado Pago só carrega o status HTTP |

## 13. Fora de escopo

- Recorrência no cartão e pagamento por cartão.
- Bricks ou Checkout Transparente.
- NFS-e da mensalidade.
- Planos, desconto, cupom, trial.
- Cadastro do lojista sem implantação (#229 trata da implantação).

**Em aberto, não implementado:**
- reajuste anual pelo IPCA em fevereiro (contrato 4.3): por ora, ajuste manual do valor;
- rescisão por mais de 60 dias de atraso (contrato 4.6): decisão manual.

## 14. Critérios de aceite

Verificados pelo teste de ponta a ponta `npm run e2e:mensalidade` (#220) contra o staging:

1. O cron cria a 1ª cobrança de um grupo não isento (mensalidade + implantação) com link; rodar de
   novo não cria nada.
2. O link exclui cartões e aponta o `external_reference` e o webhook certos; o checkout mostra só
   PIX e boleto.
3. O `admin_socio` vê a faixa e a cobrança em `/mensalidade`; o vendedor não vê a faixa.
4. No 6º dia após o vencimento, o `admin_socio` cai em "Acesso suspenso" e o vendedor em "fale com
   o responsável"; o `admin_geral` continua entrando.
5. Pagar uma cobrança vencida refaz o link com multa e juros.
6. Notificação sem assinatura → 401; com assinatura e pagamento aprovado → baixa; a mesma
   notificação de novo → ignorada.
7. Com a mensalidade paga, o acesso volta sozinho.
8. O "Conferir agora" acha o pagamento aprovado e dá baixa.

**PIX e boleto aprovados não se testam no sandbox:** lá eles ficam pendentes. A baixa no teste usa
um pagamento com cartão aprovado no sandbox em 17/10/2026, guardado na mensalidade de referência
do grupo de teste. PIX e boleto aprovados se provam na 1ª cobrança real, com valor baixo.
