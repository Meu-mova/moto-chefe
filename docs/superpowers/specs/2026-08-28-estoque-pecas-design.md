# Estoque de peças e capacetes por loja

**Data:** 2026-08-28
**Status:** aprovado, a implementar

## Problema

Não existe estoque de peças. `pecas_catalogo.quantidade_estoque` é **um inteiro só,
global** — sem loja, sem tamanho, sem histórico. Na prática está zerado: 1 unidade
somando as 1.733 peças do catálogo.

Três buracos concretos:

1. **Não sabe onde a peça está.** Varginha e Poços compartilham o mesmo número. Uma
   venda em Lavras desconta do "estoque" que talvez esteja em Itajubá.
2. **Capacete não cabe no modelo.** Não há nenhum capacete cadastrado (as 1.733 peças
   são de reposição da fábrica). Capacete é comprado fora e precisa de **modelo +
   tamanho** — a tabela atual só tem um nome solto.
3. **A OS come estoque sem descontar.** `os_itens.peca_id` existe e já tem 12 peças
   lançadas, mas nada nunca foi baixado. O saldo nunca fecharia com a prateleira.

E não há entrada automática: o que a loja retira na fábrica só existiria no sistema se
alguém digitasse.

## Estado atual (medido em 28/08/2026)

| Fato | Valor |
|---|---|
| Peças no catálogo | 1.733 (todas da fábrica; **zero capacetes**) |
| Peças com estoque > 0 | 1 (soma = 1 unidade) |
| Vendas de peças registradas | **0** |
| Peças lançadas em OS | 12, todas do Sul de Minas |
| Lojas ativas | 8 — Sul de Minas 6, BH 1, Vale 1 |
| Lojas com login da fábrica | 5 — todas do Sul de Minas menos Galpão e Lavras, mais Raja BH |

Não há dado real de estoque para migrar. É folha em branco, o que permite mudar o
modelo sem backfill de saldo.

## Design

### Modelo de dados

`pecas_catalogo` **passa a ser a variação**, não o produto. É a decisão central: todas
as FKs que já existem (`os_itens.peca_id`, `vendas_pecas_itens.peca_id`) continuam
apontando para ela, que é justamente onde o estoque mora. Zero backfill de referência,
e as 12 peças em OS seguem válidas.

```
pecas_produtos          nome, categoria, VALOR, grupo dono, ativo
  └ pecas_catalogo      + produto_id, + tamanho   ← a variação; é ela que tem estoque
      ├ pecas_estoque          saldo por (variação × loja)
      └ pecas_movimentacoes    histórico de toda entrada e saída
```

Peça da fábrica = produto com **uma** variação de `tamanho` nulo. Capacete = produto
com N variações (P/M/G/GG).

**Preço mora no produto** (`pecas_produtos.valor`): todos os tamanhos custam igual.
`pecas_catalogo.valor` deixa de ser lido e é removida junto com `quantidade_estoque` —
o preço de uma venda passada não se perde, porque `vendas_pecas_itens.valor_unitario`
sempre foi snapshot.

Tabelas novas:

```sql
pecas_produtos (
  id uuid PK, grupo_id uuid NOT NULL → grupos,
  nome text NOT NULL, categoria text,
  valor numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_automaticamente boolean NOT NULL DEFAULT false,
  criado_em, atualizado_em
)
UNIQUE (grupo_id, lower(nome))    -- trava a duplicata do robô da fábrica

pecas_estoque (
  peca_id uuid → pecas_catalogo, loja_id uuid → lojas,
  quantidade integer NOT NULL DEFAULT 0, atualizado_em,
  PRIMARY KEY (peca_id, loja_id)
)

pecas_movimentacoes (
  id uuid PK, peca_id → pecas_catalogo, loja_id → lojas,
  tipo text NOT NULL,           -- entrada_fabrica | entrada_manual | ajuste | venda | os | estorno_os
  quantidade integer NOT NULL,  -- positivo entra, negativo sai
  saldo_depois integer NOT NULL,
  venda_peca_id → vendas_pecas, os_id → ordens_servico, pedido_fabrica text,
  observacao text, usuario_id → usuarios, criado_em
)
UNIQUE (pedido_fabrica, peca_id, loja_id) WHERE pedido_fabrica IS NOT NULL
```

Esse índice parcial é o que torna o cron seguro: rodar duas vezes o mesmo pedido não
dobra o estoque. Um pedido que liste a mesma peça em duas linhas é **somado antes** do
insert, para não bater no índice.

### Escopo por grupo

Todo produto tem dono (`grupo_id NOT NULL`), inclusive as peças da fábrica — segue a
regra de que nada novo nasce global. As 1.733 viram **5.199 produtos**: as linhas
originais ficam com o Sul de Minas (preservando as 12 referências de OS) e BH e Vale
recebem cópias. Cada grupo pode precificar do seu jeito daqui pra frente.

BH compra da mesma fábrica (tem login), então precisa do catálogo. Vale ainda não tem
login — recebe a cópia mesmo assim, para poder vender e dar entrada manual; a
reposição automática passa a funcionar no dia em que a credencial existir.

### Entrada automática da fábrica

Cron diário mais botão "Sincronizar agora". Para cada loja **do grupo** com login:

1. Lista os pedidos de compra com status **"Retirado"** e **"Enviado"**.
2. Abre o detalhe de cada pedido (a lista não traz nome nem categoria da peça).
3. Para cada item: acha o produto no grupo da loja por **nome normalizado** (sem
   acento, sem caixa, espaços colapsados — `normalizar()` de `src/lib/texto.ts`).
   Não achou, **cria** o produto com `criado_automaticamente = true`, a categoria que
   a fábrica mandou e uma variação de tamanho nulo.
4. Grava a movimentação `entrada_fabrica` com o número do pedido e soma em
   `pecas_estoque`.

**Risco aceito:** criar sozinho gera duplicata sempre que a fábrica escrever o mesmo
nome de outro jeito ("Viseira (JET)" vs "VISEIRA JET"). A comparação normalizada corta
a maior parte, e o selo `criado_automaticamente` deixa achar e mesclar depois. Foi a
escolha explícita — a alternativa (fila de conferência) exigia trabalho manual a cada
pedido.

**Produto criado pelo robô nasce com valor R$ 0** e sairia de graça no balcão. A tela
de estoque abre com um aviso listando os produtos sem preço.

Os pedidos que já deram entrada aparecem na aba "Pedidos na fábrica" marcados como
**"já no estoque"** — senão a aba continuaria dizendo que a peça não chegou.

### As saídas

| Evento | Efeito no estoque | Movimentação |
|---|---|---|
| Venda de balcão fechada | baixa na loja da venda | `venda` |
| Peça lançada na OS | baixa na loja da OS | `os` |
| Item de peça removido da OS | devolve | `estorno_os` |
| OS cancelada ou excluída | devolve todas as peças | `estorno_os` |

As duas devoluções são o par obrigatório da baixa em OS: sem elas, editar uma OS comeria
estoque para sempre. `garantirOSNaoConciliada` já impede mexer em OS conciliada, então
não há como estornar o passado.

**Assumido:** OS cancelada devolve a peça, porque o serviço não foi feito. Se na
operação a peça às vezes já foi aplicada antes do cancelamento, isso infla o saldo — a
conferência manual (ajuste) é a válvula para esse caso.

Estoque **pode ficar negativo**: a venda avisa, mas não trava. Bloquear a venda porque
o cadastro está atrasado é pior do que vender e acertar depois — e hoje o saldo é zero
em tudo, então travar deixaria a loja sem vender nada no primeiro dia.

### Entrada e ajuste manual

Nova aba **Estoque** em `/pecas`, para gestor (`admin_geral`, `admin_socio`, `aux_adm`):

- Seletor de loja — admin escolhe qualquer uma do grupo; aux_adm fica na dele.
- Tabela produto / tamanho / saldo, com busca.
- **Dar entrada**: soma uma quantidade ("chegaram 10 capacetes M").
- **Ajustar**: define o saldo conferido, com motivo obrigatório; grava a diferença.
- **Histórico** por peça: o que entrou/saiu, quando, por quem e de onde (pedido da
  fábrica, venda #N, OS #N).

É por aqui que o estoque de capacetes nasce: cadastra o produto com os tamanhos, dá
entrada da quantidade em cada loja.

### Onde mais aparece

- **Nova Venda**: a busca mostra o saldo **da loja selecionada** (hoje mostra um número
  global que não quer dizer nada) e pede o tamanho quando o produto tem variações.
  Trocar a loja recalcula os saldos exibidos.
- **Catálogo**: passa a listar produtos, com as variações dentro.

## Fora de escopo

Transferência de peça entre lojas, custo/margem por peça, ponto de pedido e alerta de
estoque mínimo, inventário cíclico, mesclar produtos duplicados pela tela (por ora é
SQL), e reserva de peça para OS aberta.

## Riscos

| Risco | Mitigação |
|---|---|
| Duplicata vinda do nome livre da fábrica | nome normalizado + selo `criado_automaticamente` |
| Cron dobrar estoque | índice único `(pedido, peça, loja)` |
| Produto do robô vendido a R$ 0 | aviso de "sem preço" no topo da tela de estoque |
| Saldo negativo assustar | é permitido e visível; a venda avisa e não trava |
| 5.199 produtos incham a busca | a busca já filtra por grupo; o lookup só vê o do usuário |
