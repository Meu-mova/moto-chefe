# Bling por grupo

## Contexto

O sistema hoje gerencia dois grupos (Sul de Minas e BH, além de Vale). A integração com o Bling (emissão de NF-e) ainda é um singleton global: uma única linha em `bling_config` (`id=1`) guarda o token OAuth, e `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET` são variáveis de ambiente compartilhadas. Isso já foi identificado como pendência no spec da fundação multi-grupo (`2026-07-01-multi-grupo-design.md`, seção "Integrações por grupo").

O grupo BH tem sua própria conta Bling e seu próprio aplicativo cadastrado no Portal do Desenvolvedor Bling (Client ID/Secret distintos do Sul de Minas — decisão confirmada nesta sessão, diferente da suposição original do spec de fundação de que os grupos compartilhariam um único app). É necessário que a BH consiga conectar sua conta Bling e emitir NF-e de forma isolada, sem afetar a conexão do Sul de Minas.

## Objetivo

Cada grupo tem seu próprio Client ID/Secret e seu próprio token OAuth do Bling, isolados entre si. O fluxo de conexão em `/admin/bling` passa a operar sobre o grupo ativo (selecionado na barra do dashboard).

## Fora do escopo

- `blingCodigo` dos modelos continua global (não por grupo) — decisão já tomada no spec de fundação, não revisitada aqui.
- `BLING_REDIRECT_URI` e `BLING_NATUREZA_OPERACAO` continuam variáveis de ambiente globais (a mesma URL de callback atende os apps de todos os grupos; a natureza da operação de NF-e é igual para todos).
- ValidaPix e Fábrica não fazem parte deste trabalho (ficam para uma iteração futura, já sinalizada no spec de fundação).

## Mudanças de schema

### `grupos`

Adiciona duas colunas (texto, nuláveis, mesmo padrão de `validapix_email`/`fabrica_email`):
- `bling_client_id`
- `bling_client_secret`

Editáveis em Admin → Grupos, no mesmo diálogo onde já se edita ValidaPix/Fábrica.

### `bling_config`

Deixa de ser singleton (`id` inteiro fixo em 1) e passa a ter uma linha por grupo, com `grupo_id` (uuid, FK para `grupos`) como chave primária — mesmo padrão de `pix_mcp_sync_status`.

Migração:
1. Adiciona a coluna `grupo_id` (nulável, temporariamente)
2. Copia a linha existente (`id=1`) para o grupo Sul de Minas (uuid fixo `00000000-0000-4000-8000-000000000001`)
3. Torna `grupo_id` `NOT NULL` e chave primária
4. Remove a coluna `id`

### Migração de dados — backfill do Sul de Minas

O `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET` que já estão em uso hoje (env var, Vercel produção) são copiados para a linha do grupo Sul de Minas em `grupos`, como parte da migração — a conexão existente não deve exigir reconfiguração.

## Mudanças de código

### `src/lib/bling.ts`

Todas as funções exportadas passam a receber `grupoId: string` como primeiro parâmetro:
- `salvarTokens(grupoId, access, refresh, expiresIn)`
- `getBlingStatus(grupoId)`
- `criarRascunhoNFe(grupoId, dados)`
- `atualizarRascunhoNFe(grupoId, blingId, dados)`
- `emitirNFe(grupoId, dados)`
- `buscarNfeIdPorNumero(grupoId, numero)`
- `buscarLinksDanfe(grupoId, blingNfeId)`

Internamente:
- Novo helper (local a `bling.ts` ou em `src/lib/grupo.ts`) busca `blingClientId`/`blingClientSecret` do grupo em `grupos`; lança erro claro se não configurado ("Client ID/Secret do Bling não configurados para este grupo — configure em Admin → Grupos").
- `basicHeader`, `refreshAccessToken`, `getToken`, `blingRequest` passam a receber/repassar `grupoId` e usam as credenciais do grupo em vez de `process.env`.
- `blingAuthUrl` e `trocarCodePorTokens` recebem `clientId`/`clientSecret` como parâmetros (não mais leem de `process.env` diretamente) — quem chama (`connect`/`callback`) resolve as credenciais do grupo antes.

### `/api/bling/connect`

1. Autentica o usuário (já existente, só `admin_geral`).
2. Resolve o grupo ativo via `getGrupoAtivo(usuario)`.
3. Busca `blingClientId` do grupo; se não configurado, redireciona para `/admin/bling?erro=sem_credenciais`.
4. Gera `state` (já existente) e grava, além do cookie `bling_oauth_state`, um novo cookie `bling_oauth_grupo` com o `grupoId` (mesmas flags: `httpOnly`, `secure` em produção, `sameSite: lax`, `maxAge: 600`).

### `/api/bling/callback`

1. Autentica o usuário (já existente).
2. Lê `state` e `grupoId` dos cookies; valida `state` (já existente).
3. Busca `blingClientId`/`blingClientSecret` do grupo lido do cookie.
4. Troca o `code` por tokens usando essas credenciais e grava em `bling_config` para aquele `grupoId` (upsert — `onConflictDoUpdate` na chave primária `grupo_id`, já que pode ser a primeira conexão daquele grupo).
5. Limpa os dois cookies (`state` e `grupo`) ao final, sucesso ou erro.

### `/admin/bling` (página e actions)

- `getBlingStatusAction`/`desconectarBlingAction` resolvem `grupoId` via `getGrupoAtivo(usuario)` e repassam.
- Página mostra o nome do grupo ativo no cabeçalho ("Bling NF-e — Sul de Minas" / "Bling NF-e — BH").
- Texto de pré-requisitos atualizado: em vez de "adicione BLING_CLIENT_ID/SECRET no Vercel", instrui a configurar em Admin → Grupos.

### `vendas/actions.ts`

Nos 4 pontos que chamam funções do Bling (criar rascunho, atualizar rascunho, emitir NF-e, buscar links DANFE), resolve `grupoId` via `getGrupoIdDaLoja(venda.lojaId)` (helper já existente, usado hoje pela precificação) e repassa como primeiro argumento.

## Validação

Depois de implementado: Cesar insere o Client ID/Secret da BH em Admin → Grupos (grupo BH), troca para o grupo BH na barra do dashboard, acessa `/admin/bling`, clica em conectar, autoriza no Bling, e confirma que:
1. A conexão da BH aparece como conectada, sem afetar o status do Sul de Minas (verificar trocando de volta pro grupo Sul de Minas).
2. Uma venda de teste no grupo BH consegue gerar rascunho de NF-e usando o token da BH.
