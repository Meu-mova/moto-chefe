# Status da Moto nos Cards de Transferência Pendente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o status da moto (caixa/montada/em_garantia/vendida) nos cards de transferências pendentes, para o responsável saber se a moto já está pronta para retirada.

**Architecture:** Extrair o ícone de status já existente em `estoque/moto-table.tsx` para um componente compartilhado, adicionar a coluna `status` da moto na query de transferências, e renderizar o ícone no card apenas quando a transferência está pendente.

**Tech Stack:** Next.js App Router, Drizzle ORM (postgres-js), React Server Components, lucide-react.

## Global Constraints

- Projeto não tem framework de testes automatizados configurado (sem vitest/jest). Verificação é via `npx tsc --noEmit` (typecheck) + checagem manual no navegador (dev server ou Playwright MCP). Não criar arquivos `*.test.*` novos.
- Seguir o padrão de nomeação em português já usado no domínio (labels "Montada", "Garantia", "Vendida", "Caixa").
- Não alterar comportamento visual/lógico existente do módulo Estoque — a extração deve ser puramente mecânica (mesmo JSX, mesmo import path relativo a partir do novo arquivo).

---

### Task 1: Extrair `MotoStatusIcon` para componente compartilhado

**Files:**
- Create: `src/components/moto-status-icon.tsx`
- Modify: `src/app/(dashboard)/estoque/components/moto-table.tsx:1-44,130`

**Interfaces:**
- Produces: `export function MotoStatusIcon({ status }: { status: string }): JSX.Element` — mesma lógica visual da função `StatusIcon` atual (caixa/montada/em_garantia/vendida), usada pelo Task 3.

- [ ] **Step 1: Criar o componente compartilhado**

Criar `src/components/moto-status-icon.tsx`:

```tsx
import { Package, Zap, XCircle, CheckCircle2 } from 'lucide-react'

export function MotoStatusIcon({ status }: { status: string }) {
  if (status === 'montada') {
    return (
      <span className="flex items-center gap-1 text-green-600 font-medium text-sm">
        <Zap size={15} className="fill-green-500 text-green-600" />
        Montada
      </span>
    )
  }
  if (status === 'em_garantia') {
    return (
      <span className="flex items-center gap-1 text-red-600 font-medium text-sm">
        <XCircle size={15} className="fill-red-100" />
        Garantia
      </span>
    )
  }
  if (status === 'vendida') {
    return (
      <span className="flex items-center gap-1 text-teal-700 font-medium text-sm">
        <CheckCircle2 size={15} className="text-teal-500" />
        Vendida
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-slate-500 text-sm">
      <Package size={15} />
      Caixa
    </span>
  )
}
```

- [ ] **Step 2: Atualizar `moto-table.tsx` para usar o componente compartilhado**

Em `src/app/(dashboard)/estoque/components/moto-table.tsx`:

1. Remover a função local `StatusIcon` (linhas 13-44).
2. Remover `Package, Zap, XCircle, CheckCircle2` do import de `lucide-react` na linha 5 (mantendo os demais ícones usados: `Eye, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight`).
3. Adicionar `import { MotoStatusIcon } from '@/components/moto-status-icon'` junto aos outros imports.
4. Trocar o uso na linha 130 de `<StatusIcon status={moto.status} />` para `<MotoStatusIcon status={moto.status} />`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos (saída vazia, igual ao baseline antes da mudança).

- [ ] **Step 4: Commit**

```bash
git add src/components/moto-status-icon.tsx "src/app/(dashboard)/estoque/components/moto-table.tsx"
git commit -m "refactor: extrair MotoStatusIcon para componente compartilhado"
```

---

### Task 2: Incluir status da moto na query de transferências

**Files:**
- Modify: `src/lib/queries/transferencias.ts:21-39`

**Interfaces:**
- Consumes: nenhuma nova (a tabela `motos` já está no `innerJoin` da query).
- Produces: campo `motoStatus: string` no retorno de `listarTransferencias` (e portanto no tipo `TransferenciaComDetalhes`), consumido pelo Task 3.

- [ ] **Step 1: Adicionar a coluna ao select**

Em `src/lib/queries/transferencias.ts`, dentro do objeto passado a `.select({ ... })` (função `listarTransferencias`), adicionar logo após a linha `chassi: motos.chassi,`:

```ts
      motoStatus:         motos.status,
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erros (o tipo `TransferenciaComDetalhes` é inferido automaticamente do retorno da query, então o novo campo já fica tipado).

- [ ] **Step 3: Verificação manual da query**

Run (via MCP Supabase `execute_sql` no projeto `bzlaradpofaecqzawyym`, ou psql equivalente):

```sql
SELECT t.id, t.status, m.status AS moto_status
FROM transferencias t
JOIN motos m ON m.id = t.moto_id
WHERE t.status = 'pendente'
LIMIT 5;
```

Expected: retorna linhas com `moto_status` preenchido (`caixa`, `montada`, etc.), confirmando que o join está correto antes de plugar na UI.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/transferencias.ts
git commit -m "feat: incluir status da moto na query de transferencias"
```

---

### Task 3: Exibir o status na TransferenciaCard para transferências pendentes

**Files:**
- Modify: `src/app/(dashboard)/transferencias/components/transferencia-card.tsx:1-99`

**Interfaces:**
- Consumes: `MotoStatusIcon` (Task 1) via `@/components/moto-status-icon`; campo `motoStatus` (Task 2) presente em cada item de `lista` retornado por `listarTransferencias`, passado pelo `page.tsx` como prop `transferencia`.

- [ ] **Step 1: Atualizar o tipo `TransferenciaCardData`**

Em `src/app/(dashboard)/transferencias/components/transferencia-card.tsx`, adicionar o campo ao tipo (logo após `chassi: string`):

```ts
  motoStatus: string
```

- [ ] **Step 2: Importar o componente**

Adicionar no topo do arquivo, junto aos outros imports:

```ts
import { MotoStatusIcon } from '@/components/moto-status-icon'
```

- [ ] **Step 3: Renderizar o ícone condicionado a `status === 'pendente'`**

No bloco JSX que mostra modelo/chassi (dentro de `<div className="flex justify-between items-start">`, no primeiro `<div>` com `t.modelo` e `t.chassi`), adicionar logo abaixo do parágrafo do chassi:

```tsx
            {t.status === 'pendente' && (
              <div className="mt-1">
                <MotoStatusIcon status={t.motoStatus} />
              </div>
            )}
```

Ficando o bloco assim:

```tsx
          <div>
            <p className="font-medium text-sm">{t.modelo}</p>
            <p className="text-xs font-mono text-slate-500">
              {t.chassi}{t.cor ? ` · ${t.cor}` : ''}
            </p>
            {t.status === 'pendente' && (
              <div className="mt-1">
                <MotoStatusIcon status={t.motoStatus} />
              </div>
            )}
          </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. Se `page.tsx` reclamar de incompatibilidade de tipo ao passar `transferencia={t}`, confirmar que `t` (vindo de `listarTransferencias`) já contém `motoStatus` (garantido pelo Task 2) — não deve haver erro.

- [ ] **Step 5: Verificação manual no navegador**

1. Rodar `npm run dev`.
2. Abrir `/transferencias` logado como `admin_geral` (ou papel com transferências pendentes visíveis).
3. Confirmar visualmente que os cards nas seções "Pendentes"/"Para aceitar" e "Aguardando resposta" mostram o ícone + label de status da moto (ex: "Caixa", "Montada").
4. Confirmar que os cards da seção "Histórico" **não** mostram o status (comportamento inalterado).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/transferencias/components/transferencia-card.tsx"
git commit -m "feat: exibir status da moto nos cards de transferencia pendente"
```
