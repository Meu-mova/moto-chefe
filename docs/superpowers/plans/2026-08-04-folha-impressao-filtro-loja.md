# Folha: filtro por loja e impressão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar a folha de pagamento por loja e imprimir o fechamento de cada loja para enviar à contabilidade.

**Architecture:** O cálculo da folha sai de dentro de `page.tsx` e vira duas peças em `src/lib/queries/folha.ts`: uma que busca do banco e uma **pura** que agrega — testável sem banco. A tela e a nova rota de impressão chamam as mesmas peças, então nunca divergem. O filtro por loja restringe as lojas antes das consultas.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle + postgres.js, `node:test` + `node:assert/strict`.

Spec: `docs/superpowers/specs/2026-08-04-folha-impressao-filtro-loja-design.md`

## Global Constraints

- **O Cesar está fechando julho/2026 agora.** A Task 1 grava os números atuais e a Task 2 só é aceita se a saída for **idêntica**, centavo a centavo. Qualquer diferença reverte a refatoração.
- **Testes:** `node --import tsx --test`; o script `test` do `package.json` é uma **lista explícita de arquivos, sem glob** — arquivo novo tem que ser acrescentado à mão.
- **Nunca `Date` cru dentro de `` sql`` ``** (postgres.js com `prepare:false` estoura em runtime; o `tsc` não pega).
- **Datas de período** usam `inicioDoDiaBrt`/`fimDoDiaBrt` de `@/lib/data-venda` — comparar com meia-noite UTC já escondeu 12 vendas e R$ 159.494,46 de julho.
- **UI é @base-ui/react, não Radix.** Para o seletor de loja, usar `<select>` nativo: o `<Select>` do projeto mostra o *value* cru quando ele difere do rótulo exibido (id da loja vs nome).
- **A página é restrita a admins** (`ADMINS` em `page.tsx`), e a rota de impressão precisa do **mesmo gate** — rota nova sem gate é rota aberta.
- Comentários e textos de tela em português brasileiro.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/queries/folha.ts` (criar) | `buscarDadosFolha` (I/O) e `agregarFolha` (pura). Único lugar onde a folha é calculada. |
| `src/lib/queries/folha.test.ts` (criar) | Testes da agregação, sem banco. |
| `src/app/(dashboard)/folha-pagamento/page.tsx` (modificar) | Passa a chamar o lib; ganha o filtro de loja e o botão de imprimir. |
| `src/app/(dashboard)/folha-pagamento/components/loja-selector-folha.tsx` (criar) | Seletor de loja (client), no padrão do seletor de mês. |
| `src/app/(print)/folha-pagamento/imprimir/page.tsx` (criar) | A folha em papel, com CPF. |
| `src/app/(dashboard)/relatorio-fabrica/print-button.tsx` (modificar) | Passa a receber `href` por parâmetro, para servir às duas telas. |

---

### Task 1: Congelar os números de julho antes de mexer

**Files:**
- Create (temporário, apagado ao fim da Task 2): `scripts/_tmp-folha-antes.ts`
- Create: `docs/superpowers/plans/dados/folha-julho-antes.json`

**Interfaces:**
- Produces: o arquivo JSON com a folha de julho/2026 por loja, usado como gabarito na Task 2.

- [ ] **Step 1: Escrever o script que lê a folha como ela está hoje**

O cálculo ainda mora em `page.tsx` e não é importável. O jeito mais seguro de reproduzi-lo sem risco de traduzir algo errado: **copie `page.tsx` inteiro para o script e apague o que não é cálculo** — todo o `return (...)` com JSX, os imports de componentes e o gate de papel. Sobram `valorLiquidoExpr`, o `Promise.all` com as 12 consultas e a agregação até `totalGeral`. Não reescreva nada; o objetivo é fotografar o comportamento atual, defeitos inclusive.

Rodar para `mes = '2026-07'`, para **cada loja separadamente e para o conjunto todo** (variando o `lojaIdsGrupo` usado nas consultas).

Para cada execução, gravar: nome do funcionário, `baseComissao`, `salario`, `comissao`, `premiacao`, `ajudaCusto`, `totalPagar`, e os cinco totais. Números como string com 2 casas, para a comparação ser textual e não sofrer com ponto flutuante.

```ts
// scripts/_tmp-folha-antes.ts — TEMPORÁRIO, apagar no fim da Task 2.
// Gabarito da folha de julho ANTES da refatoração. Se a Task 2 mudar qualquer
// valor daqui, a refatoração está errada e volta atrás.
import fs from 'node:fs'
// ... (copiar as consultas e a agregação de page.tsx, sem alterar nada)

const saida = { gerado: '2026-08-04', mes: '2026-07', porLoja: {} as Record<string, unknown> }
// para cada lojaId (e a chave 'TODAS'), rodar o cálculo e preencher saida.porLoja
fs.writeFileSync('docs/superpowers/plans/dados/folha-julho-antes.json', JSON.stringify(saida, null, 2))
```

- [ ] **Step 2: Rodar e conferir que o arquivo tem conteúdo**

Run: `npx dotenv -e .env.local -- npx tsx scripts/_tmp-folha-antes.ts`
Expected: o JSON existe, tem uma entrada por loja mais `TODAS`, e os totais de `TODAS` batem com o que a tela `/folha-pagamento?mes=2026-07` mostra hoje. **Confira essa igualdade na tela antes de seguir** — se o gabarito já nasce errado, ele não serve de trava.

- [ ] **Step 3: Commit do gabarito**

```bash
git add docs/superpowers/plans/dados/folha-julho-antes.json
git commit -m "chore(folha): congela numeros de julho antes da refatoracao"
```

---

### Task 2: Extrair o cálculo para um lib compartilhado

**Files:**
- Create: `src/lib/queries/folha.ts`
- Test: `src/lib/queries/folha.test.ts`
- Modify: `src/app/(dashboard)/folha-pagamento/page.tsx`
- Modify: `package.json`
- Delete: `scripts/_tmp-folha-antes.ts`

**Interfaces:**
- Consumes: `resolverBaseComissao`, `calcularPremiacao`, `TotaisBase` (`@/lib/folha`); `temPapel` (`@/lib/auth`); `inicioDoDiaBrt`/`fimDoDiaBrt` (`@/lib/data-venda`).
- Produces:

```ts
export type DadosFolha = {
  funcionarios: { id: string; nome: string; papel: string; papeisExtras: string[] | null; lojaId: string | null; lojaNome: string }[]
  configs: { usuarioId: string; salario: string; comissaoPercentual: string; ajudaCusto: string | null; ativo: boolean; baseComissao: string }[]
  faixas: { id: string; valorMinimoVendas: string; premiacao: string }[]
  vendasPorVendedor: { vendedorId: string; total: string }[]
  pecasPorVendedor: { vendedorId: string; total: string }[]
  osPorMecanico: { mecanicoId: string | null; total: string }[]
  osPecasPorAbertaPor: { abertaPor: string; total: string }[]
  motosPorLoja: { lojaId: string; total: string }[]
  pecasPorLoja: { lojaId: string; total: string }[]
  osPecasPorLoja: { lojaId: string; total: string }[]
  ajustes: { id: string; lojaId: string; lojaNome: string; tipo: string; usuarioId: string | null; usuarioNome: string | null; valor: string; observacao: string | null }[]
  lojas: { id: string; nome: string }[]
}

export type FuncionarioFolha = {
  id: string; nome: string; papel: string; lojaNome: string
  salario: number; comissaoPercentual: number; ajudaCusto: number; ativo: boolean
  baseComissao: number; comissao: number; premiacao: number; totalPagar: number
}

export type FolhaDoMes = {
  todos: FuncionarioFolha[]
  ativos: FuncionarioFolha[]
  totais: { salarios: number; comissoes: number; premiacoes: number; ajudaCusto: number; geral: number }
}

export async function buscarDadosFolha(p: { mes: string; lojaIds: string[]; grupoId: string }): Promise<DadosFolha>
export function agregarFolha(dados: DadosFolha): FolhaDoMes
```

A divisão existe para o teste: `agregarFolha` é pura e recebe números prontos, então dá para provar as regras de comissão sem banco.

- [ ] **Step 1: Escrever os testes da agregação**

Criar `src/lib/queries/folha.test.ts`. Monte um `DadosFolha` mínimo em cada teste (só os campos que o caso usa; os demais como arrays vazios).

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarFolha, type DadosFolha } from './folha'

const VAZIO: DadosFolha = {
  funcionarios: [], configs: [], faixas: [],
  vendasPorVendedor: [], pecasPorVendedor: [], osPorMecanico: [], osPecasPorAbertaPor: [],
  motosPorLoja: [], pecasPorLoja: [], osPecasPorLoja: [], ajustes: [], lojas: [],
}

const func = (over: Partial<DadosFolha['funcionarios'][0]> = {}) => ({
  id: 'u1', nome: 'Fulano', papel: 'vendedor', papeisExtras: [], lojaId: 'L1', lojaNome: 'Pouso Alegre', ...over,
})
const config = (over: Partial<DadosFolha['configs'][0]> = {}) => ({
  usuarioId: 'u1', salario: '2000', comissaoPercentual: '1', ajudaCusto: null, ativo: true, baseComissao: 'padrao', ...over,
})

test('vendedor comissiona sobre as próprias motos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config()],
    vendasPorVendedor: [{ vendedorId: 'u1', total: '100000' }],
    motosPorLoja: [{ lojaId: 'L1', total: '500000' }],
  })
  assert.equal(r.ativos[0].baseComissao, 100000)   // as dele, não as da loja
  assert.equal(r.ativos[0].comissao, 1000)         // 1%
  assert.equal(r.ativos[0].totalPagar, 3000)       // salário + comissão
})

test('aux_adm com base de loja comissiona sobre o total da loja', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func({ papel: 'aux_adm' })],
    configs: [config({ baseComissao: 'loja_motos', comissaoPercentual: '0.5' })],
    vendasPorVendedor: [{ vendedorId: 'u1', total: '0' }],
    motosPorLoja: [{ lojaId: 'L1', total: '500000' }],
  })
  assert.equal(r.ativos[0].baseComissao, 500000)
  assert.equal(r.ativos[0].comissao, 2500)
})

test('mecânico comissiona só sobre mão de obra, não sobre peça da OS', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func({ papel: 'mecanico' })],
    configs: [config({ comissaoPercentual: '10' })],
    osPorMecanico: [{ mecanicoId: 'u1', total: '3000' }],
    osPecasPorAbertaPor: [{ abertaPor: 'u1', total: '9999' }],
  })
  assert.equal(r.ativos[0].baseComissao, 3000)
  assert.equal(r.ativos[0].comissao, 300)
})

test('mês sem venda nenhuma zera tudo, sem NaN', () => {
  const r = agregarFolha({ ...VAZIO, funcionarios: [func()], configs: [config()] })
  const f = r.ativos[0]
  for (const v of [f.baseComissao, f.comissao, f.premiacao]) {
    assert.equal(Number.isNaN(v), false)
    assert.equal(v, 0)
  }
  assert.equal(f.totalPagar, 2000)                 // só o salário
  assert.equal(r.totais.geral, 2000)
})

test('funcionário inativo sai dos ativos e dos totais, mas fica em todos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Inativo' })],
    configs: [config(), config({ usuarioId: 'u2', ativo: false, salario: '9999' })],
  })
  assert.equal(r.todos.length, 2)
  assert.equal(r.ativos.length, 1)
  assert.equal(r.totais.salarios, 2000)            // não soma o inativo
})

test('ajuste de venda soma na base da loja E na do funcionário apontado', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Colega' })],
    configs: [config({ baseComissao: 'loja_motos' }), config({ usuarioId: 'u2' })],
    motosPorLoja: [{ lojaId: 'L1', total: '1000' }],
    vendasPorVendedor: [{ vendedorId: 'u2', total: '1000' }],
    ajustes: [{ id: 'a1', lojaId: 'L1', lojaNome: 'Pouso Alegre', tipo: 'motos', usuarioId: 'u2', usuarioNome: 'Colega', valor: '500', observacao: null }],
  })
  const comBaseDeLoja = r.ativos.find(f => f.id === 'u1')!
  const apontado = r.ativos.find(f => f.id === 'u2')!
  assert.equal(comBaseDeLoja.baseComissao, 1500)   // loja recebeu o ajuste
  assert.equal(apontado.baseComissao, 1500)        // e o funcionário também
})

test('totais são a soma dos ativos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Outro' })],
    configs: [config({ ajudaCusto: '300' }), config({ usuarioId: 'u2', salario: '1500' })],
  })
  assert.equal(r.totais.salarios, 3500)
  assert.equal(r.totais.ajudaCusto, 300)
  assert.equal(r.totais.geral, 3800)
})
```

Acrescentar `src/lib/queries/folha.test.ts` ao script `test` do `package.json`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/queries/folha.test.ts`
Expected: FAIL — `Cannot find module './folha'`

- [ ] **Step 3: Criar o lib movendo o código, sem reescrever**

Criar `src/lib/queries/folha.ts` **movendo** de `src/app/(dashboard)/folha-pagamento/page.tsx`:

- a função `valorLiquidoExpr()` (topo do arquivo, ~linhas 20-46);
- as 12 consultas do `Promise.all` (~linhas 65-220) → corpo de `buscarDadosFolha`, trocando `lojaIdsGrupo` pelo parâmetro `lojaIds`, `grupo.id` por `grupoId` e as bordas do mês por `inicioDoDiaBrt`/`fimDoDiaBrt` como já estão hoje;
- toda a agregação (`configPorUsuario` até `totalGeral`, ~linhas 222-300) → corpo de `agregarFolha`.

Não altere nenhuma regra no caminho: é mudança de lugar, não de comportamento. Os comentários que explicam as decisões (venda de `admin_geral` fora da base da loja, OTE sobre motos próprias, ajuste somando nos dois lugares) vão junto — são o que impede alguém de "simplificar" a regra depois.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/queries/folha.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Fazer a página usar o lib**

Em `page.tsx`, trocar todo o bloco removido por:

```tsx
const dados = await buscarDadosFolha({ mes: mesParam, lojaIds: lojaIdsGrupo, grupoId: grupo.id })
const folha = agregarFolha(dados)
```

e ajustar as referências: `funcionariosAtivos` → `folha.ativos`, `funcionarios` → `folha.todos`, os cinco totais → `folha.totais.*`. `funcionariosParaConfig`, `funcionariosParaAjuste` e `faixasParaUI` continuam derivando de `dados`.

- [ ] **Step 6: Provar que nenhum número mudou**

Run: `npm run type-check && npm test && npm run build`

Depois, o que decide a task: rode de novo o cálculo de julho — agora pelo lib — para cada loja e para o conjunto, e **compare com `docs/superpowers/plans/dados/folha-julho-antes.json`**. Use um script temporário que carrega o JSON e compara campo a campo, imprimindo qualquer divergência.

Expected: **zero divergências**. Se aparecer qualquer diferença, pare, não commite, e relate — a refatoração está errada.

- [ ] **Step 7: Limpar e commitar**

```bash
rm scripts/_tmp-folha-antes.ts
git add src/lib/queries/folha.ts src/lib/queries/folha.test.ts package.json "src/app/(dashboard)/folha-pagamento/page.tsx"
git commit -m "refactor(folha): calculo sai da pagina para lib compartilhada, com testes"
```

---

### Task 3: Filtro por loja

**Files:**
- Create: `src/app/(dashboard)/folha-pagamento/components/loja-selector-folha.tsx`
- Modify: `src/app/(dashboard)/folha-pagamento/page.tsx`

**Interfaces:**
- Consumes: `buscarDadosFolha`/`agregarFolha` (Task 2).
- Produces: query param `?loja=<id>` respeitado pela página.

- [ ] **Step 1: O seletor**

Criar `src/app/(dashboard)/folha-pagamento/components/loja-selector-folha.tsx`:

```tsx
'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export function LojaSelectorFolha({ lojas, lojaAtual }: {
  lojas: { id: string; nome: string }[]
  lojaAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  function trocar(valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set('loja', valor)
    else params.delete('loja')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    // <select> nativo de propósito: o <Select> do projeto mostra o value cru
    // quando ele difere do rótulo (id da loja vs nome).
    <select
      value={lojaAtual}
      onChange={e => trocar(e.target.value)}
      disabled={pendente}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      <option value="">Todas as lojas</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )
}
```

- [ ] **Step 2: Aplicar o filtro na página**

Em `page.tsx`, depois de `const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)`:

```tsx
  // O filtro entra ANTES das consultas. Filtrar a lista já calculada daria o
  // valor certo por pessoa e o total errado, porque a base de comissão de vários
  // aux_adm incide sobre o total da LOJA (ver BASES_COMISSAO em @/lib/folha).
  const lojaParam = params.loja ?? ''
  const lojaIds = lojaParam && lojaIdsGrupo.includes(lojaParam) ? [lojaParam] : lojaIdsGrupo
```

e passar `lojaIds` para `buscarDadosFolha`. A checagem `lojaIdsGrupo.includes(lojaParam)` não é decorativa: sem ela, um id de loja de outro grupo na URL traria dados de fora do grupo ativo.

Renderizar `<LojaSelectorFolha lojas={dados.lojas} lojaAtual={lojaParam} />` ao lado do `<MesSelectorFolha>`, nas abas **Folha do Mês** e **Funcionários**.

- [ ] **Step 3: Verificar**

Run: `npm run type-check && npm run build`

Com `npm run dev`: abrir `/folha-pagamento?mes=2026-07`, anotar o Total Geral; filtrar cada loja e conferir que **a soma dos totais das lojas bate com o total sem filtro**. Se não bater, há funcionário sem loja ou loja fora do grupo — investigar antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/folha-pagamento"
git commit -m "feat(folha): filtro por loja"
```

---

### Task 4: Impressão

**Files:**
- Create: `src/app/(print)/folha-pagamento/imprimir/page.tsx`
- Modify: `src/app/(dashboard)/relatorio-fabrica/print-button.tsx`
- Modify: `src/app/(dashboard)/folha-pagamento/page.tsx`

**Interfaces:**
- Consumes: `buscarDadosFolha`/`agregarFolha` (Task 2); `usuariosDados` (`@/lib/db/schema`) para o CPF.
- Produces: rota `/folha-pagamento/imprimir?mes=&loja=`.

- [ ] **Step 1: Generalizar o botão existente**

`src/app/(dashboard)/relatorio-fabrica/print-button.tsx` tem a rota fixa no código. Trocar a assinatura para receber `href` e `rotulo`:

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintButton({ href, rotulo = 'Imprimir / PDF' }: { href: string; rotulo?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.open(href, '_blank')}>
      <Printer size={14} className="mr-1.5" />
      {rotulo}
    </Button>
  )
}
```

Atualizar o uso em `/relatorio-fabrica` para passar `href={`/relatorio-fabrica/imprimir?de=${de}&ate=${ate}`}`.

- [ ] **Step 2: A página de impressão**

Criar `src/app/(print)/folha-pagamento/imprimir/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { buscarDadosFolha, agregarFolha } from '@/lib/queries/folha'

const ADMINS = ['admin_geral', 'admin_socio']

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function formatCpf(cpf: string) {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

export default async function FolhaImprimirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  // Mesmo gate da tela. Rota de impressão sem gate é rota aberta.
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const lojaParam = params.loja ?? ''
  const lojaIds = lojaParam && lojaIdsGrupo.includes(lojaParam) ? [lojaParam] : lojaIdsGrupo

  const dados = await buscarDadosFolha({ mes: mesParam, lojaIds, grupoId: grupo.id })
  const folha = agregarFolha(dados)

  const ids = folha.ativos.map(f => f.id)
  const cpfs = ids.length
    ? await db.select({ usuarioId: usuariosDados.usuarioId, cpf: usuariosDados.cpf })
        .from(usuariosDados).where(inArray(usuariosDados.usuarioId, ids))
    : []
  const cpfPorUsuario = new Map(cpfs.map(c => [c.usuarioId, c.cpf]))

  const nomeLoja = lojaParam
    ? (dados.lojas.find(l => l.id === lojaParam)?.nome ?? 'Loja')
    : 'Todas as lojas'
  const mesExtenso = new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <div className="p-8 text-[11px] text-black">
      <style>{`@page { size: A4 portrait; margin: 12mm } @media print { .nao-imprime { display: none } }`}</style>

      <header className="mb-4">
        <h1 className="text-lg font-bold">Folha de pagamento — {grupo.nome}</h1>
        <p className="capitalize">{mesExtenso} · {nomeLoja}</p>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1">Funcionário</th>
            <th className="py-1">CPF</th>
            <th className="py-1 text-right">Base comissão</th>
            <th className="py-1 text-right">Salário</th>
            <th className="py-1 text-right">Comissão</th>
            <th className="py-1 text-right">Premiação</th>
            <th className="py-1 text-right">Ajuda de custo</th>
            <th className="py-1 text-right">Total a pagar</th>
          </tr>
        </thead>
        <tbody>
          {folha.ativos.map(f => {
            const cpf = cpfPorUsuario.get(f.id)
            return (
              <tr key={f.id} className="border-b border-slate-300">
                <td className="py-1">{f.nome}<span className="text-slate-500"> · {f.lojaNome}</span></td>
                <td className="py-1">{cpf ? formatCpf(cpf) : '—'}</td>
                <td className="py-1 text-right">{f.baseComissao > 0 ? fmt(f.baseComissao) : '—'}</td>
                <td className="py-1 text-right">{fmt(f.salario)}</td>
                <td className="py-1 text-right">{f.comissao > 0 ? fmt(f.comissao) : '—'}</td>
                <td className="py-1 text-right">{f.premiacao > 0 ? fmt(f.premiacao) : '—'}</td>
                <td className="py-1 text-right">{f.ajudaCusto > 0 ? fmt(f.ajudaCusto) : '—'}</td>
                <td className="py-1 text-right font-semibold">{fmt(f.totalPagar)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1" colSpan={3}>Totais</td>
            <td className="py-1 text-right">{fmt(folha.totais.salarios)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.comissoes)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.premiacoes)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.ajudaCusto)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.geral)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-slate-500">
        Emitido em {emitidoEm}. O valor de comissão usa o líquido das vendas em cartão já
        conciliadas — conciliações posteriores alteram a base deste mês.
      </p>

      {/* Sem botão: esta é uma Server Component e onClick não existe aqui —
          passar um handler daria erro de build. Ctrl+P resolve. */}
      <p className="nao-imprime mt-6 text-slate-400">Use Ctrl+P para imprimir ou salvar em PDF.</p>
    </div>
  )
}
```

O aviso do rodapé não é enfeite: a base usa o líquido das transações **já conciliadas**, então o mesmo mês impresso hoje e semana que vem pode dar números diferentes. Quem recebe o papel precisa saber que é uma fotografia.

- [ ] **Step 3: O botão na tela**

Em `page.tsx`, ao lado dos seletores de mês e loja, na aba Folha do Mês:

```tsx
<PrintButton href={`/folha-pagamento/imprimir?mes=${mesParam}&loja=${lojaParam}`} rotulo="Imprimir folha" />
```

- [ ] **Step 4: Verificar**

Run: `npm run type-check && npm run build`

Com `npm run dev`: abrir `/folha-pagamento?mes=2026-07`, filtrar uma loja, clicar em Imprimir. Conferir **número por número** que o papel bate com a tela: os cinco totais e ao menos três funcionários. Conferir também que o CPF aparece para quem preencheu e "—" para quem não preencheu, e que a pré-visualização de impressão do navegador cabe em A4 retrato sem cortar a última coluna.

Testar o gate: abrir a URL de impressão logado como `vendedor` e confirmar o redirecionamento para `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(print)/folha-pagamento" "src/app/(dashboard)/folha-pagamento/page.tsx" "src/app/(dashboard)/relatorio-fabrica"
git commit -m "feat(folha): impressao da folha por loja, com CPF"
```

---

## Fora deste plano

Está no spec como fora de escopo e **não deve ser implementado aqui**: recibo individual com assinatura, exportação para Excel, e envio por e-mail ou WhatsApp.
