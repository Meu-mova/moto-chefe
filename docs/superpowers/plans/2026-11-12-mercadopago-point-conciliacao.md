# Maquininha Mercado Pago (Point) na conciliação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As vendas da maquininha Mercado Pago do grupo BH (cartão e Pix) entram sozinhas na conciliação do MOVA, por botão e por rodada diária, com estorno tirando o valor das somas.

**Architecture:** O servidor do MOVA (Vercel) chama `GET /v1/payments/search` com o token do grupo, guardado cifrado em `grupos`. Uma função pura classifica cada pagamento (cartão, Pix, estorno, ignorar). O cartão passa pelo mesmo casamento da conciliação atual, extraído para `src/lib`. O Pix vai para `pix_recebimentos_mcp`. Os disparos são um Route Handler (botão) e um cron.

**Tech Stack:** Next.js 16 (App Router), Drizzle sobre Postgres (Supabase), `node:test`, `@base-ui/react`, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-11-12-mercadopago-point-conciliacao-design.md`

## Global Constraints

- Partir da `origin/dev` (não da branch atual `feat/financeiro-periodo-de-ate`): branch `feat/mercadopago-point-bh`. PR para `dev` com `Refs #N`, nunca `Closes`.
- **Nenhum commit nem PR com autoria de IA** (`Co-Authored-By: Claude`, `Generated with Claude Code` etc.). Regra do `CLAUDE.md`; vale acima de qualquer padrão da ferramenta.
- Antes do código: issue-mãe por `/to-spec` (Luis responsável) e tickets por `/to-tickets` a partir do spec. Telas (Tasks 7 e 8) só com protótipo aprovado pelo Luis, no desktop e no celular.
- Token do MP cifrado com `cifrar`/`decifrar` de `src/lib/cripto.ts`. Nunca em log, erro, resposta, teste ou chat. Erro da API carrega só `HTTP <status>` e o caminho sem query (padrão de `src/lib/mercadopago/cliente.ts`).
- A env `MP_ACCESS_TOKEN` (conta da Infinity Fit, mensalidade) não é lida nem alterada por nada deste plano.
- O grupo de toda gravação vem da credencial usada. Toda consulta e todo upsert filtram por `grupo_id`.
- Janela de busca: pagamentos com `date_last_updated` nos últimos **7 dias**.
- `banco` do Pix = `'Mercado Pago'`; `transacao_id` do Pix = `'mp-' + id`; `operadora` do cartão = `'mercadopago'`; `nsu` do cartão = id do pagamento MP (string).
- Status estornado = `'estornado'` (cartão e Pix). Vem de MP `refunded`, `charged_back` ou `cancelled`.
- Serial da maquininha gravado em `raw_data->>'serial'` (chave que `src/lib/terminal-da-conta.ts` lê). A checagem por serial fica fora.
- Migração: `src/lib/db/migrations/0183_mercadopago_point.sql`. Antes, confirme que 0183 está livre na `origin/dev`, nos PRs abertos e no staging (`migrate.ts --status`). Nunca rode `db:generate`/`db:migrate`.
- Datas: dia da transação com `dataBrt()` de `src/lib/conciliacao-cartao.ts`; "hoje" com `hojeBrt()`.
- Cor só por variável do `globals.css`.
- Teste novo entra na lista do `package.json`: `test` ou `test:db` (`*.db.test.ts`).
- Pronto = `npm run type-check` → `npm test` → `npm run test:db` → `npm run build` → navegador com `aux_adm` e admin.

## Desvios do spec (decididos no plano, para o César conferir)

1. **Estorno de cartão também põe `conciliado = false`**, mantendo `venda_id`/`peca_venda_id`/`os_id`. Hoje há mais de dez somas de receita filtrando `conciliado = true` (`valor-liquido.ts`, `dre.ts`, `financeiro/page.tsx`, `dashboard.ts`…). Com isso todas excluem o estorno sem cada uma ser editada, e a venda volta a aparecer como "a conciliar": é o "aparece para revisão". A venda em si não é mexida.
2. **O casamento extraído inclui os dois caminhos que existem na `dev`**: por autorização (CSV, `conciliacao/actions.ts`) e por valor (agente, `api/conciliacao/cartao/route.ts`). O MP tenta autorização primeiro, valor depois. Assim o código fica num lugar só (regra "sem código duplicado").
3. **`mercadopago` não entra em `COM_RELATORIO`.** Na `dev`, esse conjunto quer dizer "tem leitor de CSV" e controla o upload. O botão do MP aparece pela credencial do grupo.
4. **Sem aviso no Telegram no cron.** Não existe helper de Telegram no `src/lib` (o do agente mora em `scripts/`). O cron devolve e loga, por grupo, o erro só com status.

## Review Focus

1. **Pagamento parcialmente estornado** (`status_detail = partially_refunded`, status continua `approved`): não pode virar estorno inteiro nem sumir. Fica como aprovado; o valor estornado vai em `rawData.estornado`. Teste na Task 4.
2. **Segunda rodada com os mesmos pagamentos** (botão clicado duas vezes, cron logo depois): zero linhas novas e nenhum vínculo desfeito. Teste na Task 5.
3. **Token revogado ou trocado no painel do MP**: a rodada falha com mensagem "Credencial do Mercado Pago recusada (HTTP 401). Cadastre o token novo em Admin › Grupos." e não grava nada pela metade daquele grupo. Os outros grupos do cron seguem. Teste nas Tasks 3 e 9.
4. **Venda das 21h às 23h59 em Brasília** (já é o dia seguinte em UTC): `dataTransacao` é o dia de Brasília. Teste na Task 4.
5. **Pix estornado já vinculado a uma venda**: deixa de cobrir o pagamento da venda nas telas de conciliação, de OS e de peças, mas continua visível em `/pix-mcp` com selo. Teste na Task 6.

---

### Task 0: Issue, branch e protótipos

- [ ] **Step 1:** Rode `/to-spec` com o spec para a issue-mãe (Módulo Conciliação, Luis responsável) e `/to-tickets` para um ticket por task 1–9. Anote as decisões do César (seção "Decisões do César" do spec) e os "Desvios do spec" deste plano como comentário na issue-mãe.
- [ ] **Step 2:** `git fetch origin && git switch -c feat/mercadopago-point-bh origin/dev`. Copie para a branch o spec e este plano, que estão sem commit na árvore atual.
- [ ] **Step 3:** Commit `docs: spec e plano da maquininha Mercado Pago (Refs #N)`.
- [ ] **Step 4:** Peça ao Luis o protótipo de três peças, no desktop e no celular: bloco "Mercado Pago (maquininha)" no diálogo do grupo; botão "Importar Mercado Pago" com o resumo do resultado na conciliação; selo "Estornado" na lista da conciliação e em `/pix-mcp`. As Tasks 7 e 8 esperam a aprovação. As Tasks 1–6 e 9 não dependem dela.

### Task 1: Migração e schema

**Files:**
- Create: `src/lib/db/migrations/0183_mercadopago_point.sql`
- Modify: `src/lib/db/schema.ts` (tabela `grupos`, perto de `mcpaiEndpointUrl`; tabela `pixRecebimentosMcp`)

**Interfaces:**
- Produces: `grupos.mpAccessToken: text | null` (cifrado `iv:tag:dados`), `grupos.mpPublicKey: text | null`, `grupos.mpUserId: text | null`, `pixRecebimentosMcp.status: text not null default 'aprovado'`.

- [ ] **Step 1:** Escreva o SQL com `alter table grupos add column if not exists mp_access_token text, add column if not exists mp_public_key text, add column if not exists mp_user_id text;` e `alter table pix_recebimentos_mcp add column if not exists status text not null default 'aprovado';`. Ponha um comentário no topo dizendo por que existe (credencial por grupo, ADR 0010; status do Pix para estorno).
- [ ] **Step 2:** Espelhe no `schema.ts`, com um comentário em `mpAccessToken` no padrão do `mcpaiEndpointUrl` (cifrado, nulo = sem integração).
- [ ] **Step 3:** `npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --status`. Esperado: o banco impresso é o staging e só a 0183 está pendente.
- [ ] **Step 4:** `npm run type-check`. Esperado: sem erro.
- [ ] **Step 5:** Commit `feat(conciliacao): colunas da credencial Mercado Pago e status do Pix (Refs #N)`.

### Task 2: Casamento extraído para `src/lib`

**Files:**
- Create: `src/lib/conciliacao-casamento.ts`
- Create: `src/lib/conciliacao-casamento.db.test.ts`
- Modify: `src/app/api/conciliacao/cartao/route.ts` (o laço de casamento e `casaPagamento` saem daqui)
- Modify: `src/app/(dashboard)/conciliacao/actions.ts` (o bloco "auto-conciliar pela autorização" de `importarRelatorio`)

**Interfaces:**
- Produces:
  - `type Alvos = { vendaId: string | null; pecaVendaId: string | null; osId: string | null }`
  - `casarPorAutorizacao(db: Db, lojaIds: string[], autorizacao: string): Promise<Alvos>`: moto, depois peça, depois OS, com `pagamentos @> [{autorizacao}]`.
  - `casarPorValor(db: Db, lojaIds: string[], t: { dataTransacao: string; valorBruto: number; parcelas: number }): Promise<Alvos>`: ±1 dia, ±R$ 0,05, mesmas parcelas, nos tipos de cartão. Moto, depois peça, depois OS. Comportamento de `route.ts` hoje, incluindo o `.find` (primeiro candidato).
  - `lojaIdsDoGrupo(db: Db, grupoId: string): Promise<string[]>`
  - Lista vazia de lojas devolve tudo `null`, sem consulta.

- [ ] **Step 1: Teste de banco (falha).** Cenários em `conciliacao-casamento.db.test.ts`, com contagens filtradas pelos ids do próprio teste:
  - `casarPorValor acha a venda do grupo A`: uma venda de R$ 1.234,56 em 3x no dia D → `vendaId` é ela.
  - `casarPorValor não casa venda de outra Conta`: venda idêntica só no grupo B; chamada com as lojas de A → todos `null`.
  - `casarPorValor respeita parcelas e tolerância`: R$ 1.234,62 (diferença de 0,06) → `null`; R$ 1.234,60 → casa; 2x contra venda em 3x → `null`.
  - `casarPorAutorizacao acha peça quando não há moto`: autorização `ABC123` só numa venda de peça → `pecaVendaId`.
- [ ] **Step 2:** `npm run test:db` com o arquivo na lista. Esperado: FAIL, módulo sem as funções exportadas (crie o arquivo vazio antes, para o vermelho não ser `ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3:** Implemente as três funções movendo o código existente sem mudar regra. `route.ts` e `importarRelatorio` passam a chamá-las.
- [ ] **Step 4:** `npm run test:db`. Esperado: PASS no arquivo novo e em `src/app/(dashboard)/conciliacao/importar-relatorio.db.test.ts`, que não muda. Diga no PR "refatoração sem mudança de comportamento: sem vermelho" para essa parte.
- [ ] **Step 5:** Commit `refactor(conciliacao): casamento de cartão num lugar só (Refs #N)`.

### Task 3: Cliente da API por token

**Files:**
- Create: `src/lib/mercadopago/point.ts`
- Create: `src/lib/mercadopago/point.test.ts`
- Modify: `src/lib/mercadopago/cliente.ts`: exporte `ErroMercadoPago` (já é) e extraia o `chamar` para `chamarComToken(token, caminho, init)`. O `chamar` atual vira `chamarComToken(token(), …)`, e a mensalidade não muda.

**Interfaces:**
- Produces:
  - `type PagamentoMp` com os campos lidos pela Task 4: `id: number; status: string; status_detail?: string; payment_type_id: string; payment_method_id: string; transaction_amount: number; transaction_amount_refunded?: number; installments: number; date_created: string; date_approved: string | null; date_last_updated: string; authorization_code?: string | null; transaction_details?: { net_received_amount?: number }; point_of_interaction?: { type?: string; device?: { serial_number?: string } }; card?: { last_four_digits?: string }; payer?: { first_name?: string; last_name?: string }`. Caminhos exatos confirmados na Task 4, Step 1.
  - `consultarConta(token: string): Promise<{ id: string; nickname: string }>`, via `GET /users/me`.
  - `buscarPagamentosAlterados(token: string, p: { inicio: Date; fim: Date }): Promise<PagamentoMp[]>`: `range=date_last_updated`, `sort=date_last_updated`, `criteria=asc`, `limit=100`, `offset` até `paging.total`.
  - Erro 401/403: `ErroMercadoPago('Credencial do Mercado Pago recusada (HTTP 401). Cadastre o token novo em Admin › Grupos.', 401)`.

- [ ] **Step 1: Testes (falham)** com `fetch` mockado (fronteira de fora):
  - `pagina até o total`: 2 páginas (100 + 37) → 137 pagamentos; a 2ª chamada tem `offset=100`.
  - `manda Bearer e as datas em ISO`: confere `Authorization` e `begin_date`/`end_date`.
  - `401 vira mensagem de credencial recusada sem o token`: `err.message` não contém o token de teste `TEST-tok-0000`.
  - `consultarConta devolve id como string`.
- [ ] **Step 2:** `npm test` (arquivo na lista). Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** `npm test`. Esperado: PASS, inclusive `src/lib/mercadopago/webhook.test.ts`.
- [ ] **Step 5:** Commit `feat(mercadopago): cliente por token para a maquininha (Refs #N)`.

### Task 4: Classificação do pagamento (função pura)

**Files:**
- Create: `src/lib/conciliacao-mercadopago.ts`
- Create: `src/lib/conciliacao-mercadopago.test.ts`
- Create: `src/lib/fixtures/mercadopago/` (JSONs mascarados)
- Modify: `src/lib/conciliacao-cartao.ts`: `Operadora` ganha `'mercadopago'`.

**Interfaces:**
- Consumes: `PagamentoMp` (Task 3); `TransacaoCartao`, `dataBrt` (`conciliacao-cartao.ts`).
- Produces:
  - `type PixMp = { transacaoId: string; data: string; valor: number; pagadorNome: string | null; serial: string | null }`
  - `type Classificacao = { tipo: 'cartao'; transacao: TransacaoCartao } | { tipo: 'pix'; pix: PixMp } | { tipo: 'estorno'; meio: 'cartao' | 'pix'; chave: string } | { tipo: 'ignorar'; motivo: string }`
  - `classificarPagamento(p: PagamentoMp): Classificacao`. Para estorno, `chave` é o `nsu` do cartão (`String(id)`) ou o `transacaoId` do Pix (`'mp-' + id`).
  - `ehDaMaquininha(p: PagamentoMp): boolean`

- [ ] **Step 1:** Com o César ou o Luis, pegue na conta do BH um pagamento real de cada tipo: crédito parcelado, débito, Pix na maquininha e, se houver, um estorno. Use `buscarPagamentosAlterados` num script local que só imprime o JSON passado por um mascarador (nome, documento, e-mail, últimos dígitos → `***`). Salve em `src/lib/fixtures/mercadopago/`. Confirme ali os caminhos de `point_of_interaction` e do serial; se diferirem do tipo da Task 3, corrija o tipo.
- [ ] **Step 2: Testes (falham)** sobre as fixtures:
  - `crédito 3x aprovado vira cartão`: `tipo 'credito'`, `parcelas 3`, `valorBruto` = `transaction_amount`, `valorLiquido` = `net_received_amount`, `nsu = String(id)`, `status 'aprovado'`, `rawData.serial` = serial da fixture, `rawData.bandeira` = `payment_method_id`.
  - `débito vira cartão débito com 1 parcela`.
  - `Pix aprovado vira pix`: `transacaoId 'mp-<id>'`, `valor`, `data = date_approved`.
  - `venda às 23:30 BRT cai no dia de Brasília`: `date_approved '2026-11-13T02:30:00.000Z'` → `dataTransacao '2026-11-12'`.
  - `refunded, charged_back e cancelled viram estorno` com `chave` certa, para cartão e Pix.
  - `parcialmente estornado continua cartão aprovado` com `rawData.estornado = transaction_amount_refunded` (Review Focus 1).
  - `pagamento sem point_of_interaction de maquininha é ignorado` (link/checkout).
  - `pending/in_process é ignorado`.
- [ ] **Step 3:** `npm test`. Esperado: FAIL.
- [ ] **Step 4:** Implemente. `rawData` leva só `id`, `bandeira`, `serial`, `ultimos4`, `estornado`; nenhum dado do pagador no cartão.
- [ ] **Step 5:** `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit `feat(conciliacao): classificar pagamento da maquininha Mercado Pago (Refs #N)`.

### Task 5: Importação de um grupo

**Files:**
- Create: `src/lib/mercadopago/importar.ts`
- Create: `src/lib/mercadopago/importar.db.test.ts`

**Interfaces:**
- Consumes: `buscarPagamentosAlterados`, `classificarPagamento`, `casarPorAutorizacao`, `casarPorValor`, `lojaIdsDoGrupo`, `decifrar`.
- Produces:
  - `type ResultadoImportacaoMp = { importadas: number; duplicadas: number; conciliadas: number; pixNovos: number; estornos: number; ignorados: number }`
  - `importarMercadoPagoDoGrupo(grupoId: string, opts?: { agora?: Date; buscar?: typeof buscarPagamentosAlterados }): Promise<ResultadoImportacaoMp>`. Lança `RecusaUsuario('Este grupo não tem credencial do Mercado Pago.')` sem token.
  - `gruposComMercadoPago(): Promise<{ id: string; nome: string }[]>`

Regras:
- Cartão: casa por autorização, depois por valor. `insert … onConflictDoNothing` no índice `(grupo_id, operadora, nsu)` (migração 0182). Conflito conta como duplicada.
- Pix: `insert … onConflictDoUpdate` no `transacao_id`, com `setWhere: eq(pixRecebimentosMcp.grupoId, grupoId)`. Só reescreve `pagador_nome` com `coalesce`, como `pix-sync.ts`. Conta como novo só o que entrou (`returning` com `xmax = 0`, ou select antes).
- Estorno: `update conciliacoes_cartao set status='estornado', conciliado=false where grupo_id=$g and operadora='mercadopago' and nsu=$chave` (mantém os vínculos). Pix: `update pix_recebimentos_mcp set status='estornado' where grupo_id=$g and transacao_id=$chave`. Sem linha: não faz nada.
- Erro da API antes de qualquer gravação: propaga e não grava nada daquele grupo.

- [ ] **Step 1: Testes de banco (falham)**, com `buscar` injetado (fronteira de fora) devolvendo fixtures da Task 4:
  - `grava cartão e casa com a venda do grupo`.
  - `segunda rodada não duplica nem desfaz vínculo` (Review Focus 2): `duplicadas` igual ao total e `venda_id` intacto.
  - `isolamento: grupo B não casa com venda do grupo A nem sobrescreve Pix de A`: Pix com o mesmo `transacao_id` já existe em A; importar em B não muda a linha de A e não conta como novo.
  - `estorno de cartão marca estornado, conciliado false e mantém venda_id`.
  - `estorno de Pix marca status estornado e mantém venda_id`.
  - `sem credencial recusa`.
  - `401 não grava nada` (Review Focus 3).
- [ ] **Step 2:** `npm run test:db`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** `npm run test:db`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(conciliacao): importar vendas da maquininha Mercado Pago (Refs #N)`.

### Task 6: Pix estornado não cobre pagamento

**Files:**
- Create: `src/lib/pix-status.ts`
- Modify: os leitores de Pix vinculado que medem cobertura de pagamento. Levante com `git grep -n "pixRecebimentosMcp" src/app src/lib | grep -v test`; na `dev` são `conciliacao/actions.ts` (`buscarPixDoAlvo`), `ordens-servico/actions.ts`, `pecas/actions.ts`. `apagar-venda.ts`, `excluir-venda-peca.ts` e `remover-motos.ts` só desvinculam e não mudam.
- Modify: `src/app/(dashboard)/pix-mcp/actions.ts`: devolve `status` para a lista.
- Test: `src/lib/pix-status.db.test.ts`

**Interfaces:**
- Produces: `PIX_ESTORNADO = 'estornado'`; `pixQueCobre = ne(pixRecebimentosMcp.status, PIX_ESTORNADO)` (condição Drizzle, usada no `where` de cada leitor).

- [ ] **Step 1: Teste de banco (falha):** `Pix estornado vinculado não aparece em buscarPixDoAlvo e o aprovado sim` (Review Focus 5), chamando a função real com a sessão mockada como nos testes vizinhos.
- [ ] **Step 2:** `npm run test:db`. Esperado: FAIL.
- [ ] **Step 3:** Aplique `pixQueCobre` em cada leitor levantado.
- [ ] **Step 4:** `npm run test:db`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(pix): Pix estornado deixa de cobrir pagamento (Refs #N)`.

### Task 7: Credencial na tela do grupo (depois do protótipo)

**Files:**
- Modify: `src/app/(dashboard)/admin/grupos/actions.ts` (`GrupoInput`, listagem, `criarGrupoAction`, `editarGrupoAction`)
- Modify: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`
- Test: `src/app/(dashboard)/admin/grupos/actions.mercadopago.test.ts` (na lista `test`)

**Interfaces:**
- Consumes: `consultarConta` (Task 3), `cifrar`.
- Produces: `GrupoInput` ganha `mpAccessToken?: string`, `mpPublicKey?: string`, `mpRemover?: boolean`; a listagem ganha `mpConfigurado: boolean` e `mpConta: string | null` (nickname). O token nunca volta.

Regras, no padrão do MCPAI: campo vazio não mexe; `mpRemover` apaga as três colunas; token novo → `consultarConta` → grava `cifrar(token)`, `mp_user_id` e a public key. Recusa com `RecusaUsuario`:
- `'O Mercado Pago recusou esse token. Confira se copiou o Access Token de produção.'` em 401.
- `'Esse token é da conta da mensalidade do MOVA, não da loja.'` se o token for igual a `process.env.MP_ACCESS_TOKEN`.
- `'Esse token não começa com APP_USR-. Use o Access Token de produção.'` se não começar com `APP_USR-`.

- [ ] **Step 1: Testes (falham)** com `consultarConta` e `db` da action mockados na fronteira, conferindo o que cada caminho envia ao `update` (criar e editar): token vazio não inclui as colunas; token válido inclui `mpAccessToken` ≠ token em claro e `decifrar(...)` devolve o token; remover zera as três; as três recusas acima.
- [ ] **Step 2:** `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente a action e o bloco do diálogo conforme o protótipo aprovado: campos Access Token (password) e Public Key, estado "Configurado — conta <nickname>" e botão "Remover".
- [ ] **Step 4:** `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(admin): credencial Mercado Pago no grupo (Refs #N)`.

### Task 8: Botão, rota e selo (depois do protótipo)

**Files:**
- Create: `src/app/api/conciliacao/mercadopago/route.ts`
- Create: `src/app/(dashboard)/conciliacao/components/importar-mercadopago-button.tsx`
- Modify: `src/app/(dashboard)/conciliacao/page.tsx` (botão quando o grupo ativo tem `mpAccessToken`; selo "Estornado" quando `status = 'estornado'`)
- Modify: lista de `/pix-mcp` (`pix-lista.tsx`): selo "Estornado"
- Test: `src/app/(dashboard)/conciliacao/components/importar-mercadopago-button.test.tsx` (com `montarDom()`)

**Interfaces:**
- Consumes: `importarMercadoPagoDoGrupo` (Task 5).
- Produces: `POST /api/conciliacao/mercadopago` → `200 ResultadoImportacaoMp` | `401 { error: 'Sessão expirada' }` | `403 { error: 'Sem permissão' }` | `400 { error: <RecusaUsuario.message> }` | `502 { error: <ErroMercadoPago.message> }`. `maxDuration = 300`, `dynamic = 'force-dynamic'`. Permissão `usuarioPodeAcessar(usuario, '/conciliacao')` e grupo `getGrupoAtivo(usuario)`, no padrão de `api/pix-mcp/sincronizar/route.ts`.

- [ ] **Step 1: Teste de tela (falha):** clicar mostra "Importando…" com o botão desabilitado; com sucesso mostra "12 importadas, 9 conciliadas, 3 Pix novos, 1 estorno"; com 502 mostra a mensagem do servidor.
- [ ] **Step 2:** `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente a rota, o botão (`router.refresh()` no sucesso) e os selos, com cor só por variável.
- [ ] **Step 4:** `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(conciliacao): botão Importar Mercado Pago e selo de estorno (Refs #N)`.

### Task 9: Rodada diária

**Files:**
- Create: `src/app/api/cron/conciliacao-mercadopago/route.ts`
- Create: `src/lib/mercadopago/rodada.ts` + `src/lib/mercadopago/rodada.test.ts`
- Modify: `vercel.json`: `{ "path": "/api/cron/conciliacao-mercadopago", "schedule": "0 9 * * *" }` (06:00 BRT)

**Interfaces:**
- Consumes: `gruposComMercadoPago`, `importarMercadoPagoDoGrupo`.
- Produces: `rodarTodosOsGrupos(deps?: { grupos?: typeof gruposComMercadoPago; importar?: typeof importarMercadoPagoDoGrupo }): Promise<{ grupo: string; ok: boolean; resultado?: ResultadoImportacaoMp; erro?: string }[]>`. Um grupo que falha não para os outros; `erro` é só a mensagem do `ErroMercadoPago`/`RecusaUsuario`, senão `'erro interno'`.
- A rota usa o `autorizado()` de `api/cron/avaliacoes-google/route.ts`: se ainda for local, extraia-o para `src/lib` e reuse nos dois. `GET`, `maxDuration = 300`.

- [ ] **Step 1: Teste (falha):** `grupo com 401 não impede o seguinte` (Review Focus 3): dois grupos, o 1º lança `ErroMercadoPago` 401 e o 2º importa; o resultado tem os dois, com `ok` false e true.
- [ ] **Step 2:** `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente a rodada, a rota e o `vercel.json`.
- [ ] **Step 4:** `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(conciliacao): rodada diária do Mercado Pago (Refs #N)`.

### Task 10: Conferência final e PR

- [ ] **Step 1:** `npm run type-check`, `npm test`, `npm run test:db` e `npm run build`. Esperado: tudo verde.
- [ ] **Step 2:** No navegador, contra a cópia local da produção (`prod-local/copiar-prod.py`, com a 0183 aplicada só na cópia): o Luis cola o token **novo** do BH na tela do grupo. Como `aux_adm` do BH, clicar em Importar e conferir as vendas reais da semana; repetir o clique e ver tudo duplicado; como usuário de outra Conta, não ver nada. Depois, `copiar-prod.py` de novo para apagar.
- [ ] **Step 3:** Abra o PR para `dev` com `Refs #N`, sem nenhuma linha de autoria de IA no corpo nem nos commits, citando os protótipos aprovados e os "Desvios do spec".
- [ ] **Step 4:** Abra a issue separada do casamento duplicado: o `.find` pega o primeiro candidato e não exclui venda já casada. Isso vale para todas as operadoras, como diz o spec.
