# Spec — Perguntar ao MOVA pelo Telegram (consulta somente-leitura)

- **Data:** 2026-07-28
- **Autor:** Cesar + Claude
- **Status:** Aprovado para plano de implementação
- **Repos envolvidos:** MOVA/moto-chefe SaaS (`D:\Claude\Teste`, Next.js 16 + Supabase/Postgres, deploy Vercel) e Jarvis (`D:\jarvis`, OpenJarvis).

---

## 1. Contexto

O Cesar quer perguntar pelo **Telegram** e o Jarvis responder buscando dados
reais do seu SaaS (**MOVA**): vendas, estoque, ranking de vendedores, financeiro,
etc. O Jarvis já está ligado ao Telegram (bot @JarvisDoCesar_bot, allow-list do
chat do dono) e ao cérebro Claude.

Esta etapa é **somente LEITURA** ("perguntar e saber"). Ações que **mudam** o
MOVA (lançar venda, alterar estoque) são uma etapa futura, com aprovação.

### Decisões travadas (brainstorming)
| Decisão | Escolha |
|---|---|
| Ler ou agir | **Só LER** nesta etapa |
| Cobertura | **Todos os grupos** (Sul de Minas + BH) — visão consolidada, sem filtro por grupo |
| Arquitetura | **A**: rota de leitura DENTRO do MOVA + ferramenta no Jarvis |
| Confirmação | Ler NÃO passa pelo portão de aprovação (não muda nada) |

---

## 2. Objetivos e não-objetivos

### Objetivos
1. Rota `POST /api/jarvis/consulta` no MOVA que roda um `SELECT` **somente-leitura**
   (dupla trava: validação + transação read-only), com limite de tempo e de linhas.
2. Rota `GET /api/jarvis/schema` no MOVA que devolve tabelas/colunas (sem dados),
   para o Claude escrever a consulta certa.
3. Ferramentas `consultar_mova` e `schema_mova` no Jarvis; o secretário as usa.
4. Perguntar em linguagem natural pelo Telegram → resposta com dados do MOVA.
5. Segurança: token secreto, só-leitura, timeout, cap de linhas, log de auditoria.

### Não-objetivos (fora de escopo)
- **Escrever/alterar** dados no MOVA (etapa futura, com aprovação).
- "Consultas verificadas" pré-escritas para números críticos (melhoria futura).
- Filtro/escopo por grupo (o dono quer visão consolidada de todos).
- Interface visual/relatórios — a resposta é texto no Telegram/voz/web.

---

## 3. Arquitetura

```
Você (Telegram): "quantas vendas hoje?"
      ▼
🧠 Secretário (Claude) — chama schema_mova (uma vez) e consultar_mova(sql)
      │  HTTPS + Authorization: Bearer <JARVIS_API_TOKEN>
      ▼
🌐 MOVA (Vercel):
     GET  /api/jarvis/schema   -> tabelas/colunas (sem dados)
     POST /api/jarvis/consulta -> valida SELECT + transacao READ ONLY
      ▼                            + statement_timeout 5s + LIMIT 200
🗄️ Supabase Postgres -> linhas (JSON)
      ▲
🧠 Claude resume em pt-BR e mostra a consulta usada -> 📱 Telegram
```

Cross-repo: as rotas ficam no **MOVA** (onde já existe conexão com o banco e o
controle de segurança); a ferramenta e o token ficam no **Jarvis**.

---

## 4. Componentes

### 4.1 MOVA — `POST /api/jarvis/consulta`
- **Arquivo:** `src/app/api/jarvis/consulta/route.ts` (App Router route handler).
- **Auth:** header `Authorization: Bearer <token>`; compara com `process.env.JARVIS_API_TOKEN`
  usando comparação **timing-safe** (`crypto.timingSafeEqual`). Sem/errado → 401.
- **Body:** `{ "sql": string }`.
- **Validação (defesa em profundidade):**
  1. Trim; precisa começar com `select` (case-insensitive).
  2. Recusa se contiver `;` (evita múltiplos comandos).
  3. Recusa se casar `\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|into)\b`.
  4. Executa dentro de `client.begin(...)` com:
     `SET LOCAL transaction_read_only = on` (o Postgres recusa QUALQUER escrita) e
     `SET LOCAL statement_timeout = 5000`.
  5. Resultado limitado a **200 linhas** (fatia no servidor; sinaliza `truncated`).
- **Resposta:** `{ rows: unknown[], rowCount: number, truncated: boolean }`.
- **Erros:** 401 (token), 400 (sql inválido/não-select/palavra proibida), 408/500
  (timeout/erro de query) com mensagem curta e segura (sem vazar detalhes internos).
- **Auditoria:** registra (log) a query recebida + rowCount + duração (sem os dados).
- **Nota de conexão:** `src/lib/db/index.ts` hoje só exporta `db` (drizzle). Exportar
  também o client `postgres.js` cru (ou um helper) para usar `begin`/`unsafe` na
  transação read-only. Import só no server (route handler roda no Node).

### 4.2 MOVA — `GET /api/jarvis/schema`
- **Arquivo:** `src/app/api/jarvis/schema/route.ts`.
- **Auth:** mesmo token Bearer.
- **O que faz:** consulta `information_schema.columns` (schema `public`), devolve
  `{ tabela: [{ coluna, tipo }] }` — **só nomes/tipos, nunca dados**. Ignora tabelas
  internas do Supabase/postgres.
- **Resposta:** `{ schema: Record<string, {coluna:string, tipo:string}[]> }`.

### 4.3 Jarvis — ferramenta `consultar_mova`
- **Arquivo:** `src/openjarvis/tools/consultar_mova.py`.
- `consultar_mova(sql: str) -> ToolResult`: `POST {MOVA_API_URL}/api/jarvis/consulta`
  com o token (env), timeout de rede ~15s. Devolve as linhas (JSON) como texto ao modelo.
- **`requires_confirmation = False`** (só leitura → passa livre).
- Descrição instrui o Claude: "Consulta SOMENTE-LEITURA ao ERP MOVA (Postgres).
  Escreva UM único SELECT. Antes, use `schema_mova` para conferir tabelas/colunas.
  Datas: `current_date`, `now()`. Sempre diga ao usuário de onde tirou o número."
- Config: `MOVA_API_URL` (ex.: `https://mova.motochefesuldeminas.com.br`) e
  `JARVIS_API_TOKEN` (no vault, injetado no ambiente pelos launchers).

### 4.4 Jarvis — ferramenta `schema_mova`
- No mesmo arquivo. `schema_mova() -> ToolResult`: `GET .../api/jarvis/schema`;
  devolve tabelas/colunas. Cacheável no processo. `requires_confirmation = False`.

### 4.5 Jarvis — secretário ganha as ferramentas
- `scripts/criar_secretario.py`: `tools = ["salvar_lembrete", "think", "consultar_mova", "schema_mova"]`.
- System prompt: instrui a usar `schema_mova` + `consultar_mova` para perguntas sobre
  o negócio (vendas/estoque/etc.), e a **mostrar a consulta/lógica** usada.
- Registrar os imports das novas ferramentas em `src/openjarvis/tools/__init__.py`.

### 4.6 Jarvis — launchers injetam a config
- `jarvis-telegram.ps1` (e afins): `$env:MOVA_API_URL` e `$env:JARVIS_API_TOKEN`
  (lido do vault via `scripts/get_secret.py`), como já é feito com a chave do Claude.

---

## 5. Fluxo de dados (exemplo)

> Você (Telegram): *"quantas vendas foram feitas hoje?"*
1. Secretário chama `schema_mova` → vê a tabela `vendas` e sua coluna de data.
2. Escreve `SELECT count(*) AS total FROM vendas WHERE data_venda::date = current_date`.
3. Chama `consultar_mova(sql)` → MOVA valida (é SELECT), roda read-only → `{rows:[{total:12}]}`.
4. Claude responde: *"Hoje foram 12 vendas."* (e, se pedido, mostra a consulta usada).

---

## 6. Segurança

- 🔑 **Token Bearer** (`JARVIS_API_TOKEN`) — env no Vercel + no vault do Jarvis;
  comparação timing-safe; nunca em chat/log/commit.
- 🔒 **Só SELECT** — validação por string **e** `transaction_read_only = on` (garantia do banco).
- ⏱️ **`statement_timeout = 5s`** + **cap de 200 linhas** — sem query cara.
- 📱 **Allow-list do Telegram** (só o chat do Cesar comanda o Jarvis) — já existe.
- 📝 **Log de auditoria** da query (sem os dados) no MOVA.
- As rotas `/api/jarvis/*` **não** dependem de sessão de usuário (são máquina-a-máquina, só o token).

---

## 7. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Sem token / token errado | 401 → Jarvis: "sem acesso ao MOVA" |
| SQL não é SELECT / tem `;` / palavra de escrita | 400 → Claude reformula ou avisa |
| Coluna/tabela inexistente | 500 com msg curta → Claude reconsulta o schema e tenta de novo |
| Query demorou > 5s | erro de timeout → Jarvis: "a consulta demorou demais" |
| MOVA fora do ar / rede | Jarvis: "não consegui falar com o MOVA agora" |

---

## 8. Critérios de aceite

1. `POST /api/jarvis/consulta` **sem token** → 401.
2. Com token, `INSERT`/`UPDATE`/`DELETE`/`DROP`/`;` → 400 (recusado).
3. Mesmo forçando uma escrita que passe da validação, a transação read-only **bloqueia** (nada é gravado).
4. Um `SELECT count(*) FROM vendas` válido retorna as linhas.
5. `GET /api/jarvis/schema` devolve tabelas/colunas (inclui `vendas`, `motos`, etc.), sem dados.
6. Pelo **Telegram**: "quantas vendas hoje?" → resposta com um número vindo do MOVA.
7. Uma pergunta que exige olhar o schema (ex.: ranking de vendedores) → resposta plausível, com a consulta mostrada.
8. Token e credenciais **não** aparecem em log/chat.

---

## 9. Deploy

- As rotas novas exigem **push + deploy na Vercel** (preferência do Cesar: deploy
  automático ao terminar). Env var `JARVIS_API_TOKEN` cadastrada no Vercel (todos os
  ambientes usados).
- O Jarvis roda no PC; chama a URL pública do MOVA.

---

## 10. Testes

- **MOVA (endpoint):** 401 sem token; rejeita INSERT/UPDATE/DELETE/DROP/`;`;
  read-only bloqueia escrita; SELECT válido retorna; timeout e cap respeitados;
  `/schema` retorna tabelas sem dados. (Vitest/rota de teste conforme padrão do repo.)
- **Jarvis (ferramenta):** `consultar_mova`/`schema_mova` chamam o endpoint (mock) e
  tratam 401/400/timeout; `requires_confirmation is False`.
- **Ao vivo:** pergunta pelo Telegram conferida contra a tela do MOVA.

---

## 11. Fora de escopo (futuro)

Ações de escrita no MOVA (com aprovação) · consultas verificadas para números
críticos · role de banco somente-leitura dedicado (hardening extra além do
`transaction_read_only`) · cache/relatórios · gráficos.
