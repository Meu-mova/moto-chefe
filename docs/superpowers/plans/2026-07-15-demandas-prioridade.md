# Demandas — Prioridade por Recebimento Prévio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um cliente já deu um sinal/recebimento prévio numa demanda de moto (modelo fora de estoque), a demanda vira visualmente prioritária — pra ajudar a decidir quais modelos pedir primeiro à fábrica.

**Architecture:** `demandas` hoje é uma tabela mínima (modelo, cor, loja, solicitante, data) sem nenhum conceito de pagamento ou prioridade, e sem action de edição (só criar e "dar baixa" = deletar). Investigação confirmou que não existe nenhum jeito de linkar um pagamento real (PIX/conciliação) a uma demanda hoje — criar isso seria um escopo bem maior do que o pedido. A solução mínima e correta: dois campos novos (`sinalRecebido: boolean`, `valorSinal: numeric` opcional) marcados manualmente pelo usuário, um badge de "Prioridade" na listagem, e a listagem ordenada com prioridade primeiro.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Migração de schema: SQL manual via script Node temporário (`node --env-file=.env.local script.mjs`) + mirror manual em `src/lib/db/schema.ts` — nunca `db:generate`/`db:migrate`.
- Regras de permissão: quem já pode criar demanda (`admin_geral`, `admin_socio`, `aux_adm`, `vendedor`) também pode marcar o sinal; só admins podem desmarcar (mesmo padrão de "Dar baixa", que já é admin-only). Não-admin só pode agir em demandas da própria loja (mesmo padrão de `criarDemandaAction`).
- Não criar um sistema de reconciliação de pagamento (sem link a PIX/conciliação) — é um campo manual, marcado pelo próprio usuário. Isso é uma decisão deliberada de escopo, não uma lacuna.

---

### Task 1: Schema — `demandas.sinalRecebido` + `demandas.valorSinal`

**Files:**
- Create (temporário, apagar ao final): `D:\Claude\Teste\_migration_demandas_prioridade.mjs`
- Modify: `D:\Claude\Teste\src\lib\db\schema.ts`

**Interfaces:**
- Produces: colunas `demandas.sinalRecebido` (boolean, not null, default false) e `demandas.valorSinal` (numeric nullable) — usadas pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever e rodar a migration SQL**

Criar `D:\Claude\Teste\_migration_demandas_prioridade.mjs`:

```js
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

await sql`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS sinal_recebido boolean NOT NULL DEFAULT false`
await sql`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS valor_sinal numeric(10,2)`

console.log('OK: colunas adicionadas')

const check = await sql`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'demandas' AND column_name IN ('sinal_recebido', 'valor_sinal')
`
console.log(check)

await sql.end()
```

Rodar:
```bash
cd "D:/Claude/Teste" && node --env-file=.env.local _migration_demandas_prioridade.mjs
```

Expected: imprime "OK: colunas adicionadas" e as duas colunas confirmadas (`sinal_recebido` boolean not null default false, `valor_sinal` numeric nullable).

- [ ] **Step 2: Apagar o script**

```bash
rm "D:/Claude/Teste/_migration_demandas_prioridade.mjs"
```

- [ ] **Step 3: Mirror no schema.ts**

Em `src/lib/db/schema.ts`, na definição de `demandas` (procurar `export const demandas = pgTable('demandas', {`), adicionar as duas colunas novas logo após `cor: text('cor').notNull(),`:

```ts
  sinalRecebido: boolean('sinal_recebido').notNull().default(false),
  valorSinal:    numeric('valor_sinal', { precision: 10, scale: 2 }),
```

Confirme que `boolean` já está importado de `drizzle-orm/pg-core` no topo do arquivo (é bem provável que já esteja, usado em outras tabelas) — se não estiver, adicione ao import existente.

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat: adiciona sinal_recebido e valor_sinal em demandas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Actions — marcar/desmarcar sinal

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\demandas\actions.ts`

**Interfaces:**
- Consumes: `demandas.sinalRecebido`/`valorSinal` (Task 1).
- Produces: `criarDemandaAction(modelo, cor, lojaId, sinalRecebido?: boolean, valorSinal?: number | null)` (assinatura estendida, compatível com chamadas antigas de 3 argumentos); `atualizarSinalDemandaAction(demandaId: string, sinalRecebido: boolean, valorSinal: number | null): Promise<void>` — usadas pela Task 3.

- [ ] **Step 1: Estender `criarDemandaAction`**

Substituir:

```ts
export async function criarDemandaAction(modelo: string, cor: string, lojaId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  // Não-admins só podem criar demandas na própria loja — ignora lojaId do cliente
  const effectiveLojaId = ADMINS.includes(usuario.papel) ? lojaId : usuario.lojaId
  if (!effectiveLojaId) throw new Error('Usuário sem loja associada')
  await db.insert(demandas).values({
    modelo: modelo.trim(),
    cor: cor.trim(),
    lojaId: effectiveLojaId,
    solicitanteId: usuario.id,
  })
  revalidatePath('/demandas')
}
```

por:

```ts
export async function criarDemandaAction(
  modelo: string,
  cor: string,
  lojaId: string,
  sinalRecebido = false,
  valorSinal: number | null = null,
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  // Não-admins só podem criar demandas na própria loja — ignora lojaId do cliente
  const effectiveLojaId = ADMINS.includes(usuario.papel) ? lojaId : usuario.lojaId
  if (!effectiveLojaId) throw new Error('Usuário sem loja associada')
  await db.insert(demandas).values({
    modelo: modelo.trim(),
    cor: cor.trim(),
    lojaId: effectiveLojaId,
    solicitanteId: usuario.id,
    sinalRecebido,
    valorSinal: sinalRecebido && valorSinal != null ? String(valorSinal) : null,
  })
  revalidatePath('/demandas')
}
```

- [ ] **Step 2: Adicionar `atualizarSinalDemandaAction`**

Ao final do arquivo, adicionar:

```ts

export async function atualizarSinalDemandaAction(
  demandaId: string,
  sinalRecebido: boolean,
  valorSinal: number | null,
) {
  const usuario = await getUsuarioLogado()
  const PODE_MARCAR = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']
  if (!PODE_MARCAR.includes(usuario.papel)) throw new Error('Sem permissão')

  // Desmarcar (remover a prioridade) é ação sensível — só admin
  if (!sinalRecebido && !ADMINS.includes(usuario.papel)) {
    throw new Error('Sem permissão para desmarcar o sinal')
  }

  const [demanda] = await db.select({ lojaId: demandas.lojaId }).from(demandas).where(eq(demandas.id, demandaId)).limit(1)
  if (!demanda) throw new Error('Demanda não encontrada')
  if (!ADMINS.includes(usuario.papel) && demanda.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão para essa loja')
  }

  await db.update(demandas).set({
    sinalRecebido,
    valorSinal: sinalRecebido && valorSinal != null ? String(valorSinal) : null,
  }).where(eq(demandas.id, demandaId))

  revalidatePath('/demandas')
}
```

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/demandas/actions.ts"
git commit -m "$(cat <<'EOF'
feat: actions para marcar/desmarcar sinal recebido em demandas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: UI — badge de prioridade, marcar sinal, ordenação

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\demandas\page.tsx`
- Modify: `D:\Claude\Teste\src\app\(dashboard)\demandas\components\demandas-table.tsx`
- Modify: `D:\Claude\Teste\src\app\(dashboard)\demandas\components\nova-demanda-form.tsx`
- Create: `D:\Claude\Teste\src\app\(dashboard)\demandas\components\marcar-sinal-button.tsx`

**Interfaces:**
- Consumes: `atualizarSinalDemandaAction`, `criarDemandaAction` (Task 2).

- [ ] **Step 1: `page.tsx` — selecionar os novos campos e ordenar por prioridade**

Trocar o import de `drizzle-orm`:
```ts
import { eq, inArray } from 'drizzle-orm'
```
por:
```ts
import { eq, inArray, desc, asc } from 'drizzle-orm'
```

Trocar a query:
```ts
  const lista = await db
    .select({
      id: demandas.id,
      modelo: demandas.modelo,
      cor: demandas.cor,
      lojaNome: lojas.nome,
      solicitanteNome: usuarios.nome,
      criadoEm: demandas.criadoEm,
    })
    .from(demandas)
    .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
    .where(where)
    .orderBy(demandas.criadoEm)
```
por:
```ts
  const lista = await db
    .select({
      id: demandas.id,
      modelo: demandas.modelo,
      cor: demandas.cor,
      lojaNome: lojas.nome,
      solicitanteNome: usuarios.nome,
      criadoEm: demandas.criadoEm,
      sinalRecebido: demandas.sinalRecebido,
      valorSinal: demandas.valorSinal,
    })
    .from(demandas)
    .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
    .where(where)
    .orderBy(desc(demandas.sinalRecebido), asc(demandas.criadoEm))
```

- [ ] **Step 2: `demandas-table.tsx` — badge de prioridade + botão de marcar/desmarcar**

Substituir o arquivo inteiro por:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { darBaixaAction } from '../actions'
import { MarcarSinalButton } from './marcar-sinal-button'

type Demanda = {
  id: string
  modelo: string
  cor: string
  lojaNome: string
  solicitanteNome: string
  criadoEm: Date
  sinalRecebido: boolean
  valorSinal: string | null
}

type Props = { demandas: Demanda[]; isAdmin: boolean }

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function DemandasTable({ demandas, isAdmin }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleBaixa(id: string) {
    setLoadingId(id)
    try {
      await darBaixaAction(id)
      toast.success('Baixa dada com sucesso')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao dar baixa')
    } finally {
      setLoadingId(null)
    }
  }

  if (demandas.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-12">
        Nenhuma demanda registrada.
      </p>
    )
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Modelo</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Cor</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Loja</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Solicitante</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Prioridade</th>
            {isAdmin && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {demandas.map(d => (
            <tr key={d.id} className={`hover:bg-slate-50 ${d.sinalRecebido ? 'bg-amber-50/60' : ''}`}>
              <td className="px-4 py-3 font-medium">{d.modelo}</td>
              <td className="px-4 py-3 text-slate-600">{d.cor}</td>
              <td className="px-4 py-3 text-slate-600">{d.lojaNome}</td>
              <td className="px-4 py-3 text-slate-600">{d.solicitanteNome}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
              </td>
              <td className="px-4 py-3">
                <MarcarSinalButton
                  demandaId={d.id}
                  sinalRecebido={d.sinalRecebido}
                  valorSinal={d.valorSinal}
                  isAdmin={isAdmin}
                />
              </td>
              {isAdmin && (
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingId === d.id}
                    onClick={() => handleBaixa(d.id)}
                  >
                    {loadingId === d.id ? 'Aguarde…' : 'Dar baixa'}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

(Nota: `fmt` fica sem uso direto nesse arquivo — é usado dentro de `MarcarSinalButton`, Step 3. Remova a constante `fmt` daqui se o implementador achar que ela não é usada neste arquivo — mantenha só se for referenciada. Ao aplicar, confira se `fmt` é necessária aqui; se não for usada em `demandas-table.tsx`, delete essa linha antes de commitar, pra não deixar uma constante morta.)

- [ ] **Step 3: Criar `marcar-sinal-button.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { atualizarSinalDemandaAction } from '../actions'

type Props = {
  demandaId: string
  sinalRecebido: boolean
  valorSinal: string | null
  isAdmin: boolean
}

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MarcarSinalButton({ demandaId, sinalRecebido, valorSinal, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [pending, startTransition] = useTransition()

  function marcar() {
    const v = valor.trim() ? parseFloat(valor.replace(',', '.')) : null
    startTransition(async () => {
      try {
        await atualizarSinalDemandaAction(demandaId, true, v)
        toast.success('Demanda marcada como prioridade')
        setOpen(false)
        setValor('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar sinal')
      }
    })
  }

  function desmarcar() {
    startTransition(async () => {
      try {
        await atualizarSinalDemandaAction(demandaId, false, null)
        toast.success('Prioridade removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao desmarcar')
      }
    })
  }

  if (sinalRecebido) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-2 py-1">
          Prioridade{valorSinal ? ` · ${fmt(valorSinal)}` : ''}
        </span>
        {isAdmin && (
          <button
            onClick={desmarcar}
            disabled={pending}
            className="text-xs text-slate-400 hover:text-red-500 underline"
          >
            desmarcar
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Marcar sinal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recebimento prévio (sinal)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Marcar essa demanda como prioridade — o cliente já deu um sinal/recebimento prévio.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Valor do sinal (opcional)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={e => setValor(e.target.value)}
              />
            </div>
            <Button onClick={marcar} disabled={pending} className="w-full">
              {pending ? 'Salvando…' : 'Confirmar prioridade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: `nova-demanda-form.tsx` — campo opcional de sinal já na criação**

Substituir o arquivo inteiro por:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { criarDemandaAction } from '../actions'

type Loja = { id: string; nome: string }
type Props = { lojas: Loja[]; lojaIdFixa: string | null }

export function NovaDemandaForm({ lojas, lojaIdFixa }: Props) {
  const [modelo, setModelo] = useState('')
  const [cor, setCor] = useState('')
  const [lojaId, setLojaId] = useState(lojaIdFixa ?? '')
  const [sinalRecebido, setSinalRecebido] = useState(false)
  const [valorSinal, setValorSinal] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelo.trim() || !cor.trim() || !lojaId) return
    setLoading(true)
    try {
      const v = sinalRecebido && valorSinal.trim() ? parseFloat(valorSinal.replace(',', '.')) : null
      await criarDemandaAction(modelo, cor, lojaId, sinalRecebido, v)
      setModelo('')
      setCor('')
      setSinalRecebido(false)
      setValorSinal('')
      if (!lojaIdFixa) setLojaId('')
      toast.success('Demanda registrada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar demanda')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 space-y-4">
      <h2 className="font-semibold text-sm">Nova demanda</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Input
            placeholder="Ex: Hunter 1500"
            value={modelo}
            onChange={e => setModelo(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cor</Label>
          <Input
            placeholder="Ex: Preto"
            value={cor}
            onChange={e => setCor(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Loja</Label>
          {lojaIdFixa ? (
            <Input value={lojas.find(l => l.id === lojaIdFixa)?.nome ?? ''} disabled />
          ) : (
            <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')} required>
              <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
              <SelectContent>
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={sinalRecebido}
            onChange={e => setSinalRecebido(e.target.checked)}
            className="rounded border-slate-300"
          />
          Já recebi um sinal / recebimento prévio do cliente
        </label>
        {sinalRecebido && (
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Valor do sinal (opcional)"
            value={valorSinal}
            onChange={e => setValorSinal(e.target.value)}
            className="max-w-[180px]"
          />
        )}
      </div>
      <Button type="submit" disabled={loading || !modelo.trim() || !cor.trim() || !lojaId}>
        {loading ? 'Salvando…' : 'Registrar demanda'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 6: Build**

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, rota `/demandas` normal.

- [ ] **Step 7: Checagem manual no navegador**

Com o dev server rodando, logar como vendedor ou admin, ir em `/demandas`, criar uma demanda nova marcando "já recebi um sinal" com um valor, confirmar que ela aparece com o badge "Prioridade" e vem ordenada antes das demandas sem prioridade. Criar outra demanda sem marcar sinal, confirmar que ela some ao final da lista. Clicar em "Marcar sinal" numa demanda sem prioridade, confirmar que vira prioridade. Como admin, clicar em "desmarcar" e confirmar que volta ao estado normal e reordena.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/demandas/page.tsx" "src/app/(dashboard)/demandas/components/demandas-table.tsx" "src/app/(dashboard)/demandas/components/nova-demanda-form.tsx" "src/app/(dashboard)/demandas/components/marcar-sinal-button.tsx"
git commit -m "$(cat <<'EOF'
feat: badge de prioridade e marcacao de sinal recebido em demandas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"`.
