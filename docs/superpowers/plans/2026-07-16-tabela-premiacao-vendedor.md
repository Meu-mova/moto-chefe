# Link para tabela completa de premiação OTE no dashboard do vendedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No card "Simulador de Ganhos" do dashboard do vendedor, adicionar um link "Ver tabela completa" que abre um dialog somente-leitura com todas as faixas de premiação OTE.

**Architecture:** Mudança contida a um único arquivo client component já existente (`simulador-comissao.tsx`), que já recebe a prop `faixas` com todos os dados necessários. Adiciona estado local de dialog e reaproveita o padrão visual de tabela já usado em `PremiacaoFaixasTable` (admin), sem os controles de edição.

**Tech Stack:** Next.js App Router, React client component, Tailwind, lucide-react, `@/components/ui/dialog`. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Nenhuma rota, query ou server action nova — usa só a prop `faixas: Faixa[]` já existente no componente.
- Nenhuma mudança em `/folha-pagamento` ou `PremiacaoFaixasTable` (edição continua admin-only).
- O link fica só no card "Simulador de Ganhos" — não no card de KPI "Premiação OTE" (decisão do usuário).

---

### Task 1: Link + dialog de tabela completa no Simulador de Ganhos

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\dashboard\components\simulador-comissao.tsx`

**Interfaces:**
- Nenhuma interface nova exposta a outros arquivos — mudança inteiramente interna a este componente.

- [ ] **Step 1: Adicionar imports e estado do dialog**

Trocar:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { TrendingUp, Trophy, HandCoins, Wallet } from 'lucide-react'
import { calcularPremiacao } from '@/lib/premiacao'
```

por:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TrendingUp, Trophy, HandCoins, Wallet, Table2 } from 'lucide-react'
import { calcularPremiacao } from '@/lib/premiacao'
```

Logo após a linha `const [valor, setValor] = useState(() => {` ... `})` (o bloco que inicializa `valor`), adicionar uma nova linha de estado:

```ts
  const [tabelaAberta, setTabelaAberta] = useState(false)
```

- [ ] **Step 2: Adicionar o link "Ver tabela completa" no cabeçalho do card**

Trocar:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Simulador de Ganhos</h3>
          <p className="text-xs text-slate-400">Arraste para simular o total de vendas no mês e veja sua comissão + premiação OTE</p>
        </div>
        <TrendingUp size={18} className="text-emerald-500 shrink-0" />
      </div>
```

por:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Simulador de Ganhos</h3>
          <p className="text-xs text-slate-400">Arraste para simular o total de vendas no mês e veja sua comissão + premiação OTE</p>
          <button
            onClick={() => setTabelaAberta(true)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            <Table2 size={12} />
            Ver tabela completa
          </button>
        </div>
        <TrendingUp size={18} className="text-emerald-500 shrink-0" />
      </div>
```

- [ ] **Step 3: Adicionar o dialog somente-leitura no final do componente**

Trocar o fechamento do componente:

```tsx
      {proximaFaixa && faltamParaProxima != null && (
        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Faltam <span className="font-semibold text-amber-700">{fmt(faltamParaProxima)}</span> em vendas para subir a
          premiação para <span className="font-semibold text-amber-700">{fmt(parseFloat(proximaFaixa.premiacao))}</span>.
        </p>
      )}
    </div>
  )
}
```

por:

```tsx
      {proximaFaixa && faltamParaProxima != null && (
        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Faltam <span className="font-semibold text-amber-700">{fmt(faltamParaProxima)}</span> em vendas para subir a
          premiação para <span className="font-semibold text-amber-700">{fmt(parseFloat(proximaFaixa.premiacao))}</span>.
        </p>
      )}

      <Dialog open={tabelaAberta} onOpenChange={setTabelaAberta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tabela de Premiação OTE</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Premiação mensal do vendedor de acordo com o valor total vendido no mês (motos). Aplica-se a faixa de
            maior valor mínimo que ele atingiu.
          </p>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Venda mínima no mês</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Premiação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ordenadas.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2">{fmt(parseFloat(f.valorMinimoVendas))}</td>
                    <td className="px-4 py-2 font-medium">{fmt(parseFloat(f.premiacao))}</td>
                  </tr>
                ))}
                {ordenadas.length === 0 && (
                  <tr><td colSpan={2} className="text-center text-slate-400 py-6">Nenhuma faixa cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, sem novas rotas (mudança é só de UI dentro de `/dashboard`).

- [ ] **Step 5: Checagem manual no navegador**

Com o dev server rodando, logado como vendedor: ir em `/dashboard`, localizar o card "Simulador de Ganhos", clicar em "Ver tabela completa" e confirmar que abre um dialog com a tabela de faixas (venda mínima → premiação) ordenada crescente, sem botão de adicionar/excluir. Fechar o dialog e confirmar que o simulador continua funcionando normalmente (slider, mini-cards, dica de próxima faixa).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/components/simulador-comissao.tsx"
git commit -m "$(cat <<'EOF'
feat: adiciona link para tabela completa de premiacao OTE no simulador

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"`.
