# Custo e Lucro das Motos Vendidas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no módulo Financeiro quanto foi investido (custo de aquisição) nas motos vendidas no período, e o lucro resultante, tanto em cards de totais quanto por linha na tabela de vendas.

**Architecture:** Reaproveita o campo `motos.precoCompra` já existente. As queries `totaisVendas` e `vendasMes` de `financeiro/page.tsx` ganham `innerJoin` com `motos` (a segunda já fazia esse join) e colunas extras de custo. A UI ganha 2 cards agregados + um aviso condicional + 2 colunas na tabela de vendas.

**Tech Stack:** Next.js App Router (Server Component), Drizzle ORM, Postgres agregação com `FILTER`, shadcn/ui Table/Card.

## Global Constraints

- Custo de uma venda = `motos.precoCompra` da moto vendida — sem ratear despesas operacionais
- Moto sem `precoCompra` conta como custo `R$ 0,00`, mas gera aviso visível com a contagem de vendas afetadas
- Lucro Bruto = Receita Líquida (pós-taxa de cartão) − Custo Total, mesma base usada por linha na tabela
- Mesmos filtros de mês/loja já existentes na página — não introduzir filtros novos
- Não criar bloco agregado "por modelo" — a tabela de vendas já mostra o modelo por linha

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/app/(dashboard)/financeiro/page.tsx` | Modificar — queries de custo, cards, aviso |
| `src/app/(dashboard)/financeiro/components/vendas-table.tsx` | Modificar — colunas Custo e Lucro |

---

## Task 1: Queries e cards de Custo/Lucro no Financeiro

**Files:**
- Modify: `src/app/(dashboard)/financeiro/page.tsx`

**Interfaces:**
- Produces: variáveis `totalCusto: number`, `qtdSemCusto: number`, `lucroBruto: number` no escopo de `FinanceiroPage`, disponíveis para o JSX dos cards
- Produces: `vendasMes` (linhas retornadas da query) agora inclui `precoCompra: string | null` e `valorLiquido: string` por linha — consumido por `VendasTable` na Task 2

- [ ] **Step 1: Adicionar `motos` ao join e colunas de custo na query `totaisVendas`**

Em `src/app/(dashboard)/financeiro/page.tsx`, localizar o segundo item do array do `Promise.all` (a query `totaisVendas`, atualmente nas linhas 77-88):

```ts
    db
      .select({
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        qtdVendas: count(),
      })
      .from(vendas)
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      )),
```

Substituir por:

```ts
    db
      .select({
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        totalCusto: sql<string>`COALESCE(SUM(${motos.precoCompra}), '0')`,
        qtdSemCusto: sql<string>`COUNT(*) FILTER (WHERE ${motos.precoCompra} IS NULL)`,
        qtdVendas: count(),
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      )),
```

- [ ] **Step 2: Adicionar `precoCompra` e `valorLiquido` por linha na query `vendasMes`**

Localizar o primeiro item do `Promise.all` (query `vendasMes`, select nas linhas 51-64):

```ts
      .select({
        id: vendas.id,
        clienteNome: vendas.clienteNome,
        clienteCpf: vendas.clienteCpf,
        valor: vendas.valor,
        formaPagamento: vendas.formaPagamento,
        dataVenda: vendas.dataVenda,
        lojaNome: lojas.nome,
        vendedorNome: usuarios.nome,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        chassi: motos.chassi,
      })
```

Substituir por:

```ts
      .select({
        id: vendas.id,
        clienteNome: vendas.clienteNome,
        clienteCpf: vendas.clienteCpf,
        valor: vendas.valor,
        formaPagamento: vendas.formaPagamento,
        dataVenda: vendas.dataVenda,
        lojaNome: lojas.nome,
        vendedorNome: usuarios.nome,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        chassi: motos.chassi,
        precoCompra: motos.precoCompra,
        valorLiquido: valorLiquidoExpr(),
      })
```

(`motos` já está no `innerJoin` dessa query — nenhuma mudança de join necessária aqui.)

- [ ] **Step 3: Calcular `totalCusto`, `qtdSemCusto` e `lucroBruto`**

Localizar o bloco de cálculo (linhas 187-194):

```ts
  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const receitaLiquida = Number(totaisVendas[0]?.totalLiquido ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)
  const entradasCaixa = Number(totaisCaixa.find(t => t.tipo === 'entrada')?.total ?? 0)
  const saidasCaixa = Number(totaisCaixa.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldoCaixa = entradasCaixa - saidasCaixa
  const taxasCartao = receitaVendas - receitaLiquida
  const totalDespesas = Number(totalDespesasRaw[0]?.total ?? 0)
```

Substituir por:

```ts
  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const receitaLiquida = Number(totaisVendas[0]?.totalLiquido ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)
  const entradasCaixa = Number(totaisCaixa.find(t => t.tipo === 'entrada')?.total ?? 0)
  const saidasCaixa = Number(totaisCaixa.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldoCaixa = entradasCaixa - saidasCaixa
  const taxasCartao = receitaVendas - receitaLiquida
  const totalDespesas = Number(totalDespesasRaw[0]?.total ?? 0)
  const totalCusto = Number(totaisVendas[0]?.totalCusto ?? 0)
  const qtdSemCusto = Number(totaisVendas[0]?.qtdSemCusto ?? 0)
  const lucroBruto = receitaLiquida - totalCusto
```

- [ ] **Step 4: Adicionar os cards de Custo Total e Lucro Bruto**

Localizar o card "Despesas Operac." (linhas 252-257):

```tsx
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Despesas Operac.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalDespesas > 0 ? '-' : ''}{fmt(totalDespesas)}</p>
          </CardContent>
        </Card>
      </div>
```

Substituir por (adiciona os 2 cards novos antes do fechamento do grid):

```tsx
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Despesas Operac.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalDespesas > 0 ? '-' : ''}{fmt(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Custo Total (Motos Vendidas)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalCusto > 0 ? '-' : ''}{fmt(totalCusto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lucro Bruto</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lucroBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(lucroBruto)}
            </p>
          </CardContent>
        </Card>
      </div>

      {qtdSemCusto > 0 && (
        <p className="text-xs text-amber-600">
          ⚠ {qtdSemCusto} venda{qtdSemCusto > 1 ? 's' : ''} sem custo de moto registrado (conta{qtdSemCusto > 1 ? 'm' : ''} como R$ 0,00 no cálculo).
        </p>
      )}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros em `financeiro/page.tsx`. Neste ponto `VendasTable` ainda recebe as duas colunas extras (`precoCompra`, `valorLiquido`) dentro de `vendasMes`, mas seu tipo `Venda` local em `vendas-table.tsx` ainda não as declara — isso é aceito pelo TypeScript porque `vendas={vendasMes}` passa um valor cujo tipo tem propriedades a mais que o exigido pelo parâmetro (excess properties só são bloqueadas em literais de objeto inline, não em variáveis), então não deve gerar erro de compilação.

- [ ] **Step 6: Testar no browser**

Abrir `/financeiro` logado como admin, em um mês com vendas registradas:
- Cards "Custo Total (Motos Vendidas)" e "Lucro Bruto" aparecem no grid com valores coerentes
- Se alguma moto vendida no período não tem `precoCompra`, o aviso âmbar aparece com a contagem certa
- Trocar o filtro de loja/mês e conferir que os valores mudam de acordo

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/financeiro/page.tsx"
git commit -m "feat: cards de custo e lucro bruto das motos vendidas no financeiro"
```

---

## Task 2: Colunas Custo e Lucro na tabela de vendas

**Files:**
- Modify: `src/app/(dashboard)/financeiro/components/vendas-table.tsx`

**Interfaces:**
- Consumes: `vendasMes` de Task 1 — cada linha agora tem `precoCompra: string | null` e `valorLiquido: string`

- [ ] **Step 1: Atualizar o tipo `Venda` e adicionar as colunas**

Substituir todo o conteúdo de `src/app/(dashboard)/financeiro/components/vendas-table.tsx` por:

```tsx
'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Venda = {
  id: string
  clienteNome: string
  clienteCpf: string
  valor: string
  formaPagamento: string
  dataVenda: Date
  lojaNome: string
  vendedorNome: string
  modelo: string
  marca: string
  cor: string
  chassi: string
  precoCompra: string | null
  valorLiquido: string
}

function formatCurrency(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function VendasTable({ vendas }: { vendas: Venda[] }) {
  if (vendas.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nenhuma venda no período.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Moto</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Pagamento</TableHead>
          <TableHead className="text-right">Custo</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendas.map(v => {
          const custo = Number(v.precoCompra ?? 0)
          const lucro = Number(v.valorLiquido) - custo
          return (
            <TableRow key={v.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(v.dataVenda).toLocaleDateString('pt-BR')}
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">{v.marca} {v.modelo}</div>
                <div className="text-xs text-slate-400">{v.cor} — {v.chassi}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{v.clienteNome}</div>
                <div className="text-xs text-slate-400">{v.clienteCpf}</div>
              </TableCell>
              <TableCell>{v.vendedorNome}</TableCell>
              <TableCell>{v.lojaNome}</TableCell>
              <TableCell className="capitalize">{v.formaPagamento}</TableCell>
              <TableCell className="text-right font-mono text-sm text-slate-500">
                {v.precoCompra ? formatCurrency(v.precoCompra) : '—'}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm font-medium ${lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(String(lucro))}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">{formatCurrency(v.valor)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Testar no browser**

Abrir `/financeiro`, mês com vendas:
- Tabela "Vendas Realizadas" mostra as colunas "Custo" e "Lucro" antes de "Valor"
- Moto com `precoCompra` nulo mostra "—" na coluna Custo e o Lucro daquela linha fica igual à Receita Líquida da venda
- Lucro negativo (custo maior que receita líquida) aparece em vermelho; positivo em verde

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/financeiro/components/vendas-table.tsx"
git commit -m "feat: colunas de custo e lucro por venda na tabela do financeiro"
```
