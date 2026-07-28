# Integração Kommo (CRM) — métricas de atendimento por colaborador

**Data:** 2026-07-28

## Objetivo

Trazer para o Mova métricas de atendimento por colaborador a partir do Kommo (CRM). O usuário quer ver volume de atendimentos, conversão (ganhos/perdidos), velocidade de resposta e atividade (tarefas/mensagens/ligações), numa nova página "Atendimento".

## Decisões (confirmadas com o usuário)

- **Métricas:** volume, conversão, velocidade de resposta, atividade.
- **Onde:** nova página "Atendimento" (menu próprio), padrão visual do Dashboard.
- **Conta Kommo:** uma conta única para toda a empresa (um subdomínio) → integração **global**, não por grupo.
- **Colaboradores:** casar usuário do Kommo com `usuarios` do Mova por **e-mail**; usuário do Kommo sem correspondência aparece marcado como "não vinculado".
- **Frescor:** cache ~15min no Postgres + botão "Atualizar agora" (padrão `/pix-mcp`).
- **OAuth:** usuário tem acesso admin para criar a integração privada no Kommo.

## Faseamento

- **Fase A (esta entrega) — Conexão.** Fundação OAuth: não dá para construir a extração de métricas contra formatos de resposta chutados; primeiro entregamos a conexão, depois inspecionamos os dados reais do Kommo do usuário e construímos as métricas contra as respostas de verdade (mesmo método do saldo Sicoob).
- **Fase 1 — Métricas diretas.** Volume, conversão e atividade (tarefas/ligações/mensagens) — página Atendimento + sync/cache.
- **Fase 2 — Velocidade de resposta.** Tempo de 1ª resposta / tempo médio, reconstruído do stream de eventos/chats do Kommo (mais pesado; depende de os eventos de mensagem estarem acessíveis na conta).

## Fluxo OAuth do Kommo (confirmado nos docs)

- Authorize: redireciona o usuário para `https://www.kommo.com/oauth?client_id={id}&state={state}&mode=post_message`.
- Callback: o Kommo redireciona para o Redirect URL registrado com `?code=...&state=...&referer={subdominio}.kommo.com`. O subdomínio da conta vem no `referer`.
- Token: `POST https://{subdominio}.kommo.com/oauth2/access_token` (JSON) com `client_id`, `client_secret`, `grant_type` (`authorization_code`/`refresh_token`), `code`/`refresh_token`, `redirect_uri`. Resposta: `access_token`, `refresh_token`, `expires_in` (access 24h, refresh 3 meses).
- Redirect URI: `https://mova.motochefesuldeminas.com.br/api/kommo/callback` (env `KOMMO_REDIRECT_URI`, mesmo domínio do Bling).

## Arquitetura — Fase A (espelha o padrão Bling)

- **Schema:** tabela singleton `kommo_config` (`id text pk default 'global'`): `subdominio`, `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at`, `atualizado_em`. Migração SQL manual (padrão do repo — journal do drizzle-kit quebrado; aplicar via runner/`apply_migration`).
- **Client:** `src/lib/kommo.ts` espelhando `src/lib/bling.ts`: `getKommoConfig`, `salvarCredenciaisKommo`, `kommoAuthUrl`, `trocarCodePorTokens`, `refreshAccessToken`, `salvarTokensKommo`, `getToken` (refresh automático quando faltam <5min), `kommoRequest` genérico, `getKommoStatus`.
- **Rotas OAuth:** `src/app/api/kommo/connect/route.ts` (valida admin, gera `state`, cookie, redireciona ao authorize) e `src/app/api/kommo/callback/route.ts` (valida admin+state, extrai `code`/`referer`, troca por tokens, salva subdomínio+tokens).
- **Admin:** `src/app/(dashboard)/admin/kommo/page.tsx` + `actions.ts` + `components/` — formulário para salvar `subdominio`/`client_id`/`client_secret`, status da conexão e botão Conectar/Reconectar/Desconectar. Card em `admin/page.tsx`. Acesso `admin_geral`.

## Arquitetura — Fase 1/2 (a detalhar após a conexão)

- Sync a cada ~15min grava métricas **diárias por colaborador** em `kommo_metricas_diarias` + `kommo_sync_status` (padrão `pix_mcp_sync_status`). Página `/atendimento` agrega por período (padrão `getRankingVendedores`), charts Recharts. Mapeamento por e-mail; opcional coluna/tabela `kommo_user_id` para vínculo estável.

## Setup que o usuário faz no Kommo (uma vez)

Criar a integração privada (Configurações → Integrações → criar), registrar o Redirect URL `https://mova.motochefesuldeminas.com.br/api/kommo/callback`, e informar ao Mova (tela Admin → Kommo) o **Client ID** e o **Client Secret**. O subdomínio é capturado automaticamente no callback.
