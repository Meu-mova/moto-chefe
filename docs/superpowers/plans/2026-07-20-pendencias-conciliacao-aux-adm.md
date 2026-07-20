# Pendências de Conciliação para Aux Adm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar um card de alerta no Dashboard do `aux_adm`, com as pendências de conciliação da própria loja nos últimos 30 dias (vendas sem NF, vendas/OS/peças com pagamento não conciliado).

**Architecture:** Uma função de leitura (`getPendenciasConciliacaoLoja`) busca as linhas de `vendas`, `ordens_servico` e `vendas_pecas` da loja nos últimos 30 dias e aplica os helpers de status já existentes (`calcStatusMultiPagamento`, `calcStatusPagamentoUnicoOS`) para contar pendências. Um componente server-side (`PendenciasLojaCard`) renderiza o resultado. A página do Dashboard busca os dados só para `aux_adm` com loja definida, numa seção própria com `Suspense`/`SectionErrorBoundary`.

**Tech Stack:** Next.js App Router (Server Components), Drizzle ORM, PostgreSQL (Supabase), Tailwind.

## Global Constraints

- Projeto não tem suite de testes automatizada — verificação é `npm run type-check` + validação manual (ver spec, seção "Teste").
- Critério de pendência reaproveita exatamente `calcStatusMultiPagamento`/`calcStatusPagamentoUnicoOS` de `src/lib/conciliacao-status.ts` — não criar lógica de status nova.
- Card só aparece para `papel === 'aux_adm'` com `usuario.lojaId` definido; não aparece para `admin_geral`/`admin_socio`/`vendedor`/`mecanico`.
- Janela fixa de 30 dias, independente do filtro de data do resto do Dashboard.
- Sem tabela nova, sem cron, sem canal externo (WhatsApp/e-mail) — conforme spec `docs/superpowers/specs/2026-07-20-pendencias-conciliacao-aux-adm-design.md`.

---

### Task 1: Query `getPendenciasConciliacaoLoja`

**Files:**
- Modify: `src/lib/queries/dashboard.ts`

**Interfaces:**
- Consumes: `calcStatusMultiPagamento(pagamentos: unknown, conciliadoValor: number, pixConciliadoValor: number, valorTotal: string): StatusConc` e `calcStatusPagamentoUnicoOS(formaPagamento: string | null, valorTotal: string | null, conciliadoValor: number, pixConciliadoValor: number): StatusConc`, ambos já existentes em `src/lib/conciliacao-status.ts`. Tabela `vendasPecas` de `src/lib/db/schema.ts` (ainda não importada em `dashboard.ts`).
- Produces: `getPendenciasConciliacaoLoja(lojaId: string, desde: Date): Promise<{ semNotaFiscal: number; vendasPendentes: number; osPendentes: number; pecasPendentes: number }>` — usado pela Task 3.

- [ ] **Step 1: Importar `vendasPecas` e os helpers de status**

Em `src/lib/queries/dashboard.ts`, linha 2, trocar:

```ts
import { vendas, motos, transferencias, garantias, ordensServico, lancamentosCaixa, lojas, modelos, pedidosVenda, usuarios, conciliacoesCartao } from '@/lib/db/schema'
```

por:

```ts
import { vendas, motos, transferencias, garantias, ordensServico, lancamentosCaixa, lojas, modelos, pedidosVenda, usuarios, conciliacoesCartao, vendasPecas } from '@/lib/db/schema'
```

Logo abaixo do bloco de imports existente (depois da linha `import type { Column } from 'drizzle-orm'`), adicionar:

```ts
import { calcStatusMultiPagamento, calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'
```

- [ ] **Step 2: Adicionar a função no final de `src/lib/queries/dashboard.ts`**

```ts
// Pendências de conciliação de uma loja específica, últimos N dias (parâmetro `desde`).
// Reaproveita os mesmos helpers de status usados em /vendas, /ordens-servico e /pecas —
// não inventa critério novo. Usado só pelo card do aux_adm no Dashboard.
export async function getPendenciasConciliacaoLoja(lojaId: string, desde: Date) {
  const [vendasRows, osRows, pecasRows] = await Promise.all([
    db
      .select({
        pagamentos: vendas.pagamentos,
        valor: vendas.valor,
        notaFiscalSaida: vendas.notaFiscalSaida,
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE venda_id = ${vendas.id}
          AND conciliado = true
        ), 0)`,
        pixConciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor::numeric)
          FROM pix_recebimentos_mcp
          WHERE venda_id = ${vendas.id}
        ), 0)`,
      })
      .from(vendas)
      .where(and(eq(vendas.lojaId, lojaId), gte(vendas.dataVenda, desde))),
    db
      .select({
        formaPagamento: ordensServico.formaPagamento,
        valorTotal: ordensServico.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE os_id = ${ordensServico.id}
          AND conciliado = true
        ), 0)`,
        pixConciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor::numeric)
          FROM pix_recebimentos_mcp
          WHERE os_id = ${ordensServico.id}
        ), 0)`,
      })
      .from(ordensServico)
      .where(and(eq(ordensServico.lojaId, lojaId), gte(ordensServico.dataAbertura, desde))),
    db
      .select({
        pagamentos: vendasPecas.pagamentos,
        valorTotal: vendasPecas.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE peca_venda_id = ${vendasPecas.id}
          AND conciliado = true
        ), 0)`,
        pixConciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor::numeric)
          FROM pix_recebimentos_mcp
          WHERE peca_venda_id = ${vendasPecas.id}
        ), 0)`,
      })
      .from(vendasPecas)
      .where(and(eq(vendasPecas.lojaId, lojaId), gte(vendasPecas.dataVenda, desde))),
  ])

  const semNotaFiscal = vendasRows.filter(v => !v.notaFiscalSaida).length

  const vendasPendentes = vendasRows.filter(v => {
    const status = calcStatusMultiPagamento(v.pagamentos, v.conciliadoValor, v.pixConciliadoValor, v.valor)
    return status === 'pendente' || status === 'parcial'
  }).length

  const osPendentes = osRows.filter(o => {
    const status = calcStatusPagamentoUnicoOS(o.formaPagamento, o.valorTotal, o.conciliadoValor, o.pixConciliadoValor)
    return status === 'pendente' || status === 'parcial'
  }).length

  const pecasPendentes = pecasRows.filter(p => {
    const status = calcStatusMultiPagamento(p.pagamentos, p.conciliadoValor, p.pixConciliadoValor, p.valorTotal)
    return status === 'pendente' || status === 'parcial'
  }).length

  return { semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }
}
```

- [ ] **Step 3: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/dashboard.ts
git commit -m "feat: query getPendenciasConciliacaoLoja para o card do aux_adm"
```

---

### Task 2: Componente `PendenciasLojaCard`

**Files:**
- Create: `src/app/(dashboard)/dashboard/components/pendencias-loja-card.tsx`

**Interfaces:**
- Consumes: nenhuma dependência de código além de `next/link` e `lucide-react` (já usados no projeto, ver `src/app/(dashboard)/vendas/components/aprovacoes-pendentes-panel.tsx` para o mesmo padrão visual).
- Produces: `PendenciasLojaCard({ semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }: { semNotaFiscal: number; vendasPendentes: number; osPendentes: number; pecasPendentes: number })` — usado pela Task 3.

- [ ] **Step 1: Criar o componente**

```tsx
// src/app/(dashboard)/dashboard/components/pendencias-loja-card.tsx
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

type Props = {
  semNotaFiscal: number
  vendasPendentes: number
  osPendentes: number
  pecasPendentes: number
}

export function PendenciasLojaCard({ semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }: Props) {
  const itens = [
    {
      count: semNotaFiscal,
      href: '/vendas',
      label: `${semNotaFiscal} venda${semNotaFiscal !== 1 ? 's' : ''} sem nota fiscal`,
    },
    {
      count: vendasPendentes,
      href: '/vendas',
      label: `${vendasPendentes} venda${vendasPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
    {
      count: osPendentes,
      href: '/ordens-servico',
      label: `${osPendentes} serviço${osPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
    {
      count: pecasPendentes,
      href: '/pecas',
      label: `${pecasPendentes} peça${pecasPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
  ].filter(item => item.count > 0)

  if (itens.length === 0) return null

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
      <h2 className="font-semibold text-sm text-amber-800 flex items-center gap-1.5">
        <AlertTriangle size={15} className="text-amber-600" />
        Pendências da loja (últimos 30 dias)
      </h2>
      <ul className="space-y-1">
        {itens.map(item => (
          <li key={item.href + item.label}>
            <Link href={item.href} className="text-sm text-amber-800 hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/components/pendencias-loja-card.tsx"
git commit -m "feat: componente PendenciasLojaCard"
```

---

### Task 3: Integrar no Dashboard

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getPendenciasConciliacaoLoja(lojaId: string, desde: Date)` (Task 1), `PendenciasLojaCard` (Task 2), `SectionErrorBoundary` (já existe em `src/app/(dashboard)/dashboard/section-error-boundary.tsx`).

- [ ] **Step 1: Importar a query e o componente**

Em `src/app/(dashboard)/dashboard/page.tsx`, linha 13, trocar:

```ts
import {
  getKPIs, getVendasPorDia, getEstoquePorLoja, getSaldoCaixaPorLoja,
  getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento,
  getOsAbertas, getMotoMaisVendida, getFaturamentoOS,
  getRankingVendedores, getRankingLojas, getModelosMaisVendidos,
} from '@/lib/queries/dashboard'
```

por:

```ts
import {
  getKPIs, getVendasPorDia, getEstoquePorLoja, getSaldoCaixaPorLoja,
  getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento,
  getOsAbertas, getMotoMaisVendida, getFaturamentoOS,
  getRankingVendedores, getRankingLojas, getModelosMaisVendidos,
  getPendenciasConciliacaoLoja,
} from '@/lib/queries/dashboard'
```

Na linha 15 (`import { DashboardFiltros } from './components/dashboard-filtros'`), adicionar logo abaixo:

```ts
import { PendenciasLojaCard } from './components/pendencias-loja-card'
```

- [ ] **Step 2: Adicionar a seção async `PendenciasSection`**

Logo após o fechamento da função `KpiSection` (depois da chave `}` que fecha essa função, antes de `async function GraficosSection`), adicionar:

```tsx
async function PendenciasSection({ lojaId }: { lojaId: string }) {
  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const pendencias = await getPendenciasConciliacaoLoja(lojaId, desde)
  return <PendenciasLojaCard {...pendencias} />
}
```

- [ ] **Step 3: Calcular `isAuxAdm` e renderizar a seção**

Dentro de `DashboardPage`, logo após a linha `const isVendedor = usuario.papel === 'vendedor'`, adicionar:

```ts
  const isAuxAdm = usuario.papel === 'aux_adm'
```

No JSX, logo depois do bloco `<div className="flex flex-col sm:flex-row ...">...</div>` (o cabeçalho com título e `DashboardFiltros`) e antes do `<SectionErrorBoundary key={`kpi-${filtroKey}`} ...>`, adicionar:

```tsx
      {isAuxAdm && usuario.lojaId && (
        <SectionErrorBoundary label="as pendências da loja">
          <Suspense fallback={null}>
            <PendenciasSection lojaId={usuario.lojaId} />
          </Suspense>
        </SectionErrorBoundary>
      )}
```

- [ ] **Step 4: Verificar tipos e build**

Rodar: `npm run type-check`
Esperado: sem erros.

Rodar: `npm run build`
Esperado: build conclui sem erros.

- [ ] **Step 5: Validação manual**

1. No banco (via Supabase Studio, `db:studio`, ou tela Admin > Usuários), confirmar o `lojaId` de um usuário `aux_adm` de teste e identificar/gerar pelo menos: uma venda de moto sem `nota_fiscal_saida`, uma venda de moto com pagamento em cartão/pix não conciliado, uma OS paga em cartão/pix não conciliada, e uma venda de peça com pagamento em cartão/pix não conciliado — todas com `data_venda`/`data_abertura` dentro dos últimos 30 dias e na loja desse usuário.
2. Logar como esse `aux_adm` e abrir `/dashboard`.
3. Confirmar que o card "Pendências da loja (últimos 30 dias)" aparece acima dos KPIs, com uma linha por categoria e a contagem batendo com o que aparece em `/vendas`, `/ordens-servico` e `/pecas`.
4. Clicar em cada link do card e confirmar que leva para a tela correta (`/vendas`, `/ordens-servico`, `/pecas`).
5. Resolver uma das pendências (ex: preencher a NF de saída de uma venda) e recarregar `/dashboard` — confirmar que o número daquela categoria caiu.
6. Logar como `admin_geral`, `admin_socio` ou `vendedor` e confirmar que o card não aparece.
7. Logar como um `aux_adm` de uma loja sem nenhuma pendência nos últimos 30 dias e confirmar que o card não aparece.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: card de pendências de conciliação da loja no dashboard do aux_adm"
```

---

## Self-Review

- **Cobertura da spec:** "Consulta de dados" → Task 1. "Componente" → Task 2. "Integração no Dashboard" → Task 3 (gate por `aux_adm` + `lojaId`, janela de 30 dias, seção própria com `Suspense`/`SectionErrorBoundary`). "Teste" da spec → Step 5 da Task 3.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
- **Consistência de tipos:** `getPendenciasConciliacaoLoja` retorna `{ semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }` (Task 1) — mesmos 4 campos usados como props de `PendenciasLojaCard` (Task 2) e espalhados via `{...pendencias}` em `PendenciasSection` (Task 3). Nomes batem em todas as três tasks.
