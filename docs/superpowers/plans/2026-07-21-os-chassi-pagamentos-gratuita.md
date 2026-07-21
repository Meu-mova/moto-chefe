# OS: chassi na impressão, pagamentos múltiplos e OS gratuita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No módulo de Ordem de Serviço (OS): imprimir o chassi de veículos externos, suportar múltiplas formas de pagamento por OS (igual venda de moto, com conciliação individual por forma) e permitir fechar uma OS gratuita (R$0,00) sem exigir forma de pagamento.

**Architecture:** Reaproveita a infraestrutura de pagamento múltiplo já existente em vendas de moto (`calcStatusMultiPagamento`, coluna `pagamentos` jsonb, tabelas `conciliacoes_cartao`/`pix_recebimentos_mcp`) em vez de duplicar lógica. `ordensServico.pagamentos` passa a ser gravado como array completo (hoje só grava 1 item quando é cartão). Uma função nova, `pagamentosEfetivosOS`, sintetiza um array de 1 item a partir do `formaPagamento` legado para OS antigas que nunca tiveram o array populado, preservando o status de conciliação de dados existentes.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, PostgreSQL (Supabase), Tailwind.

## Global Constraints

- Projeto não tem suite de testes automatizada — verificação é `npm run type-check` (+ `npm run build` na última task) e validação manual, seguindo o padrão do resto do repositório.
- Não usar componentes `Select`/`SelectContent` do `@/components/ui/select` (base-ui) no painel de pagamento da OS — manter `<select>` HTML nativo, igual ao arquivo atual (`os-pagamento-panel.tsx`), pra não herdar comportamento de Radix/base-ui nesse formulário.
- Não alterar `vendas/actions.ts`, o fluxo de venda de moto, nem a abertura de OS (`abrirOSAction`) — fora de escopo (ver spec).
- Conforme spec `docs/superpowers/specs/2026-07-21-os-chassi-pagamentos-gratuita-design.md`.

---

### Task 1: Expor `chassiOs` e `pagamentos` nas queries de OS

**Files:**
- Modify: `src/lib/queries/ordens-servico.ts`

**Interfaces:**
- Produces: `OSComDetalhes` (tipo inferido de `buildSelect`) passa a incluir `chassiOs: string | null` e `pagamentos: { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[] | null` — usado pelas Tasks 2, 3 e 7.

- [ ] **Step 1: Adicionar os dois campos no `buildSelect`**

Em `src/lib/queries/ordens-servico.ts`, dentro da função `buildSelect` (por volta da linha 27), trocar:

```ts
    formaPagamento:      ordensServico.formaPagamento,
    conciliadoValor:     sql<number>`COALESCE((
```

por:

```ts
    formaPagamento:      ordensServico.formaPagamento,
    pagamentos:          ordensServico.pagamentos,
    conciliadoValor:     sql<number>`COALESCE((
```

E, na mesma função, logo abaixo do campo `clienteId` (por volta da linha 55), trocar:

```ts
    clienteId:           ordensServico.clienteId,
    chassi:              motos.chassi,
```

por:

```ts
    clienteId:           ordensServico.clienteId,
    chassiOs:            ordensServico.chassiOs,
    chassi:              motos.chassi,
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/ordens-servico.ts
git commit -m "feat: expõe chassiOs e pagamentos nas queries de OS"
```

---

### Task 2: Chassi de veículo externo na impressão da OS

**Files:**
- Modify: `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx`

**Interfaces:**
- Consumes: `os.chassiOs` (Task 1).

- [ ] **Step 1: Usar `chassiOs` como fallback do chassi na impressão**

Em `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx`, linha 113, trocar:

```tsx
          {os.chassi && (
            <div className="f">
              <span className="fl">Chassi</span>
              <span className="fv" style={{ fontFamily: 'monospace' }}>{os.chassi}</span>
            </div>
          )}
```

por:

```tsx
          {(os.chassi ?? os.chassiOs) && (
            <div className="f">
              <span className="fl">Chassi</span>
              <span className="fv" style={{ fontFamily: 'monospace' }}>{os.chassi ?? os.chassiOs}</span>
            </div>
          )}
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 3: Validação manual**

1. Abrir uma OS existente vinculada a uma moto do estoque (tem `chassi` via `motos`) em `/ordens-servico/<id>/imprimir` e confirmar que o chassi aparece (comportamento já existia, não deve quebrar).
2. Abrir uma OS de veículo externo (aberta com "Buscar por chassi" sem encontrar moto no estoque, preenchendo o chassi manualmente) e confirmar que agora o chassi também aparece na impressão. Se não houver nenhuma OS assim, criar uma de teste em `/ordens-servico` (abrir OS → buscar por chassi que não existe no estoque → preencher marca/modelo/chassi manualmente).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(print)/ordens-servico/[id]/imprimir/page.tsx"
git commit -m "fix: imprime chassi de veiculo externo na OS"
```

---

### Task 3: Corrigir cálculo de conciliação e migrar leituras de OS para multi-pagamento

**Files:**
- Modify: `src/lib/conciliacao-status.ts`
- Modify: `src/lib/queries/dashboard.ts`
- Modify: `src/app/(dashboard)/ordens-servico/page.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/components/os-card.tsx`

**Interfaces:**
- Produces:
  - `PgtoOS = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }` (tipo exportado) — usado pelas Tasks 4, 5, 6, 7.
  - `pagamentosEfetivosOS(formaPagamento: string | null, pagamentos: unknown, valorTotal: string | null): PgtoOS[]` — usado pelas Tasks 6 e 7.
  - `calcStatusMultiPagamento(...)` passa a retornar `'conciliada'` direto quando `valorTotal < 0.01`, para qualquer forma.
- Remove: `calcStatusPagamentoUnicoOS` (nenhum outro arquivo do repo usa essa função fora dos 3 listados aqui).

- [ ] **Step 1: Corrigir `calcStatusMultiPagamento` e adicionar `pagamentosEfetivosOS`, remover `calcStatusPagamentoUnicoOS`**

Substituir o conteúdo de `src/lib/conciliacao-status.ts` inteiro por:

```ts
export type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

export type PgtoOS = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }

type PgtoItem = { tipo: string; valor: number }

// Vendas, peças e OS: pagamento pode ter múltiplos itens (carrinho com pix + cartão +
// dinheiro, etc.). Reaproveitada pelas três telas — não duplicar essa lógica.
export function calcStatusMultiPagamento(
  pagamentos: unknown,
  conciliadoValor: number,
  pixConciliadoValor: number,
  valorTotal: string,
): StatusConc {
  // Venda/OS/peça de valor zero (ex.: OS gratuita) não tem nada a conciliar,
  // independente da forma de pagamento lançada.
  if (Number(valorTotal) < 0.01) return 'conciliada'

  const pgtos = (pagamentos ?? []) as PgtoItem[]
  if (pgtos.length === 0) return 'na'

  const totalCartao = pgtos.filter(p => TIPOS_CARTAO.has(p.tipo)).reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalPix     = pgtos.filter(p => p.tipo === 'pix').reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)

  if (totalLancado < Number(valorTotal) - 0.05) return 'parcial'

  const totalNecessario = totalCartao + totalPix
  if (totalNecessario < 0.01) return 'conciliada' // só dinheiro/financiamento/cortesia

  const conciliado = (Number(conciliadoValor) || 0) + (Number(pixConciliadoValor) || 0)
  if (conciliado < 0.01) return 'pendente'
  if (conciliado >= totalNecessario - 0.05) return 'conciliada'
  return 'parcial'
}

const LABEL_PARA_TIPO_OS: Record<string, string> = {
  'PIX':                  'pix',
  'Dinheiro':             'dinheiro',
  'Cartão de Crédito':    'cartao_credito',
  'Cartão de Débito':     'cartao_debito',
  'Transferência':        'transferencia',
  'Cortesia / Garantia':  'cortesia',
  'Gratuita':             'gratuita',
}

// OS abertas antes do pagamento multi-forma só gravavam o array `pagamentos` quando a
// forma era cartão — PIX/Dinheiro/Transferência/Cortesia ficavam só em `formaPagamento`
// (texto). Sintetiza um array de 1 item nesses casos pra reaproveitar
// calcStatusMultiPagamento sem perder o histórico de conciliação dessas OS.
export function pagamentosEfetivosOS(
  formaPagamento: string | null,
  pagamentos: unknown,
  valorTotal: string | null,
): PgtoOS[] {
  const arr = (pagamentos ?? []) as PgtoOS[]
  if (arr.length > 0) return arr
  if (!formaPagamento) return []
  const tipo = LABEL_PARA_TIPO_OS[formaPagamento] ?? formaPagamento.toLowerCase()
  return [{ tipo, valor: Number(valorTotal) || 0 }]
}
```

- [ ] **Step 2: Migrar `getPendenciasConciliacaoLoja` em `src/lib/queries/dashboard.ts`**

Trocar o import (linha 5):

```ts
import { calcStatusMultiPagamento, calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'
```

por:

```ts
import { calcStatusMultiPagamento, pagamentosEfetivosOS } from '@/lib/conciliacao-status'
```

No select de OS dentro de `getPendenciasConciliacaoLoja` (por volta da linha 477), trocar:

```ts
      .select({
        formaPagamento: ordensServico.formaPagamento,
        valorTotal: ordensServico.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
```

por:

```ts
      .select({
        formaPagamento: ordensServico.formaPagamento,
        pagamentos: ordensServico.pagamentos,
        valorTotal: ordensServico.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
```

E o filtro que usa o status (por volta da linha 521), trocar:

```ts
  const osPendentes = osRows.filter(o => {
    const status = calcStatusPagamentoUnicoOS(o.formaPagamento, o.valorTotal, o.conciliadoValor, o.pixConciliadoValor)
    return status === 'pendente' || status === 'parcial'
  }).length
```

por:

```ts
  const osPendentes = osRows.filter(o => {
    const pagamentos = pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal)
    const status = calcStatusMultiPagamento(pagamentos, o.conciliadoValor, o.pixConciliadoValor, o.valorTotal ?? '0')
    return status === 'pendente' || status === 'parcial'
  }).length
```

- [ ] **Step 3: Migrar `src/app/(dashboard)/ordens-servico/page.tsx`**

Trocar o import (linha 10):

```ts
import { calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'
```

por:

```ts
import { calcStatusMultiPagamento, pagamentosEfetivosOS } from '@/lib/conciliacao-status'
```

E o cálculo de `concStats` (linha 62), trocar:

```ts
      const status = calcStatusPagamentoUnicoOS(o.formaPagamento, o.valorTotal, o.conciliadoValor as number, o.pixConciliadoValor as number)
```

por:

```ts
      const pagamentos = pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal)
      const status = calcStatusMultiPagamento(pagamentos, o.conciliadoValor as number, o.pixConciliadoValor as number, o.valorTotal ?? '0')
```

- [ ] **Step 4: Migrar `src/app/(dashboard)/ordens-servico/components/os-card.tsx`**

Trocar o import (linha 9):

```ts
import { calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'
```

por:

```ts
import { calcStatusMultiPagamento, pagamentosEfetivosOS } from '@/lib/conciliacao-status'
```

E o cálculo de `statusConc` (linha 33), trocar:

```ts
  const statusConc = calcStatusPagamentoUnicoOS(
    os.formaPagamento,
    os.valorTotal,
    os.conciliadoValor as number,
    os.pixConciliadoValor as number,
  )
```

por:

```ts
  const statusConc = calcStatusMultiPagamento(
    pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal),
    os.conciliadoValor as number,
    os.pixConciliadoValor as number,
    os.valorTotal ?? '0',
  )
```

- [ ] **Step 5: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros. Isso confirma que nenhum outro arquivo do repo ainda referencia `calcStatusPagamentoUnicoOS` (a função foi removida no Step 1).

- [ ] **Step 6: Commit**

```bash
git add src/lib/conciliacao-status.ts src/lib/queries/dashboard.ts "src/app/(dashboard)/ordens-servico/page.tsx" "src/app/(dashboard)/ordens-servico/components/os-card.tsx"
git commit -m "fix: OS de valor zero conciliada direto e leitura de status migrada para multi-pagamento"
```

---

### Task 4: Pagamento múltiplo e OS gratuita em `ordens-servico/actions.ts`

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/actions.ts`

**Interfaces:**
- Consumes: `PgtoOS` (Task 3, de `@/lib/conciliacao-status`).
- Produces:
  - `DadosPagamentoOS = { valorTotal: number; pagamentos: PgtoOS[] }` — usado pela Task 5 e por `src/app/(dashboard)/vendas/actions.ts` (já importa esse tipo, sem mudança necessária lá — o objeto persistido em `aprovacoesVenda.dadosVenda` já vai ter o novo formato).
  - `aplicarPagamentoOS(osId: string, dados: DadosPagamentoOS): Promise<void>`.
  - `registrarPagamentoOSAction(osId: string, dados: DadosPagamentoOS): Promise<{ aguardandoAprovacao: boolean }>` — usado pela Task 5. Valida somatório contra `valorTotal` (com folga de R$0,01); se `valorTotal < 0.01`, exige `pagamentos: []` (OS gratuita).

- [ ] **Step 1: Trocar os tipos e a lógica de pagamento**

Em `src/app/(dashboard)/ordens-servico/actions.ts`, trocar o bloco inteiro entre a declaração de `TIPO_CARTAO_OS` (linha 153) e o fim de `registrarPagamentoOSAction` (linha 231) — ou seja, substituir:

```ts
const TIPO_CARTAO_OS: Record<string, string> = {
  'Cartão de Crédito': 'cartao_credito',
  'Cartão de Débito':  'cartao_debito',
}

// 'Transferência' precisa da mesma aprovação exigida em venda de moto — só quem tem
// podeAprovarPagamentoSensivel vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_OS = new Set(['Transferência'])

export type DadosPagamentoOS = {
  valorTotal: number
  formaPagamento: string
  operadora?: string
  parcelas?: number
  autorizacao?: string
}

// Aplica o pagamento de fato na OS — sem checagem de permissão/sensibilidade, usada
// tanto pelo fechamento direto quanto pela aprovação de pagamento sensível.
export async function aplicarPagamentoOS(osId: string, dados: DadosPagamentoOS) {
  const [osAtual] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  const tipoCartao = TIPO_CARTAO_OS[dados.formaPagamento]
  const pagamentos = tipoCartao
    ? [{
        tipo:  tipoCartao,
        valor: dados.valorTotal,
        ...(dados.operadora   ? { operadora: dados.operadora }     : {}),
        ...(dados.parcelas    ? { parcelas: dados.parcelas }       : {}),
        ...(dados.autorizacao ? { autorizacao: dados.autorizacao } : {}),
      }]
    : null

  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
    pagamentos,
    ...(osAtual?.status === 'pendente_pagamento'
      ? { status: 'concluida' as any, dataConclusao: new Date() }
      : {}),
  }).where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function registrarPagamentoOSAction(osId: string, dados: DadosPagamentoOS) {
  const { usuario } = await verificarAcessoOS(osId, GESTORES)

  if (TIPOS_PAGAMENTO_SENSIVEL_OS.has(dados.formaPagamento) && !podeAprovarPagamentoSensivel(usuario)) {
    const [os] = await db
      .select({ lojaId: ordensServico.lojaId, numero: ordensServico.numero })
      .from(ordensServico)
      .where(eq(ordensServico.id, osId))
      .limit(1)
    if (!os) throw new Error('OS não encontrada')

    await db.insert(aprovacoesVenda).values({
      origem: 'os',
      osId,
      lojaId: os.lojaId,
      vendedorId: usuario.id,
      valor: String(dados.valorTotal),
      dadosVenda: dados,
      motivo: `Pagamento via Transferência Bancária — OS #${os.numero ?? '—'}`,
      tipo: 'pagamento_sensivel',
      status: 'pendente',
    })
    revalidatePath('/ordens-servico')
    revalidatePath(`/ordens-servico/${osId}`)
    return { aguardandoAprovacao: true }
  }

  await aplicarPagamentoOS(osId, dados)
  return { aguardandoAprovacao: false }
}
```

por:

```ts
// 'transferencia' precisa da mesma aprovação exigida em venda de moto — só quem tem
// podeAprovarPagamentoSensivel vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_OS = new Set(['transferencia'])

export type DadosPagamentoOS = {
  valorTotal: number
  pagamentos: PgtoOS[]
}

// Aplica o pagamento de fato na OS — sem checagem de permissão/sensibilidade, usada
// tanto pelo fechamento direto quanto pela aprovação de pagamento sensível.
export async function aplicarPagamentoOS(osId: string, dados: DadosPagamentoOS) {
  const [osAtual] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.pagamentos[0]?.tipo ?? (dados.valorTotal < 0.01 ? 'Gratuita' : null),
    pagamentos:     dados.pagamentos.length > 0 ? dados.pagamentos : null,
    ...(osAtual?.status === 'pendente_pagamento'
      ? { status: 'concluida' as any, dataConclusao: new Date() }
      : {}),
  }).where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function registrarPagamentoOSAction(osId: string, dados: DadosPagamentoOS) {
  const { usuario } = await verificarAcessoOS(osId, GESTORES)

  const somatorio = dados.pagamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0)
  if (dados.valorTotal >= 0.01 && Math.abs(somatorio - dados.valorTotal) > 0.01) {
    throw new Error('A soma dos pagamentos precisa bater com o valor total da OS')
  }
  if (dados.valorTotal < 0.01 && dados.pagamentos.length > 0) {
    throw new Error('OS gratuita não deve ter formas de pagamento lançadas')
  }

  if (dados.pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL_OS.has(p.tipo)) && !podeAprovarPagamentoSensivel(usuario)) {
    const [os] = await db
      .select({ lojaId: ordensServico.lojaId, numero: ordensServico.numero })
      .from(ordensServico)
      .where(eq(ordensServico.id, osId))
      .limit(1)
    if (!os) throw new Error('OS não encontrada')

    await db.insert(aprovacoesVenda).values({
      origem: 'os',
      osId,
      lojaId: os.lojaId,
      vendedorId: usuario.id,
      valor: String(dados.valorTotal),
      dadosVenda: dados,
      motivo: `Pagamento via Transferência Bancária — OS #${os.numero ?? '—'}`,
      tipo: 'pagamento_sensivel',
      status: 'pendente',
    })
    revalidatePath('/ordens-servico')
    revalidatePath(`/ordens-servico/${osId}`)
    return { aguardandoAprovacao: true }
  }

  await aplicarPagamentoOS(osId, dados)
  return { aguardandoAprovacao: false }
}
```

- [ ] **Step 2: Importar `PgtoOS`**

No topo de `src/app/(dashboard)/ordens-servico/actions.ts` (linha 7, logo após o import de `podeAprovarPagamentoSensivel`), adicionar:

```ts
import type { PgtoOS } from '@/lib/conciliacao-status'
```

- [ ] **Step 3: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/actions.ts"
git commit -m "feat: OS aceita array de pagamentos e libera fechamento gratuito sem forma de pagamento"
```

---

### Task 5: `OSPagamentoPanel` — lista de pagamentos e botão de OS gratuita

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/components/os-pagamento-panel.tsx`

**Interfaces:**
- Consumes: `registrarPagamentoOSAction(osId: string, dados: { valorTotal: number; pagamentos: PgtoOS[] }): Promise<{ aguardandoAprovacao: boolean }>` (Task 4).
- Produces: `OSPagamentoPanel({ osId, valorTotal, pagamentosIniciais, jaPago, aprovacaoPendente }: Props)` — usado pela Task 7. `pagamentosIniciais` já vem resolvido (via `pagamentosEfetivosOS`) pela página que renderiza o componente.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-react'
import { registrarPagamentoOSAction } from '../../actions'
import type { PgtoOS } from '@/lib/conciliacao-status'
import { toast } from 'sonner'

const FORMAS = [
  { value: 'pix',             label: 'PIX' },
  { value: 'dinheiro',        label: 'Dinheiro' },
  { value: 'cartao_credito',  label: 'Cartão de Crédito' },
  { value: 'cartao_debito',   label: 'Cartão de Débito' },
  { value: 'transferencia',   label: 'Transferência' },
  { value: 'cortesia',        label: 'Cortesia / Garantia' },
]
const FORMAS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone',       label: 'Stone' },
  { value: 'pagueveloz',  label: 'PaguéVeloz' },
  { value: 'cielo',       label: 'Cielo' },
  { value: 'getnet',      label: 'GetNet' },
  { value: 'redecard',    label: 'Redecard' },
]

type Linha = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string }

type Props = {
  osId: string
  valorTotal: number
  pagamentosIniciais: PgtoOS[]
  jaPago: boolean
  aprovacaoPendente?: boolean
}

function linhasIniciais(pagamentos: PgtoOS[], valorTotal: number): Linha[] {
  if (pagamentos.length > 0) {
    return pagamentos.map((p, i) => ({
      id: String(i),
      tipo: p.tipo,
      valor: String(p.valor),
      operadora: p.operadora,
      parcelas: p.parcelas != null ? String(p.parcelas) : undefined,
      autorizacao: p.autorizacao,
    }))
  }
  return [{ id: '1', tipo: '', valor: valorTotal > 0 ? valorTotal.toFixed(2) : '' }]
}

export function OSPagamentoPanel({ osId, valorTotal, pagamentosIniciais, jaPago, aprovacaoPendente }: Props) {
  const [pending, start] = useTransition()
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(pagamentosIniciais, valorTotal))

  const addLinha = () => setLinhas(l => [...l, { id: Date.now().toString(), tipo: '', valor: '' }])
  const removeLinha = (id: string) => setLinhas(l => l.filter(x => x.id !== id))
  const updateLinha = (id: string, campo: keyof Linha, val: string) =>
    setLinhas(l => l.map(x => x.id === id ? { ...x, [campo]: val } : x))

  const somatorio = linhas.reduce((a, l) => a + (parseFloat(l.valor) || 0), 0)
  const somatorioOk = Math.abs(somatorio - valorTotal) < 0.01
  const linhasCompletas = linhas.every(l => l.tipo && l.valor)

  function salvar() {
    if (!linhasCompletas) { toast.error('Preencha forma e valor de todas as linhas'); return }
    if (!somatorioOk) { toast.error('A soma dos pagamentos precisa bater com o valor total'); return }
    start(async () => {
      try {
        const resultado = await registrarPagamentoOSAction(osId, {
          valorTotal,
          pagamentos: linhas.map(l => ({
            tipo: l.tipo,
            valor: parseFloat(l.valor),
            ...(FORMAS_CARTAO.has(l.tipo) && l.operadora   ? { operadora: l.operadora }                     : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.parcelas    ? { parcelas: parseInt(l.parcelas, 10) }         : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.autorizacao?.trim() ? { autorizacao: l.autorizacao.trim().toUpperCase() } : {}),
          })),
        })
        toast.success(resultado.aguardandoAprovacao
          ? 'Pagamento por transferência enviado para aprovação'
          : 'Pagamento registrado')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function concluirGratuita() {
    start(async () => {
      try {
        await registrarPagamentoOSAction(osId, { valorTotal: 0, pagamentos: [] })
        toast.success('OS concluída como gratuita')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  if (valorTotal < 0.01) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jaPago ? (
            <p className="text-sm text-green-600">✓ OS gratuita — sem pendência de pagamento.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">Esta OS não tem cobrança (R$ 0,00).</p>
              <Button size="sm" onClick={concluirGratuita} disabled={pending} className="w-full">
                {pending ? 'Concluindo…' : 'Concluir OS gratuita'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aprovacaoPendente && (
          <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
            Pagamento por transferência bancária enviado para aprovação — a OS só fica marcada como paga quando for aprovado.
          </p>
        )}

        {linhas.map(l => (
          <div key={l.id} className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <div className="flex gap-2 items-center">
              <select value={l.tipo} onChange={e => updateLinha(l.id, 'tipo', e.target.value)}
                className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <CurrencyInput className="w-28" placeholder="0,00" value={l.valor} onChange={v => updateLinha(l.id, 'valor', v)} />
              {linhas.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeLinha(l.id)}>
                  <X size={14} />
                </Button>
              )}
            </div>

            {FORMAS_CARTAO.has(l.tipo) && (
              <div className="grid grid-cols-2 gap-2">
                <select value={l.operadora ?? ''} onChange={e => updateLinha(l.id, 'operadora', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Operadora...</option>
                  {OPERADORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={l.parcelas ?? ''} onChange={e => updateLinha(l.id, 'parcelas', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Parcelas...</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            )}
            {FORMAS_CARTAO.has(l.tipo) && (
              <Input
                value={l.autorizacao ?? ''}
                onChange={e => updateLinha(l.id, 'autorizacao', e.target.value)}
                placeholder="Autorização (impresso no comprovante) — opcional"
              />
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" className="gap-1 w-full" onClick={addLinha}>
          <Plus size={14} /> Adicionar forma de pagamento
        </Button>

        <div className={`text-xs px-3 py-2 rounded-md border font-medium ${
          somatorioOk ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          Soma: {somatorio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          {' '}/ Total: {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>

        <Button size="sm" onClick={salvar} disabled={pending || !somatorioOk || !linhasCompletas} className="w-full">
          {pending ? 'Salvando…' : jaPago ? 'Atualizar pagamento' : 'Registrar pagamento'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: erros esperados apenas em `src/app/(dashboard)/ordens-servico/[id]/page.tsx` (props antigas de `OSPagamentoPanel`) — corrigido na Task 7. Confirmar que não há erro dentro do próprio `os-pagamento-panel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/components/os-pagamento-panel.tsx"
git commit -m "feat: painel de pagamento da OS aceita multiplas formas e fecha OS gratuita"
```

---

### Task 6: `OSConciliacaoPanel` — uma seção por forma presente

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/components/os-conciliacao-panel.tsx`

**Interfaces:**
- Consumes: `PgtoOS` (Task 3).
- Produces: `OSConciliacaoPanel({ osId, osNumero, pagamentos, isAdmin }: Props)` — usado pela Task 7. Renderiza uma linha "Cartão" se `pagamentos` tiver alguma linha `cartao_credito`/`cartao_debito`, e uma linha "PIX" se tiver alguma linha `pix`; `null` se nenhuma das duas.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Search, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buscarConciliacoesDaOS,
  buscarPixDaOS,
  buscarConciliacoesPorValor,
  vincularVendaAction,
} from '../../../conciliacao/actions'
import type { PgtoOS } from '@/lib/conciliacao-status'

type Conc      = Awaited<ReturnType<typeof buscarConciliacoesDaOS>>[number]
type PixRec    = Awaited<ReturnType<typeof buscarPixDaOS>>[number]
type Candidato = Awaited<ReturnType<typeof buscarConciliacoesPorValor>>[number]

type Props = { osId: string; osNumero: number | null; pagamentos: PgtoOS[]; isAdmin: boolean }

const FORMAS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
  cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
}
const fmt = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OSConciliacaoPanel({ osId, osNumero, pagamentos, isAdmin }: Props) {
  const valorCartao = pagamentos.filter(p => FORMAS_CARTAO.has(p.tipo)).reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const valorPix     = pagamentos.filter(p => p.tipo === 'pix').reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const ehCartao = valorCartao > 0.009
  const ehPix    = valorPix > 0.009

  const [loading, setLoading]         = useState(true)
  const [concs, setConcs]             = useState<Conc[]>([])
  const [pixRecs, setPixRecs]         = useState<PixRec[]>([])
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [candidatos, setCandidatos]   = useState<Candidato[]>([])
  const [vinculando, setVinculando]   = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [c, px] = await Promise.all([
        ehCartao ? buscarConciliacoesDaOS(osId) : Promise.resolve([]),
        ehPix    ? buscarPixDaOS(osId)          : Promise.resolve([]),
      ])
      setConcs(c)
      setPixRecs(px)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ehCartao || ehPix) carregar()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osId])

  if (!ehCartao && !ehPix) return null // dinheiro/transferência/cortesia/gratuita — não precisa conciliar

  const cartaoConciliado = concs.length > 0
  const pixConciliado    = pixRecs.length > 0

  async function buscarCandidatos() {
    const abrir = !buscaAberta
    setBuscaAberta(abrir)
    if (!abrir) return
    setBuscaLoading(true)
    try {
      setCandidatos(await buscarConciliacoesPorValor(valorCartao))
    } finally {
      setBuscaLoading(false)
    }
  }

  async function vincular(conciliacaoId: string) {
    setVinculando(true)
    try {
      await vincularVendaAction(conciliacaoId, osId, 'os')
      await carregar()
      setBuscaAberta(false)
      setCandidatos([])
      toast.success('Pagamento conciliado')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Conciliação</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {ehCartao && (
          <div className={`flex justify-between items-center rounded px-3 py-2 ${
            loading ? 'bg-slate-50' : cartaoConciliado ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {loading
                ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
                : cartaoConciliado
                  ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                  : <Clock size={13} className="text-red-400 shrink-0" />}
              <span className={cartaoConciliado ? 'text-green-800' : 'text-red-700'}>
                Cartão{!loading && (cartaoConciliado ? ' — conciliado' : ' — pendente')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-medium tabular-nums">{fmt(valorCartao)}</span>
              {isAdmin && !cartaoConciliado && !loading && (
                <button
                  onClick={buscarCandidatos}
                  title="Buscar transação para conciliar"
                  className={`p-1 rounded transition-colors ${
                    buscaAberta ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <Search size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {ehPix && (
          <div className={`flex justify-between items-center rounded px-3 py-2 ${
            loading ? 'bg-slate-50' : pixConciliado ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {loading
                ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
                : pixConciliado
                  ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                  : <Clock size={13} className="text-red-400 shrink-0" />}
              <span className={pixConciliado ? 'text-green-800' : 'text-red-700'}>
                PIX{!loading && (pixConciliado ? ' — conciliado' : ' — pendente')}
              </span>
            </div>
            <span className="font-medium tabular-nums">{fmt(valorPix)}</span>
          </div>
        )}

        {ehPix && !pixConciliado && !loading && (
          <p className="text-xs text-slate-500">
            PIX conciliado à parte — vá em <Link href="/pix-mcp" className="text-blue-600 hover:underline">PIX</Link>, busque a OS #{osNumero ?? '—'} e lance a correspondência.
          </p>
        )}

        {buscaAberta && (
          <div className="border border-blue-100 rounded-lg bg-blue-50 p-2 space-y-1">
            <p className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
              <Search size={11} />
              Transações com valor próximo não vinculadas
            </p>

            {buscaLoading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 py-1">
                <Loader2 size={12} className="animate-spin" />
                Buscando…
              </div>
            )}

            {!buscaLoading && candidatos.length === 0 && (
              <p className="text-xs text-slate-500 py-1">
                Nenhuma transação encontrada com este valor. Importe o relatório da operadora no módulo de conciliação.
              </p>
            )}

            {!buscaLoading && candidatos.map(c => {
              const raw = c.rawData as { bandeira?: string; portador?: string } | null
              return (
                <button
                  key={c.id}
                  onClick={() => vincular(c.id)}
                  disabled={vinculando}
                  className="w-full text-left rounded px-2.5 py-2 bg-white border border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors text-xs disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-slate-800">
                        {OPERADORA_LABEL[c.operadora] ?? c.operadora}
                        {raw?.bandeira ? ` · ${raw.bandeira}` : ''}
                        {c.tipo === 'debito' ? ' (Débito)' : ' (Crédito)'}
                      </p>
                      {raw?.portador && (
                        <p className="text-slate-700 font-medium">
                          Portador: <span className="font-normal">{raw.portador}</span>
                        </p>
                      )}
                      <p className="text-slate-500">
                        {new Date(c.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {c.autorizacao ? ` · Aut. ${c.autorizacao}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">{fmt(c.valorBruto)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Rodar: `npm run type-check`
Esperado: erros esperados apenas em `src/app/(dashboard)/ordens-servico/[id]/page.tsx` (props antigas de `OSConciliacaoPanel`) — corrigido na Task 7.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/components/os-conciliacao-panel.tsx"
git commit -m "feat: painel de conciliacao da OS mostra cartao e pix separadamente"
```

---

### Task 7: Ligar tudo em `[id]/page.tsx`

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/page.tsx`

**Interfaces:**
- Consumes: `pagamentosEfetivosOS` (Task 3), `OSPagamentoPanel` (Task 5), `OSConciliacaoPanel` (Task 6).

- [ ] **Step 1: Importar `pagamentosEfetivosOS`**

Em `src/app/(dashboard)/ordens-servico/[id]/page.tsx`, linha 1, adicionar logo abaixo do import de `buscarOS, listarItensOS`:

```ts
import { pagamentosEfetivosOS } from '@/lib/conciliacao-status'
```

- [ ] **Step 2: Calcular o array de pagamentos efetivo**

Logo após a linha `const totalGeral = totalServicos + totalPecas` (linha 57), adicionar:

```ts
  const pagamentosOS = pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal)
```

- [ ] **Step 3: Atualizar as props de `OSPagamentoPanel` e `OSConciliacaoPanel`**

Trocar (linhas 177-194):

```tsx
      {podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status) && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          formaPagamento={os.formaPagamento ?? ''}
          aprovacaoPendente={aprovacaoPendente}
        />
      )}

      {podeFechar && os.status === 'concluida' && os.formaPagamento && (
        <OSConciliacaoPanel
          osId={id}
          osNumero={os.numero}
          formaPagamento={os.formaPagamento}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          isAdmin={podeFechar}
        />
      )}
```

por:

```tsx
      {podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status) && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          pagamentosIniciais={pagamentosOS}
          jaPago={os.status === 'concluida'}
          aprovacaoPendente={aprovacaoPendente}
        />
      )}

      {podeFechar && os.status === 'concluida' && pagamentosOS.length > 0 && (
        <OSConciliacaoPanel
          osId={id}
          osNumero={os.numero}
          pagamentos={pagamentosOS}
          isAdmin={podeFechar}
        />
      )}
```

- [ ] **Step 4: Verificar tipos e build**

Rodar: `npm run type-check`
Esperado: sem erros.

Rodar: `npm run build`
Esperado: build conclui sem erros.

- [ ] **Step 5: Validação manual**

1. Abrir uma OS de teste, avançar o status até `pendente_pagamento` (via `OSStatusBar` — precisa passar por `oficina`/`em_andamento`/`finalizada` primeiro, logado como `mecanico` para essas etapas e como `aux_adm`/admin para `pendente_pagamento`).
2. No painel de Pagamento, adicionar 2 linhas (ex.: PIX de metade do valor + Cartão de Crédito da outra metade), preencher operadora/parcelas do cartão, confirmar que o botão só habilita quando a soma bate com o total, e clicar em "Registrar pagamento". Confirmar que a OS vira "Concluída".
3. Confirmar que o painel de Conciliação mostra as duas linhas (Cartão e PIX) separadamente, cada uma como "pendente".
4. No módulo `/conciliacao`, importar (ou simular) uma transação de cartão com o mesmo valor e vincular à OS pela busca de candidatos — confirmar que a linha "Cartão" muda para "conciliado" e a linha "PIX" continua pendente.
5. Criar uma segunda OS de teste, adicionar um item de serviço, depois excluir o item (ou não adicionar nenhum) para o total ficar R$0,00, avançar até `pendente_pagamento`, e confirmar que aparece só o botão "Concluir OS gratuita" (sem formulário de forma de pagamento). Clicar e confirmar que a OS conclui direto, sem pendência de conciliação na listagem (`ConcBadge` não aparece / ou mostra nada, já que `'na'`/`'conciliada'` sem badge visível de pendência).
6. Abrir uma OS antiga (criada antes dessa mudança, com `formaPagamento` tipo `'PIX'` ou `'Dinheiro'` e sem array `pagamentos`) e confirmar que a listagem/card continuam mostrando o mesmo status de conciliação de antes (ex.: uma OS antiga em dinheiro continua "✓ OK", uma antiga em PIX pendente continua aparecendo como pendente).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/page.tsx"
git commit -m "feat: liga pagamento multiplo e OS gratuita na pagina de detalhe da OS"
```

---

### Task 8: Listar todas as formas de pagamento na impressão da OS

**Files:**
- Modify: `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx`

**Interfaces:**
- Consumes: `pagamentosEfetivosOS` (Task 3).

Depois da Task 4, `ordensServico.formaPagamento` passa a guardar só o tipo do **primeiro** pagamento (em código, ex. `'pix'`), e não mais um label pronto em português como antes (`'PIX'`). A impressão hoje usa `os.formaPagamento` direto (`src/app/(print)/ordens-servico/[id]/imprimir/page.tsx:222-227`), então uma OS paga com 2 formas (ex. PIX + Cartão) imprimiria só a primeira, com um código cru (`pix`) em vez de um label legível. Corrigir listando todas as linhas de `pagamentosOS`.

- [ ] **Step 1: Importar `pagamentosEfetivosOS` e calcular `pagamentosOS`**

Em `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx`, linha 2, adicionar logo abaixo do import de `buscarOS, listarItensOS`:

```ts
import { pagamentosEfetivosOS } from '@/lib/conciliacao-status'
```

Logo após a linha `const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })` (linha 37), adicionar:

```ts
  const pagamentosOS = pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal)
  const TIPO_LABEL: Record<string, string> = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito', transferencia: 'Transferência',
    cortesia: 'Cortesia / Garantia', gratuita: 'Gratuita',
  }
```

- [ ] **Step 2: Trocar a linha única de forma de pagamento por uma linha por pagamento**

Trocar (linhas 222-227):

```tsx
          {os.formaPagamento && (
            <tr>
              <td style={{ fontSize: 11, color: '#64748b' }}>Forma de pagamento</td>
              <td className="tr" style={{ fontSize: 11 }}>{os.formaPagamento}</td>
            </tr>
          )}
```

por:

```tsx
          {pagamentosOS.map((p, i) => (
            <tr key={i}>
              <td style={{ fontSize: 11, color: '#64748b' }}>
                {pagamentosOS.length > 1 ? `Pagamento ${i + 1}` : 'Forma de pagamento'}
              </td>
              <td className="tr" style={{ fontSize: 11 }}>
                {TIPO_LABEL[p.tipo] ?? p.tipo} — {fmtR(p.valor)}
              </td>
            </tr>
          ))}
```

- [ ] **Step 3: Verificar tipos**

Rodar: `npm run type-check`
Esperado: sem erros.

- [ ] **Step 4: Validação manual**

1. Imprimir a OS de teste com 2 formas de pagamento da Task 7 (Step 5.2-5.4) — confirmar que a impressão mostra "Pagamento 1: PIX — R$ X" e "Pagamento 2: Cartão de Crédito — R$ Y", não só a primeira.
2. Imprimir a OS gratuita da Task 7 (Step 5.5) — confirmar que aparece "Forma de pagamento: Gratuita — R$ 0,00".
3. Imprimir a OS antiga da Task 7 (Step 5.6, sem array `pagamentos`) — confirmar que ainda aparece "Forma de pagamento: <label> — R$ <valor>" corretamente (via `pagamentosEfetivosOS`), igual ao comportamento anterior.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(print)/ordens-servico/[id]/imprimir/page.tsx"
git commit -m "fix: impressao da OS lista todas as formas de pagamento"
```

---

## Self-Review

- **Cobertura da spec:** "1. Chassi na impressão" → Tasks 1-2. "2. Vários métodos de pagamento" → Tasks 1, 3, 4, 5, 6, 7, 8 (buildSelect, cálculo de status, action, painel de pagamento, painel de conciliação, integração na página de detalhe, impressão listando todas as formas). "3. OS gratuita" → Task 3 (fix do cálculo pra valor zero) + Task 4 (validação da action) + Task 5 (botão dedicado). Compatibilidade com OS antigas (`pagamentosEfetivosOS`) → Task 3, testada no Step 5.6 da Task 7 e no Step 4.3 da Task 8.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
- **Consistência de tipos:** `PgtoOS` definido uma única vez em `src/lib/conciliacao-status.ts` (Task 3) e reimportado (não redeclarado) em `ordens-servico/actions.ts` (Task 4), `os-pagamento-panel.tsx` (Task 5) e `os-conciliacao-panel.tsx` (Task 6). `DadosPagamentoOS = { valorTotal, pagamentos: PgtoOS[] }` (Task 4) é exatamente o que `OSPagamentoPanel.salvar()`/`concluirGratuita()` (Task 5) enviam para `registrarPagamentoOSAction`. `pagamentosEfetivosOS(...)` (Task 3) é usado com a mesma assinatura `(formaPagamento, pagamentos, valorTotal)` nos 4 pontos de leitura (Task 3), na Task 7 e na Task 8. Props `pagamentosIniciais`/`jaPago` (Task 5) e `pagamentos` (Task 6) batem com o que a Task 7 passa a partir de `pagamentosOS`. `TIPO_LABEL`/`LABEL_PARA_TIPO_OS` (Task 8/Task 3) usam as mesmas chaves de tipo (`pix`, `dinheiro`, `cartao_credito`, `cartao_debito`, `transferencia`, `cortesia`, `gratuita`) que `FORMAS` em `os-pagamento-panel.tsx` (Task 5) e `formaPagamento`/`TIPOS_PAGAMENTO_SENSIVEL_OS` em `actions.ts` (Task 4).
