# Aprovação de Venda Abaixo do Valor Mínimo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o vendedor pedir aprovação (em vez de ficar bloqueado) quando lança uma venda abaixo do valor mínimo, e permitir que só `admin_geral`/`admin_socio` do grupo certo aprovem ou recusem.

**Architecture:** Nova tabela `aprovacoes_venda` guarda o payload completo da venda (cliente + pagamentos) como JSON enquanto pendente — nenhuma linha em `pedidos_venda`/`vendas` é criada até a aprovação. A moto usa um novo valor de `disponibilidade` (`aguardando_aprovacao`) para ficar travada nesse período. O fluxo direto de venda (`registrarVendaCompletaAction`) é refatorado para compartilhar sua lógica de criação de venda com a nova ação de aprovação, via um helper `criarVendaTx`.

**Tech Stack:** Next.js App Router (Server Actions), Drizzle ORM + Postgres (Supabase), TypeScript, shadcn/ui.

## Global Constraints

- Projeto não tem suite de testes automatizada — não crie uma. Verificação por task = `npm run type-check` + checagem manual descrita no passo de verificação.
- Migrações são aplicadas manualmente via Supabase MCP (`apply_migration`), nunca via `db:generate`/`db:migrate` (o journal do drizzle-kit está quebrado neste repo).
- Projeto Supabase: `bzlaradpofaecqzawyym`.
- Só o fluxo direto de venda (`vender-button.tsx` → `registrarVendaCompletaAction`) é afetado — o fluxo legado de pedido → efetivar não muda.
- Sem notificação externa (e-mail, WhatsApp) — tudo aparece na tela.
- `admin_geral` sempre pode aprovar; `admin_socio` só pode aprovar vendas de lojas do próprio grupo (via `usuarios.lojaId` fixo, nunca via cookie `grupoAtivo`).
- Quem já é `admin_geral`/`admin_socio` vende abaixo do mínimo direto, sem passar por aprovação.
- Spec completa: `docs/superpowers/specs/2026-07-10-aprovacao-venda-abaixo-minimo-design.md`.

---

### Task 1: Schema e migração — tabela `aprovacoes_venda`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0025_aprovacao_venda.sql`

**Interfaces:**
- Produces: enum `aprovacaoVendaStatusEnum` (valores Postgres: `'pendente' | 'aprovada' | 'recusada'`); tabela `aprovacoesVenda` com colunas `id, motoId, lojaId, vendedorId, valor, dadosVenda, motivo, disponibilidadeAnterior, status, respondidoPor, dataSolicitacao, dataResposta`; `disponibilidadeEnum` ganha o valor `'aguardando_aprovacao'`; `referenciaEnum` ganha o valor `'aprovacao_venda'`.

- [ ] **Step 1: Editar os enums existentes em `schema.ts`**

Em `src/lib/db/schema.ts`, linha 13, trocar:

```ts
export const disponibilidadeEnum = pgEnum('disponibilidade_moto', ['disponivel', 'reservada', 'vendida'])
```

por:

```ts
export const disponibilidadeEnum = pgEnum('disponibilidade_moto', ['disponivel', 'reservada', 'vendida', 'aguardando_aprovacao'])
```

Linha 21, trocar:

```ts
export const referenciaEnum = pgEnum('referencia_tipo', ['transferencia', 'pedido_venda'])
```

por:

```ts
export const referenciaEnum = pgEnum('referencia_tipo', ['transferencia', 'pedido_venda', 'aprovacao_venda'])
```

Logo abaixo da linha 15 (`transferenciaStatusEnum`), adicionar uma nova linha:

```ts
export const aprovacaoVendaStatusEnum = pgEnum('aprovacao_venda_status', ['pendente', 'aprovada', 'recusada'])
```

- [ ] **Step 2: Adicionar a tabela `aprovacoesVenda`**

Em `src/lib/db/schema.ts`, depois do fechamento da tabela `vendas` (depois da linha `})` que fecha `export const vendas = pgTable(...)`, antes do comentário `// ─── transferencias ───...`, adicionar:

```ts
// ─── aprovacoes_venda ────────────────────────────────────────────────────────
export const aprovacoesVenda = pgTable('aprovacoes_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  dadosVenda: jsonb('dados_venda').notNull(),
  motivo: text('motivo').notNull(),
  disponibilidadeAnterior: disponibilidadeEnum('disponibilidade_anterior'),
  status: aprovacaoVendaStatusEnum('status').notNull().default('pendente'),
  respondidoPor: uuid('respondido_por').references(() => usuarios.id),
  dataSolicitacao: timestamp('data_solicitacao', { withTimezone: true }).notNull().defaultNow(),
  dataResposta: timestamp('data_resposta', { withTimezone: true }),
})
```

- [ ] **Step 3: Criar o arquivo de migração**

Criar `src/lib/db/migrations/0025_aprovacao_venda.sql`:

```sql
ALTER TYPE "disponibilidade_moto" ADD VALUE 'aguardando_aprovacao';
ALTER TYPE "referencia_tipo" ADD VALUE 'aprovacao_venda';

CREATE TYPE "aprovacao_venda_status" AS ENUM ('pendente', 'aprovada', 'recusada');

CREATE TABLE "aprovacoes_venda" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "moto_id" uuid NOT NULL REFERENCES "motos"("id"),
  "loja_id" uuid NOT NULL REFERENCES "lojas"("id"),
  "vendedor_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "valor" numeric(12,2) NOT NULL,
  "dados_venda" jsonb NOT NULL,
  "motivo" text NOT NULL,
  "disponibilidade_anterior" "disponibilidade_moto",
  "status" "aprovacao_venda_status" NOT NULL DEFAULT 'pendente',
  "respondido_por" uuid REFERENCES "usuarios"("id"),
  "data_solicitacao" timestamp with time zone DEFAULT now() NOT NULL,
  "data_resposta" timestamp with time zone
);
```

- [ ] **Step 4: Aplicar a migração via Supabase MCP**

Use a ferramenta MCP `apply_migration` do Supabase (`project_id: bzlaradpofaecqzawyym`, `name: aprovacao_venda`), com o conteúdo do arquivo criado no Step 3.

- [ ] **Step 5: Verificar**

Rodar `npm run type-check` — deve passar sem erros novos.

Verificar manualmente via SQL (Supabase MCP `execute_sql`, mesmo `project_id`):

```sql
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname IN ('disponibilidade_moto', 'referencia_tipo', 'aprovacao_venda_status')
ORDER BY t.typname, e.enumsortorder;
```

Esperado: `disponibilidade_moto` inclui `aguardando_aprovacao`; `referencia_tipo` inclui `aprovacao_venda`; `aprovacao_venda_status` tem `pendente`, `aprovada`, `recusada`. E `SELECT * FROM aprovacoes_venda LIMIT 1;` não deve dar erro (tabela vazia, sem erro de "relation does not exist").

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0025_aprovacao_venda.sql
git commit -m "feat: tabela aprovacoes_venda para aprovação de venda abaixo do mínimo"
```

---

### Task 2: Helper de permissão `podeAprovarVendaBaixoValor`

**Files:**
- Modify: `src/lib/grupo.ts`

**Interfaces:**
- Consumes: `getGrupoIdDaLoja(lojaId: string): Promise<string>` (já existe em `src/lib/grupo.ts:51-55`).
- Produces: `podeAprovarVendaBaixoValor(usuario: { papel: string; lojaId: string | null }, lojaIdVenda: string): Promise<boolean>` — usado por `vendas/actions.ts` (Task 6) e `estoque/[id]/page.tsx` (Task 9).

- [ ] **Step 1: Adicionar a função em `src/lib/grupo.ts`**

No final do arquivo `src/lib/grupo.ts`, depois de `listarTodasLojasAtivas`, adicionar:

```ts
// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────
// admin_geral aprova de qualquer grupo; admin_socio só do próprio grupo,
// determinado pela loja fixa dele (usuarios.lojaId), não pelo cookie
// grupoAtivo — a permissão de aprovar não deve depender de qual grupo o
// sócio está "olhando" no momento.
export async function podeAprovarVendaBaixoValor(
  usuario: { papel: string; lojaId: string | null },
  lojaIdVenda: string,
): Promise<boolean> {
  if (usuario.papel === 'admin_geral') return true
  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false

  const [grupoVenda, grupoSocio] = await Promise.all([
    getGrupoIdDaLoja(lojaIdVenda),
    getGrupoIdDaLoja(usuario.lojaId),
  ])
  return grupoVenda === grupoSocio
}
```

- [ ] **Step 2: Verificar**

Rodar `npm run type-check` — deve passar sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/grupo.ts
git commit -m "feat: helper podeAprovarVendaBaixoValor para checar permissão de aprovação"
```

---

### Task 3: Label de disponibilidade `aguardando_aprovacao`

**Files:**
- Modify: `src/lib/estado-moto.ts`

**Interfaces:**
- Produces: `Disponibilidade` type inclui `'aguardando_aprovacao'`; `disponibilidadeLabel['aguardando_aprovacao'] === 'Aguardando aprovação'`.

- [ ] **Step 1: Editar o type e o label**

Em `src/lib/estado-moto.ts`, linha 3, trocar:

```ts
export type Disponibilidade = 'disponivel' | 'reservada' | 'vendida'
```

por:

```ts
export type Disponibilidade = 'disponivel' | 'reservada' | 'vendida' | 'aguardando_aprovacao'
```

Linhas 64-68, trocar:

```ts
export const disponibilidadeLabel: Record<Disponibilidade, string> = {
  disponivel: 'Disponível',
  reservada:  'Reservada',
  vendida:    'Vendida',
}
```

por:

```ts
export const disponibilidadeLabel: Record<Disponibilidade, string> = {
  disponivel: 'Disponível',
  reservada:  'Reservada',
  vendida:    'Vendida',
  aguardando_aprovacao: 'Aguardando aprovação',
}
```

Não é preciso mexer em `getTransicoesDisponibilidadePermitidas` (`src/lib/estado-moto.ts:42-56`): a função já só retorna transições explícitas para `null`/`disponivel`/`reservada` e cai no `return []` final para qualquer outro valor — `'aguardando_aprovacao'` já fica automaticamente sem transição manual disponível (igual a `'vendida'`), sem precisar de um guard extra.

- [ ] **Step 2: Verificar**

Rodar `npm run type-check`. Como `disponibilidadeLabel` é `Record<Disponibilidade, string>`, o TypeScript vai reclamar se o valor `aguardando_aprovacao` não estiver lá — confirme que passa limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/estado-moto.ts
git commit -m "feat: label de disponibilidade aguardando_aprovacao"
```

---

### Task 4: Query — expor solicitação pendente em `buscarMoto`

**Files:**
- Modify: `src/lib/queries/motos.ts`

**Interfaces:**
- Produces: `buscarMoto(id)` passa a retornar também `aprovacaoPendenteId: string | null`, `aprovacaoPendenteValor: string | null`, `aprovacaoPendenteMotivo: string | null`, `aprovacaoPendenteVendedorId: string | null`, `aprovacaoPendenteDataSolicitacao: string | null`.

- [ ] **Step 1: Adicionar os subselects em `buscarMoto`**

Em `src/lib/queries/motos.ts`, dentro do `select({...})` de `buscarMoto` (a partir da linha 183), logo depois do campo `reservaCartaoParcelas` (linha 286-290) e antes do fechamento `})` do select (linha 291), adicionar:

```ts
      aprovacaoPendenteId: sql<string | null>`(
        SELECT a.id FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteValor: sql<string | null>`(
        SELECT a.valor::text FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteMotivo: sql<string | null>`(
        SELECT a.motivo FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteVendedorId: sql<string | null>`(
        SELECT a.vendedor_id FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteDataSolicitacao: sql<string | null>`(
        SELECT a.data_solicitacao::text FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
```

Não mexer em `listarMotos` — a tabela/lista só precisa do badge de `disponibilidade` (Task 8), não dos detalhes da solicitação.

- [ ] **Step 2: Verificar**

Rodar `npm run type-check`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/motos.ts
git commit -m "feat: buscarMoto expõe solicitação de aprovação de venda pendente"
```

---

### Task 5: Extrair `criarVendaTx` e ajustar `registrarVendaCompletaAction`

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts:145-316`

**Interfaces:**
- Produces: função interna `criarVendaTx(tx, { moto, data, vendedorId, efetivadoPor, dataVendaFinal }): Promise<{ vendaId: string }>` — consumida por `registrarVendaCompletaAction` (aqui) e por `aprovarVendaAction` (Task 6).
- Consumes: `DadosVendaCompleta` type (`src/app/(dashboard)/vendas/actions.ts:126-143`, já existe, não exportado — mas usado por referência estrutural).

- [ ] **Step 1: Extrair o corpo da transação para `criarVendaTx`**

Em `src/app/(dashboard)/vendas/actions.ts`, logo depois da definição do type `DadosVendaCompleta` (depois da linha 143, antes de `export async function registrarVendaCompletaAction`), adicionar:

```ts
async function criarVendaTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    moto: { id: string; lojaId: string }
    data: DadosVendaCompleta
    vendedorId: string
    efetivadoPor: string
    dataVendaFinal: Date
  }
): Promise<{ vendaId: string }> {
  const { moto, data, vendedorId, efetivadoPor, dataVendaFinal } = params
  const valorNum = parseFloat(data.valorTotal)

  // Verificar reserva ativa para linkar
  const [reservaAtiva] = await tx
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.motoId, moto.id), eq(reservas.status, 'ativa')))
    .limit(1)

  // Criar pedido já efetivado
  const [pedido] = await tx.insert(pedidosVenda).values({
    motoId: moto.id,
    lojaId: moto.lojaId,
    vendedorId,
    status: 'efetivado',
    observacao: null,
    dataPedido: dataVendaFinal,
    dataAtualizacao: dataVendaFinal,
  }).returning({ id: pedidosVenda.id })

  // Upsert cliente por CPF — cria se não existir, atualiza se existir
  const cpfLimpo = data.clienteCpf.replace(/\D/g, '')
  let clienteVinculadoId: string | null = null
  if (cpfLimpo.length >= 11) {
    const [clienteUpsert] = await tx
      .insert(clientes)
      .values({
        nome:        data.clienteNome.trim(),
        cpfCnpj:     cpfLimpo,
        email:       data.clienteEmail        || null,
        celular:     data.clienteCelular       || null,
        endereco:    data.clienteLogradouro    || null,
        numero:      data.clienteNumero        || null,
        complemento: data.clienteComplemento   || null,
        bairro:      data.clienteBairro        || null,
        cep:         data.clienteCep           || null,
        cidade:      data.clienteCidade        || null,
        uf:          data.clienteEstado        || null,
      })
      .onConflictDoUpdate({
        target: clientes.cpfCnpj,
        set: {
          nome:        sql`excluded.nome`,
          email:       sql`excluded.email`,
          celular:     sql`excluded.celular`,
          endereco:    sql`excluded.endereco`,
          numero:      sql`excluded.numero`,
          complemento: sql`excluded.complemento`,
          bairro:      sql`excluded.bairro`,
          cep:         sql`excluded.cep`,
          cidade:      sql`excluded.cidade`,
          uf:          sql`excluded.uf`,
          atualizadoEm: sql`now()`,
        },
      })
      .returning({ id: clientes.id })
    clienteVinculadoId = clienteUpsert?.id ?? null
  }

  const [venda] = await tx.insert(vendas).values({
    pedidoVendaId: pedido.id,
    motoId: moto.id,
    lojaId: moto.lojaId,
    vendedorId,
    efetivadoPor,
    clienteId:    clienteVinculadoId,
    clienteNome: data.clienteNome,
    clienteCpf: data.clienteCpf,
    clienteCelular: data.clienteCelular,
    clienteEmail: data.clienteEmail,
    clienteCep: data.clienteCep,
    clienteLogradouro: data.clienteLogradouro,
    clienteNumero: data.clienteNumero,
    clienteComplemento: data.clienteComplemento,
    clienteBairro: data.clienteBairro,
    clienteCidade: data.clienteCidade,
    clienteEstado: data.clienteEstado,
    valor: data.valorTotal,
    formaPagamento: data.pagamentos[0].tipo,
    pagamentos: data.pagamentos,
    reservaId: reservaAtiva?.id ?? null,
    dataVenda: dataVendaFinal,
  }).returning({ id: vendas.id })

  // Marcar reserva como convertida
  if (reservaAtiva) {
    await tx.update(reservas)
      .set({ status: 'convertida' })
      .where(eq(reservas.id, reservaAtiva.id))
  }

  // Moto fica em estoque com status 'vendida' até a NF de saída ser confirmada
  await tx.update(motos)
    .set({ status: 'vendida' as any, disponibilidade: null })
    .where(eq(motos.id, moto.id))

  // Histórico
  const tipoLabel: Record<string, string> = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
    link_pagamento: 'Link de Pagamento', transferencia: 'Transferência',
  }
  const descPagamentos = data.pagamentos
    .map(p => `${tipoLabel[p.tipo] ?? p.tipo}: R$ ${p.valor.toFixed(2)}`)
    .join(' + ')
  await tx.insert(historicoEstoque).values({
    motoId: moto.id,
    lojaOrigemId: moto.lojaId,
    usuarioId: efetivadoPor,
    tipo: 'saida',
    referenciaTipo: 'pedido_venda',
    referenciaId: pedido.id,
    observacao: `Venda — Cliente: ${data.clienteNome} — Total: R$ ${valorNum.toFixed(2)} — ${descPagamentos}`,
  })

  // Registrar pagamentos em dinheiro no caixa automaticamente
  const pagamentosDinheiro = data.pagamentos.filter(p => p.tipo === 'dinheiro')
  for (const pgto of pagamentosDinheiro) {
    await tx.insert(lancamentosCaixa).values({
      lojaId: moto.lojaId,
      usuarioId: efetivadoPor,
      tipo: 'entrada',
      categoria: 'Venda',
      descricao: `Venda dinheiro — ${data.clienteNome}`,
      valor: pgto.valor.toFixed(2),
      data: dataVendaFinal.toISOString().split('T')[0],
      vendaId: venda.id,
    })
  }

  return { vendaId: venda.id }
}
```

- [ ] **Step 2: Reescrever `registrarVendaCompletaAction` para usar o helper e permitir bypass do mínimo**

Substituir o corpo de `registrarVendaCompletaAction` (linhas 145-316) por:

```ts
export async function registrarVendaCompletaAction(data: DadosVendaCompleta) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para registrar venda')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, data.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status === 'caixa') {
    throw new Error('Moto ainda não foi montada — não pode ser vendida')
  }
  if (moto.status === 'vendida') {
    throw new Error('Moto já foi vendida')
  }

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new Error('Somatório das formas de pagamento difere do valor da venda')
  }

  // admin_geral/admin_socio podem vender abaixo do mínimo direto (auto-aprovação);
  // os demais papéis devem usar solicitarAprovacaoVendaAction nesse caso.
  const podeVenderAbaixoDoMinimo = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
  if (prec && !podeVenderAbaixoDoMinimo) {
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido < prec.valorMinimoPix - 0.01) {
      const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      throw new Error(
        `Valor abaixo do mínimo: líquido estimado ${fmt(liquido)} — mínimo PIX ${fmt(prec.valorMinimoPix)}. Peça aprovação em vez de salvar direto.`
      )
    }
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id

  const dataVendaFinal = data.dataVenda ? new Date(data.dataVenda + 'T12:00:00') : new Date()

  await db.transaction(async (tx) => {
    await criarVendaTx(tx, { moto, data, vendedorId, efetivadoPor: usuario.id, dataVendaFinal })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')
}
```

- [ ] **Step 3: Verificar**

Rodar `npm run type-check` — deve passar sem erros.

Verificação manual: com o dev server rodando (`npm run dev`), logado como `vendedor`, registrar uma venda normal (valor acima do mínimo) e confirmar que ainda funciona igual a antes (cria pedido efetivado + venda, moto vira `vendida`). Depois, logado como `admin_geral`, registrar uma venda abaixo do mínimo e confirmar que salva direto (sem erro).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/vendas/actions.ts"
git commit -m "refactor: extrair criarVendaTx e permitir admin/sócio venderem abaixo do mínimo direto"
```

---

### Task 6: Ações `solicitarAprovacaoVendaAction`, `aprovarVendaAction`, `recusarVendaAction`

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts`

**Interfaces:**
- Consumes: `criarVendaTx` (Task 5), `podeAprovarVendaBaixoValor` (Task 2), tabela `aprovacoesVenda` (Task 1).
- Produces: `solicitarAprovacaoVendaAction(data: DadosVendaCompleta, motivo: string): Promise<void>`, `aprovarVendaAction(aprovacaoId: string): Promise<void>`, `recusarVendaAction(aprovacaoId: string, observacao?: string): Promise<void>` — consumidas por `vender-button.tsx` (Task 7) e `aprovacao-venda-card.tsx` (Task 9).

- [ ] **Step 1: Atualizar os imports do arquivo**

Em `src/app/(dashboard)/vendas/actions.ts`, linha 5, trocar:

```ts
import { motos, modelos, modeloBlingCodigos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, precificacao, configuracaoTaxas, usuarios, clientes } from '@/lib/db/schema'
```

por:

```ts
import { motos, modelos, modeloBlingCodigos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, precificacao, configuracaoTaxas, usuarios, clientes, aprovacoesVenda } from '@/lib/db/schema'
```

Linha 9, trocar:

```ts
import { getGrupoIdDaLoja } from '@/lib/grupo'
```

por:

```ts
import { getGrupoIdDaLoja, podeAprovarVendaBaixoValor } from '@/lib/grupo'
```

- [ ] **Step 2: Adicionar as três novas actions**

No final de `src/app/(dashboard)/vendas/actions.ts`, adicionar:

```ts
// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────

export async function solicitarAprovacaoVendaAction(data: DadosVendaCompleta, motivo: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para registrar venda')
  }
  if (!motivo.trim()) throw new Error('Informe o motivo do pedido de aprovação')

  const [moto] = await db.select().from(motos).where(eq(motos.id, data.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status === 'caixa') throw new Error('Moto ainda não foi montada — não pode ser vendida')
  if (moto.status === 'vendida') throw new Error('Moto já foi vendida')
  if (moto.disponibilidade === 'aguardando_aprovacao') throw new Error('Esta moto já tem uma venda aguardando aprovação')
  if (moto.disponibilidade === 'reservada') throw new Error('Moto está reservada — finalize ou cancele a reserva antes')

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new Error('Somatório das formas de pagamento difere do valor da venda')
  }

  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
  if (!prec) throw new Error('Sem preço mínimo configurado para este modelo — use o fluxo normal de venda')
  const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
  if (liquido >= prec.valorMinimoPix - 0.01) {
    throw new Error('Valor está dentro do mínimo — use o fluxo normal de venda')
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id

  await db.transaction(async (tx) => {
    await tx.insert(aprovacoesVenda).values({
      motoId: moto.id,
      lojaId: moto.lojaId,
      vendedorId,
      valor: data.valorTotal,
      dadosVenda: data,
      motivo: motivo.trim(),
      disponibilidadeAnterior: moto.disponibilidade,
      status: 'pendente',
    })

    await tx.update(motos)
      .set({ disponibilidade: 'aguardando_aprovacao' })
      .where(eq(motos.id, moto.id))

    await tx.insert(historicoEstoque).values({
      motoId: moto.id,
      lojaOrigemId: moto.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      referenciaTipo: 'aprovacao_venda',
      observacao: `Pedido de aprovação — Cliente: ${data.clienteNome} — Valor: R$ ${valorNum.toFixed(2)} — Motivo: ${motivo.trim()}`,
    })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${data.motoId}`)
}

export async function aprovarVendaAction(aprovacaoId: string) {
  const usuario = await getUsuarioLogado()

  const [aprovacao] = await db.select().from(aprovacoesVenda).where(eq(aprovacoesVenda.id, aprovacaoId)).limit(1)
  if (!aprovacao) throw new Error('Solicitação não encontrada')
  if (aprovacao.status !== 'pendente') throw new Error(`Solicitação não está pendente (status: ${aprovacao.status})`)

  if (!(await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId))) {
    throw new Error('Sem permissão para aprovar esta venda')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, aprovacao.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const data = aprovacao.dadosVenda as unknown as DadosVendaCompleta
  const dataVendaFinal = data.dataVenda ? new Date(data.dataVenda + 'T12:00:00') : new Date()

  await db.transaction(async (tx) => {
    await criarVendaTx(tx, { moto, data, vendedorId: aprovacao.vendedorId, efetivadoPor: usuario.id, dataVendaFinal })

    await tx.update(aprovacoesVenda)
      .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(eq(aprovacoesVenda.id, aprovacaoId))
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${aprovacao.motoId}`)
  revalidatePath('/caixa')
}

export async function recusarVendaAction(aprovacaoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()

  const [aprovacao] = await db.select().from(aprovacoesVenda).where(eq(aprovacoesVenda.id, aprovacaoId)).limit(1)
  if (!aprovacao) throw new Error('Solicitação não encontrada')
  if (aprovacao.status !== 'pendente') throw new Error(`Solicitação não está pendente (status: ${aprovacao.status})`)

  if (!(await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId))) {
    throw new Error('Sem permissão para recusar esta venda')
  }

  await db.transaction(async (tx) => {
    await tx.update(motos)
      .set({ disponibilidade: aprovacao.disponibilidadeAnterior })
      .where(eq(motos.id, aprovacao.motoId))

    await tx.update(aprovacoesVenda)
      .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(eq(aprovacoesVenda.id, aprovacaoId))

    await tx.insert(historicoEstoque).values({
      motoId: aprovacao.motoId,
      lojaOrigemId: aprovacao.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      referenciaTipo: 'aprovacao_venda',
      referenciaId: aprovacaoId,
      observacao: observacao?.trim()
        ? `Venda recusada — Motivo: ${observacao.trim()}`
        : 'Venda recusada',
    })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${aprovacao.motoId}`)
}
```

- [ ] **Step 3: Verificar**

Rodar `npm run type-check` — deve passar sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/vendas/actions.ts"
git commit -m "feat: solicitar, aprovar e recusar venda abaixo do valor mínimo"
```

---

### Task 7: `vender-button.tsx` — campo de motivo e botão "Pedir aprovação"

**Files:**
- Modify: `src/app/(dashboard)/estoque/components/vender-button.tsx`

**Interfaces:**
- Consumes: `solicitarAprovacaoVendaAction(data, motivo)` (Task 6).
- Produces: `VenderButton` passa a exigir a prop `papel: string`.

- [ ] **Step 1: Importar a nova action, o `Textarea` e adicionar a prop `papel`**

Em `src/app/(dashboard)/estoque/components/vender-button.tsx`, linha 11, trocar:

```ts
import { registrarVendaCompletaAction, registrarReservaAction, buscarPrecoMinimoAction, buscarClientePorCpfAction } from '../../vendas/actions'
```

por:

```ts
import { registrarVendaCompletaAction, registrarReservaAction, buscarPrecoMinimoAction, buscarClientePorCpfAction, solicitarAprovacaoVendaAction } from '../../vendas/actions'
```

Depois da linha `import { Label } from '@/components/ui/label'` (linha 7), adicionar:

```ts
import { Textarea } from '@/components/ui/textarea'
```

No type `Props` (linhas 72-83), adicionar o campo `papel`:

```ts
type Props = {
  motoId: string
  descricao: string
  vendedorId: string
  vendedorNome: string
  papel: string
  usuarios: Usuario[]
  soReserva?: boolean
  reservaAtiva?: DadosReservaAtiva
  showLabel?: boolean
  precoMinimoPix?: number | null
  taxasVenda?: TaxasVenda | null
}
```

Na assinatura da função (linha 105), adicionar `papel` na desestruturação:

```ts
export function VenderButton({ motoId, descricao, vendedorId, vendedorNome, papel, usuarios, soReserva, reservaAtiva, showLabel, precoMinimoPix: precoMinimoPixProp, taxasVenda: taxasVendaProp }: Props) {
```

- [ ] **Step 2: Adicionar estado `motivo` e resetar no `resetForm`**

Depois da linha `const [pgtos, setPgtos] = useState<Pgto[]>([{ id: '1', tipo: '', valor: '' }])` (linha 134), adicionar:

```ts
  const [motivo, setMotivo] = useState('')
```

Em `resetForm` (linhas 153-192), na última linha antes do fechamento da função (depois de `setValorReserva(''); setValorTotalVenda(''); setMeioPgto(''); setMeioPgtoOperadora(''); setMeioPgtoParcelas(''); setDataPrevista('')`), adicionar:

```ts
    setMotivo('')
```

- [ ] **Step 3: Calcular `precisaAprovacao` e usar no lugar de `liquidoOk` na validação**

Depois da linha `const liquidoOk = !precoMinimoPix || liquidoEstimado === null || liquidoEstimado >= precoMinimoPix - 0.01` (linha 336), adicionar:

```ts
  const bypassMinimo = ['admin_geral', 'admin_socio'].includes(papel)
  const precisaAprovacao = !liquidoOk && !bypassMinimo
  const valorOk = liquidoOk || bypassMinimo || (precisaAprovacao && motivo.trim().length > 0)
```

Na definição de `vendaValida` (linhas 346-351), trocar `liquidoOk` por `valorOk`:

```ts
  const vendaValida = clientePreenchido && (
    tipo === 'venda'
      ? !!(valorVenda && somatorioOk && pgtos.every(p => p.tipo && p.valor) && !cartaoIncompleto && valorOk)
      : !!(valorReserva && valorTotalVenda && meioPgto && dataPrevista && !reservaCartaoIncompleto
          && (reservaValidacao ? reservaValidacao.entradaOk : true))
  )
```

- [ ] **Step 4: Ramificar `handleSubmit` entre venda direta e pedido de aprovação**

Substituir o bloco `if (tipo === 'venda') { ... }` dentro de `handleSubmit` (linhas 364-376) por:

```ts
      if (tipo === 'venda') {
        const payload = {
          motoId, ...clienteBase, valorTotal: valorVenda,
          vendedorId: vendedorSelecionado,
          dataVenda: dataVenda || undefined,
          pagamentos: pgtos.map(p => ({
            tipo: p.tipo, valor: parseFloat(p.valor),
            ...(p.tipo === 'cartao_credito' ? { operadora: p.operadora, parcelas: parseInt(p.parcelas!) } : {}),
            ...(TIPOS_COM_PARCELAS.has(p.tipo) && p.tipo !== 'cartao_credito' && p.parcelas ? { parcelas: parseInt(p.parcelas) } : {}),
            ...((p.tipo === 'cartao_credito' || p.tipo === 'cartao_debito') && p.autorizacao?.trim() ? { autorizacao: p.autorizacao.trim() } : {}),
          })),
        }
        if (precisaAprovacao) {
          await solicitarAprovacaoVendaAction(payload, motivo)
          toast.success('Pedido de aprovação enviado!')
        } else {
          await registrarVendaCompletaAction(payload)
          toast.success('Venda registrada com sucesso!')
        }
      } else {
```

(o `else { ... registrarReservaAction ... }` que já existia continua igual, apenas o `if` foi reescrito.)

- [ ] **Step 5: Adicionar o campo de motivo na UI**

Depois do bloco do alerta de preço mínimo (linhas 709-726, o `{precoMinimoPix && taxasVenda && somatorioOk && ... }`), adicionar:

```tsx
                  {precisaAprovacao && (
                    <div className="space-y-1">
                      <Label>Motivo do pedido de aprovação <span className="text-red-500">*</span></Label>
                      <Textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="Explique por que está vendendo abaixo do valor mínimo..."
                        rows={3}
                      />
                    </div>
                  )}
```

- [ ] **Step 6: Trocar o texto do botão de confirmar**

Na `DialogFooter` (linhas 813-815), trocar:

```tsx
            <Button onClick={handleSubmit} disabled={loading || !vendaValida}>
              {loading ? 'Salvando...' : tipo === 'venda' ? 'Confirmar Venda' : 'Confirmar Reserva'}
            </Button>
```

por:

```tsx
            <Button onClick={handleSubmit} disabled={loading || !vendaValida}>
              {loading
                ? 'Salvando...'
                : tipo === 'reserva'
                  ? 'Confirmar Reserva'
                  : precisaAprovacao
                    ? 'Pedir aprovação'
                    : 'Confirmar Venda'}
            </Button>
```

- [ ] **Step 7: Verificar**

Rodar `npm run type-check` — vai apontar erro nos lugares que ainda não passam `papel` para `<VenderButton>` (isso é esperado, resolvido na Task 8). Confirme que o erro é só "Property 'papel' is missing" nos call sites, sem outro tipo de erro.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/estoque/components/vender-button.tsx"
git commit -m "feat: botão Pedir aprovação no fluxo de venda abaixo do mínimo"
```

---

### Task 8: Passar `papel` para `VenderButton` e travar venda quando `aguardando_aprovacao`

**Files:**
- Modify: `src/app/(dashboard)/estoque/components/moto-table.tsx`
- Modify: `src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx`

**Interfaces:**
- Consumes: `VenderButton` agora exige `papel` (Task 7).

- [ ] **Step 1: `moto-table.tsx` — badge, guard e prop `papel`**

Em `src/app/(dashboard)/estoque/components/moto-table.tsx`, linhas 14-18, trocar:

```ts
const dispBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  disponivel: { label: 'Disponível', variant: 'default' },
  reservada:  { label: 'Reservada',  variant: 'outline' },
  vendida:    { label: 'Vendida',    variant: 'secondary' },
}
```

por:

```ts
const dispBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  disponivel: { label: 'Disponível', variant: 'default' },
  reservada:  { label: 'Reservada',  variant: 'outline' },
  vendida:    { label: 'Vendida',    variant: 'secondary' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', variant: 'destructive' },
}
```

Linha 146, trocar a condição:

```tsx
                                {moto.status !== 'caixa' && moto.disponibilidade !== 'reservada' && (moto.disponibilidade === 'disponivel' || moto.status === 'em_garantia') && (
```

por:

```tsx
                                {moto.status !== 'caixa' && moto.disponibilidade !== 'reservada' && moto.disponibilidade !== 'aguardando_aprovacao' && (moto.disponibilidade === 'disponivel' || moto.status === 'em_garantia') && (
```

Nos três usos de `<VenderButton ... />` (linhas 147-153, 157-181, 186-193), adicionar a prop `papel={papel}` junto das outras props (por exemplo, logo depois de `vendedorNome={vendedorNome}`). Exemplo para o primeiro (linhas 147-153):

```tsx
                                  <VenderButton
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    vendedorId={vendedorId}
                                    vendedorNome={vendedorNome}
                                    papel={papel}
                                    usuarios={usuarios}
                                  />
```

Aplicar a mesma adição de `papel={papel}` nos outros dois blocos `<VenderButton ...>` do arquivo.

- [ ] **Step 2: `moto-actions.tsx` — guard e prop `papel`**

Em `src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx`, linhas 98-102, trocar:

```ts
      const podeVenderMoto = moto.status !== 'caixa' &&
        moto.disponibilidade !== 'reservada' && (
          moto.disponibilidade === 'disponivel' ||
          moto.status === 'em_garantia'
        )
```

por:

```ts
      const podeVenderMoto = moto.status !== 'caixa' &&
        moto.disponibilidade !== 'reservada' &&
        moto.disponibilidade !== 'aguardando_aprovacao' && (
          moto.disponibilidade === 'disponivel' ||
          moto.status === 'em_garantia'
        )
```

Nos três usos de `<VenderButton ... />` (linhas 105-116, 120-150, 154-166), adicionar `papel={papel}`. Exemplo para o primeiro:

```tsx
        acoes.push(
          <VenderButton
            key="vender"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
          />
        )
```

Aplicar a mesma adição de `papel={papel}` nos outros dois blocos `<VenderButton ...>` do arquivo.

- [ ] **Step 3: Verificar**

Rodar `npm run type-check` — os erros de "Property 'papel' is missing" da Task 7 devem sumir. Não deve sobrar nenhum erro.

Verificação manual: com o dev server rodando, abrir `/estoque`, confirmar que a tabela carrega normalmente e que motos com `disponibilidade` normal continuam mostrando o botão de vender.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/estoque/components/moto-table.tsx" "src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx"
git commit -m "feat: badge e trava de venda para moto aguardando aprovação"
```

---

### Task 9: Card de aprovação na página de detalhe da moto

**Files:**
- Create: `src/app/(dashboard)/estoque/[id]/components/aprovacao-venda-card.tsx`
- Modify: `src/app/(dashboard)/estoque/[id]/page.tsx`

**Interfaces:**
- Consumes: `aprovarVendaAction`, `recusarVendaAction` (Task 6); `fmtBRL` (`src/lib/preco-minimo.ts:74-76`, já existe); `podeAprovarVendaBaixoValor` (Task 2); campos `aprovacaoPendente*` de `buscarMoto` (Task 4).

- [ ] **Step 1: Criar o componente `AprovacaoVendaCard`**

Criar `src/app/(dashboard)/estoque/[id]/components/aprovacao-venda-card.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { aprovarVendaAction, recusarVendaAction } from '../../../vendas/actions'
import { fmtBRL } from '@/lib/preco-minimo'

type Props = {
  aprovacaoId: string
  valor: number
  motivo: string
  vendedorNome: string
  dataSolicitacao: string
  podeAprovar: boolean
}

export function AprovacaoVendaCard({ aprovacaoId, valor, motivo, vendedorNome, dataSolicitacao, podeAprovar }: Props) {
  const [loading, setLoading] = useState(false)
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')

  async function aprovar() {
    setLoading(true)
    try {
      await aprovarVendaAction(aprovacaoId)
      toast.success('Venda aprovada!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar')
    } finally {
      setLoading(false)
    }
  }

  async function recusar() {
    setLoading(true)
    try {
      await recusarVendaAction(aprovacaoId, observacao || undefined)
      toast.success('Venda recusada')
      setRecusarOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <AlertTriangle size={16} />
          Venda aguardando aprovação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Valor</span><span className="font-bold">{fmtBRL(valor)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Vendedor</span><span>{vendedorNome}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Pedido em</span><span>{new Date(dataSolicitacao).toLocaleString('pt-BR')}</span></div>
        <div>
          <p className="text-slate-500 mb-1">Motivo</p>
          <p className="bg-white border rounded px-2 py-1.5">{motivo}</p>
        </div>

        {podeAprovar ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={aprovar} disabled={loading}>Aprovar</Button>
            <Button size="sm" variant="outline" onClick={() => setRecusarOpen(true)} disabled={loading}>Recusar</Button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Aguardando aprovação de um administrador ou sócio.</p>
        )}
      </CardContent>

      <Dialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar venda</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Observação (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={recusar} disabled={loading}>
              {loading ? 'Recusando...' : 'Confirmar recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 2: Wirear no `page.tsx`**

Em `src/app/(dashboard)/estoque/[id]/page.tsx`, linha 6, trocar:

```ts
import { listarLojasDoGrupoAtivo, getGrupoIdDaLoja } from '@/lib/grupo'
```

por:

```ts
import { listarLojasDoGrupoAtivo, getGrupoIdDaLoja, podeAprovarVendaBaixoValor } from '@/lib/grupo'
```

Depois da linha `import { MotoActions } from './components/moto-actions'` (linha 13), adicionar:

```ts
import { AprovacaoVendaCard } from './components/aprovacao-venda-card'
```

Depois da linha `const grupoIdDaMoto = await getGrupoIdDaLoja(moto.lojaId)` (linha 29), adicionar:

```ts
  const podeAprovarAprovacao = await podeAprovarVendaBaixoValor(usuario, moto.lojaId)
```

Depois do `</div>` que fecha o `<div className="grid grid-cols-2 gap-4">` (linha 122), antes do `<Tabs defaultValue="historico">` (linha 124), adicionar:

```tsx

      {moto.disponibilidade === 'aguardando_aprovacao' && moto.aprovacaoPendenteId && (
        <AprovacaoVendaCard
          aprovacaoId={moto.aprovacaoPendenteId}
          valor={parseFloat(moto.aprovacaoPendenteValor ?? '0')}
          motivo={moto.aprovacaoPendenteMotivo ?? ''}
          vendedorNome={usuariosOpts.find(u => u.id === moto.aprovacaoPendenteVendedorId)?.nome ?? 'Desconhecido'}
          dataSolicitacao={moto.aprovacaoPendenteDataSolicitacao ?? new Date().toISOString()}
          podeAprovar={podeAprovarAprovacao}
        />
      )}
```

- [ ] **Step 3: Verificar**

Rodar `npm run type-check` — deve passar sem erros.

Verificação manual, com o dev server rodando:
1. Logado como `vendedor`, abrir uma moto disponível, tentar vender abaixo do mínimo, preencher o motivo e clicar "Pedir aprovação". Confirmar que a moto abre novamente na tela de detalhe mostrando o card amarelo "Venda aguardando aprovação", sem botões (porque `vendedor` não pode aprovar).
2. Logado como `admin_socio` de outro grupo, abrir a mesma moto e confirmar que o card aparece mas sem os botões Aprovar/Recusar.
3. Logado como `admin_socio` do mesmo grupo (ou `admin_geral`), abrir a moto e clicar "Aprovar". Confirmar que a moto vira `vendida` e a venda aparece em `/vendas`.
4. Repetir pedindo uma nova aprovação em outra moto e clicando "Recusar" — confirmar que a moto volta para `disponivel` (ou o status anterior) e some o card.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/estoque/[id]/components/aprovacao-venda-card.tsx" "src/app/(dashboard)/estoque/[id]/page.tsx"
git commit -m "feat: card de aprovação/recusa de venda na página de detalhe da moto"
```
