# Integrações por Grupo — PIX e Conciliação de Cartão — Design

**Data:** 2026-07-01
**Status:** Aprovado

## Contexto

O spec original do multi-grupo (`2026-07-01-multi-grupo-design.md`) deixou explicitamente fora de escopo as integrações (ValidaPix, Fábrica, Bling), por dependerem de contas externas por CNPJ. Com BH operando de verdade, dois desses buracos já causam problema real: **PIX** e **Conciliação de Cartão** estão puxando/misturando dados do Sul de Minas quando o usuário está no grupo BH. BH tem contas próprias (ValidaPix e operadoras de cartão) separadas do Sul de Minas.

Este plano cobre **apenas PIX e Conciliação**. Fábrica e Bling continuam fora de escopo (não foram pedidos agora).

## Objetivo

- PIX: buscar transações da conta ValidaPix do **grupo ativo**, não de uma conta global fixa por `.env`.
- Conciliação de cartão: cada transação importada (upload manual de extrato) pertence ao grupo que estava ativo no momento do upload, e a tela só mostra transações do grupo ativo.
- Zero impacto no Sul de Minas: todos os dados existentes (PIX já persistidos, conciliações já importadas) continuam pertencendo ao grupo Sul de Minas.

## Modelo de dados

### `pix_recebimentos`

| Alteração | Observação |
|---|---|
| ADD `grupo_id` uuid NOT NULL FK → grupos | grupo cujo ValidaPix retornou a transação |

### `conciliacoes_cartao`

| Alteração | Observação |
|---|---|
| ADD `grupo_id` uuid NOT NULL FK → grupos | grupo ativo no momento do upload do extrato |

### Migração dos dados existentes

Como no plano original: todo registro existente em `pix_recebimentos` e `conciliacoes_cartao` recebe o `grupo_id` do Sul de Minas via `UPDATE`, na mesma migration que adiciona a coluna (add nullable → backfill → `SET NOT NULL`).

## ValidaPix por grupo

- `src/lib/validapix.ts`: `fetchAllPix(from, to)` passa a `fetchAllPix(from, to, credenciais: { email: string; password: string })`. A função interna `getSession()` (hoje lê `process.env.VALIDAPIX_EMAIL/PASSWORD`) passa a receber essas credenciais como parâmetro em vez de ler env var.
- `src/app/(dashboard)/pix/page.tsx`: busca `getGrupoAtivo(usuario)`, valida que `validapixEmail`/`validapixPassword` estão preenchidos (senão mostra mensagem clara pedindo pra configurar em `/admin/grupos`), e chama `fetchAllPix(from, to, { email: grupo.validapixEmail, password: grupo.validapixPassword })`.
- O upsert em `pixRecebimentos` (já existente na página) passa a gravar `grupoId: grupo.id`.
- A sessão em memória (`let session: PixSession | null`) dentro de `validapix.ts` precisa virar um cache por grupo (ex: `Map<string, PixSession>` chaveado pelo e-mail), já que agora existe mais de uma conta possível na mesma instância do servidor.
- **Não muda:** a lógica de cruzamento com `vendas`/`pedidosVenda` via NF/PV continua igual — o número (`numero`) já é globalmente único no sistema (sequência única `numero_venda_seq`), então não há risco de uma venda do Sul de Minas casar com um PIX da BH por coincidência de número.

## Conciliação por grupo

- `src/app/(dashboard)/conciliacao/actions.ts` → `importarRelatorioAction`: busca `getGrupoAtivo(usuario)` e grava `grupoId: grupo.id` em cada linha inserida em `conciliacoesCartao`.
- `src/app/(dashboard)/conciliacao/page.tsx`: a query principal passa a filtrar `eq(conciliacoesCartao.grupoId, grupo.id)`, assim como o contador de pendentes/conciliadas.
- Buscas usadas no fluxo de "vincular venda manualmente" (`buscarConciliacoesPorValor`, `buscarVendasParaVincular`, `buscarVendaManual`) passam a receber/filtrar pelo grupo ativo, restringindo a busca de vendas candidatas às lojas do grupo da transação — hoje buscam em **todas** as vendas do sistema, o que é um vazamento (e pode causar um vínculo errado entre uma transação de cartão de um grupo e uma venda de outro).
- `buscarConciliacoesDaVenda`/`buscarPixDaVenda` (chamadas a partir do detalhe de uma venda específica) não precisam de ajuste — já são implicitamente escopadas pela venda, que tem `lojaId` próprio.

## Fora de escopo (permanece)

- Fábrica (peças) e Bling continuam lendo credenciais globais de `.env`/singleton — não fazem parte deste plano.
- `bling_config` continua singleton (`id=1`).

## Pendência operacional

Antes desse trabalho fazer efeito para BH, o operador precisa cadastrar o e-mail/senha do ValidaPix da BH em `/admin/grupos` (campos que já existem na tela, hoje sem uso).

## Teste

Sem suite automatizada. Validação manual: com o grupo BH ativo e as credenciais ValidaPix da BH cadastradas, acessar `/pix` e confirmar que só aparecem transações da conta BH. Fazer upload de um extrato de cartão com o grupo BH ativo e confirmar que só aparece em `/conciliacao` quando BH está selecionado, sumindo ao trocar para Sul de Minas.
