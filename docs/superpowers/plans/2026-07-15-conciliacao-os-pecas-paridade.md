# Conciliação de OS — Paridade com Motos/Peças — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a Conciliação de Cartão tratar pagamentos de Ordens de Serviço (OS) exatamente como já trata vendas de motos e de peças/acessórios (PA): auto-match por autorização, busca manual, vínculo/desvínculo.

**Architecture:** Peças (PA) já tem paridade completa com motos em todas as camadas (schema, auto-match, busca manual, UI) — confirmado por investigação direta do código atual. OS não tem nenhuma: falta a própria coluna de vínculo (`conciliacoes_cartao.os_id`), falta até o dado de origem (OS grava só um `forma_pagamento` texto solto, sem os campos `operadora`/`autorizacao`/`parcelas` que o auto-match usa). Este plano: (1) dá à OS um `pagamentos jsonb` no mesmo formato de `vendas`/`vendas_pecas`, populado quando a forma de pagamento é cartão; (2) adiciona a coluna `os_id`; (3) estende as 5 funções de `conciliacao/actions.ts` que hoje só cobrem moto+peça pra também cobrir OS; (4) estende a página e o botão de vínculo pra exibir/badge OS.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Migração de schema: SQL manual via script Node temporário (`node --env-file=.env.local script.mjs`) + mirror manual em `src/lib/db/schema.ts` — nunca `db:generate`/`db:migrate` neste repo.
- Só `admin_geral`/`admin_socio`/`aux_adm` podem vincular/desvincular conciliações — mesma regra já usada nas funções existentes.
- Todo campo novo em UI usa padrões já estabelecidos no arquivo que está sendo editado (native `<select>` em `OSPagamentoPanel` porque é isso que ele já usa; `@/components/ui/select` customizado em `venda-peca-dialog.tsx` porque é isso que ele já usa — não trocar o padrão de um arquivo por outro).
- O formato de `pagamentos` em `ordensServico` deve ser idêntico ao já usado em `vendas`/`vendasPecas`: `{ tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]`, com `tipo` usando os mesmos slugs (`cartao_credito`, `cartao_debito`) pros quais o auto-match já filtra.
- Não expandir `OSPagamentoPanel` pra um carrinho multi-pagamento — OS continua com um único pagamento por fechamento (igual hoje), só ganha os campos extras de cartão quando a forma é cartão. Isso é suficiente pra habilitar a conciliação; um carrinho completo seria over-engineering não pedido.

---

### Task 1: Schema — `ordensServico.pagamentos` + `conciliacoesCartao.osId`

**Files:**
- Create (temporário, apagar ao final): `D:\Claude\Teste\_migration_os_conciliacao.mjs`
- Modify: `D:\Claude\Teste\src\lib\db\schema.ts`

**Interfaces:**
- Produces: coluna `ordensServico.pagamentos` (mesmo tipo Drizzle usado em `vendas.pagamentos`/`vendasPecas.pagamentos`) e `conciliacoesCartao.osId` (uuid, nullable, FK `ordensServico.id`) — usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever e rodar a migration SQL**

Criar `D:\Claude\Teste\_migration_os_conciliacao.mjs`:

```js
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

await sql`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS pagamentos jsonb`
await sql`ALTER TABLE conciliacoes_cartao ADD COLUMN IF NOT EXISTS os_id uuid REFERENCES ordens_servico(id)`

console.log('OK: colunas adicionadas')

const check1 = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ordens_servico' AND column_name = 'pagamentos'`
const check2 = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conciliacoes_cartao' AND column_name = 'os_id'`
console.log(check1, check2)

await sql.end()
```

Rodar:
```bash
cd "D:/Claude/Teste" && node --env-file=.env.local _migration_os_conciliacao.mjs
```

Expected: imprime "OK: colunas adicionadas" e as duas colunas confirmadas (`pagamentos` tipo `jsonb`, `os_id` tipo `uuid`).

- [ ] **Step 2: Apagar o script**

```bash
rm "D:/Claude/Teste/_migration_os_conciliacao.mjs"
```

- [ ] **Step 3: Mirror no schema.ts**

Em `src/lib/db/schema.ts`, na definição de `ordensServico` (procurar `export const ordensServico = pgTable('ordens_servico', {`), adicionar a nova coluna logo após `formaPagamento: text('forma_pagamento'),`:

```ts
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]>(),
```

Na definição de `conciliacoesCartao` (procurar `export const conciliacoesCartao = pgTable(`), adicionar logo após a coluna `pecaVendaId`:

```ts
  osId: uuid('os_id').references(() => ordensServico.id),
```

**Atenção de ordem de declaração:** `conciliacoesCartao` provavelmente já referencia `vendas`/`vendasPecas` que são declaradas antes dela no arquivo — confirme que `ordensServico` também já está declarada antes de `conciliacoesCartao` nesse arquivo (senão, use apenas o tipo `uuid('os_id')` sem `.references()` e adicione a referência depois, ou reordene — mas o mais provável é que já esteja em ordem, já que `conciliacoesCartao.pecaVendaId` referencia `vendasPecas` que também vem de um módulo posterior a `ordensServico` no arquivo atual).

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat: adiciona pagamentos jsonb em ordens_servico e os_id em conciliacoes_cartao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Captura de dados de cartão no pagamento de OS

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\ordens-servico\actions.ts`
- Modify: `D:\Claude\Teste\src\app\(dashboard)\ordens-servico\[id]\components\os-pagamento-panel.tsx`

**Interfaces:**
- Consumes: `ordensServico.pagamentos` (Task 1).
- Produces: `registrarPagamentoOSAction(osId, { valorTotal, formaPagamento, operadora?, parcelas?, autorizacao? })` — grava um `pagamentos` de um único item quando a forma é cartão, usado pelo auto-match da Task 3.

- [ ] **Step 1: Estender `registrarPagamentoOSAction`**

Em `src/app/(dashboard)/ordens-servico/actions.ts`, localizar a função atual:

```ts
export async function registrarPagamentoOSAction(osId: string, dados: {
  valorTotal: number
  formaPagamento: string
}) {
  await verificarAcessoOS(osId, GESTORES)

  const [osAtual] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
    ...(osAtual?.status === 'pendente_pagamento'
      ? { status: 'concluida' as any, dataConclusao: new Date() }
      : {}),
  }).where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}
```

Substituir por:

```ts
const TIPO_CARTAO_OS: Record<string, string> = {
  'Cartão de Crédito': 'cartao_credito',
  'Cartão de Débito':  'cartao_debito',
}

export async function registrarPagamentoOSAction(osId: string, dados: {
  valorTotal: number
  formaPagamento: string
  operadora?: string
  parcelas?: number
  autorizacao?: string
}) {
  await verificarAcessoOS(osId, GESTORES)

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
```

- [ ] **Step 2: Estender o formulário `OSPagamentoPanel`**

Substituir o conteúdo completo de `src/app/(dashboard)/ordens-servico/[id]/components/os-pagamento-panel.tsx` por:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { registrarPagamentoOSAction } from '../../actions'
import { toast } from 'sonner'

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Cortesia / Garantia']
const FORMAS_CARTAO = new Set(['Cartão de Crédito', 'Cartão de Débito'])
const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone',       label: 'Stone' },
  { value: 'pagueveloz',  label: 'PaguéVeloz' },
  { value: 'cielo',       label: 'Cielo' },
  { value: 'getnet',      label: 'GetNet' },
  { value: 'redecard',    label: 'Redecard' },
]

type Props = { osId: string; valorTotal: number; formaPagamento: string }

export function OSPagamentoPanel({ osId, valorTotal, formaPagamento }: Props) {
  const [pending, start] = useTransition()
  const [valor, setValor] = useState(valorTotal > 0 ? valorTotal.toFixed(2) : '')
  const [forma, setForma] = useState(formaPagamento)
  const [operadora, setOperadora] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [autorizacao, setAutorizacao] = useState('')

  const ehCartao = FORMAS_CARTAO.has(forma)

  function salvar() {
    const v = parseFloat(valor)
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    if (!forma) { toast.error('Selecione a forma de pagamento'); return }
    start(async () => {
      try {
        await registrarPagamentoOSAction(osId, {
          valorTotal: v,
          formaPagamento: forma,
          ...(ehCartao && operadora ? { operadora } : {}),
          ...(ehCartao && parcelas ? { parcelas: parseInt(parcelas, 10) } : {}),
          ...(ehCartao && autorizacao.trim() ? { autorizacao: autorizacao.trim().toUpperCase() } : {}),
        })
        toast.success('Pagamento registrado')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Valor cobrado (R$)</Label>
            <Input type="number" min="0" step="0.01" value={valor}
              onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Forma de pagamento</Label>
            <select value={forma} onChange={e => setForma(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Selecione...</option>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {ehCartao && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Operadora</Label>
              <select value={operadora} onChange={e => setOperadora(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {OPERADORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas</Label>
              <select value={parcelas} onChange={e => setParcelas(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            </div>
          </div>
        )}
        {ehCartao && (
          <div className="space-y-1.5">
            <Label className="text-xs">Autorização (impresso no comprovante)</Label>
            <Input value={autorizacao} onChange={e => setAutorizacao(e.target.value)} placeholder="Opcional" />
          </div>
        )}

        <Button size="sm" onClick={salvar} disabled={pending} className="w-full">
          {pending ? 'Salvando…' : formaPagamento ? 'Atualizar pagamento' : 'Registrar pagamento'}
        </Button>
        {formaPagamento && (
          <p className="text-xs text-green-600 text-center">
            Pago: {formaPagamento} · {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/actions.ts" "src/app/(dashboard)/ordens-servico/[id]/components/os-pagamento-panel.tsx"
git commit -m "$(cat <<'EOF'
feat: captura operadora/parcelas/autorizacao no pagamento de OS por cartao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `conciliacao/actions.ts` — paridade de OS em todas as 5 funções

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\conciliacao\actions.ts`

**Interfaces:**
- Consumes: `ordensServico.pagamentos`, `conciliacoesCartao.osId` (Task 1); `clientes` (já existe, para resolver nome do cliente da OS).
- Produces: `vincularVendaAction(conciliacaoId, alvoId, tipo: 'moto' | 'peca' | 'os')`; `buscarVendasParaVincular`/`buscarVendaManual` retornando também linhas `tipo: 'os'` — usados pela Task 4/5.

- [ ] **Step 1: Atualizar o import do topo**

Trocar:
```ts
import { conciliacoesCartao, vendas, vendasPecas, pixRecebimentos } from '@/lib/db/schema'
```
por (ajuste o nome exato do import existente — adicionar `ordensServico` e `clientes` à lista já importada de `@/lib/db/schema`, mantendo todos os outros nomes já importados no arquivo):
```ts
import { conciliacoesCartao, vendas, vendasPecas, pixRecebimentos, ordensServico, clientes } from '@/lib/db/schema'
```

- [ ] **Step 2: Auto-match em `importarRelatorioAction`**

Localizar o bloco (dentro do loop `for (const r of rows)`):

```ts
    // Tenta auto-conciliar pela autorização registrada na venda (moto ou peça), restrito ao grupo ativo
    let vendaId: string | null = null
    let pecaVendaId: string | null = null
    if (r.autorizacao) {
      const [matchVenda] = await db
        .select({ id: vendas.id })
        .from(vendas)
        .where(and(
          sql`${vendas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
          inArray(vendas.lojaId, lojaIdsGrupo),
        ))
        .limit(1)
      if (matchVenda) {
        vendaId = matchVenda.id
      } else {
        const [matchPeca] = await db
          .select({ id: vendasPecas.id })
          .from(vendasPecas)
          .where(and(
            sql`${vendasPecas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
            inArray(vendasPecas.lojaId, lojaIdsGrupo),
          ))
          .limit(1)
        if (matchPeca) pecaVendaId = matchPeca.id
      }
    }

    const matched = vendaId ?? pecaVendaId
    await db.insert(conciliacoesCartao).values({
      grupoId:        grupo.id,
      operadora,
      dataTransacao:  r.dataTransacao,
      nsu:            r.nsu,
      autorizacao:    r.autorizacao,
      valorBruto:     String(r.valorBruto),
      valorLiquido:   r.valorLiquido != null ? String(r.valorLiquido) : null,
      parcelas:       r.parcelas,
      tipo:           r.tipo,
      status:         'aprovado',
      rawData:        { bandeira: r.bandeira, portador: r.portador },
      ...(matched ? { vendaId, pecaVendaId, conciliado: true, conciliadoEm: new Date() } : {}),
    })
```

Substituir por:

```ts
    // Tenta auto-conciliar pela autorização registrada na venda (moto, peça ou OS), restrito ao grupo ativo
    let vendaId: string | null = null
    let pecaVendaId: string | null = null
    let osId: string | null = null
    if (r.autorizacao) {
      const [matchVenda] = await db
        .select({ id: vendas.id })
        .from(vendas)
        .where(and(
          sql`${vendas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
          inArray(vendas.lojaId, lojaIdsGrupo),
        ))
        .limit(1)
      if (matchVenda) {
        vendaId = matchVenda.id
      } else {
        const [matchPeca] = await db
          .select({ id: vendasPecas.id })
          .from(vendasPecas)
          .where(and(
            sql`${vendasPecas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
            inArray(vendasPecas.lojaId, lojaIdsGrupo),
          ))
          .limit(1)
        if (matchPeca) {
          pecaVendaId = matchPeca.id
        } else {
          const [matchOs] = await db
            .select({ id: ordensServico.id })
            .from(ordensServico)
            .where(and(
              sql`${ordensServico.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
              inArray(ordensServico.lojaId, lojaIdsGrupo),
            ))
            .limit(1)
          if (matchOs) osId = matchOs.id
        }
      }
    }

    const matched = vendaId ?? pecaVendaId ?? osId
    await db.insert(conciliacoesCartao).values({
      grupoId:        grupo.id,
      operadora,
      dataTransacao:  r.dataTransacao,
      nsu:            r.nsu,
      autorizacao:    r.autorizacao,
      valorBruto:     String(r.valorBruto),
      valorLiquido:   r.valorLiquido != null ? String(r.valorLiquido) : null,
      parcelas:       r.parcelas,
      tipo:           r.tipo,
      status:         'aprovado',
      rawData:        { bandeira: r.bandeira, portador: r.portador },
      ...(matched ? { vendaId, pecaVendaId, osId, conciliado: true, conciliadoEm: new Date() } : {}),
    })
```

- [ ] **Step 3: Estender `vincularVendaAction`**

Localizar:

```ts
export async function vincularVendaAction(conciliacaoId: string, alvoId: string, tipo: 'moto' | 'peca' = 'moto') {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  if (tipo === 'peca') {
    const [pecaVenda] = await db.select({ lojaId: vendasPecas.lojaId }).from(vendasPecas).where(eq(vendasPecas.id, alvoId)).limit(1)
    if (!pecaVenda || !lojaIdsGrupo.includes(pecaVenda.lojaId)) {
      throw new Error('Venda de peça não pertence ao grupo ativo')
    }
    const atualizadas = await db.update(conciliacoesCartao)
      .set({ pecaVendaId: alvoId, vendaId: null, conciliado: true, conciliadoEm: new Date() })
      .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
      .returning({ id: conciliacoesCartao.id })
    if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')
    revalidatePath('/conciliacao')
    return
  }

  // Garante que a venda a ser vinculada pertence a uma loja do grupo ativo
  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, alvoId))
    .limit(1)
  if (!venda || !lojaIdsGrupo.includes(venda.lojaId)) {
    throw new Error('Venda não pertence ao grupo ativo')
  }

  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: alvoId, pecaVendaId: null, conciliado: true, conciliadoEm: new Date() })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })

  if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')

  revalidatePath('/conciliacao')
}
```

Substituir por:

```ts
export async function vincularVendaAction(conciliacaoId: string, alvoId: string, tipo: 'moto' | 'peca' | 'os' = 'moto') {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  if (tipo === 'peca') {
    const [pecaVenda] = await db.select({ lojaId: vendasPecas.lojaId }).from(vendasPecas).where(eq(vendasPecas.id, alvoId)).limit(1)
    if (!pecaVenda || !lojaIdsGrupo.includes(pecaVenda.lojaId)) {
      throw new Error('Venda de peça não pertence ao grupo ativo')
    }
    const atualizadas = await db.update(conciliacoesCartao)
      .set({ pecaVendaId: alvoId, vendaId: null, osId: null, conciliado: true, conciliadoEm: new Date() })
      .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
      .returning({ id: conciliacoesCartao.id })
    if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')
    revalidatePath('/conciliacao')
    return
  }

  if (tipo === 'os') {
    const [os] = await db.select({ lojaId: ordensServico.lojaId }).from(ordensServico).where(eq(ordensServico.id, alvoId)).limit(1)
    if (!os || !lojaIdsGrupo.includes(os.lojaId)) {
      throw new Error('Ordem de serviço não pertence ao grupo ativo')
    }
    const atualizadas = await db.update(conciliacoesCartao)
      .set({ osId: alvoId, vendaId: null, pecaVendaId: null, conciliado: true, conciliadoEm: new Date() })
      .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
      .returning({ id: conciliacoesCartao.id })
    if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')
    revalidatePath('/conciliacao')
    return
  }

  // Garante que a venda a ser vinculada pertence a uma loja do grupo ativo
  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, alvoId))
    .limit(1)
  if (!venda || !lojaIdsGrupo.includes(venda.lojaId)) {
    throw new Error('Venda não pertence ao grupo ativo')
  }

  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: alvoId, pecaVendaId: null, osId: null, conciliado: true, conciliadoEm: new Date() })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })

  if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')

  revalidatePath('/conciliacao')
}
```

- [ ] **Step 4: Estender `desvincularVendaAction`**

Trocar:
```ts
  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: null, pecaVendaId: null, conciliado: false, conciliadoEm: null })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })
```
por:
```ts
  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: null, pecaVendaId: null, osId: null, conciliado: false, conciliadoEm: null })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })
```
(essa função aparece dentro de `desvincularVendaAction` — é a única ocorrência desse `.set({ vendaId: null, pecaVendaId: null, conciliado: false, conciliadoEm: null })` no arquivo).

- [ ] **Step 5: Adicionar `osRows` em `buscarVendasParaVincular`**

Localizar:

```ts
export async function buscarVendasParaVincular(valorRef: number) {
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  // Busca vendas (motos e peças/acessórios) onde algum lançamento de cartão tem valor
  // exato (tolerância de R$0,01), restrito às lojas do grupo ativo do usuário.
  const [motosRows, pecasRows] = await Promise.all([
```

... (mantém as duas queries `motosRows`/`pecasRows` exatamente como estão) ...

```ts
  return [...motosRows, ...pecasRows]
}
```

Substituir o `Promise.all([...])` e o `return` finais por (adicionando `osRows` como terceiro elemento do array e do `Promise.all`, mantendo `motosRows`/`pecasRows` idênticos):

```ts
  const [motosRows, pecasRows, osRows] = await Promise.all([
    // ... motosRows e pecasRows exatamente como já estão no arquivo, sem alteração ...
    db
      .select({
        id:             ordensServico.id,
        tipo:           sql<'os'>`'os'`,
        numero:         ordensServico.numero,
        dataVenda:      ordensServico.dataConclusao,
        clienteNome:    sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:          ordensServico.valorTotal,
        formaPagamento: ordensServico.formaPagamento,
        pagamentos:     ordensServico.pagamentos,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(
        and(
          inArray(ordensServico.lojaId, lojaIdsGrupo),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${ordensServico.pagamentos}) AS p
            WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
            AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
          )`,
        )
      )
      .orderBy(desc(ordensServico.dataConclusao))
      .limit(50),
  ])

  return [...motosRows, ...pecasRows, ...osRows]
}
```

(Implementador: mantenha `motosRows`/`pecasRows` — as duas primeiras entradas do array — byte-a-byte iguais ao que já existe no arquivo; a única mudança real é adicionar a terceira query `osRows` e trocar `[motosRows, pecasRows]` por `[motosRows, pecasRows, osRows]` em ambos os lugares, além do `return` final.)

- [ ] **Step 6: Adicionar `osRows` em `buscarVendaManual`**

Mesma mecânica do Step 5, agora na função `buscarVendaManual`. Localizar o `Promise.all([motosRows, pecasRows])` dessa função e adicionar uma terceira query:

```ts
    db
      .select({
        id:             ordensServico.id,
        tipo:           sql<'os'>`'os'`,
        numero:         ordensServico.numero,
        dataVenda:      ordensServico.dataConclusao,
        clienteNome:    sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:          ordensServico.valorTotal,
        formaPagamento: ordensServico.formaPagamento,
        pagamentos:     ordensServico.pagamentos,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(
        and(
          inArray(ordensServico.lojaId, lojaIdsGrupo),
          isNumero
            ? eq(ordensServico.numero, parseInt(q, 10))
            : sql`(COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, '') ILIKE ${'%' + q + '%'})`,
        )
      )
      .orderBy(desc(ordensServico.dataConclusao))
      .limit(15),
```

E o `return` final vira `return [...motosRows, ...pecasRows, ...osRows]`.

**Atenção:** `ordensServico.dataConclusao` é nullable (OS pode não ter sido concluída ainda, mas só é candidata a conciliação se tiver `pagamentos` preenchido, o que só acontece após `registrarPagamentoOSAction` — nesse ponto `dataConclusao` já foi setada pela própria action quando o status vira `concluida`. Ainda assim, trate como nullable no `orderBy`/exibição downstream — não assuma not-null.)

- [ ] **Step 7: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/conciliacao/actions.ts"
git commit -m "$(cat <<'EOF'
feat: paridade de OS na conciliacao de cartao (auto-match, busca e vinculo)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `conciliacao/page.tsx` — exibir vínculo de OS

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\conciliacao\page.tsx`

**Interfaces:**
- Consumes: `conciliacoesCartao.osId` (Task 1), `ordensServico`, `clientes`.
- Produces: passa `tipoVinculado: 'moto' | 'peca' | 'os'` e o objeto vinculado pra `VincularVendaButton` (Task 5).

- [ ] **Step 1: Atualizar o import**

Trocar:
```ts
import { conciliacoesCartao, vendas, vendasPecas } from '@/lib/db/schema'
```
por:
```ts
import { conciliacoesCartao, vendas, vendasPecas, ordensServico, clientes } from '@/lib/db/schema'
```

- [ ] **Step 2: Selecionar `osId` na query principal**

Na query de `transacoes`, adicionar `osId: conciliacoesCartao.osId,` logo após a linha `pecaVendaId: conciliacoesCartao.pecaVendaId,`.

- [ ] **Step 3: Carregar `osMap`**

Logo após o bloco que carrega `pecasVendaMap` (o `if (pecaVendaIds.length > 0) { ... }`), adicionar:

```ts
  const osIds = [...new Set(transacoes.flatMap(t => t.osId ? [t.osId] : []))]
  const osMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  if (osIds.length > 0) {
    const rows = await db
      .select({
        id:          ordensServico.id,
        numero:      ordensServico.numero,
        clienteNome: sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:       ordensServico.valorTotal,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(inArray(ordensServico.id, osIds))
    rows.forEach(o => osMap.set(o.id, { ...o, numero: o.numero ?? 0, valor: o.valor ?? '0' }))
  }
```

Você precisará adicionar `sql` ao import de `drizzle-orm` no topo do arquivo se ainda não estiver importado (verifique a linha `import { eq, desc, and, isNull, isNotNull, inArray } from 'drizzle-orm'` e estenda pra incluir `sql`).

- [ ] **Step 4: Resolver o vínculo exibido**

Localizar:
```ts
                const vendaVinculada = t.vendaId
                  ? (vendasMap.get(t.vendaId) ?? null)
                  : t.pecaVendaId
                    ? (pecasVendaMap.get(t.pecaVendaId) ?? null)
                    : null
                const tipoVinculado: 'moto' | 'peca' | undefined = t.vendaId ? 'moto' : t.pecaVendaId ? 'peca' : undefined
```
Substituir por:
```ts
                const vendaVinculada = t.vendaId
                  ? (vendasMap.get(t.vendaId) ?? null)
                  : t.pecaVendaId
                    ? (pecasVendaMap.get(t.pecaVendaId) ?? null)
                    : t.osId
                      ? (osMap.get(t.osId) ?? null)
                      : null
                const tipoVinculado: 'moto' | 'peca' | 'os' | undefined =
                  t.vendaId ? 'moto' : t.pecaVendaId ? 'peca' : t.osId ? 'os' : undefined
```

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros (vai falhar até a Task 5 atualizar os tipos de `VincularVendaButton` — se rodar antes da Task 5 e der erro de tipo em `tipoVinculado`, isso é esperado; a Task 5 corrige. Rode `type-check` de novo só depois da Task 5).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/conciliacao/page.tsx"
git commit -m "$(cat <<'EOF'
feat: exibe vinculo de OS na pagina de conciliacao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `VincularVendaButton` — badge e fluxo de vínculo de OS

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\conciliacao\components\vincular-venda-button.tsx`

**Interfaces:**
- Consumes: `tipoVinculado: 'moto' | 'peca' | 'os'` (Task 4); `buscarVendasParaVincular`/`buscarVendaManual` agora retornam itens com `tipo: 'os'` (Task 3).

- [ ] **Step 1: Atualizar o tipo `Props`**

Trocar:
```ts
type Props = {
  conciliacaoId: string
  dataRef: string
  valorRef: number
  vendaVinculada?: { id: string; numero: number; clienteNome: string; valor: string } | null
  tipoVinculado?: 'moto' | 'peca'
}
```
por:
```ts
type Props = {
  conciliacaoId: string
  dataRef: string
  valorRef: number
  vendaVinculada?: { id: string; numero: number; clienteNome: string; valor: string } | null
  tipoVinculado?: 'moto' | 'peca' | 'os'
}
```

- [ ] **Step 2: Atualizar `vincular()`**

Trocar:
```ts
  function vincular(alvoId: string, tipo: 'moto' | 'peca') {
```
por:
```ts
  function vincular(alvoId: string, tipo: 'moto' | 'peca' | 'os') {
```

- [ ] **Step 3: Badge "OS" em `renderVenda`**

Localizar:
```ts
          <span className="font-medium text-slate-800">
            {v.tipo === 'peca' && (
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mr-1.5">PA</span>
            )}
            Venda #{v.numero} — {v.clienteNome}
          </span>
```
Substituir por:
```ts
          <span className="font-medium text-slate-800">
            {v.tipo === 'peca' && (
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mr-1.5">PA</span>
            )}
            {v.tipo === 'os' && (
              <span className="text-xs font-semibold text-teal-600 bg-teal-50 rounded px-1.5 py-0.5 mr-1.5">OS</span>
            )}
            {v.tipo === 'os' ? `OS #${v.numero}` : `Venda #${v.numero}`} — {v.clienteNome}
          </span>
```

- [ ] **Step 4: Badge "OS" no estado já-vinculado**

Localizar:
```ts
          {tipoVinculado === 'peca' && (
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1 py-0.5">PA</span>
          )}
```
Substituir por:
```ts
          {tipoVinculado === 'peca' && (
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1 py-0.5">PA</span>
          )}
          {tipoVinculado === 'os' && (
            <span className="text-xs font-semibold text-teal-600 bg-teal-50 rounded px-1 py-0.5">OS</span>
          )}
```

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros — agora sim, com Task 4 e Task 5 completas, o `type-check` deve passar limpo ponta a ponta.

- [ ] **Step 6: Build**

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, rota `/conciliacao` normal.

- [ ] **Step 7: Checagem manual no navegador**

Com o dev server rodando, logar como admin, ir em uma OS com pagamento em aberto, registrar um pagamento com forma "Cartão de Crédito" preenchendo operadora/parcelas/autorização, confirmar que salva sem erro. Ir em `/conciliacao`, abrir "Vincular" numa transação com valor igual ao da OS testada, confirmar que a OS aparece nas sugestões com badge "OS", vincular, confirmar que aparece como vinculada com o badge "OS" e que dá pra desvincular.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/conciliacao/components/vincular-venda-button.tsx"
git commit -m "$(cat <<'EOF'
feat: badge e fluxo de vinculo de OS no botao de conciliacao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Webhook `api/conciliacao/cartao/route.ts` — paridade de OS

**Files:**
- Modify: `D:\Claude\Teste\src\app\api\conciliacao\cartao\route.ts`

**Interfaces:**
- Consumes: `ordensServico.pagamentos`, `conciliacoesCartao.osId` (Task 1).

- [ ] **Step 1: Atualizar o import**

Trocar:
```ts
import { conciliacoesCartao, vendas, vendasPecas } from '@/lib/db/schema'
```
por:
```ts
import { conciliacoesCartao, vendas, vendasPecas, ordensServico } from '@/lib/db/schema'
```

- [ ] **Step 2: Adicionar fallback de OS**

Localizar:
```ts
    // Se não casou com venda de moto, tenta venda de peças/acessórios (mesma tolerância)
    let pecaVendaId: string | null = null
    if (!vendaId) {
      const pecasCandidatas = await db
        .select({ id: vendasPecas.id, pagamentos: vendasPecas.pagamentos })
        .from(vendasPecas)
        .where(between(vendasPecas.dataVenda, dataMin, dataMax))

      for (const v of pecasCandidatas) {
        const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
        const pgtoCartao = pgtos.find(p =>
          ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
          Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
          (!p.parcelas || p.parcelas === t.parcelas)
        )
        if (pgtoCartao) { pecaVendaId = v.id; break }
      }
    }
```
Substituir por:
```ts
    // Se não casou com venda de moto, tenta venda de peças/acessórios (mesma tolerância)
    let pecaVendaId: string | null = null
    if (!vendaId) {
      const pecasCandidatas = await db
        .select({ id: vendasPecas.id, pagamentos: vendasPecas.pagamentos })
        .from(vendasPecas)
        .where(between(vendasPecas.dataVenda, dataMin, dataMax))

      for (const v of pecasCandidatas) {
        const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
        const pgtoCartao = pgtos.find(p =>
          ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
          Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
          (!p.parcelas || p.parcelas === t.parcelas)
        )
        if (pgtoCartao) { pecaVendaId = v.id; break }
      }
    }

    // Se também não casou com peça, tenta Ordem de Serviço (mesma tolerância)
    let osId: string | null = null
    if (!vendaId && !pecaVendaId) {
      const osCandidatas = await db
        .select({ id: ordensServico.id, pagamentos: ordensServico.pagamentos })
        .from(ordensServico)
        .where(between(ordensServico.dataConclusao, dataMin, dataMax))

      for (const v of osCandidatas) {
        const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
        const pgtoCartao = pgtos.find(p =>
          ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
          Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
          (!p.parcelas || p.parcelas === t.parcelas)
        )
        if (pgtoCartao) { osId = v.id; break }
      }
    }
```

- [ ] **Step 3: Incluir `osId` no insert final**

Trocar:
```ts
    const matched = vendaId ?? pecaVendaId
    await db.insert(conciliacoesCartao).values({
      grupoId: '00000000-0000-4000-8000-000000000001',
      operadora,
      dataTransacao: t.dataTransacao,
      nsu: t.nsu ?? null,
      autorizacao: t.autorizacao ?? null,
      valorBruto: String(t.valorBruto),
      valorLiquido: t.valorLiquido != null ? String(t.valorLiquido) : null,
      parcelas: t.parcelas,
      tipo: t.tipo,
      status: t.status,
      vendaId: vendaId ?? undefined,
      pecaVendaId: pecaVendaId ?? undefined,
      conciliado: matched !== null,
      conciliadoEm: matched !== null ? new Date() : null,
      rawData: t.rawData ?? null,
    })
```
por:
```ts
    const matched = vendaId ?? pecaVendaId ?? osId
    await db.insert(conciliacoesCartao).values({
      grupoId: '00000000-0000-4000-8000-000000000001',
      operadora,
      dataTransacao: t.dataTransacao,
      nsu: t.nsu ?? null,
      autorizacao: t.autorizacao ?? null,
      valorBruto: String(t.valorBruto),
      valorLiquido: t.valorLiquido != null ? String(t.valorLiquido) : null,
      parcelas: t.parcelas,
      tipo: t.tipo,
      status: t.status,
      vendaId: vendaId ?? undefined,
      pecaVendaId: pecaVendaId ?? undefined,
      osId: osId ?? undefined,
      conciliado: matched !== null,
      conciliadoEm: matched !== null ? new Date() : null,
      rawData: t.rawData ?? null,
    })
```

- [ ] **Step 4: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check && npm run build
```

Expected: ambos limpos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/conciliacao/cartao/route.ts"
git commit -m "$(cat <<'EOF'
feat: paridade de OS no webhook de conciliacao de cartao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"` e repetir a checagem manual da Task 5/Step 7 direto em produção.
