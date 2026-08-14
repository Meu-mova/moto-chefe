# Retirada de peças na fábrica

**Data:** 2026-08-14
**Status:** aprovado, implementado

## Problema

Quando a loja vai ao galpão da fábrica buscar motos, aproveita para retirar peças de
troca que a fábrica já separou. Hoje não há visibilidade dessas peças no MOVA — é
preciso entrar no portal da fábrica loja a loja para saber o que está pronto.

## Descoberta (portal real)

O portal da fábrica (`motochefebrasil.store`) tem duas abas: **Compras** e **Garantias**.
As peças a retirar são **pedidos de compra com status "Separado"** (do lado da fábrica é
"pedido de venda"; na loja cai em Compras). Não são as garantias/trocas.

- Lista: `GET /clientes/pedidos?aba=compras&status=Separado` (filtro server-side) devolve
  os pedidos separados — mas **sem** o nome da peça e **sem** o tipo de entrega.
- Detalhe: `GET /clientes/pedido/N` traz **Tipo de Entrega** ("Retirada na Loja" | "Correios")
  e **Itens do Pedido** (peça + quantidade + categoria/modelo).
- Só interessam as de **Retirada** — as de Correios a fábrica manda pelo malote.

Validado com dados reais: Pouso Alegre tinha 10 pedidos Separado, 8 de Retirada
(GUIDÃO, pedaleira, 4 setas, garfo, retrovisor); as outras lojas com 0 no momento.

## Design

Página de **consulta** (sem gravar nada, sem tracking, sem card no dashboard, sem alerta):

- Rota `/pecas-fabrica`, menu **"Retirada de Peças"** (`PackageCheck`), para
  `admin_geral` / `admin_socio` / `aux_adm`.
- Botão **Sincronizar** → `listarPecasSeparadasAction()` lê ao vivo, por loja do grupo do
  usuário (admin vê o grupo; aux_adm vê a própria loja — mesmo escopo das garantias),
  usando a credencial de fábrica de cada loja.
- Para cada loja: login → lista Separado → abre o detalhe de cada pedido → mantém só
  Retirada → coleta os itens.
- Lista agrupada por loja: **Peça · Qtd · Modelo · Pedido · Data**. Estados por loja:
  sem peças / sem credencial / erro (uma loja que falha não derruba as outras).

## Reaproveitamento e código novo

- Reusa `loginFabrica` e `listarPedidosCompraFabrica(session, 'Separado')` (já existiam).
- `src/lib/fabrica-scraper.ts`: novos `parsearDetalheCompra` (puro, testado com HTML real —
  âncora h3+"Quantidade" para ignorar títulos), `buscarDetalheCompraFabrica`,
  `ehRetiradaNaLoja`, `STATUS_SEPARADO`.
- `src/app/(dashboard)/pecas-fabrica/` (page + actions + client).
- Menu em `src/components/layout/sidebar.tsx`.

## Fora de escopo

Marcar como retirado, histórico, card/alerta no dashboard, e as peças de Correios.
