# WhatsApp como disparador de alertas (aposentando o Telegram)

**Data:** 2026-08-10
**Status:** aprovado para planejamento

## Objetivo

Trocar o transporte dos alertas do sistema de **Telegram** para **WhatsApp**, usando o
servidor MCP da mcp.ai (o mesmo fornecedor já usado para saldos bancários / Open Finance).
O WhatsApp é só um **disparador** (outbound). O bot 2-vias do Telegram (`@MovaMC_bot`:
perguntas prontas + coringa Claude) **é descontinuado** — não haverá equivalente 2-vias.

## O que existe hoje

Dois disparos, ambos enviando para o **grupo do Telegram por bandeira**
(coluna `grupos.telegram_chat_id`):

1. **Aviso de venda** — `notificarVendaTelegram` em `src/lib/telegram/venda.ts`, chamado no
   fim da venda em `src/app/(dashboard)/vendas/actions.ts` (wrapper `avisarVendaNoTelegram`,
   best-effort com timeout de 8s; venda não pode falhar por causa do aviso).
2. **Alerta de pedidos da fábrica** — `alertarPedidosFabrica` em
   `src/lib/telegram/pedidos-fabrica.ts`, chamado pelo cron
   `src/app/api/cron/pedidos-fabrica/route.ts` (varre lojas ativas, lista o que está
   "aguardando pagamento", grava controle em `pedidos_fabrica_alerta`).

Bot 2-vias (a descontinuar): `src/app/api/telegram/webhook/route.ts`,
`src/lib/telegram/cerebro.ts`, `src/lib/telegram/perguntas-prontas.ts`,
`src/lib/telegram/api.ts`.

## Como a mcp.ai envia WhatsApp

Mesmo protocolo MCP já usado em `src/lib/mcpai.ts`: `initialize` → `tools/call` sobre
HTTP + resposta SSE (`data: {...}`). Endpoint e token são **diferentes** do endpoint de
Open Finance — é uma URL própria com token do usuário.

Ferramenta relevante (descoberta via `tools/list` no endpoint):

- **`whatsapp_send_text`** — `{ to, text }`. `to` aceita telefone puro com DDI
  (`55` + DDD + número) ou JID (`...@s.whatsapp.net` para pessoa, `...@g.us` para grupo).
- `whatsapp_list_accounts` — conta(s) de WhatsApp pareada(s) ao install (campo `account`
  opcional em `whatsapp_send_text`; só é necessário se houver mais de uma conta).

**Pré-requisito de ambiente:** o WhatsApp precisa estar pareado no install da mcp.ai
(confirmar com `whatsapp_list_accounts` no deploy).

## Decisões de desenho

### Destino: um número só
Todos os alertas das duas bandeiras vão para **um único número** (env var), não mais um
chat por grupo. A mensagem já carrega o nome da loja, então dá pra distinguir Sul de Minas
de BH ao ler. Expandir para número-por-grupo depois é mudança pequena (trocar a leitura da
env var por uma coluna em `grupos`).

### Config por env var (nada hardcoded, nada commitado)
- `MCPAI_WHATSAPP_URL` — URL do endpoint mcp.ai com token de WhatsApp. **Secreta**, só na
  Vercel e no `.env.local`. Nunca commitada, nunca em query string montada em código.
- `WHATSAPP_ALERTA_NUMERO` — número de destino com DDI (formato `55` + DDD + número, só
  dígitos). Fica só em env (Vercel + `.env.local`); o número real **não** entra no
  repositório.

### Reaproveitar os formatadores testados
`formatarAvisoVenda`, `formatarAvisoPedidosFabrica` e `diasEntre` são texto puro e já têm
testes — migram para `src/lib/whatsapp/` **sem alterar o conteúdo do texto**. Só o
transporte muda.

## Estrutura nova

```
src/lib/whatsapp/
  client.ts            enviarAlertaWhatsapp(texto): mesmo padrão MCP do mcpai.ts,
                       chama whatsapp_send_text { to: WHATSAPP_ALERTA_NUMERO, text }.
                       Nunca lança. Retorna 'enviado' | 'sem_numero' | 'erro'.
  venda.ts             formatarAvisoVenda (movido, inalterado)
                       + notificarVendaWhatsapp(params) — monta o texto e chama o client.
  pedidos-fabrica.ts   formatarAvisoPedidosFabrica + diasEntre (movidos, inalterados)
                       + alertarPedidosFabrica* — mesma lógica de scraping/controle,
                       trocando o envio para enviarAlertaWhatsapp.
  venda.test.ts        (movido) testa formatarAvisoVenda
  pedidos-fabrica.test.ts (movido) testa formatarAvisoPedidosFabrica/diasEntre

src/lib/texto.ts       normalizar (movido de telegram/texto.ts; usado por kommo-etapas)
src/lib/texto.test.ts  (se aplicável — cobrir normalizar)
```

### Mudança no `client.ts` vs. o Telegram
No Telegram, o destino saía do banco (`grupos.telegram_chat_id`) e cada função resolvia o
chat. No WhatsApp o destino é fixo (env var), então:
- `notificarVendaWhatsapp` **não** precisa mais buscar `telegram_chat_id` — ainda busca
  loja/modelo/vendedor pra montar o texto, mas envia sempre para o número da env.
- `alertarPedidosFabricaDaLoja` deixa de exigir `telegramChatId`; o status `sem_chat` vira
  `sem_numero` (env var ausente), verificado uma vez no client.

## Pontos de troca (rewire)

- `src/app/(dashboard)/vendas/actions.ts`: `avisarVendaNoTelegram` → `avisarVendaNoWhatsapp`,
  chamando `notificarVendaWhatsapp`. **Mantém** o `Promise.race` com timeout de 8s.
  (Há duas chamadas: linhas ~432 e ~1472.)
- `src/app/api/cron/pedidos-fabrica/route.ts`: importa `alertarPedidosFabrica` de
  `@/lib/whatsapp/pedidos-fabrica`. Schedule e autorização inalterados.
- `src/lib/kommo-etapas.ts`: import de `normalizar` passa de `./telegram/texto` para
  `./texto`. Atualizar também `kommo-etapas.test.ts` se referenciar o caminho.

## O que apagar

- Pasta `src/lib/telegram/` inteira (depois de mover venda/pedidos-fabrica/normalizar).
- Rota `src/app/api/telegram/webhook/route.ts`.
- Campo "Telegram — Chat do grupo de avisos" no Admin → Grupos:
  `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx` e o `telegramChatId` em
  `src/app/(dashboard)/admin/grupos/actions.ts`.
- Caminhos de teste do Telegram no `package.json` (`telegram/texto.test`,
  `perguntas-prontas.test`, `api.test`, `venda.test`, `pedidos-fabrica.test`) — substituir
  pelos novos caminhos `whatsapp/venda.test`, `whatsapp/pedidos-fabrica.test` e
  `texto.test` (se criado). `api.test` e `perguntas-prontas.test` são do bot → some.

## O que NÃO tocar

- `src/lib/marketing-canal.ts` — `'telegram': 'Telegram'` é **rótulo de canal de lead do
  Kommo** (origem do lead), não tem relação com o bot.
- Coluna `grupos.telegram_chat_id` no banco — fica **parada** (morta). Dropar coluna é mais
  arriscado que deixar quieta; remoção fica para uma migração futura dedicada. A definição
  no `schema.ts` pode permanecer marcada como obsoleta.

## Passos manuais do Cesar (fora do código)

- Setar `MCPAI_WHATSAPP_URL` e `WHATSAPP_ALERTA_NUMERO` na Vercel (e no `.env.local` para
  teste local).
- Confirmar o WhatsApp pareado na mcp.ai (`whatsapp_list_accounts`).
- Revogar o `@MovaMC_bot` no BotFather e apagar as env vars `TELEGRAM_BOT_TOKEN` /
  `TELEGRAM_WEBHOOK_SECRET` na Vercel. (Não mexo em conta externa nem em env alheia.)

## Tratamento de erro

- `enviarAlertaWhatsapp` **nunca lança**: erro de rede/MCP vira `console.error` + retorno
  `'erro'`, exatamente como o `chamar()` do Telegram fazia. Aviso é efeito colateral e não
  pode derrubar venda nem o cron.
- Aviso de venda mantém o timeout de 8s (best-effort).
- Cron mantém o loop por loja com captura de erro por loja (uma falha não cala as outras) e
  só grava o controle `pedidos_fabrica_alerta` **depois** do envio (retry na próxima rodada
  se o envio falhar).

## Testes

- Unit: os formatadores movidos (`formatarAvisoVenda`, `formatarAvisoPedidosFabrica`,
  `diasEntre`, `normalizar`) mantêm cobertura — texto inalterado, testes passam sem mudança
  de asserção, só de caminho.
- `client.ts` (chamada MCP de rede) não tem unit test; validação é manual no deploy: um
  envio real de teste para `WHATSAPP_ALERTA_NUMERO` confirmando que a mensagem chega.

## Fora de escopo (YAGNI)

- Bot 2-vias / perguntas prontas / coringa Claude no WhatsApp.
- Número/destino por grupo econômico.
- Envio de mídia (`whatsapp_send_media`) — só texto por enquanto.
- Drop da coluna `telegram_chat_id`.
