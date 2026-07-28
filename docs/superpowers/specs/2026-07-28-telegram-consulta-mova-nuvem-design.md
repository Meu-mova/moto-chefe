# Bot de Consulta ao MOVA na Nuvem (Telegram, só leitura) — Design

**Data:** 2026-07-28
**Autor:** Cesar + Claude
**Status:** Aprovado para virar plano de implementação

## Objetivo (uma frase)

Um **segundo** bot no Telegram que responde perguntas do negócio (somente
leitura) **24/7, rodando dentro do próprio MOVA na Vercel** — sem depender do
PC ligado.

## Contexto e motivação

Hoje a consulta ao MOVA pelo Telegram existe, mas passa pelo **PC do Cesar**
(a ponte `telegram_bridge.py` + o backend OpenJarvis). Se o PC está desligado,
não há resposta. Os **dados** já vivem na nuvem (MOVA na Vercel, sempre no ar);
o que falta é mover o **cérebro** (quem escreve a consulta) e a **escuta do
Telegram** para a nuvem também.

Decisão de escopo tomada no brainstorming:
- **2 bots** (não 1). O `@JarvisDoCesar_bot` atual **continua intacto no PC**
  (lembretes, voz, orbe). Criamos um **bot novo dedicado** à consulta 24/7.
  Motivo: o Telegram só permite **um** "ouvinte" por bot (webhook OU polling,
  nunca os dois). Um bot separado evita quebrar o que já funciona e permite
  entregar a consulta agora, com risco zero.
- **Somente leitura.** Nenhuma escrita ao MOVA, nunca.
- **Todos os grupos** (Sul de Minas + BH).
- **Perguntas prontas + Claude só pro resto** (ver abaixo) — para gastar o
  mínimo de crédito Claude.

Fora de escopo (projetos futuros, próprios): mover **lembretes** para a nuvem;
**escrever** no MOVA com aprovação; deixar funcionários consultarem.

## Arquitetura

Tudo dentro do app Next.js do MOVA (`D:\Claude\Teste`, deploy Vercel). É
**100% aditivo** — nada existente é removido ou alterado em comportamento.

```
Telegram (bot novo)
   │  POST (update)
   ▼
/api/telegram/webhook  ── confere: senha secreta do webhook + chat_id na allow-list
   │
   ├─ texto casa com uma PERGUNTA PRONTA?
   │      SIM → roda o SELECT fixo (só leitura) → formata → responde   [Claude NÃO entra: grátis]
   │      NÃO → cérebro Claude escreve UM SELECT (schema + tools) → só leitura → responde  [paga só aqui]
   │
   └─ responde no Telegram (sendMessage)
```

### Caminho de dados só-leitura (reaproveitado)

A rota `/api/jarvis/consulta` já existe e roda um SELECT sob
`transaction_read_only = on` + `statement_timeout` + cap de 201 linhas. Vamos
**extrair essa lógica** para uma função compartilhada e chamá-la direto (sem o
salto HTTP) tanto do caminho de perguntas prontas quanto da tool do Claude.

- **Criar:** `src/lib/jarvis/consulta-readonly.ts`
  - `export async function consultaSomenteLeitura(sqlText: string): Promise<{ rows: unknown[]; rowCount: number; truncated: boolean }>`
  - Move para cá a validação (`^select`, sem `;`) e a transação read-only que
    hoje vivem em `src/app/api/jarvis/consulta/route.ts`.
- **Modificar:** `src/app/api/jarvis/consulta/route.ts` passa a **importar** essa
  função (mantém 401/400/200 e o token — o bot do PC continua usando essa rota
  sem alteração de comportamento).

> A garantia de "só leitura" continua sendo a **transação read-only do
> Postgres** (já provada em `scripts/test-readonly.mjs`), não uma lista de
> palavras proibidas (que dava falso-positivo com nomes em pt-BR).

### Perguntas prontas (catálogo)

- **Criar:** `src/lib/telegram/perguntas-prontas.ts`
  - Cada entrada: `{ id, titulo, casa(textoNormalizado): boolean, sql, formatar(rows): string }`.
  - `casa` usa texto **normalizado** (minúsculas, sem acento) com palavras-chave.
  - O webhook percorre o catálogo; **primeira** que casa vence. Se nenhuma
    casa, cai no Claude.
- **Normalização:** `src/lib/telegram/texto.ts` → `normalizar(s)` (lowercase +
  remove acentos via `normalize('NFD')`). Função pura, testável.

As 9 perguntas (período padrão das quebras/rankings = **mês corrente**; fuso
`America/Sao_Paulo` em toda lógica de data):

| id | Título | SQL (essência) |
|----|--------|----------------|
| `vendas_hoje` | Vendas hoje | count + sum(valor) de `vendas` onde `data_venda` (em SP) é hoje |
| `vendas_mes` | Vendas no mês | count + sum(valor) do mês corrente |
| `vendas_por_vendedor` | Vendas por vendedor (mês) | join `usuarios`, group by nome, order by total |
| `vendas_por_loja` | Vendas por loja (mês) | join `lojas`, group by nome, order by total |
| `vendas_por_modelo` | Vendas por modelo (mês) | join `motos`→`modelos`, group by modelo, order by qtd |
| `ranking_vendedores` | Ranking de vendedores (mês) | = por vendedor, lista numerada por total |
| `ranking_motos` | Ranking de motos vendidas (mês) | = por modelo, lista numerada por qtd |
| `ranking_lojas` | Ranking de lojas (mês) | = por loja, lista numerada por total |
| `estoque_por_modelo` | Estoque por modelo | count de `motos` com `status IN ('montada','caixa')`, group by modelo |

SQL exato (todas são **um** SELECT, sem `;` — passam na trava read-only):

```sql
-- vendas_hoje
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo')::date
    = (now() AT TIME ZONE 'America/Sao_Paulo')::date

-- vendas_mes
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo')
    >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))

-- vendas_por_vendedor  /  ranking_vendedores  (mesmo SQL, formatação diferente)
SELECT u.nome AS vendedor, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN usuarios u ON u.id = v.vendedor_id
WHERE (v.data_venda AT TIME ZONE 'America/Sao_Paulo')
    >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
GROUP BY u.nome ORDER BY total DESC

-- vendas_por_loja  /  ranking_lojas
SELECT l.nome AS loja, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN lojas l ON l.id = v.loja_id
WHERE (v.data_venda AT TIME ZONE 'America/Sao_Paulo')
    >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
GROUP BY l.nome ORDER BY total DESC

-- vendas_por_modelo  /  ranking_motos
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd,
       coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN motos m ON m.id = v.moto_id JOIN modelos mo ON mo.id = m.modelo_id
WHERE (v.data_venda AT TIME ZONE 'America/Sao_Paulo')
    >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC

-- estoque_por_modelo  (estoque = moto ainda na loja: montada ou na caixa)
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd
FROM motos m JOIN modelos mo ON mo.id = m.modelo_id
WHERE m.status IN ('montada', 'caixa')
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC
```

Formatação (JS, função pura): valores em `R$` com `Intl.NumberFormat('pt-BR')`;
rankings como lista numerada (`1. Fulano — 4 motos — R$ 48.000`). Formatadores
ficam em `perguntas-prontas.ts`, testáveis sem rede.

### Cérebro Claude (coringa, só quando não casa pergunta pronta)

- **Criar:** `src/lib/telegram/cerebro.ts` → `responderComClaude(pergunta: string): Promise<string>`.
- Usa `@anthropic-ai/sdk` com **tool use**: as tools `schema_mova` (lista
  tabelas/colunas via `information_schema`) e `consultar_mova` (roda o SELECT via
  `consultaSomenteLeitura`). Loop: modelo pede tool → executamos → devolvemos →
  modelo responde em texto.
- **Modelo:** `claude-haiku-4-5-20251001` (barato e rápido; as perguntas
  críticas já são cobertas pelas prontas). Constante configurável — pode subir
  para `claude-sonnet-5` se o Haiku errar SQL com frequência.
- **Mover** `@anthropic-ai/sdk` de `devDependencies` → `dependencies` (garante o
  bundle na função serverless).

### Webhook

- **Criar:** `src/app/api/telegram/webhook/route.ts` (`export const runtime = 'nodejs'`).
  1. Confere header `x-telegram-bot-api-secret-token` === `TELEGRAM_WEBHOOK_SECRET`
     (rejeita 401 se diferente — bloqueia quem descobrir a URL).
  2. Extrai `message`/`callback_query`. Confere `chat_id`/`from.id` ===
     `TELEGRAM_ALLOWED_CHAT_ID` (ignora silenciosamente o resto).
  3. `message` texto → tenta pergunta pronta → senão Claude → `sendMessage`.
  4. `callback_query` (botão do /menu) → roda a pergunta pronta do `id` → responde.
  5. `/start`,`/menu` → texto de ajuda / teclado inline com as 9 perguntas.
  6. Responde **200 rápido**; perguntas prontas são instantâneas, o caminho
     Claude (~5–15s) fica bem abaixo do limite do Telegram.
- **Criar:** `src/lib/telegram/api.ts` → `enviar(chatId, texto, teclado?)`,
  `responderCallback(id, texto?)` (wrappers de `sendMessage` etc.), lendo
  `TELEGRAM_BOT_TOKEN`.

### Segredos (env da Vercel — Cesar cola, eu guio)

| Nome | O quê |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | token do **bot novo** (do @BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | string aleatória que eu gero; casa com o header do Telegram |
| `TELEGRAM_ALLOWED_CHAT_ID` | `8908388069` (só o Cesar) |
| `ANTHROPIC_API_KEY` | chave Claude (a mesma do vault, colada na Vercel) |

`DATABASE_URL` já existe na Vercel. Nenhum segredo é digitado por mim em campo
de navegador — o Cesar cola no painel da Vercel; eu registro o webhook por
terminal (curl com o token).

### Registro do webhook (uma vez)

`curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=https://mova.motochefesuldeminas.com.br/api/telegram/webhook -d secret_token=<SEGREDO>`
— rodado no terminal depois do deploy. (Documentar também o `deleteWebhook`
para desfazer.)

## Testes

O repo MOVA não tem framework de teste. Usar o **runner nativo do Node**
(`node --test`, zero dependências novas), no estilo do `scripts/test-readonly.mjs`.

- **`src/lib/telegram/texto.test.mjs`** — `normalizar` remove acento/caixa.
- **`src/lib/telegram/perguntas-prontas.test.mjs`** — roteamento: "vendas hoje",
  "quanto vendi hoje", "ranking vendedores" etc. casam com o `id` certo; texto
  fora do catálogo não casa (→ Claude); formatadores produzem a string esperada
  a partir de linhas de exemplo.
- **`scripts/test-readonly.mjs`** (já existe) — continua provando que escrita é
  bloqueada; ajustar import se a lógica migrar para `consulta-readonly.ts`.
- **Manual ponta a ponta:** simular um update do Telegram via `curl` no webhook
  em produção (com o header secreto) e conferir a resposta; depois, uma pergunta
  real pelo celular no bot novo, batendo os números com o MOVA.

## Riscos e mitigações

- **Fuso horário** → toda data em `America/Sao_Paulo` (não usar `current_date` cru).
- **SQL errado do Claude** → perguntas prontas cobrem os números críticos; o
  Claude é só pro ad-hoc, onde um retry ocasional é aceitável.
- **Custo Claude** → minimizado pelas perguntas prontas; modelo Haiku no coringa.
- **Segurança** → senha do webhook + allow-list de chat_id + transação read-only.
- **Não quebrar o PC** → nada do OpenJarvis é tocado; a rota `/api/jarvis/consulta`
  mantém contrato. O bot do PC segue funcionando em paralelo.

## Entregável

Ao final: Cesar pergunta no bot novo (ex.: "ranking de vendedores") a qualquer
hora, com o PC desligado, e recebe a resposta certa — de graça nas perguntas
prontas, pagando pouco só quando foge do catálogo.
