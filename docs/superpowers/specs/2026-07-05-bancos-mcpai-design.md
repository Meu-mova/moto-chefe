# Bancos (mcp.ai / Open Finance) — Design

## Contexto

O usuário contratou uma conta na plataforma **mcp.ai**, que expõe integrações
de terceiros (Pluggy para Open Finance, WhatsApp, etc.) como um **servidor
MCP** (Model Context Protocol) — não uma API REST tradicional. O acesso é
feito via uma URL única por conta, que já embute um token de sessão
(`https://api.mcp.ai/tk_...?u=usr_...&t=...`).

Duas contas bancárias do grupo **Sul de Minas** (CNPJ `57.113.017/0001-72`)
já estão conectadas via essa plataforma: Sicoob Empresas e Sicredi Empresas.
O pedido é criar um card "Bancos" no admin que mostre o saldo dessas contas.

## Descoberta técnica: mcp.ai é um servidor MCP, não uma API REST

Testado diretamente contra a URL fornecida: o endpoint fala JSON-RPC 2.0
sobre HTTP, exige handshake `initialize` (retorna um `Mcp-Session-Id` via
header) antes de qualquer outra chamada, e responde com Server-Sent Events
(`Content-Type: text/event-stream`). Chamar `tools/call` sem antes chamar
`initialize` retorna erro `-32000 Server not initialized`.

Isso significa que o backend do app precisa atuar como um **cliente MCP
mínimo**: 2 requisições HTTP por consulta (`initialize` → `tools/call`),
sem necessidade de manter sessão entre requisições (cada carregamento de
página faz seu próprio handshake).

A ferramenta relevante já testada e confirmada:

- **`openfinance_list_accounts`** (com `{"type": "BANK"}`, omitindo `item`
  para trazer todas as conexões de uma vez) retorna, por conta: `id`,
  `bank` (nome comercial, ex. "Sicoob Empresas"), `subtype`
  (`CHECKING_ACCOUNT` | `SAVINGS_ACCOUNT`), `number`, `balance` (string
  numérica), `currencyCode`.

## Decisões

- **Só contas BANK (corrente/poupança), sem cartão de crédito.** O `balance`
  de contas `CREDIT` tem semântica variável por banco (fatura parcial vs.
  dívida total) — fora de escopo por enquanto.
- **Busca ao vivo a cada visita à página, sem cache.** Simplicidade
  (YAGNI); o volume de acessos a uma página de admin não justifica
  infraestrutura de cache.
- **Só para o grupo Sul de Minas.** A conexão mcp.ai pertence a essa
  empresa especificamente. O card no admin e a própria página só aparecem/
  funcionam quando o grupo ativo (`getGrupoAtivo`) é Sul de Minas — nos
  outros grupos, o card fica oculto no dashboard do admin, e um acesso
  direto à URL mostra uma mensagem explicando a restrição em vez de dados
  incorretos ou vazios sem contexto.
- **Permissão: `admin_geral` e `admin_socio`** — mesmo padrão de
  `AdminGuard` já usado nas outras páginas do admin.
- **Credencial em variável de ambiente**, nunca no código: `MCPAI_ENDPOINT_URL`.
  Configurada via Vercel CLI (`vercel env add`) em produção e em
  `.env.local` (já no `.gitignore`) para desenvolvimento local.

## Arquitetura

**`src/lib/mcpai.ts`** (novo, server-only):
- `buscarSaldosBancarios(): Promise<{ ok: true; contas: ContaBancaria[] } | { ok: false; erro: string }>`
- `ContaBancaria = { id: string; banco: string; tipo: 'corrente' | 'poupanca'; numero: string; saldo: string }`
- Internamente: lê `process.env.MCPAI_ENDPOINT_URL` (lança erro claro se
  ausente), faz `POST` com `initialize`, extrai `Mcp-Session-Id` do header
  de resposta, faz `POST` com `tools/call` (`openfinance_list_accounts`,
  `{ type: 'BANK' }`) usando esse header, faz parse da resposta SSE
  (`event: message\ndata: {...}`) e do JSON aninhado em
  `result.content[0].text`. Qualquer falha de rede, erro JSON-RPC, ou
  ausência de conexões retorna `{ ok: false, erro }` — a página nunca
  quebra, só mostra uma mensagem.

**`src/app/(dashboard)/admin/bancos/page.tsx`** (novo):
- `AdminGuard` (mesmo padrão das outras páginas admin)
- Busca `getUsuarioLogado()` + `getGrupoAtivo()`
- Se `grupo.nome !== 'Sul de Minas'`: mostra mensagem "Esta integração está
  disponível apenas para o grupo Sul de Minas."
- Senão: chama `buscarSaldosBancarios()`; em caso de erro, mostra mensagem
  amigável; em caso de sucesso, lista as contas agrupadas por banco (Sicoob,
  Sicredi) com tipo, número e saldo formatado, mais um total geral somado

**`src/app/(dashboard)/admin/page.tsx`** (modificar):
- Busca `getGrupoAtivo()` (ainda não é buscado nessa página)
- Renderiza o card "Bancos" (ícone `Landmark` ou similar do lucide-react)
  condicionalmente, só quando `grupo.nome === 'Sul de Minas'`

## Fora de escopo

- Contas CREDIT (cartão de crédito)
- Cache/atualização automática de saldo
- Qualquer outra ferramenta do mcp.ai (WhatsApp, marketplace, etc.)
- Suporte a múltiplos grupos com conexões mcp.ai próprias
