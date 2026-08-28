# Estoque de Peças por Loja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada loja o estoque real das suas peças e capacetes — com entrada automática do que é comprado na fábrica, entrada e ajuste manuais, baixa nas três saídas (venda de balcão, OS, e o estorno das duas), e histórico de toda movimentação.

**Architecture:** `pecas_catalogo` deixa de ser "o produto" e passa a ser **a variação** (tamanho) — assim todas as FKs que já apontam pra ela (`os_itens.peca_id`, `vendas_pecas_itens.peca_id`) continuam válidas sem backfill, e é nela que o estoque se pendura. Por cima entra `pecas_produtos` (nome, categoria, preço, grupo dono). Por baixo, `pecas_estoque` (saldo por variação × loja) e `pecas_movimentacoes` (histórico). Toda alteração de saldo passa por uma única função, `movimentarEstoque`, que escreve o histórico e o saldo na mesma transação — não existe caminho que mexa em `pecas_estoque` direto.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript, `node:test` para as funções puras. Sem framework de teste de UI — a verificação de tela é manual no navegador.

**Spec:** `docs/superpowers/specs/2026-08-28-estoque-pecas-design.md`

## Global Constraints

- **Migração:** SQL escrito à mão em `src/lib/db/migrations/NNNN_nome.sql`, aplicado com `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file NNNN_nome.sql`, mais mirror manual em `src/lib/db/schema.ts`. **Nunca** `npm run db:generate` / `db:migrate` — o journal do drizzle-kit está quebrado neste repo desde a fusão multi-grupo. A última migração aplicada é `0071`; as novas são `0072` e `0073`.
- **Gestor** = `admin_geral`, `admin_socio`, `aux_adm`. O `aux_adm` é quem opera a loja e **sempre** entra junto — nunca liberar só pros dois primeiros.
- **Escopo por grupo é obrigatório** em toda leitura e escrita nova. Use `listarLojaIdsDoGrupoAtivo(usuario)` / `getGrupoAtivo(usuario)` de `@/lib/grupo`. Admin (`admin_geral`/`admin_socio`) vê o grupo inteiro; os demais ficam presos à própria `usuario.lojaId`.
- **Drizzle, três armadilhas já pagas neste repo:** (1) não passe `Date` cru dentro de `` sql`` `` — use string ISO; (2) array dentro de `` sql`` `` precisa de `sql.param()`, senão o cast estoura; (3) em subconsulta correlacionada numa query **sem** join, `${tabela.id}` casa com a tabela interna — qualifique com `sql.raw('"tabela"."id"')`.
- **UI é `@base-ui/react`**, não Radix: nada de `asChild` nem `onPointerDownOutside`. Largura de dialog **sempre** com prefixo `sm:` (`sm:max-w-lg`) — `max-w-*` sem prefixo não sobrescreve o base. Quando o valor de um `<Select>` for diferente do rótulo exibido, use `<select>` nativo (o Select do base-ui mostra o value cru).
- **Teste novo em `src/lib/*.test.ts` precisa ser adicionado à mão** na lista do script `test` em `package.json` — ela é uma enumeração explícita, não um glob.
- **Verificação de toda task:** `npm run type-check`, `npm test`, `npm run build`. Os três têm que passar antes do commit.
- Estoque **pode ficar negativo**: a venda avisa, não trava.
- Mensagem de commit em português, no padrão do repo (`feat(escopo): ...`), terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Estrutura de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/db/migrations/0072_estoque_pecas.sql` | tabelas novas + colunas em `pecas_catalogo` |
| `src/lib/db/migrations/0073_backfill_produtos_pecas.sql` | 1.733 peças viram produtos; cópia por grupo |
| `src/lib/db/schema.ts` | mirror das tabelas novas |
| `src/lib/estoque-pecas.ts` | **núcleo**: `movimentarEstoque` + funções puras de cálculo |
| `src/lib/estoque-pecas.test.ts` | testes das funções puras |
| `src/app/(dashboard)/pecas/estoque-actions.ts` | listar saldo, entrada manual, ajuste, histórico |
| `src/app/(dashboard)/pecas/produtos-actions.ts` | CRUD de produto + variações |
| `src/lib/fabrica-entrada-estoque.ts` | entrada automática (usado pela action e pelo cron) |
| `src/app/api/cron/estoque-fabrica/route.ts` | cron diário |
| `src/app/(dashboard)/pecas/components/estoque-tab.tsx` | aba Estoque |
| `src/app/(dashboard)/pecas/components/estoque-dialogs.tsx` | dialogs de entrada, ajuste e histórico |
| `src/app/(dashboard)/pecas/components/produto-form.tsx` | cadastro de produto com tamanhos |

Modificados: `pecas/actions.ts` (baixa na venda), `ordens-servico/actions.ts` (baixa e estorno), `pecas/page.tsx`, `catalogo-table.tsx`, `venda-peca-dialog.tsx`, `peca-lookup.tsx`, `pedidos-fabrica-action.ts`, `vercel.json`, `package.json`.

---

### Task 1: Schema — produtos, estoque e movimentações

**Files:**
- Create: `src/lib/db/migrations/0072_estoque_pecas.sql`
- Modify: `src/lib/db/schema.ts`

**Interfaces:**
- Produces: tabelas `pecas_produtos`, `pecas_estoque`, `pecas_movimentacoes`; colunas `pecas_catalogo.produto_id` e `pecas_catalogo.tamanho`. Exports Drizzle `pecasProdutos`, `pecasEstoque`, `pecasMovimentacoes` — usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

Criar `src/lib/db/migrations/0072_estoque_pecas.sql`:

```sql
-- Estoque de peças por loja. Ver docs/superpowers/specs/2026-08-28-estoque-pecas-design.md
--
-- pecas_catalogo deixa de ser "o produto" e passa a ser A VARIAÇÃO (tamanho).
-- É o que permite não mexer em os_itens.peca_id nem em vendas_pecas_itens.peca_id:
-- eles já apontam pra linha que agora carrega o estoque.

CREATE TABLE IF NOT EXISTS pecas_produtos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id               uuid NOT NULL REFERENCES grupos(id),
  nome                   text NOT NULL,
  categoria              text,
  valor                  numeric(10,2) NOT NULL DEFAULT 0,
  ativo                  boolean NOT NULL DEFAULT true,
  criado_automaticamente boolean NOT NULL DEFAULT false,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

-- Trava a duplicata do robô da fábrica: o mesmo nome não entra duas vezes no grupo.
-- lower() e não normalizar() porque o índice tem que ser imutável; a comparação
-- sem acento acontece no TypeScript, antes de tentar inserir.
CREATE UNIQUE INDEX IF NOT EXISTS pecas_produtos_grupo_nome_uk
  ON pecas_produtos (grupo_id, lower(nome));

ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS produto_id uuid REFERENCES pecas_produtos(id);
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS tamanho text;

CREATE TABLE IF NOT EXISTS pecas_estoque (
  peca_id       uuid NOT NULL REFERENCES pecas_catalogo(id),
  loja_id       uuid NOT NULL REFERENCES lojas(id),
  quantidade    integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (peca_id, loja_id)
);

CREATE TABLE IF NOT EXISTS pecas_movimentacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id        uuid NOT NULL REFERENCES pecas_catalogo(id),
  loja_id        uuid NOT NULL REFERENCES lojas(id),
  tipo           text NOT NULL,
  quantidade     integer NOT NULL,
  saldo_depois   integer NOT NULL,
  venda_peca_id  uuid REFERENCES vendas_pecas(id),
  os_id          uuid REFERENCES ordens_servico(id),
  pedido_fabrica text,
  observacao     text,
  usuario_id     uuid REFERENCES usuarios(id),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

-- O índice que torna o cron seguro: rodar duas vezes o mesmo pedido não dobra
-- o estoque. Parcial porque só a entrada da fábrica tem número de pedido.
CREATE UNIQUE INDEX IF NOT EXISTS pecas_mov_pedido_fabrica_uk
  ON pecas_movimentacoes (pedido_fabrica, peca_id, loja_id)
  WHERE pedido_fabrica IS NOT NULL;

CREATE INDEX IF NOT EXISTS pecas_mov_peca_loja_idx
  ON pecas_movimentacoes (peca_id, loja_id, criado_em DESC);
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0072_estoque_pecas.sql
```

Esperado: `OK — sem linhas de retorno`.

- [ ] **Step 3: Conferir no banco**

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT table_name FROM information_schema.tables WHERE table_name IN ('pecas_produtos','pecas_estoque','pecas_movimentacoes') ORDER BY table_name"
```

Esperado: as três tabelas listadas.

- [ ] **Step 4: Mirror no schema.ts**

Em `src/lib/db/schema.ts`, **logo antes** de `export const pecasCatalogo` (linha ~431), inserir:

```ts
// ─── pecas_produtos (o produto; pecas_catalogo é a variação de tamanho) ──────
export const pecasProdutos = pgTable('pecas_produtos', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  nome: text('nome').notNull(),
  categoria: text('categoria'),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  // Selo do robô da fábrica: peça criada sozinha nasce sem preço e pode ser duplicata.
  criadoAutomaticamente: boolean('criado_automaticamente').notNull().default(false),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

Dentro de `pecasCatalogo`, após `nome`, adicionar:

```ts
  produtoId: uuid('produto_id').references(() => pecasProdutos.id),
  /** null = produto sem variação (toda peça da fábrica). "P"/"M"/"G"/"GG" nos capacetes. */
  tamanho: text('tamanho'),
```

**Logo depois** de `vendasPecasItens` (linha ~463), inserir:

```ts
// ─── pecas_estoque / pecas_movimentacoes ─────────────────────────────────────
// Saldo por (variação × loja). Toda alteração passa por movimentarEstoque()
// em src/lib/estoque-pecas.ts — nada escreve aqui direto.
export const pecasEstoque = pgTable('pecas_estoque', {
  pecaId: uuid('peca_id').notNull().references(() => pecasCatalogo.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  quantidade: integer('quantidade').notNull().default(0),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.pecaId, t.lojaId] })])

export const pecasMovimentacoes = pgTable('pecas_movimentacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pecaId: uuid('peca_id').notNull().references(() => pecasCatalogo.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  tipo: text('tipo').notNull(),
  /** Positivo entra, negativo sai. */
  quantidade: integer('quantidade').notNull(),
  saldoDepois: integer('saldo_depois').notNull(),
  vendaPecaId: uuid('venda_peca_id').references(() => vendasPecas.id),
  osId: uuid('os_id').references(() => ordensServico.id),
  /** Número do pedido no portal da fábrica — é a chave de idempotência do cron. */
  pedidoFabrica: text('pedido_fabrica'),
  observacao: text('observacao'),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

**Atenção de ordem:** `pecasMovimentacoes` referencia `ordensServico` e `vendasPecas`. Confirme que ambas já estão declaradas acima desse ponto no arquivo; se `ordensServico` vier depois, declare a coluna sem `.references()` (só `uuid('os_id')`) — a FK já existe no banco de qualquer forma.

Adicione `primaryKey` ao import de `drizzle-orm/pg-core` no topo do arquivo se ainda não estiver lá.

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check && npm run build
```

Esperado: os dois sem erro.

- [ ] **Step 6: Commit**

```bash
cd "D:/Claude/Teste" && git add src/lib/db/migrations/0072_estoque_pecas.sql src/lib/db/schema.ts && git commit -m "feat(estoque): schema de produtos, estoque por loja e movimentacoes

pecas_catalogo passa a ser a variacao (ganha produto_id e tamanho), o que
preserva os_itens.peca_id e vendas_pecas_itens.peca_id sem backfill.

Indice unico parcial (pedido_fabrica, peca, loja) e o que torna o cron da
fabrica seguro pra rodar duas vezes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backfill — as 1.733 peças viram produtos, com cópia por grupo

**Files:**
- Create: `src/lib/db/migrations/0073_backfill_produtos_pecas.sql`

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces: todo `pecas_catalogo` com `produto_id NOT NULL`; ~5.199 linhas em `pecas_produtos` (1.733 × 3 grupos); `pecas_catalogo.valor` e `quantidade_estoque` removidas.

- [ ] **Step 1: Conferir o ponto de partida**

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT (SELECT count(*) FROM pecas_catalogo) AS pecas, (SELECT count(*) FROM grupos WHERE ativo) AS grupos, (SELECT count(*) FROM pecas_catalogo WHERE produto_id IS NOT NULL) AS ja_migradas"
```

Esperado: `pecas` = 1733, `ja_migradas` = 0. Se `ja_migradas` > 0, a migration já rodou — **pare e investigue**, não rode de novo.

- [ ] **Step 2: Escrever a migration**

Criar `src/lib/db/migrations/0073_backfill_produtos_pecas.sql`:

```sql
-- Cada peça existente vira um produto (1 variação, tamanho nulo) do Sul de Minas,
-- que é quem realmente as usa hoje (as 12 peças lançadas em OS são todas de lá).
-- BH e Vale recebem CÓPIAS: BH compra da mesma fábrica (tem login) e o Vale passa
-- a poder vender e dar entrada manual mesmo antes de ter credencial.
--
-- Preserva as linhas originais de pecas_catalogo, porque os_itens.peca_id e
-- vendas_pecas_itens.peca_id apontam pra elas.

DO $$
DECLARE
  g_sul uuid;
  g record;
BEGIN
  IF EXISTS (SELECT 1 FROM pecas_catalogo WHERE produto_id IS NOT NULL) THEN
    RAISE NOTICE 'Backfill já aplicado — nada a fazer.';
    RETURN;
  END IF;

  SELECT id INTO g_sul FROM grupos WHERE nome = 'Sul de Minas';
  IF g_sul IS NULL THEN
    RAISE EXCEPTION 'Grupo "Sul de Minas" não encontrado — confira o nome antes de rodar';
  END IF;

  -- 1) Um produto por peça existente, no Sul de Minas. O preço sai da própria
  --    peça (já reajustado pela 0071). Nome duplicado no catálogo antigo é
  --    colapsado num produto só pelo ON CONFLICT do índice único.
  INSERT INTO pecas_produtos (grupo_id, nome, valor)
  SELECT g_sul, c.nome, max(c.valor)
  FROM pecas_catalogo c
  GROUP BY c.nome
  ON CONFLICT (grupo_id, lower(nome)) DO NOTHING;

  UPDATE pecas_catalogo c
  SET produto_id = p.id
  FROM pecas_produtos p
  WHERE p.grupo_id = g_sul AND lower(p.nome) = lower(c.nome);

  -- 2) Cópia do catálogo pros demais grupos ativos, cada um com sua variação
  --    própria (é ela que vai carregar o estoque daquele grupo).
  FOR g IN SELECT id FROM grupos WHERE ativo AND id <> g_sul LOOP
    INSERT INTO pecas_produtos (grupo_id, nome, categoria, valor)
    SELECT g.id, p.nome, p.categoria, p.valor
    FROM pecas_produtos p
    WHERE p.grupo_id = g_sul
    ON CONFLICT (grupo_id, lower(nome)) DO NOTHING;

    INSERT INTO pecas_catalogo (nome, produto_id, tamanho, ativo)
    SELECT p.nome, p.id, NULL, true
    FROM pecas_produtos p
    WHERE p.grupo_id = g.id;
  END LOOP;
END $$;

-- Agora que tudo tem dono, a coluna vira obrigatória.
ALTER TABLE pecas_catalogo ALTER COLUMN produto_id SET NOT NULL;

-- Uma variação por (produto, tamanho). COALESCE porque NULL não colide em índice único.
CREATE UNIQUE INDEX IF NOT EXISTS pecas_catalogo_produto_tamanho_uk
  ON pecas_catalogo (produto_id, COALESCE(tamanho, ''));

-- O preço mora no produto e o saldo em pecas_estoque; estas duas morrem.
-- Venda passada não perde o preço: vendas_pecas_itens.valor_unitario é snapshot.
ALTER TABLE pecas_catalogo DROP COLUMN IF EXISTS valor;
ALTER TABLE pecas_catalogo DROP COLUMN IF EXISTS quantidade_estoque;
```

- [ ] **Step 3: Aplicar**

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0073_backfill_produtos_pecas.sql
```

- [ ] **Step 4: Conferir o resultado**

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT g.nome AS grupo, count(DISTINCT p.id) AS produtos, count(c.id) AS variacoes FROM grupos g LEFT JOIN pecas_produtos p ON p.grupo_id = g.id LEFT JOIN pecas_catalogo c ON c.produto_id = p.id WHERE g.ativo GROUP BY g.nome ORDER BY g.nome"
```

Esperado: três grupos, cada um com ~1.733 produtos e ~1.733 variações.

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT count(*) AS os_itens_orfaos FROM os_itens oi WHERE oi.peca_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pecas_catalogo c WHERE c.id = oi.peca_id)"
```

Esperado: **0**. Se não for 0, as 12 peças em OS perderam a referência — pare e investigue antes de seguir.

- [ ] **Step 5: Remover do schema.ts as colunas que morreram**

Em `src/lib/db/schema.ts`, dentro de `pecasCatalogo`, apagar as linhas:

```ts
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  quantidadeEstoque: integer('quantidade_estoque').notNull().default(0),
```

- [ ] **Step 6: Rodar o type-check pra achar todos os pontos que liam essas colunas**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Esperado: **FALHA**, com erros em `pecas/actions.ts`, `pecas/page.tsx`, `catalogo-table.tsx`, `peca-lookup.tsx` e `venda-peca-dialog.tsx`. Essa lista é o mapa das Tasks 4 e 8 — **anote-a**. Não conserte agora; as tasks seguintes fazem isso. Se algum arquivo fora dessa lista aparecer, avise antes de continuar.

- [ ] **Step 7: Commit (schema e migration; o código quebrado é consertado nas próximas tasks)**

```bash
cd "D:/Claude/Teste" && git add src/lib/db/migrations/0073_backfill_produtos_pecas.sql src/lib/db/schema.ts && git commit -m "feat(estoque): backfill das 1.733 pecas em produtos, com copia por grupo

Sul de Minas fica com as linhas originais de pecas_catalogo (preservando as
12 pecas ja lancadas em OS); BH e Vale ganham copias proprias, porque o
estoque e por grupo.

pecas_catalogo.valor e quantidade_estoque morrem: preco vai pro produto e
saldo vai pra pecas_estoque. Venda passada nao perde preco -- valor_unitario
sempre foi snapshot.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Núcleo do estoque — `movimentarEstoque` e as funções puras

**Files:**
- Create: `src/lib/estoque-pecas.ts`
- Create: `src/lib/estoque-pecas.test.ts`
- Modify: `package.json` (registrar o teste novo)

**Interfaces:**
- Consumes: `pecasEstoque`, `pecasMovimentacoes` da Task 1.
- Produces:
  - `type TipoMovimentacao = 'entrada_fabrica' | 'entrada_manual' | 'ajuste' | 'venda' | 'os' | 'estorno_os'`
  - `movimentarEstoque(tx, params: MovimentacaoInput): Promise<{ saldoDepois: number; aplicada: boolean }>`
  - `deltaAjuste(saldoAtual: number, saldoConferido: number): number`
  - `chaveProduto(nome: string): string`
  - `agruparItensPedido(itens: {peca: string; quantidade: number | null}[]): {peca: string; quantidade: number}[]`

- [ ] **Step 1: Escrever os testes das funções puras**

Criar `src/lib/estoque-pecas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deltaAjuste, chaveProduto, agruparItensPedido } from './estoque-pecas'

test('deltaAjuste: conferiu mais do que o sistema tinha', () => {
  assert.equal(deltaAjuste(3, 7), 4)
})

test('deltaAjuste: conferiu menos', () => {
  assert.equal(deltaAjuste(9, 7), -2)
})

test('deltaAjuste: bateu certo, delta zero', () => {
  assert.equal(deltaAjuste(5, 5), 0)
})

test('deltaAjuste: parte de saldo negativo', () => {
  assert.equal(deltaAjuste(-2, 4), 6)
})

test('chaveProduto: caixa, acento e espaco duplo nao contam', () => {
  assert.equal(chaveProduto('  VISEIRA   (JET)  '), chaveProduto('viseira (jet)'))
  assert.equal(chaveProduto('Óleo de Motor'), chaveProduto('OLEO DE MOTOR'))
})

test('chaveProduto: nomes de verdade diferentes nao colidem', () => {
  assert.notEqual(chaveProduto('Viseira (JET)'), chaveProduto('Viseira (MIA)'))
})

// O portal lista o mesmo item em duas linhas quando o pedido tem lotes; somar
// antes de gravar evita bater no indice unico (pedido, peca, loja).
test('agruparItensPedido: soma linhas repetidas da mesma peca', () => {
  const itens = [
    { peca: 'Viseira (JET)', quantidade: 2 },
    { peca: 'Garfo (JOY)', quantidade: 1 },
    { peca: 'VISEIRA (JET)', quantidade: 3 },
  ]
  assert.deepEqual(agruparItensPedido(itens), [
    { peca: 'Viseira (JET)', quantidade: 5 },
    { peca: 'Garfo (JOY)', quantidade: 1 },
  ])
})

test('agruparItensPedido: quantidade nula conta como 1', () => {
  assert.deepEqual(
    agruparItensPedido([{ peca: 'Garfo (JOY)', quantidade: null }]),
    [{ peca: 'Garfo (JOY)', quantidade: 1 }],
  )
})

test('agruparItensPedido: item sem nome e descartado', () => {
  assert.deepEqual(agruparItensPedido([{ peca: '   ', quantidade: 2 }]), [])
})

test('agruparItensPedido: lista vazia devolve vazia', () => {
  assert.deepEqual(agruparItensPedido([]), [])
})
```

- [ ] **Step 2: Registrar o teste no package.json**

Em `package.json`, no script `test`, adicionar ` src/lib/estoque-pecas.test.ts` logo após `src/lib/busca-peca.test.ts`. A lista é uma enumeração explícita — sem isso o teste nunca roda.

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "D:/Claude/Teste" && npm test 2>&1 | tail -20
```

Esperado: FALHA — `Cannot find module './estoque-pecas'`.

- [ ] **Step 4: Escrever `src/lib/estoque-pecas.ts`**

```ts
import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pecasEstoque, pecasMovimentacoes } from '@/lib/db/schema'
import { normalizar } from './texto'

export type TipoMovimentacao =
  | 'entrada_fabrica'
  | 'entrada_manual'
  | 'ajuste'
  | 'venda'
  | 'os'
  | 'estorno_os'

/** Quanto somar pra sair do saldo do sistema e chegar no que foi conferido na prateleira. */
export function deltaAjuste(saldoAtual: number, saldoConferido: number): number {
  return saldoConferido - saldoAtual
}

/**
 * Chave de comparação de nome de produto.
 *
 * É o que segura a duplicata do robô da fábrica: o portal escreve "Viseira (JET)"
 * hoje e "VISEIRA JET" amanhã. O índice único do banco usa lower(nome) porque
 * precisa ser imutável; a comparação sem acento acontece aqui, antes de inserir.
 */
export function chaveProduto(nome: string): string {
  return normalizar(nome)
}

/**
 * Colapsa linhas repetidas da mesma peça num pedido da fábrica.
 *
 * O portal lista o mesmo item duas vezes quando o pedido veio em lotes. Sem somar
 * antes, o segundo insert bate no índice único (pedido, peça, loja) e a quantidade
 * se perderia calada. Preserva a primeira grafia e a ordem de aparição.
 */
export function agruparItensPedido(
  itens: { peca: string; quantidade: number | null }[],
): { peca: string; quantidade: number }[] {
  const porChave = new Map<string, { peca: string; quantidade: number }>()
  for (const item of itens) {
    const peca = (item.peca ?? '').trim()
    if (!peca) continue
    const chave = chaveProduto(peca)
    // Quantidade ausente no portal vale 1 — é uma peça, não zero peças.
    const qtd = item.quantidade == null ? 1 : item.quantidade
    const ja = porChave.get(chave)
    if (ja) ja.quantidade += qtd
    else porChave.set(chave, { peca, quantidade: qtd })
  }
  return [...porChave.values()]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type MovimentacaoInput = {
  pecaId: string
  lojaId: string
  tipo: TipoMovimentacao
  /** Positivo entra, negativo sai. */
  quantidade: number
  usuarioId?: string | null
  observacao?: string | null
  vendaPecaId?: string | null
  osId?: string | null
  /** Só na entrada da fábrica — é a chave de idempotência. */
  pedidoFabrica?: string | null
}

/**
 * ÚNICO caminho que altera saldo de estoque. Escreve o histórico e o saldo na
 * mesma transação, então nunca existe saldo sem movimentação que o explique.
 *
 * Idempotência da fábrica: a movimentação entra ANTES do saldo, com
 * onConflictDoNothing no índice (pedido, peça, loja). Se o insert não devolveu
 * linha, o pedido já tinha entrado e o saldo não é tocado — é isso que deixa o
 * cron rodar todo dia sem dobrar o estoque.
 *
 * Saldo pode ficar negativo de propósito: travar a venda porque o cadastro está
 * atrasado é pior do que vender e acertar depois (ver a spec).
 */
export async function movimentarEstoque(
  tx: Tx,
  params: MovimentacaoInput,
): Promise<{ saldoDepois: number; aplicada: boolean }> {
  if (params.quantidade === 0) {
    throw new Error('Movimentação de quantidade zero não faz sentido')
  }

  // Trava a linha do saldo: duas vendas simultâneas da mesma peça na mesma loja
  // não podem ler o mesmo saldo e gravar saldo_depois errado no histórico.
  const [atual] = await tx
    .select({ quantidade: pecasEstoque.quantidade })
    .from(pecasEstoque)
    .where(and(eq(pecasEstoque.pecaId, params.pecaId), eq(pecasEstoque.lojaId, params.lojaId)))
    .for('update')

  const saldoAntes = atual?.quantidade ?? 0
  const saldoDepois = saldoAntes + params.quantidade

  const gravadas = await tx
    .insert(pecasMovimentacoes)
    .values({
      pecaId: params.pecaId,
      lojaId: params.lojaId,
      tipo: params.tipo,
      quantidade: params.quantidade,
      saldoDepois,
      usuarioId: params.usuarioId ?? null,
      observacao: params.observacao ?? null,
      vendaPecaId: params.vendaPecaId ?? null,
      osId: params.osId ?? null,
      pedidoFabrica: params.pedidoFabrica ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: pecasMovimentacoes.id })

  // Conflito = esse item desse pedido da fábrica já entrou antes. Sai sem mexer no saldo.
  if (gravadas.length === 0) {
    return { saldoDepois: saldoAntes, aplicada: false }
  }

  await tx
    .insert(pecasEstoque)
    .values({ pecaId: params.pecaId, lojaId: params.lojaId, quantidade: saldoDepois })
    .onConflictDoUpdate({
      target: [pecasEstoque.pecaId, pecasEstoque.lojaId],
      set: { quantidade: saldoDepois, atualizadoEm: new Date() },
    })

  return { saldoDepois, aplicada: true }
}

/** Saldo de uma peça numa loja, sem travar. 0 quando nunca houve movimentação. */
export async function saldoDaPeca(pecaId: string, lojaId: string): Promise<number> {
  const [linha] = await db
    .select({ quantidade: pecasEstoque.quantidade })
    .from(pecasEstoque)
    .where(and(eq(pecasEstoque.pecaId, pecaId), eq(pecasEstoque.lojaId, lojaId)))
    .limit(1)
  return linha?.quantidade ?? 0
}

/** Mapa pecaId → saldo de uma loja inteira. Só traz o que tem saldo diferente de zero. */
export async function saldosDaLoja(lojaId: string): Promise<Map<string, number>> {
  const linhas = await db
    .select({ pecaId: pecasEstoque.pecaId, quantidade: pecasEstoque.quantidade })
    .from(pecasEstoque)
    .where(and(eq(pecasEstoque.lojaId, lojaId), sql`${pecasEstoque.quantidade} <> 0`))
  return new Map(linhas.map(l => [l.pecaId, l.quantidade]))
}
```

- [ ] **Step 5: Rodar os testes**

```bash
cd "D:/Claude/Teste" && npm test 2>&1 | tail -12
```

Esperado: PASS em todos, total subindo de 484 para 493.

- [ ] **Step 6: Commit**

```bash
cd "D:/Claude/Teste" && git add src/lib/estoque-pecas.ts src/lib/estoque-pecas.test.ts package.json && git commit -m "feat(estoque): nucleo movimentarEstoque + funcoes puras de calculo

movimentarEstoque e o unico caminho que altera saldo: grava historico e saldo
na mesma transacao, com a linha travada FOR UPDATE.

A movimentacao entra ANTES do saldo, com onConflictDoNothing -- e isso que
deixa o cron da fabrica rodar todo dia sem dobrar estoque.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Baixa na venda de balcão

**Files:**
- Modify: `src/app/(dashboard)/pecas/actions.ts`

**Interfaces:**
- Consumes: `movimentarEstoque` (Task 3), `pecasProdutos` (Task 1).
- Produces: `aplicarVendaPeca` passando a baixar `pecas_estoque` da loja da venda; `listarPecasAction` devolvendo produto+variação com preço do produto.

- [ ] **Step 1: Trocar a leitura de peça em `aplicarVendaPeca`**

Em `src/app/(dashboard)/pecas/actions.ts`, dentro de `aplicarVendaPeca`, substituir o bloco que lê `pecasCatalogo` (o `select` com `.for('update')` e o laço de validação logo abaixo) por:

```ts
  const pecaIds = input.itens.map(i => i.pecaId)
  // O preço agora mora no produto; a variação só carrega nome/tamanho e o estoque.
  const pecas = await tx
    .select({
      id: pecasCatalogo.id,
      nome: pecasProdutos.nome,
      tamanho: pecasCatalogo.tamanho,
      valor: pecasProdutos.valor,
    })
    .from(pecasCatalogo)
    .innerJoin(pecasProdutos, eq(pecasCatalogo.produtoId, pecasProdutos.id))
    .where(inArray(pecasCatalogo.id, pecaIds))
  const pecaById = new Map(pecas.map(p => [p.id, p]))

  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)
    if (!peca) throw new Error('Peça não encontrada')
    if (item.quantidade <= 0) throw new Error(`Quantidade inválida para ${peca.nome}`)
  }
```

Repare que **sumiu a trava de estoque insuficiente**: o saldo pode ficar negativo (decisão da spec). O aviso vive na tela, não aqui.

- [ ] **Step 2: Trocar a escrita de estoque pelo `movimentarEstoque`**

No laço que insere `vendasPecasItens`, substituir o `tx.update(pecasCatalogo)` do final por:

```ts
    await movimentarEstoque(tx, {
      pecaId: item.pecaId,
      lojaId: input.lojaId,
      tipo: 'venda',
      quantidade: -item.quantidade,
      usuarioId: vendedorId,
      vendaPecaId: venda.id,
    })
```

E, dentro do mesmo laço, trocar a descrição gravada no item para incluir o tamanho:

```ts
    const descricao = peca.tamanho ? `${peca.nome} (${peca.tamanho})` : peca.nome
```

usando `descricao` no lugar de `peca.nome` no `values({ ... descricao: peca.nome ... })`.

- [ ] **Step 3: Ajustar os imports do arquivo**

No topo de `src/app/(dashboard)/pecas/actions.ts`:

```ts
import { pecasCatalogo, pecasProdutos, vendasPecas, vendasPecasItens, lojas, usuarios, aprovacoesVenda } from '@/lib/db/schema'
import { movimentarEstoque } from '@/lib/estoque-pecas'
```

- [ ] **Step 4: Consertar `listarPecasAction`**

Substituir a função inteira por:

```ts
export async function listarPecasAction(params?: { apenasAtivos?: boolean }) {
  const usuario = await verificarAcessoVenda()
  const grupo = await getGrupoAtivo(usuario)

  const linhas = await db
    .select({
      id: pecasCatalogo.id,
      produtoId: pecasProdutos.id,
      nome: pecasProdutos.nome,
      tamanho: pecasCatalogo.tamanho,
      valor: pecasProdutos.valor,
      categoria: pecasProdutos.categoria,
      ativo: pecasProdutos.ativo,
      criadoAutomaticamente: pecasProdutos.criadoAutomaticamente,
    })
    .from(pecasCatalogo)
    .innerJoin(pecasProdutos, eq(pecasCatalogo.produtoId, pecasProdutos.id))
    .where(eq(pecasProdutos.grupoId, grupo.id))
    .orderBy(asc(pecasProdutos.nome), asc(pecasCatalogo.tamanho))

  return params?.apenasAtivos ? linhas.filter(p => p.ativo) : linhas
}
```

Adicionar `getGrupoAtivo` ao import de `@/lib/grupo` no topo.

- [ ] **Step 5: Apagar as actions de peça que não fazem mais sentido**

`criarPecaAction`, `atualizarPecaAction`, `inativarPecaAction` e `reativarPecaAction` mexiam em nome/valor/estoque da peça — tudo isso mudou de lugar. Apague as quatro e o tipo `PecaInput`; a Task 8 as substitui por `produtos-actions.ts`. O `verificarAcesso()` fica sem uso: apague também.

- [ ] **Step 6: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check 2>&1 | tail -25
```

Esperado: ainda FALHA, mas só nos arquivos de UI (`page.tsx`, `catalogo-table.tsx`, `peca-lookup.tsx`, `venda-peca-dialog.tsx`, `peca-form.tsx`) — a Task 8 conserta. **Nenhum erro deve restar em `actions.ts`.**

- [ ] **Step 7: Commit**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/pecas/actions.ts" && git commit -m "feat(estoque): venda de balcao baixa o estoque da loja da venda

Preco passa a vir do produto; a variacao carrega nome, tamanho e estoque.
A trava de estoque insuficiente sai de proposito: saldo pode ficar negativo,
o aviso vive na tela (ver spec).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Baixa e estorno na OS

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/actions.ts`

**Interfaces:**
- Consumes: `movimentarEstoque` (Task 3).
- Produces: `adicionarItemOSAction` baixando estoque; `removerItemOSAction`, `cancelarOSAction` e `excluirOSAction` devolvendo.

- [ ] **Step 1: Escrever o helper de estorno**

Em `src/app/(dashboard)/ordens-servico/actions.ts`, logo acima de `adicionarItemOSAction`, inserir:

```ts
/**
 * Devolve ao estoque as peças de uma OS.
 *
 * Par obrigatório da baixa em adicionarItemOSAction: sem isso, editar ou cancelar
 * uma OS comeria estoque para sempre. `garantirOSNaoConciliada` já impede mexer
 * em OS conciliada, então nunca se estorna o passado.
 */
async function devolverPecasDaOS(osId: string, usuarioId: string, motivo: string) {
  const [os] = await db
    .select({ lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) return

  const pecas = await db
    .select({ pecaId: osItens.pecaId, quantidade: osItens.quantidade })
    .from(osItens)
    .where(and(eq(osItens.osId, osId), isNotNull(osItens.pecaId)))

  if (pecas.length === 0) return

  await db.transaction(async tx => {
    for (const p of pecas) {
      const qtd = Math.round(parseFloat(p.quantidade))
      if (!p.pecaId || qtd <= 0) continue
      await movimentarEstoque(tx, {
        pecaId: p.pecaId,
        lojaId: os.lojaId,
        tipo: 'estorno_os',
        quantidade: qtd,
        usuarioId,
        osId,
        observacao: motivo,
      })
    }
  })
}
```

Adicionar aos imports do arquivo: `isNotNull` e `and` em `drizzle-orm`, `pecasCatalogo` não é necessário, e:

```ts
import { movimentarEstoque } from '@/lib/estoque-pecas'
```

- [ ] **Step 2: Baixar estoque ao adicionar item de peça**

Em `adicionarItemOSAction`, trocar o corpo por:

```ts
export async function adicionarItemOSAction(osId: string, item: {
  tipo: 'servico' | 'peca'
  descricao: string
  quantidade: number
  valorUnitario: number
  servicoId?: string | null
  pecaId?: string | null
}) {
  const { usuario } = await verificarAcessoOS(osId, EDITORES)
  await garantirOSNaoConciliada(osId)

  const [os] = await db
    .select({ lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

  await db.transaction(async tx => {
    await tx.insert(osItens).values({
      osId,
      tipo:          item.tipo,
      descricao:     item.descricao,
      quantidade:    String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      servicoId:     item.servicoId || null,
      pecaId:        item.pecaId || null,
    })

    // Peça avulsa digitada na mão (sem pecaId) não tem estoque a mexer.
    if (item.tipo === 'peca' && item.pecaId && item.quantidade > 0) {
      await movimentarEstoque(tx, {
        pecaId: item.pecaId,
        lojaId: os.lojaId,
        tipo: 'os',
        quantidade: -Math.round(item.quantidade),
        usuarioId: usuario.id,
        osId,
      })
    }
  })

  await recalcularTotal(osId)
  revalidatePath(`/ordens-servico/${osId}`)
  revalidatePath('/pecas')
}
```

**Atenção:** `verificarAcessoOS` devolve um objeto; confira se ele expõe `usuario` (o `cancelarOSAction` já usa `const { usuario } = await verificarAcessoOS(...)`, então sim).

- [ ] **Step 3: Devolver ao remover item**

Em `removerItemOSAction`, trocar a leitura e a exclusão do item por:

```ts
  const [item] = await db
    .select({ osId: osItens.osId, pecaId: osItens.pecaId, tipo: osItens.tipo, quantidade: osItens.quantidade })
    .from(osItens)
    .where(eq(osItens.id, itemId))
    .limit(1)
  if (!item || item.osId !== osId) throw new Error('Item não encontrado')

  const [os] = await db
    .select({ lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

  await db.transaction(async tx => {
    await tx.delete(osItens).where(eq(osItens.id, itemId))
    const qtd = Math.round(parseFloat(item.quantidade))
    if (item.tipo === 'peca' && item.pecaId && qtd > 0) {
      await movimentarEstoque(tx, {
        pecaId: item.pecaId,
        lojaId: os.lojaId,
        tipo: 'estorno_os',
        quantidade: qtd,
        usuarioId: usuario.id,
        osId,
        observacao: 'Item removido da OS',
      })
    }
  })
```

Para ter `usuario` aqui, trocar a primeira linha da função de `await verificarAcessoOS(osId, EDITORES)` para `const { usuario } = await verificarAcessoOS(osId, EDITORES)`.

Adicionar `revalidatePath('/pecas')` no fim da função.

- [ ] **Step 4: Devolver ao cancelar e ao excluir**

Em `cancelarOSAction`, logo após o `db.update` que grava o status `cancelada`:

```ts
  await devolverPecasDaOS(osId, usuario.id, `OS cancelada: ${motivoLimpo}`)
  revalidatePath('/pecas')
```

Em `excluirOSAction`, **antes** de apagar a OS (os itens somem em cascata; depois não há o que ler):

```ts
  await devolverPecasDaOS(osId, usuario.id, 'OS excluída')
```

e `revalidatePath('/pecas')` no fim. Confirme que `excluirOSAction` tem a variável `usuario` em escopo — ela chama `getUsuarioLogado()` no início, então sim.

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check 2>&1 | grep -i "ordens-servico" ; echo "--- vazio = OS ok ---"
```

Esperado: nenhuma linha de `ordens-servico`.

- [ ] **Step 6: Testar na mão no navegador**

```bash
cd "D:/Claude/Teste" && npm run dev
```

Abrir uma OS, adicionar uma peça do catálogo com quantidade 2, e conferir:

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT tipo, quantidade, saldo_depois, observacao FROM pecas_movimentacoes ORDER BY criado_em DESC LIMIT 5"
```

Esperado: uma linha `os` com `quantidade = -2`. Remover o item na tela e rodar de novo: uma linha `estorno_os` com `quantidade = 2` e `saldo_depois` de volta ao valor anterior.

- [ ] **Step 7: Commit**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/ordens-servico/actions.ts" && git commit -m "feat(estoque): OS baixa estoque, e devolve ao remover item ou cancelar

os_itens.peca_id existia desde sempre e nunca descontou nada -- 12 pecas ja
lancadas nunca sairam do saldo. As duas devolucoes sao o par obrigatorio da
baixa: sem elas, editar uma OS comeria estoque pra sempre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Entrada automática da fábrica

**Files:**
- Create: `src/lib/fabrica-entrada-estoque.ts`
- Create: `src/app/api/cron/estoque-fabrica/route.ts`
- Modify: `vercel.json`
- Modify: `src/lib/fabrica-scraper.ts`

**Interfaces:**
- Consumes: `movimentarEstoque`, `chaveProduto`, `agruparItensPedido` (Task 3); `paraCadaLojaNaFabrica` (`src/lib/fabrica-por-loja.ts`); `listarPedidosCompraFabrica`, `buscarDetalheCompraFabrica` (`src/lib/fabrica-scraper.ts`).
- Produces: `STATUS_ENTRADA_ESTOQUE`; `entrarEstoqueDaFabrica(usuario): Promise<ResultadoEntradaFabrica[]>`.

- [ ] **Step 1: Declarar os status que dão entrada**

Em `src/lib/fabrica-scraper.ts`, logo abaixo de `export const STATUS_SEPARADO = 'Separado'`, inserir:

```ts
/**
 * Status em que a peça já é da loja: "Retirado" (pega no galpão) e "Enviado"
 * (a caminho pelo malote). São os dois que disparam entrada no estoque.
 */
export const STATUS_ENTRADA_ESTOQUE = ['Retirado', 'Enviado'] as const
```

- [ ] **Step 2: Escrever a rotina de entrada**

Criar `src/lib/fabrica-entrada-estoque.ts`:

```ts
import { db } from '@/lib/db'
import { pecasProdutos, pecasCatalogo, lojas } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { paraCadaLojaNaFabrica } from '@/lib/fabrica-por-loja'
import {
  listarPedidosCompraFabrica,
  buscarDetalheCompraFabrica,
  STATUS_ENTRADA_ESTOQUE,
} from '@/lib/fabrica-scraper'
import { movimentarEstoque, chaveProduto, agruparItensPedido } from '@/lib/estoque-pecas'
import type { getUsuarioLogado } from '@/lib/auth'

type UsuarioLogado = Awaited<ReturnType<typeof getUsuarioLogado>>

export type EntradaFabrica = {
  numeroPedido: string
  peca: string
  quantidade: number
  /** false quando o pedido já tinha entrado antes — o cron rodou de novo. */
  aplicada: boolean
  /** true quando o produto não existia e foi criado na hora. */
  produtoCriado: boolean
}

/**
 * Dá entrada no estoque do que a fábrica marcou como Retirado ou Enviado.
 *
 * Idempotente por construção: cada item vira uma movimentação carimbada com o
 * número do pedido, e o índice único (pedido, peça, loja) descarta a repetição.
 * Rodar todo dia é seguro.
 *
 * Produto que não existe no grupo é CRIADO na hora, com o nome que a fábrica
 * mandou e valor R$ 0 — escolha explícita, ver a spec. A comparação é por nome
 * normalizado, o que corta a maior parte das duplicatas de grafia.
 */
export async function entrarEstoqueDaFabrica(usuario: UsuarioLogado) {
  return paraCadaLojaNaFabrica<EntradaFabrica>(usuario, async (session, loja) => {
    const [linhaLoja] = await db
      .select({ grupoId: lojas.grupoId })
      .from(lojas)
      .where(eq(lojas.id, loja.id))
      .limit(1)
    if (!linhaLoja) return []

    const grupoId = linhaLoja.grupoId

    // Catálogo do grupo indexado por nome normalizado — uma leitura só, e não
    // uma consulta por item (um pedido grande faria dezenas de idas ao banco).
    const catalogo = await db
      .select({ pecaId: pecasCatalogo.id, nome: pecasProdutos.nome })
      .from(pecasCatalogo)
      .innerJoin(pecasProdutos, eq(pecasCatalogo.produtoId, pecasProdutos.id))
      .where(and(eq(pecasProdutos.grupoId, grupoId), isNull(pecasCatalogo.tamanho)))
    const porChave = new Map(catalogo.map(c => [chaveProduto(c.nome), c.pecaId]))

    const resultado: EntradaFabrica[] = []

    for (const status of STATUS_ENTRADA_ESTOQUE) {
      const pedidos = await listarPedidosCompraFabrica(session, status)
      for (const pedido of pedidos) {
        const detalhe = await buscarDetalheCompraFabrica(session, pedido.numeroPedido)
        const itens = agruparItensPedido(detalhe.itens)

        for (const item of itens) {
          const chave = chaveProduto(item.peca)
          let pecaId = porChave.get(chave)
          let produtoCriado = false

          if (!pecaId) {
            const categoria = detalhe.itens.find(i => chaveProduto(i.peca) === chave)?.categoria ?? null
            const [produto] = await db
              .insert(pecasProdutos)
              .values({
                grupoId,
                nome: item.peca,
                categoria,
                valor: '0',
                criadoAutomaticamente: true,
              })
              .onConflictDoNothing()
              .returning({ id: pecasProdutos.id })

            // Conflito significa que outra loja do mesmo grupo acabou de criar
            // o mesmo produto nesta rodada — reaproveita o que já está lá.
            const produtoId = produto?.id ?? (await db
              .select({ id: pecasProdutos.id })
              .from(pecasProdutos)
              .where(and(eq(pecasProdutos.grupoId, grupoId), eq(pecasProdutos.nome, item.peca)))
              .limit(1))[0]?.id

            if (!produtoId) continue

            const [variacao] = await db
              .insert(pecasCatalogo)
              .values({ nome: item.peca, produtoId, tamanho: null, ativo: true })
              .returning({ id: pecasCatalogo.id })

            pecaId = variacao.id
            porChave.set(chave, pecaId)
            produtoCriado = true
          }

          const { aplicada } = await db.transaction(tx => movimentarEstoque(tx, {
            pecaId: pecaId!,
            lojaId: loja.id,
            tipo: 'entrada_fabrica',
            quantidade: item.quantidade,
            pedidoFabrica: pedido.numeroPedido,
            observacao: `Pedido ${pedido.numeroPedido} — ${status}`,
          }))

          resultado.push({
            numeroPedido: pedido.numeroPedido,
            peca: item.peca,
            quantidade: item.quantidade,
            aplicada,
            produtoCriado,
          })
        }
      }
    }

    return resultado
  })
}
```

- [ ] **Step 3: Criar a rota do cron**

Criar `src/app/api/cron/estoque-fabrica/route.ts`, copiando a autorização da rota que já existe:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { entrarEstoqueDaFabrica } from '@/lib/fabrica-entrada-estoque'

// Login + scraping por loja, mais o detalhe de cada pedido: leva bem mais que o
// default do Next. Mesmo teto da rota de pedidos-fabrica.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // O cron não tem sessão. paraCadaLojaNaFabrica escopa pelo grupo do usuário,
  // então roda uma vez por admin_geral — é o que cobre os três grupos.
  const admins = await db
    .select({ id: usuarios.id, papel: usuarios.papel, lojaId: usuarios.lojaId, nome: usuarios.nome, email: usuarios.email })
    .from(usuarios)
    .where(eq(usuarios.papel, 'admin_geral'))

  const resultados = []
  for (const admin of admins) {
    resultados.push({
      admin: admin.nome,
      lojas: await entrarEstoqueDaFabrica(admin as Parameters<typeof entrarEstoqueDaFabrica>[0]),
    })
  }

  return NextResponse.json({ ok: true, resultados })
}

export const POST = GET
```

**Atenção:** `getGrupoAtivo` decide o grupo a partir do usuário. Se cada grupo tiver seu próprio `admin_geral`, esse laço cobre os três. Rode o `SELECT` abaixo antes de confiar nisso:

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT u.nome, u.papel, g.nome AS grupo FROM usuarios u LEFT JOIN lojas l ON l.id = u.loja_id LEFT JOIN grupos g ON g.id = l.grupo_id WHERE u.papel = 'admin_geral'"
```

Se houver **um só** `admin_geral` cobrindo os três grupos, o laço vai rodar só o grupo dele — nesse caso troque a estratégia para iterar `grupos` diretamente e montar um usuário sintético por grupo. **Pare e confirme com o Cesar antes de escolher.**

- [ ] **Step 4: Registrar o cron**

Em `vercel.json`, adicionar ao array `crons`:

```json
    {
      "path": "/api/cron/estoque-fabrica",
      "schedule": "30 12 * * *"
    }
```

30 minutos depois do alerta de pedidos, para não disputar sessão no portal da fábrica com ele.

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check && npm run build
```

- [ ] **Step 6: Commit**

```bash
cd "D:/Claude/Teste" && git add src/lib/fabrica-entrada-estoque.ts src/app/api/cron/estoque-fabrica/route.ts vercel.json src/lib/fabrica-scraper.ts && git commit -m "feat(estoque): entrada automatica do que a fabrica marca Retirado ou Enviado

Idempotente por construcao: cada item vira movimentacao carimbada com o numero
do pedido, e o indice unico descarta a repeticao. Cron diario as 12h30, meia
hora depois do alerta de pedidos pra nao disputar sessao no portal.

Produto que nao existe e criado na hora com valor R\$ 0 -- escolha explicita
da spec; a tela de estoque avisa quais estao sem preco.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Actions do estoque — saldo, entrada manual, ajuste, histórico

**Files:**
- Create: `src/app/(dashboard)/pecas/estoque-actions.ts`

**Interfaces:**
- Consumes: `movimentarEstoque`, `deltaAjuste` (Task 3); `entrarEstoqueDaFabrica` (Task 6).
- Produces: `listarEstoqueAction`, `darEntradaAction`, `ajustarEstoqueAction`, `historicoPecaAction`, `sincronizarEstoqueFabricaAction`, tipo `LinhaEstoque`.

- [ ] **Step 1: Escrever o arquivo**

Criar `src/app/(dashboard)/pecas/estoque-actions.ts`:

```ts
'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasCatalogo, pecasProdutos, pecasEstoque, pecasMovimentacoes, usuarios, vendasPecas, ordensServico } from '@/lib/db/schema'
import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { movimentarEstoque, deltaAjuste } from '@/lib/estoque-pecas'
import { entrarEstoqueDaFabrica } from '@/lib/fabrica-entrada-estoque'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

async function gestor() {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) throw new Error('Sem permissão')
  return usuario
}

/** Garante que a loja pedida é do grupo ativo e que o usuário pode vê-la. */
async function lojaPermitida(usuario: { papel: string; lojaId: string | null }, lojaId: string) {
  const doGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!doGrupo.includes(lojaId)) throw new Error('Loja fora do grupo ativo')
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && lojaId !== usuario.lojaId) throw new Error('Sem permissão nesta loja')
}

export type LinhaEstoque = {
  pecaId: string
  produtoId: string
  nome: string
  tamanho: string | null
  categoria: string | null
  valor: string
  criadoAutomaticamente: boolean
  quantidade: number
}

/** Catálogo do grupo com o saldo daquela loja (zero quando nunca houve movimentação). */
export async function listarEstoqueAction(lojaId: string): Promise<LinhaEstoque[]> {
  const usuario = await gestor()
  await lojaPermitida(usuario, lojaId)
  const grupo = await getGrupoAtivo(usuario)

  return db
    .select({
      pecaId: pecasCatalogo.id,
      produtoId: pecasProdutos.id,
      nome: pecasProdutos.nome,
      tamanho: pecasCatalogo.tamanho,
      categoria: pecasProdutos.categoria,
      valor: pecasProdutos.valor,
      criadoAutomaticamente: pecasProdutos.criadoAutomaticamente,
      quantidade: sql<number>`COALESCE(${pecasEstoque.quantidade}, 0)`,
    })
    .from(pecasCatalogo)
    .innerJoin(pecasProdutos, eq(pecasCatalogo.produtoId, pecasProdutos.id))
    .leftJoin(
      pecasEstoque,
      and(eq(pecasEstoque.pecaId, pecasCatalogo.id), eq(pecasEstoque.lojaId, lojaId)),
    )
    .where(and(eq(pecasProdutos.grupoId, grupo.id), eq(pecasProdutos.ativo, true)))
    .orderBy(asc(pecasProdutos.nome), asc(pecasCatalogo.tamanho))
}

export async function darEntradaAction(input: {
  pecaId: string
  lojaId: string
  quantidade: number
  observacao?: string
}) {
  const usuario = await gestor()
  await lojaPermitida(usuario, input.lojaId)
  if (!Number.isInteger(input.quantidade) || input.quantidade <= 0) {
    throw new Error('Quantidade de entrada tem que ser um inteiro positivo')
  }

  await db.transaction(tx => movimentarEstoque(tx, {
    pecaId: input.pecaId,
    lojaId: input.lojaId,
    tipo: 'entrada_manual',
    quantidade: input.quantidade,
    usuarioId: usuario.id,
    observacao: input.observacao?.trim() || null,
  }))

  revalidatePath('/pecas')
}

/**
 * Ajuste de inventário: recebe o saldo CONFERIDO na prateleira, não a diferença.
 * É menos sujeito a erro do que pedir "+3" ou "-2" a quem acabou de contar.
 */
export async function ajustarEstoqueAction(input: {
  pecaId: string
  lojaId: string
  saldoConferido: number
  motivo: string
}) {
  const usuario = await gestor()
  await lojaPermitida(usuario, input.lojaId)
  if (!Number.isInteger(input.saldoConferido)) throw new Error('Saldo conferido inválido')
  const motivo = input.motivo.trim()
  if (motivo.length < 3) throw new Error('Informe o motivo do ajuste')

  const [atual] = await db
    .select({ quantidade: pecasEstoque.quantidade })
    .from(pecasEstoque)
    .where(and(eq(pecasEstoque.pecaId, input.pecaId), eq(pecasEstoque.lojaId, input.lojaId)))
    .limit(1)

  const delta = deltaAjuste(atual?.quantidade ?? 0, input.saldoConferido)
  if (delta === 0) return { semMudanca: true as const }

  await db.transaction(tx => movimentarEstoque(tx, {
    pecaId: input.pecaId,
    lojaId: input.lojaId,
    tipo: 'ajuste',
    quantidade: delta,
    usuarioId: usuario.id,
    observacao: motivo,
  }))

  revalidatePath('/pecas')
  return { semMudanca: false as const }
}

export type LinhaHistorico = {
  id: string
  tipo: string
  quantidade: number
  saldoDepois: number
  observacao: string | null
  pedidoFabrica: string | null
  vendaNumero: number | null
  osNumero: number | null
  usuarioNome: string | null
  criadoEm: Date
}

export async function historicoPecaAction(pecaId: string, lojaId: string): Promise<LinhaHistorico[]> {
  const usuario = await gestor()
  await lojaPermitida(usuario, lojaId)

  return db
    .select({
      id: pecasMovimentacoes.id,
      tipo: pecasMovimentacoes.tipo,
      quantidade: pecasMovimentacoes.quantidade,
      saldoDepois: pecasMovimentacoes.saldoDepois,
      observacao: pecasMovimentacoes.observacao,
      pedidoFabrica: pecasMovimentacoes.pedidoFabrica,
      vendaNumero: vendasPecas.numero,
      osNumero: ordensServico.numero,
      usuarioNome: usuarios.nome,
      criadoEm: pecasMovimentacoes.criadoEm,
    })
    .from(pecasMovimentacoes)
    .leftJoin(vendasPecas, eq(pecasMovimentacoes.vendaPecaId, vendasPecas.id))
    .leftJoin(ordensServico, eq(pecasMovimentacoes.osId, ordensServico.id))
    .leftJoin(usuarios, eq(pecasMovimentacoes.usuarioId, usuarios.id))
    .where(and(eq(pecasMovimentacoes.pecaId, pecaId), eq(pecasMovimentacoes.lojaId, lojaId)))
    .orderBy(desc(pecasMovimentacoes.criadoEm))
    .limit(100)
}

/** Botão "Sincronizar agora" — o mesmo que o cron faz, sob demanda. */
export async function sincronizarEstoqueFabricaAction() {
  const usuario = await gestor()
  const resultado = await entrarEstoqueDaFabrica(usuario)
  revalidatePath('/pecas')

  const aplicadas = resultado.flatMap(l => l.dados).filter(d => d.aplicada)
  const criados = aplicadas.filter(d => d.produtoCriado).length
  return {
    lojas: resultado.map(l => ({ loja: l.loja, status: l.status, erro: l.erro, itens: l.dados.length })),
    entradas: aplicadas.length,
    produtosCriados: criados,
  }
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check 2>&1 | grep -i "estoque-actions"; echo "--- vazio = ok ---"
```

- [ ] **Step 3: Commit**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/pecas/estoque-actions.ts" && git commit -m "feat(estoque): actions de saldo, entrada manual, ajuste e historico

O ajuste recebe o saldo CONFERIDO na prateleira, nao a diferenca -- quem
acabou de contar erra menos assim.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: UI — produtos, aba Estoque, e a venda com tamanho e saldo da loja

**Files:**
- Create: `src/app/(dashboard)/pecas/produtos-actions.ts`
- Create: `src/app/(dashboard)/pecas/components/produto-form.tsx`
- Create: `src/app/(dashboard)/pecas/components/estoque-tab.tsx`
- Create: `src/app/(dashboard)/pecas/components/estoque-dialogs.tsx`
- Modify: `src/app/(dashboard)/pecas/page.tsx`, `components/catalogo-table.tsx`, `components/peca-lookup.tsx`, `components/venda-peca-dialog.tsx`
- Delete: `src/app/(dashboard)/pecas/components/peca-form.tsx`

**Interfaces:**
- Consumes: `listarEstoqueAction`, `darEntradaAction`, `ajustarEstoqueAction`, `historicoPecaAction`, `sincronizarEstoqueFabricaAction` (Task 7); `listarPecasAction` (Task 4); `saldosDaLoja` (Task 3).
- Produces: `criarProdutoAction`, `atualizarProdutoAction`, `alternarAtivoProdutoAction`.

> **Nota de tamanho:** esta task é a maior do plano. Se estiver executando com subagentes, vale quebrá-la em três commits — produtos-actions + produto-form; estoque-tab + dialogs; e por último a venda/lookup. As verificações abaixo estão agrupadas por esses três blocos.

- [ ] **Step 1: `produtos-actions.ts` — o CRUD que substitui as actions de peça apagadas na Task 4**

```ts
'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasProdutos, pecasCatalogo } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getGrupoAtivo } from '@/lib/grupo'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']
const PAPEIS_VENDA = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export type ProdutoInput = {
  nome: string
  categoria?: string | null
  valor: number
  /** Vazio = produto sem variação (uma peça só). ["P","M","G"] cria três. */
  tamanhos: string[]
}

/** Vendedor cria (a peça nova tem que sair no balcão na hora); só gestor edita. */
export async function criarProdutoAction(input: ProdutoInput) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_VENDA.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const tamanhos = [...new Set(input.tamanhos.map(t => t.trim()).filter(Boolean))]

  const [produto] = await db.insert(pecasProdutos).values({
    grupoId: grupo.id,
    nome,
    categoria: input.categoria?.trim() || null,
    valor: input.valor.toFixed(2),
  }).returning({ id: pecasProdutos.id })

  // Sem tamanho declarado, o produto ainda precisa de uma variação: é ela que
  // carrega o estoque e é nela que as vendas e OS apontam.
  const variacoes = tamanhos.length > 0 ? tamanhos : [null]
  const criadas = await db.insert(pecasCatalogo).values(
    variacoes.map(t => ({ nome, produtoId: produto.id, tamanho: t, ativo: true })),
  ).returning({ id: pecasCatalogo.id, tamanho: pecasCatalogo.tamanho })

  revalidatePath('/pecas')
  return { id: produto.id, nome, valor: input.valor.toFixed(2), variacoes: criadas }
}

export async function atualizarProdutoAction(id: string, input: ProdutoInput) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const [produto] = await db.select({ grupoId: pecasProdutos.grupoId })
    .from(pecasProdutos).where(eq(pecasProdutos.id, id)).limit(1)
  if (!produto || produto.grupoId !== grupo.id) throw new Error('Produto fora do grupo ativo')

  await db.update(pecasProdutos).set({
    nome,
    categoria: input.categoria?.trim() || null,
    valor: input.valor.toFixed(2),
    // Editar limpa o selo: alguém olhou e assumiu o cadastro.
    criadoAutomaticamente: false,
    atualizadoEm: new Date(),
  }).where(eq(pecasProdutos.id, id))

  // Tamanho novo vira variação nova. Tamanho que sumiu da lista NÃO é apagado:
  // pode ter estoque e histórico pendurados. Some do catálogo desativando.
  const existentes = await db.select({ tamanho: pecasCatalogo.tamanho })
    .from(pecasCatalogo).where(eq(pecasCatalogo.produtoId, id))
  const jaTem = new Set(existentes.map(e => e.tamanho ?? ''))
  const novos = [...new Set(input.tamanhos.map(t => t.trim()).filter(Boolean))]
    .filter(t => !jaTem.has(t))

  if (novos.length > 0) {
    await db.insert(pecasCatalogo).values(
      novos.map(t => ({ nome, produtoId: id, tamanho: t, ativo: true })),
    )
  }

  await db.update(pecasCatalogo).set({ nome }).where(eq(pecasCatalogo.produtoId, id))

  revalidatePath('/pecas')
}

export async function alternarAtivoProdutoAction(id: string, ativo: boolean) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const [produto] = await db.select({ grupoId: pecasProdutos.grupoId })
    .from(pecasProdutos).where(eq(pecasProdutos.id, id)).limit(1)
  if (!produto || produto.grupoId !== grupo.id) throw new Error('Produto fora do grupo ativo')

  await db.update(pecasProdutos)
    .set({ ativo, atualizadoEm: new Date() })
    .where(eq(pecasProdutos.id, id))
  revalidatePath('/pecas')
}
```

- [ ] **Step 2: `produto-form.tsx` — substitui `peca-form.tsx`**

Criar `src/app/(dashboard)/pecas/components/produto-form.tsx` com a mesma estrutura de dialog do `peca-form.tsx` atual (props `trigger`, `triggerClassName`, `nomeInicial`, `onCriado`), trocando os campos por: **Nome**, **Categoria** (texto livre), **Valor** (`CurrencyInput`) e **Tamanhos** — um campo de texto onde os tamanhos vão separados por vírgula, com o texto de ajuda *"Deixe vazio se a peça não tem tamanho. Ex: P, M, G, GG"*.

O dialog usa `sm:max-w-md` (constraint global). Ao salvar, chama `criarProdutoAction` ou `atualizarProdutoAction` e repassa o retorno pro `onCriado`.

Depois apague `src/app/(dashboard)/pecas/components/peca-form.tsx` e troque as importações em `catalogo-table.tsx` e `peca-lookup.tsx`.

- [ ] **Step 3: Verificar o primeiro bloco**

```bash
cd "D:/Claude/Teste" && npm run type-check 2>&1 | grep -iE "produto|peca-form"; echo "--- vazio = bloco 1 ok ---"
```

- [ ] **Step 4: Commit do bloco 1**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/pecas/produtos-actions.ts" "src/app/(dashboard)/pecas/components/produto-form.tsx" && git commit -m "feat(estoque): cadastro de produto com tamanhos

Produto sem tamanho declarado ainda ganha uma variacao: e ela que carrega o
estoque e e nela que venda e OS apontam. Tamanho removido da lista nao e
apagado -- pode ter estoque e historico pendurados.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: `estoque-tab.tsx` — a aba**

Criar `src/app/(dashboard)/pecas/components/estoque-tab.tsx`, componente cliente que recebe `lojas: {id,nome}[]` e `lojaUsuarioId: string | null`, e:

1. Um `<select>` **nativo** de loja (constraint global: value ≠ label exibido). Admin escolhe qualquer uma; os demais já vêm presos na sua.
2. Ao escolher a loja, chama `listarEstoqueAction(lojaId)` e guarda o resultado.
3. Campo de busca reusando `filtrarPecas` de `@/lib/busca-peca` (o mesmo do catálogo), com corte em 100 linhas.
4. Um checkbox **"só as com saldo"**.
5. Se houver linhas com `criadoAutomaticamente && parseFloat(valor) === 0`, um aviso âmbar no topo: *"N peça(s) criada(s) pela sincronização da fábrica estão sem preço e sairiam de graça no balcão."* com um botão que filtra só elas.
6. Botão **"Sincronizar com a fábrica"** chamando `sincronizarEstoqueFabricaAction()`, com spinner e toast do resultado (`entradas` e `produtosCriados`).
7. Cada linha: nome, tamanho, categoria, saldo (vermelho quando ≤ 0), e três botões — **Entrada**, **Ajustar**, **Histórico** — que abrem os dialogs da Step 6.

- [ ] **Step 6: `estoque-dialogs.tsx` — os três dialogs**

Criar `src/app/(dashboard)/pecas/components/estoque-dialogs.tsx` exportando:

- `EntradaDialog` — campo de quantidade (inteiro > 0) e observação opcional; chama `darEntradaAction`.
- `AjusteDialog` — mostra o saldo atual, pede o **saldo conferido** e um motivo obrigatório (mín. 3 caracteres); mostra a diferença calculada em tempo real ("sistema tem 9, você contou 7 → sai 2"); chama `ajustarEstoqueAction`.
- `HistoricoDialog` — carrega `historicoPecaAction` ao abrir e lista as movimentações: data, tipo em português, quantidade com sinal, saldo depois, origem (pedido da fábrica / venda #N / OS #N) e quem fez.

Rótulos de tipo:

```ts
const TIPO_LABEL: Record<string, string> = {
  entrada_fabrica: 'Entrada (fábrica)',
  entrada_manual:  'Entrada manual',
  ajuste:          'Ajuste de inventário',
  venda:           'Venda de balcão',
  os:              'Usada em OS',
  estorno_os:      'Devolvida da OS',
}
```

Todos os dialogs com `sm:max-w-md` e `onSalvo` para a aba recarregar a lista.

- [ ] **Step 7: Ligar a aba na página**

Em `src/app/(dashboard)/pecas/page.tsx`, adicionar o gatilho e o conteúdo entre "Catálogo" e "Pedidos na fábrica":

```tsx
          {isGestor && <TabsTrigger value="estoque">Estoque</TabsTrigger>}
```

```tsx
        {isGestor && (
          <TabsContent value="estoque" className="mt-4">
            <EstoqueTab lojas={lojasOpts} lojaUsuarioId={usuario.lojaId} />
          </TabsContent>
        )}
```

E trocar a carga do catálogo, que ainda lê `pecasCatalogo` direto:

```tsx
  const [pecas, lojasOpts, vendas] = await Promise.all([
    listarPecasAction(),
    listarLojasDoGrupoAtivo(usuario),
    listarVendasPecasAction(),
  ])
```

removendo os imports de `db`, `pecasCatalogo` e `asc`.

- [ ] **Step 8: Consertar `catalogo-table.tsx`**

O tipo `Peca` perde `quantidadeEstoque` e ganha `tamanho`, `categoria` e `produtoId`. A coluna "Estoque" **sai** — saldo agora é por loja e mora na aba Estoque. A coluna "Nome" passa a mostrar `nome` com o tamanho como sufixo discreto quando existir. O filtro "só as com estoque" **sai junto** (não há mais saldo global a filtrar); no lugar entra **"só as criadas pela fábrica"**, que é o filtro útil agora — serve pra achar o que precisa de preço. O `PecaForm` vira `ProdutoForm` e o toggle usa `alternarAtivoProdutoAction`.

- [ ] **Step 9: Consertar `peca-lookup.tsx` e `venda-peca-dialog.tsx`**

Em `peca-lookup.tsx`: `PecaOpcao` passa a ser `{ id, produtoId, nome, tamanho, valor, estoque }`. O rótulo da lista mostra `nome` + tamanho entre colchetes quando houver, e o `estoque` vem por prop (não mais do próprio objeto do catálogo).

Em `venda-peca-dialog.tsx`: adicionar um estado `saldos: Map<string, number>` carregado por uma action nova que embrulha `saldosDaLoja(lojaId)` — chamada num `useEffect` sempre que `lojaId` muda. Passar `estoque={saldos.get(p.id) ?? 0}` pro lookup. A mensagem de estoque insuficiente vira **aviso âmbar**, não bloqueio: *"estoque insuficiente nesta loja (disponível: N) — a venda vai passar assim mesmo"*.

Criar a action em `estoque-actions.ts`:

```ts
export async function saldosDaLojaAction(lojaId: string): Promise<Record<string, number>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  const doGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!doGrupo.includes(lojaId)) throw new Error('Loja fora do grupo ativo')
  return Object.fromEntries(await saldosDaLoja(lojaId))
}
```

importando `saldosDaLoja` de `@/lib/estoque-pecas`.

- [ ] **Step 10: Verificar tudo**

```bash
cd "D:/Claude/Teste" && npm run type-check && npm test && npm run build
```

Esperado: os três limpos, 493 testes passando.

- [ ] **Step 11: Testar no navegador**

```bash
cd "D:/Claude/Teste" && npm run dev
```

Roteiro: em `/pecas` → Estoque, escolher uma loja, cadastrar um produto "Capacete Teste" com tamanhos `P, M, G`, dar entrada de 5 no M, conferir o saldo, ajustar para 3 com motivo, abrir o histórico e ver as duas linhas. Depois em Vendas → Nova Venda, buscar "capacete teste", ver o tamanho e o saldo da loja, fechar a venda e conferir que o saldo caiu.

- [ ] **Step 12: Commit**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/pecas" && git commit -m "feat(estoque): aba Estoque, catalogo por produto e venda com saldo da loja

A coluna Estoque sai do catalogo: saldo agora e por loja e mora na aba nova.
No lugar do filtro 'so com estoque' entra 'so as criadas pela fabrica', que e
o que serve pra achar o que esta sem preco.

Estoque insuficiente na venda vira aviso ambar, nao bloqueio (ver spec).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Marcar "já no estoque" na aba Pedidos na fábrica

**Files:**
- Modify: `src/app/(dashboard)/pecas/pedidos-fabrica-action.ts`
- Modify: `src/app/(dashboard)/pecas/components/pedidos-fabrica-tab.tsx`

**Interfaces:**
- Consumes: `pecasMovimentacoes` (Task 1).
- Produces: campo `jaNoEstoque: boolean` em `ItemCompraFabrica`.

- [ ] **Step 1: Marcar os pedidos que já entraram**

Em `src/app/(dashboard)/pecas/pedidos-fabrica-action.ts`, adicionar `jaNoEstoque: boolean` ao tipo `ItemCompraFabrica` e, dentro do callback de `paraCadaLojaNaFabrica`, antes de montar `itens`, ler quais pedidos daquela loja já geraram entrada:

```ts
    const numeros = [...porNumero.keys()]
    const jaEntraram = numeros.length === 0 ? new Set<string>() : new Set(
      (await db
        .selectDistinct({ pedido: pecasMovimentacoes.pedidoFabrica })
        .from(pecasMovimentacoes)
        .where(and(
          eq(pecasMovimentacoes.lojaId, loja.id),
          // sql.param() é obrigatório: array cru dentro de sql`` quebra o cast.
          sql`${pecasMovimentacoes.pedidoFabrica} = ANY(${sql.param(numeros)}::text[])`,
        )))
        .map(r => r.pedido!)
        .filter(Boolean),
    )
```

e passar `jaNoEstoque: jaEntraram.has(numeroPedido)` em cada item montado.

Adicionar aos imports: `db` de `@/lib/db`, `pecasMovimentacoes` de `@/lib/db/schema`, e `and, eq, sql` de `drizzle-orm`.

- [ ] **Step 2: Mostrar na tabela**

Em `pedidos-fabrica-tab.tsx`, na célula de status, quando `item.jaNoEstoque`:

```tsx
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                            {item.status ?? '—'}
                          </span>
                          {item.jaNoEstoque && (
                            <span className="text-xs rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5">
                              já no estoque
                            </span>
                          )}
                        </div>
                      </td>
```

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check && npm test && npm run build
```

- [ ] **Step 4: Commit e deploy**

```bash
cd "D:/Claude/Teste" && git add "src/app/(dashboard)/pecas" && git commit -m "feat(estoque): aba Pedidos na fabrica marca o que ja deu entrada

Sem isso a aba continuaria dizendo 'nao entregue' para peca que ja esta na
prateleira e ja foi somada ao saldo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main
```

---

## Verificação final

Depois da Task 9, com o deploy no ar:

- [ ] `npm test` — 493 testes passando.
- [ ] `/pecas` → Estoque: escolher loja, cadastrar produto com tamanhos, dar entrada, ajustar, ver histórico.
- [ ] `/pecas` → Estoque → "Sincronizar com a fábrica": conferir que entram peças e que **rodar de novo não muda o saldo** (é a prova da idempotência).
- [ ] `/pecas` → Vendas → Nova Venda: saldo muda ao trocar de loja; venda derruba o saldo.
- [ ] Uma OS: adicionar peça derruba o saldo; remover devolve; cancelar devolve.
- [ ] `/pecas` → Pedidos na fábrica: pedidos sincronizados aparecem com "já no estoque".
- [ ] Conferir no banco que não sobrou saldo sem histórico que o explique:

```bash
cd "D:/Claude/Teste" && npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "SELECT e.peca_id, e.loja_id, e.quantidade, COALESCE(sum(m.quantidade),0) AS soma_movimentacoes FROM pecas_estoque e LEFT JOIN pecas_movimentacoes m ON m.peca_id = e.peca_id AND m.loja_id = e.loja_id GROUP BY e.peca_id, e.loja_id, e.quantidade HAVING e.quantidade <> COALESCE(sum(m.quantidade),0)"
```

Esperado: **zero linhas**. Qualquer linha aqui é saldo que alguém escreveu sem passar por `movimentarEstoque`.
