# Simulação de Frete de Entrega Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Simulador o cálculo de custo de entrega (R$/km ida e volta, com franquia grátis) entre o CEP da loja de origem e um CEP de destino digitado pelo usuário.

**Architecture:** CEP e coordenadas (lat/long, geocodificadas uma única vez) ficam salvos na loja; a simulação de frete geocodifica só o CEP de destino a cada chamada (ViaCEP + Nominatim), calcula distância por Haversine com fator de correção de estrada, e aplica a regra de preço (R$/km e franquia) configurada por grupo em `configuracao_taxas`. O resultado é informativo — soma-se ao total exibido e ao PDF, mas não entra no cálculo de parcelas de cartão/financiamento.

**Tech Stack:** Next.js App Router (Server Actions + Server Components), Drizzle ORM, Postgres (Supabase), ViaCEP (REST público), Nominatim/OpenStreetMap (REST público).

## Global Constraints

- Projeto não tem suite de testes automatizada — verificação é `npm run type-check` + teste manual (`npm run dev`). Não introduzir Jest/Vitest.
- Migrações de banco: nunca usar `npm run db:generate`/`db:migrate` neste repo (journal quebrado) — escrever o SQL manualmente em `src/lib/db/migrations/` e aplicar via a tool `mcp__plugin_supabase_supabase__apply_migration` (`project_id: "bzlaradpofaecqzawyym"`).
- Fator de correção de estrada é fixo em `1.3` no código (não configurável).
- Frete é sempre informativo: soma-se ao total exibido/impresso, nunca entra na base de cálculo de parcelas de cartão/débito/link/financiamento.
- Papéis com acesso ao Simulador: todos exceto `mecanico` (mesma regra de `BLOQUEADOS` já existente em `simulador/page.tsx`).
- Nominatim exige um header `User-Agent` identificando a aplicação (política de uso do serviço).

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/db/migrations/0026_frete_simulador.sql` | Criar — colunas novas em `lojas` e `configuracao_taxas` |
| `src/lib/db/schema.ts` | Modificar — `lojas` (cep/latitude/longitude) e `configuracaoTaxas` (freteValorKm/freteKmGratis) |
| `src/lib/frete.ts` | Criar — geocodificação (ViaCEP + Nominatim), Haversine, cálculo de custo |
| `src/app/(dashboard)/admin/lojas/actions.ts` | Modificar — `criarLojaAction`/`editarLojaAction` aceitam e geocodificam CEP |
| `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx` | Modificar — campo CEP |
| `src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx` | Criar — dialog de edição (nome/cidade/endereço/CEP) |
| `src/app/(dashboard)/admin/lojas/page.tsx` | Modificar — botão "Editar" por linha, passa CEP pra tabela |
| `src/app/(dashboard)/precificacao/page.tsx` | Modificar — passa freteValorKm/freteKmGratis pro client |
| `src/app/(dashboard)/precificacao/components/taxas-form.tsx` | Modificar — aba "Frete" |
| `src/app/(dashboard)/precificacao/actions.ts` | Modificar — `salvarTaxasAction` aceita os 2 campos novos |
| `src/app/(dashboard)/simulador/page.tsx` | Modificar — passa lojas do grupo, papel, lojaUsuarioId, freteConfig |
| `src/app/(dashboard)/simulador/actions.ts` | Modificar — `simularFreteAction` |
| `src/app/(dashboard)/simulador/components/frete-simulador.tsx` | Criar — bloco de UI do frete |
| `src/app/(dashboard)/simulador/components/simulador-client.tsx` | Modificar — integra `FreteSimulador`, mostra total com frete, inclui no PDF |

---

## Task 1: Migração — CEP/lat/long em lojas, config de frete por grupo

**Files:**
- Create: `src/lib/db/migrations/0026_frete_simulador.sql`
- Modify: `src/lib/db/schema.ts:43-50` (tabela `lojas`)
- Modify: `src/lib/db/schema.ts:385-393` (tabela `configuracaoTaxas`)

**Interfaces:**
- Produces: colunas Drizzle `lojas.cep`, `lojas.latitude`, `lojas.longitude` (todas nullable, tipo `string | null` em TS pro numeric); `configuracaoTaxas.freteValorKm` (`string`, not null, default `'3.00'`), `configuracaoTaxas.freteKmGratis` (`number`, not null, default `40`).

- [ ] **Step 1: Escrever a migração SQL**

Criar `src/lib/db/migrations/0026_frete_simulador.sql`:

```sql
ALTER TABLE "lojas" ADD COLUMN "cep" text;
ALTER TABLE "lojas" ADD COLUMN "latitude" numeric(9,6);
ALTER TABLE "lojas" ADD COLUMN "longitude" numeric(9,6);

ALTER TABLE "configuracao_taxas" ADD COLUMN "frete_valor_km" numeric(6,2) NOT NULL DEFAULT 3.00;
ALTER TABLE "configuracao_taxas" ADD COLUMN "frete_km_gratis" integer NOT NULL DEFAULT 40;
```

- [ ] **Step 2: Aplicar a migração no Supabase**

Usar a tool `mcp__plugin_supabase_supabase__apply_migration` com:
- `project_id`: `"bzlaradpofaecqzawyym"`
- `name`: `"frete_simulador"`
- `query`: o conteúdo exato do SQL do Step 1

Expected: sucesso, sem erro de sintaxe/coluna duplicada.

- [ ] **Step 3: Confirmar as colunas no banco**

Usar `mcp__plugin_supabase_supabase__execute_sql` com `project_id: "bzlaradpofaecqzawyym"` e query:

```sql
select column_name, data_type from information_schema.columns where table_name='lojas' and column_name in ('cep','latitude','longitude');
select column_name, data_type, column_default from information_schema.columns where table_name='configuracao_taxas' and column_name in ('frete_valor_km','frete_km_gratis');
```

Expected: 3 linhas no primeiro select (`cep`/text, `latitude`/numeric, `longitude`/numeric), 2 linhas no segundo (com os defaults `3.00` e `40`).

- [ ] **Step 4: Atualizar `src/lib/db/schema.ts` — tabela `lojas`**

Substituir (linhas 43-50):

```ts
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
})
```

por:

```ts
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  cep: text('cep'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
})
```

- [ ] **Step 5: Atualizar `src/lib/db/schema.ts` — tabela `configuracaoTaxas`**

Substituir (linhas 385-393):

```ts
// ─── configuracao_taxas (uma linha por grupo) ────────────────────────────────
export const configuracaoTaxas = pgTable('configuracao_taxas', {
  grupoId: uuid('grupo_id').primaryKey().references(() => grupos.id),
  taxasCartao: jsonb('taxas_cartao').$type<Record<string, number>>().notNull().default({}),
  taxasDebito: jsonb('taxas_debito').$type<Record<string, number>>().notNull().default({}),
  taxasLink: jsonb('taxas_link').$type<Record<string, number>>().notNull().default({}),
  taxasFinanciamento: jsonb('taxas_financiamento').$type<Record<string, number>>().notNull().default({}),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

por:

```ts
// ─── configuracao_taxas (uma linha por grupo) ────────────────────────────────
export const configuracaoTaxas = pgTable('configuracao_taxas', {
  grupoId: uuid('grupo_id').primaryKey().references(() => grupos.id),
  taxasCartao: jsonb('taxas_cartao').$type<Record<string, number>>().notNull().default({}),
  taxasDebito: jsonb('taxas_debito').$type<Record<string, number>>().notNull().default({}),
  taxasLink: jsonb('taxas_link').$type<Record<string, number>>().notNull().default({}),
  taxasFinanciamento: jsonb('taxas_financiamento').$type<Record<string, number>>().notNull().default({}),
  freteValorKm: numeric('frete_valor_km', { precision: 6, scale: 2 }).notNull().default('3.00'),
  freteKmGratis: integer('frete_km_gratis').notNull().default(40),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/migrations/0026_frete_simulador.sql src/lib/db/schema.ts
git commit -m "feat: colunas de CEP/lat/long em lojas e config de frete por grupo"
```

---

## Task 2: `src/lib/frete.ts` — geocodificação, distância e custo

**Files:**
- Create: `src/lib/frete.ts`

**Interfaces:**
- Consumes: `fetch` global (Node runtime do Next.js).
- Produces:
  - `type Coordenada = { latitude: number; longitude: number }`
  - `geocodificarCep(cep: string): Promise<Coordenada | null>`
  - `calcularDistanciaKm(origem: Coordenada, destino: Coordenada): number`
  - `calcularCustoFrete(distanciaKmIda: number, valorPorKm: number, kmGratis: number): { kmIdaEVolta: number; custo: number }`

- [ ] **Step 1: Criar `src/lib/frete.ts`**

```ts
const FATOR_CORRECAO_ESTRADA = 1.3
const NOMINATIM_USER_AGENT = 'MotoChefe-Simulador/1.0 (contato@motochefesuldeminas.com.br)'

export type Coordenada = { latitude: number; longitude: number }

type EnderecoViaCep = {
  erro?: boolean
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

type ResultadoNominatim = { lat: string; lon: string }

export async function geocodificarCep(cep: string): Promise<Coordenada | null> {
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return null

  let endereco: EnderecoViaCep
  try {
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
    if (!viaCepRes.ok) return null
    endereco = await viaCepRes.json() as EnderecoViaCep
  } catch {
    return null
  }
  if (endereco.erro) return null

  const partes = [endereco.logradouro, endereco.bairro, endereco.localidade, endereco.uf, 'Brasil'].filter(Boolean)
  if (partes.length === 0) return null
  const query = partes.join(', ')

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    const nominatimRes = await fetch(nominatimUrl, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } })
    if (!nominatimRes.ok) return null
    const resultados = await nominatimRes.json() as ResultadoNominatim[]
    if (resultados.length === 0) return null
    const lat = parseFloat(resultados[0].lat)
    const lon = parseFloat(resultados[0].lon)
    if (isNaN(lat) || isNaN(lon)) return null
    return { latitude: lat, longitude: lon }
  } catch {
    return null
  }
}

function toRad(graus: number): number {
  return (graus * Math.PI) / 180
}

export function calcularDistanciaKm(origem: Coordenada, destino: Coordenada): number {
  const raioTerraKm = 6371
  const dLat = toRad(destino.latitude - origem.latitude)
  const dLon = toRad(destino.longitude - origem.longitude)
  const lat1 = toRad(origem.latitude)
  const lat2 = toRad(destino.latitude)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const distanciaLinhaReta = raioTerraKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))

  return distanciaLinhaReta * FATOR_CORRECAO_ESTRADA
}

export function calcularCustoFrete(
  distanciaKmIda: number,
  valorPorKm: number,
  kmGratis: number,
): { kmIdaEVolta: number; custo: number } {
  const kmIdaEVolta = distanciaKmIda * 2
  const kmCobravel = Math.max(0, kmIdaEVolta - kmGratis)
  const custo = kmCobravel * valorPorKm
  return { kmIdaEVolta, custo }
}
```

- [ ] **Step 2: Verificar a matemática manualmente**

Run:

```bash
node -e "
function toRad(g){return g*Math.PI/180}
function dist(a,b){
  const R=6371
  const dLat=toRad(b[0]-a[0])
  const dLon=toRad(b[1]-a[1])
  const lat1=toRad(a[0])
  const lat2=toRad(b[0])
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))
}
const sp=[-23.5505,-46.6333]
const rj=[-22.9068,-43.1729]
const linhaReta = dist(sp,rj)
const comFator = linhaReta*1.3
console.log('linha reta km:', linhaReta.toFixed(1))
console.log('com fator 1.3:', comFator.toFixed(1))
const idaEVolta = comFator*2
const kmGratis = 40
const cobravel = Math.max(0, idaEVolta - kmGratis)
console.log('ida e volta:', idaEVolta.toFixed(1), '| cobrável:', cobravel.toFixed(1), '| custo R\$', (cobravel*3).toFixed(2))
"
```

Expected: linha reta ≈ 360km, com fator ≈ 468km (mesma fórmula usada em `calcularDistanciaKm`) — distância real de estrada SP↔RJ é ~430km, então a aproximação fica na faixa certa. Confirma que `calcularDistanciaKm`/`calcularCustoFrete` em `src/lib/frete.ts` implementam a mesma fórmula (revisão de código, já que não há framework de teste no projeto).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/frete.ts
git commit -m "feat: geocodificação de CEP, distância e cálculo de custo de frete"
```

---

## Task 3: Admin > Lojas — CEP com geocodificação automática

**Files:**
- Modify: `src/app/(dashboard)/admin/lojas/actions.ts`
- Modify: `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx`
- Create: `src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/lojas/page.tsx`

**Interfaces:**
- Consumes: `geocodificarCep` de `@/lib/frete` (Task 2).
- Produces: `criarLojaAction(formData)` e `editarLojaAction(id, formData)` passam a ler `cep` do FormData e gravar `cep`/`latitude`/`longitude`; `<EditarLojaDialog loja={{id,nome,cidade,endereco,cep}} />`.

- [ ] **Step 1: Atualizar `criarLojaAction` e `editarLojaAction`**

Em `src/app/(dashboard)/admin/lojas/actions.ts`, adicionar o import e substituir as duas actions:

```ts
import { geocodificarCep } from '@/lib/frete'
```

Substituir:

```ts
export async function criarLojaAction(formData: FormData) {
  await assertAdmin()
  const grupoId = formData.get('grupoId') as string
  if (!grupoId) throw new Error('Selecione o grupo')
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    grupoId,
  })
  revalidatePath('/admin/lojas')
}

export async function editarLojaAction(id: string, formData: FormData) {
  await assertAdmin()
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
}
```

por:

```ts
async function geocodificarSeInformado(cep: string | null) {
  if (!cep || !cep.trim()) return { cep: null, latitude: null, longitude: null }
  const coord = await geocodificarCep(cep)
  return {
    cep: cep.trim(),
    latitude: coord ? String(coord.latitude) : null,
    longitude: coord ? String(coord.longitude) : null,
  }
}

export async function criarLojaAction(formData: FormData) {
  await assertAdmin()
  const grupoId = formData.get('grupoId') as string
  if (!grupoId) throw new Error('Selecione o grupo')
  const geo = await geocodificarSeInformado(formData.get('cep') as string | null)
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    grupoId,
    ...geo,
  })
  revalidatePath('/admin/lojas')
}

export async function editarLojaAction(id: string, formData: FormData) {
  await assertAdmin()
  const geo = await geocodificarSeInformado(formData.get('cep') as string | null)
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    ...geo,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
  revalidatePath('/simulador')
}
```

Nota: se o CEP não geocodificar (`geocodificarCep` retorna `null`), a loja é salva mesmo assim com `latitude`/`longitude` nulos — o Simulador vai mostrar o aviso de "configure o CEP" pra essa loja até alguém corrigir o CEP.

- [ ] **Step 2: Adicionar campo CEP em `NovaLojaDialog`**

Em `src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx`, adicionar estado e campo:

Depois de `const [endereco, setEndereco] = useState('')`:

```ts
const [cep, setCep] = useState('')
```

No `handleSalvar`, depois de `formData.set('endereco', endereco)`:

```ts
formData.set('cep', cep)
```

E depois de `setNome(''); setCidade(''); setEndereco('')`:

```ts
setCep('')
```

No JSX, depois do bloco "Endereço" (antes do `</div>` que fecha `space-y-4`):

```tsx
<div className="space-y-1.5">
  <Label className="text-xs">CEP</Label>
  <Input
    value={cep}
    onChange={e => setCep(e.target.value)}
    className="h-9 text-sm"
    placeholder="00000-000"
  />
</div>
```

- [ ] **Step 3: Criar `EditarLojaDialog`**

Criar `src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { editarLojaAction } from '../actions'

type Loja = { id: string; nome: string; cidade: string; endereco: string; cep: string | null }

export function EditarLojaDialog({ loja }: { loja: Loja }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nome, setNome] = useState(loja.nome)
  const [cidade, setCidade] = useState(loja.cidade)
  const [endereco, setEndereco] = useState(loja.endereco)
  const [cep, setCep] = useState(loja.cep ?? '')

  function handleOpen() {
    setNome(loja.nome)
    setCidade(loja.cidade)
    setEndereco(loja.endereco)
    setCep(loja.cep ?? '')
    setOpen(true)
  }

  async function handleSalvar() {
    if (!nome.trim() || !cidade.trim() || !endereco.trim()) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('nome', nome)
      formData.set('cidade', cidade)
      formData.set('endereco', endereco)
      formData.set('cep', cep)
      await editarLojaAction(loja.id, formData)
      toast.success('Loja atualizada!')
      setOpen(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" variant="outline" className="gap-1.5">
        <Pencil size={14} /> Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Loja</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço *</Label>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <Input value={cep} onChange={e => setCep(e.target.value)} className="h-9 text-sm" placeholder="00000-000" />
              <p className="text-[11px] text-slate-400">Usado pra calcular frete no Simulador.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: Adicionar botão "Editar" em `admin/lojas/page.tsx`**

Adicionar import:

```ts
import { EditarLojaDialog } from './components/editar-loja-dialog'
```

Na query de `todas`, incluir `cep` no select:

```ts
.select({
  id: lojas.id, nome: lojas.nome, cidade: lojas.cidade, endereco: lojas.endereco,
  ativa: lojas.ativa, grupoNome: grupos.nome, cep: lojas.cep,
})
```

Substituir a célula de ações (linha com `{isSuperAdmin && <DesativarLojaButton lojaId={loja.id} />}`):

```tsx
{isSuperAdmin && (
  <TableCell>
    <div className="flex items-center gap-2">
      <EditarLojaDialog loja={{ id: loja.id, nome: loja.nome, cidade: loja.cidade, endereco: loja.endereco, cep: loja.cep }} />
      {loja.ativa && <DesativarLojaButton lojaId={loja.id} />}
    </div>
  </TableCell>
)}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 6: Teste manual**

Rodar `npm run dev`, entrar como `admin_geral` em `/admin/lojas`, clicar "Editar" numa loja (ex: Poços de Caldas), preencher CEP real (ex: `37701-015`), salvar. Confirmar toast de sucesso.

Verificar no banco (via `mcp__plugin_supabase_supabase__execute_sql`, `project_id: "bzlaradpofaecqzawyym"`):

```sql
select nome, cep, latitude, longitude from lojas where nome = 'Poços de Caldas';
```

Expected: `cep` preenchido, `latitude`/`longitude` não nulos (a menos que a geocodificação tenha falhado — nesse caso repetir com outro CEP válido pra confirmar que funciona).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/admin/lojas/actions.ts" "src/app/(dashboard)/admin/lojas/components/nova-loja-dialog.tsx" "src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx" "src/app/(dashboard)/admin/lojas/page.tsx"
git commit -m "feat: editar loja com CEP, geocodificado automaticamente"
```

---

## Task 4: Precificação — aba "Frete" (valor/km e franquia por grupo)

**Files:**
- Modify: `src/app/(dashboard)/precificacao/actions.ts`
- Modify: `src/app/(dashboard)/precificacao/page.tsx`
- Modify: `src/app/(dashboard)/precificacao/components/taxas-form.tsx`

**Interfaces:**
- Consumes: `configuracaoTaxas.freteValorKm`/`freteKmGratis` (Task 1).
- Produces: `salvarTaxasAction` aceita `freteValorKm: string` e `freteKmGratis: number` no `TaxasPayload`.

- [ ] **Step 1: Atualizar `TaxasPayload` e `salvarTaxasAction`**

Em `src/app/(dashboard)/precificacao/actions.ts`, substituir:

```ts
export type TaxasPayload = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

export async function salvarTaxasAction(data: TaxasPayload) {
  const grupo = await checarAdmin()
  await db
    .insert(configuracaoTaxas)
    .values({ grupoId: grupo.id, ...data })
    .onConflictDoUpdate({
      target: configuracaoTaxas.grupoId,
      set: {
        taxasCartao: data.taxasCartao,
        taxasDebito: data.taxasDebito,
        taxasLink: data.taxasLink,
        taxasFinanciamento: data.taxasFinanciamento,
        atualizadoEm: sql`NOW()`,
      },
    })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}
```

por:

```ts
export type TaxasPayload = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
}

export async function salvarTaxasAction(data: TaxasPayload) {
  const grupo = await checarAdmin()
  await db
    .insert(configuracaoTaxas)
    .values({ grupoId: grupo.id, ...data })
    .onConflictDoUpdate({
      target: configuracaoTaxas.grupoId,
      set: {
        taxasCartao: data.taxasCartao,
        taxasDebito: data.taxasDebito,
        taxasLink: data.taxasLink,
        taxasFinanciamento: data.taxasFinanciamento,
        freteValorKm: data.freteValorKm,
        freteKmGratis: data.freteKmGratis,
        atualizadoEm: sql`NOW()`,
      },
    })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}
```

- [ ] **Step 2: Passar os campos de frete em `precificacao/page.tsx`**

Substituir:

```ts
const taxas = taxasRow[0] ?? {
  taxasCartao: {} as Record<string, number>,
  taxasDebito: {} as Record<string, number>,
  taxasLink: {} as Record<string, number>,
  taxasFinanciamento: {} as Record<string, number>,
}
```

por:

```ts
const taxas = taxasRow[0] ?? {
  taxasCartao: {} as Record<string, number>,
  taxasDebito: {} as Record<string, number>,
  taxasLink: {} as Record<string, number>,
  taxasFinanciamento: {} as Record<string, number>,
  freteValorKm: '3.00',
  freteKmGratis: 40,
}
```

E no JSX, no objeto passado pra `<PrecificacaoClient taxas={{...}}>`, adicionar depois de `taxasFinanciamento`:

```tsx
freteValorKm: taxas.freteValorKm ?? '3.00',
freteKmGratis: taxas.freteKmGratis ?? 40,
```

- [ ] **Step 3: Repassar `taxas` do `PrecificacaoClient` pro `TaxasForm`**

Ler `src/app/(dashboard)/precificacao/components/precificacao-client.tsx` e confirmar que ele recebe `taxas` via props e repassa direto pro `<TaxasForm taxas={taxas} />` sem reformatar campos (padrão esperado, já que os outros campos de taxa passam direto). Se o tipo `Taxas` estiver declarado localmente nesse arquivo (não importado de `taxas-form.tsx`), adicionar `freteValorKm: string` e `freteKmGratis: number` a esse tipo também.

- [ ] **Step 4: Adicionar aba "Frete" em `TaxasForm`**

Em `src/app/(dashboard)/precificacao/components/taxas-form.tsx`:

Atualizar o tipo `Taxas`:

```ts
type Taxas = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
}
```

No componente `TaxasForm`, adicionar estado (depois de `const [financiamento, ...]`):

```ts
const [freteValorKm, setFreteValorKm] = useState(taxas.freteValorKm)
const [freteKmGratis, setFreteKmGratis] = useState(String(taxas.freteKmGratis))
```

Em `handleSave`, incluir os campos no payload:

```ts
await salvarTaxasAction({
  taxasCartao: buildDecimalMap(cartao),
  taxasDebito: buildDecimalMap(debito),
  taxasLink: buildDecimalMap(link),
  taxasFinanciamento: buildDecimalMap(financiamento),
  freteValorKm: freteValorKm || '3.00',
  freteKmGratis: parseInt(freteKmGratis, 10) || 40,
})
```

Adicionar o import do `CurrencyInput`:

```ts
import { CurrencyInput } from '@/components/ui/currency-input'
```

Adicionar a aba na `TabsList` (depois de `<TabsTrigger value="financiamento">Financiamento</TabsTrigger>`):

```tsx
<TabsTrigger value="frete">Frete</TabsTrigger>
```

Adicionar o `TabsContent` (depois do de `financiamento`):

```tsx
<TabsContent value="frete" className="mt-4">
  <div className="max-w-xs space-y-4">
    <p className="text-xs text-slate-400">
      Usado na simulação de frete de entrega (Simulador), calculado sobre a distância ida e volta entre a loja e o CEP de destino.
    </p>
    <div className="space-y-1.5">
      <Label className="text-xs">Valor por km (R$)</Label>
      <CurrencyInput value={freteValorKm} onChange={setFreteValorKm} className="h-9 text-sm" />
    </div>
    <div className="space-y-1.5">
      <Label className="text-xs">Km grátis (ida e volta)</Label>
      <Input
        type="number"
        min="0"
        step="1"
        className="h-9 text-sm"
        value={freteKmGratis}
        onChange={e => setFreteKmGratis(e.target.value)}
      />
    </div>
  </div>
</TabsContent>
```

(O componente `Label` e `Input` já estão importados no topo do arquivo.)

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 6: Teste manual**

`npm run dev`, entrar em `/precificacao` como admin, aba "Frete", conferir que já aparece `3,00` e `40` (defaults), mudar pra `3,50` e `50`, salvar, recarregar a página e confirmar que os valores persistiram.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/precificacao/actions.ts" "src/app/(dashboard)/precificacao/page.tsx" "src/app/(dashboard)/precificacao/components/taxas-form.tsx"
git commit -m "feat: configuração de valor/km e franquia de frete por grupo em Precificação"
```

---

## Task 5: Simulador — bloco de frete, cálculo e total

**Files:**
- Modify: `src/app/(dashboard)/simulador/page.tsx`
- Modify: `src/app/(dashboard)/simulador/actions.ts`
- Create: `src/app/(dashboard)/simulador/components/frete-simulador.tsx`
- Modify: `src/app/(dashboard)/simulador/components/simulador-client.tsx`

**Interfaces:**
- Consumes: `geocodificarCep`, `calcularDistanciaKm`, `calcularCustoFrete` de `@/lib/frete` (Task 2); `listarLojasDoGrupoAtivo`, `getGrupoIdDaLoja` de `@/lib/grupo`.
- Produces:
  - `export type ResultadoFrete = { ok: true; distanciaKmIda: number; kmIdaEVolta: number; custo: number; gratis: boolean } | { ok: false; motivo: 'cep_invalido' | 'geocodificacao_falhou' }` em `simulador/actions.ts`
  - `simularFreteAction(lojaId: string, cepDestino: string): Promise<ResultadoFrete>`
  - `<FreteSimulador lojas={{id,nome,temCep:boolean}[]} isAdmin={boolean} lojaUsuarioId={string|null} onResultado={(r: ResultadoFrete | null) => void} />`

- [ ] **Step 1: `simularFreteAction` em `simulador/actions.ts`**

Adicionar aos imports do topo do arquivo:

```ts
import { lojas, configuracaoTaxas } from '@/lib/db/schema'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { geocodificarCep, calcularDistanciaKm, calcularCustoFrete } from '@/lib/frete'
```

Adicionar (após os imports, antes de `const ADMINS = [...]`):

```ts
const BLOQUEADOS_FRETE = ['mecanico']

export type ResultadoFrete =
  | { ok: true; distanciaKmIda: number; kmIdaEVolta: number; custo: number; gratis: boolean }
  | { ok: false; motivo: 'cep_invalido' | 'geocodificacao_falhou' }

export async function simularFreteAction(lojaId: string, cepDestino: string): Promise<ResultadoFrete> {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS_FRETE.includes(usuario.papel)) throw new Error('Sem permissão')

  const cepLimpo = cepDestino.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return { ok: false, motivo: 'cep_invalido' }

  const [loja] = await db
    .select({ latitude: lojas.latitude, longitude: lojas.longitude })
    .from(lojas)
    .where(eq(lojas.id, lojaId))
    .limit(1)
  if (!loja || loja.latitude === null || loja.longitude === null) {
    return { ok: false, motivo: 'geocodificacao_falhou' }
  }

  const coordDestino = await geocodificarCep(cepLimpo)
  if (!coordDestino) return { ok: false, motivo: 'geocodificacao_falhou' }

  const distanciaKmIda = calcularDistanciaKm(
    { latitude: Number(loja.latitude), longitude: Number(loja.longitude) },
    coordDestino,
  )

  const grupoId = await getGrupoIdDaLoja(lojaId)
  const [taxas] = await db
    .select({ freteValorKm: configuracaoTaxas.freteValorKm, freteKmGratis: configuracaoTaxas.freteKmGratis })
    .from(configuracaoTaxas)
    .where(eq(configuracaoTaxas.grupoId, grupoId))
    .limit(1)
  const valorPorKm = taxas ? Number(taxas.freteValorKm) : 3
  const kmGratis = taxas ? Number(taxas.freteKmGratis) : 40

  const { kmIdaEVolta, custo } = calcularCustoFrete(distanciaKmIda, valorPorKm, kmGratis)

  return { ok: true, distanciaKmIda, kmIdaEVolta, custo, gratis: custo === 0 }
}
```

Nota: `loja` sem `latitude`/`longitude` cadastrados retorna o mesmo motivo `'geocodificacao_falhou'` que uma falha real de geocodificação — o componente cliente (Step 3) trata esse caso ANTES de chamar a action, usando a flag `temCep` (evita a chamada e mostra o aviso direto), então esse branch da action só é alcançado em caso de erro genuíno.

- [ ] **Step 2: Passar dados de loja/papel/frete em `simulador/page.tsx`**

Ajustar as duas linhas de import do topo do arquivo. Trocar:

```ts
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getGrupoAtivo } from '@/lib/grupo'
```

por:

```ts
import { precificacao, configuracaoTaxas, lojas } from '@/lib/db/schema'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
```

Substituir:

```ts
const BLOQUEADOS = ['mecanico']

export default async function SimuladorPage() {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const [taxasRow, modelos] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(and(eq(precificacao.grupoId, grupo.id), eq(precificacao.ativo, true))).orderBy(asc(precificacao.nome)),
  ])

  const taxas = taxasRow[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-slate-500 text-sm">Referência de valores e condições de pagamento</p>
      </div>
      <SimuladorClient
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          imagemUrl: m.imagemUrl ?? null,
        }))}
        taxas={{
          taxasCartao: (taxas?.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas?.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas?.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas?.taxasFinanciamento ?? {}) as Record<string, number>,
        }}
      />
    </div>
  )
}
```

por:

```ts
const BLOQUEADOS = ['mecanico']
const ADMINS = ['admin_geral', 'admin_socio']

export default async function SimuladorPage() {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const isAdmin = ADMINS.includes(usuario.papel)

  const [taxasRow, modelos, lojasComCep] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(and(eq(precificacao.grupoId, grupo.id), eq(precificacao.ativo, true))).orderBy(asc(precificacao.nome)),
    listarLojasDoGrupoAtivo(usuario).then(async (opts) => {
      const rows = await db
        .select({ id: lojas.id, latitude: lojas.latitude })
        .from(lojas)
        .where(eq(lojas.grupoId, grupo.id))
      const temCepPorId = new Map(rows.map(r => [r.id, r.latitude !== null]))
      return opts.map(l => ({ id: l.id, nome: l.nome, temCep: temCepPorId.get(l.id) ?? false }))
    }),
  ])

  const taxas = taxasRow[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-slate-500 text-sm">Referência de valores e condições de pagamento</p>
      </div>
      <SimuladorClient
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          imagemUrl: m.imagemUrl ?? null,
        }))}
        taxas={{
          taxasCartao: (taxas?.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas?.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas?.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas?.taxasFinanciamento ?? {}) as Record<string, number>,
        }}
        lojasFrete={lojasComCep}
        isAdmin={isAdmin}
        lojaUsuarioId={usuario.lojaId ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 3: Criar `FreteSimulador`**

Criar `src/app/(dashboard)/simulador/components/frete-simulador.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Truck } from 'lucide-react'
import { simularFreteAction, type ResultadoFrete } from '../actions'

type Loja = { id: string; nome: string; temCep: boolean }

type Props = {
  lojas: Loja[]
  isAdmin: boolean
  lojaUsuarioId: string | null
  onResultado: (r: ResultadoFrete | null) => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FreteSimulador({ lojas, isAdmin, lojaUsuarioId, onResultado }: Props) {
  const lojaInicial = isAdmin ? (lojas[0]?.id ?? '') : (lojaUsuarioId ?? '')
  const [lojaId, setLojaId] = useState(lojaInicial)
  const [cep, setCep] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<ResultadoFrete | null>(null)

  const lojaSelecionada = lojas.find(l => l.id === lojaId) ?? null

  async function calcular(cepAtual: string, lojaAtual: string) {
    const cepLimpo = cepAtual.replace(/\D/g, '')
    if (cepLimpo.length !== 8 || !lojaAtual) {
      setResultado(null)
      onResultado(null)
      return
    }
    setLoading(true)
    try {
      const r = await simularFreteAction(lojaAtual, cepLimpo)
      setResultado(r)
      onResultado(r)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (cep.replace(/\D/g, '').length === 8) {
      calcular(cep, lojaId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId])

  if (!lojaSelecionada && !isAdmin) {
    return null
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Truck size={15} className="text-slate-600" />
        <span className="font-semibold text-sm text-slate-800">Frete de Entrega</span>
      </div>

      {isAdmin && (
        <div className="max-w-xs space-y-1.5">
          <Label className="text-xs">Loja de origem</Label>
          <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')}>
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {lojaSelecionada && !lojaSelecionada.temCep ? (
        <p className="text-xs text-amber-600">
          Configure o CEP desta loja em Admin &gt; Lojas para calcular o frete.
        </p>
      ) : (
        <>
          <div className="max-w-xs space-y-1.5">
            <Label className="text-xs">CEP de destino</Label>
            <Input
              value={cep}
              onChange={e => setCep(e.target.value)}
              onBlur={e => calcular(e.target.value, lojaId)}
              placeholder="00000-000"
              className="h-9 text-sm"
            />
          </div>

          {loading && <p className="text-xs text-slate-400">Calculando frete...</p>}

          {!loading && resultado && !resultado.ok && (
            <p className="text-xs text-red-500">
              {resultado.motivo === 'cep_invalido' ? 'CEP inválido.' : 'Não foi possível calcular a distância para este CEP.'}
            </p>
          )}

          {!loading && resultado?.ok && (
            <div className="text-xs text-slate-600 space-y-0.5">
              <p>Distância: {resultado.kmIdaEVolta.toFixed(1)} km (ida e volta)</p>
              <p className="font-semibold text-slate-800">
                Frete: {resultado.gratis ? 'Grátis' : fmt(resultado.custo)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrar em `SimuladorClient`**

Em `src/app/(dashboard)/simulador/components/simulador-client.tsx`:

Adicionar imports (junto aos existentes):

```ts
import { FreteSimulador } from './frete-simulador'
import type { ResultadoFrete } from '../actions'
```

Atualizar o tipo `Props`:

```ts
type Props = {
  modelos: Modelo[]
  taxas: Taxas
  lojasFrete: { id: string; nome: string; temCep: boolean }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
}
```

Atualizar a assinatura da função e adicionar estado (logo após `const [entrada, setEntrada] = useState('')`):

```ts
export function SimuladorClient({ modelos, taxas, lojasFrete, isAdmin, lojaUsuarioId }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [freteResultado, setFreteResultado] = useState<ResultadoFrete | null>(null)
```

(mantendo as demais linhas de estado já existentes depois dessas).

Logo após o bloco `<PrecosDestaque ... />` (antes do bloco `{/* Entrada */}`), adicionar:

```tsx
<FreteSimulador
  lojas={lojasFrete}
  isAdmin={isAdmin}
  lojaUsuarioId={lojaUsuarioId}
  onResultado={setFreteResultado}
/>

{freteResultado?.ok && (
  <p className="text-sm font-medium text-slate-700">
    Total com frete (PIX): {fmt(base + freteResultado.custo)}
  </p>
)}
```

Em `handlePrint`, passar o resultado de frete pro HTML impresso. Substituir a chamada:

```ts
const html = gerarHtmlPrint(
  modelo,
  entradaNum,
  linhasCartaoDestaque,
  linhasCartao,
  linhasDebito,
  linhasLink,
  linhasFinanciamento,
  selCartao,
  selDebito,
  selLink,
  selFinanciamento,
)
```

por:

```ts
const html = gerarHtmlPrint(
  modelo,
  entradaNum,
  linhasCartaoDestaque,
  linhasCartao,
  linhasDebito,
  linhasLink,
  linhasFinanciamento,
  selCartao,
  selDebito,
  selLink,
  selFinanciamento,
  freteResultado?.ok ? freteResultado : null,
)
```

Atualizar a assinatura de `gerarHtmlPrint` (adicionar o último parâmetro):

```ts
function gerarHtmlPrint(
  modelo: Modelo,
  entrada: number,
  linhasCartaoSemEntrada: Linha[],
  linhasCartaoComEntrada: Linha[],
  linhasDebito: Linha[],
  linhasLink: Linha[],
  linhasFinanciamento: Linha[],
  selCartao: Set<number>,
  selDebito: Set<number>,
  selLink: Set<number>,
  selFinanciamento: Set<number>,
  frete: { kmIdaEVolta: number; custo: number } | null,
) {
```

Dentro de `gerarHtmlPrint`, logo após a linha `const tabelasSelecionadas = [...].join('')`, adicionar:

```ts
const blocoFrete = frete ? `
  <div style="margin-bottom:20px;padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0">
    <div style="font-size:11px;color:#64748b">Frete: ${frete.custo > 0 ? fmt(frete.custo) : 'Grátis'} (${frete.kmIdaEVolta.toFixed(1)} km ida e volta)</div>
    <div style="font-size:13px;font-weight:700;color:#334155;margin-top:2px">Total com frete (PIX): ${fmt(base + frete.custo)}</div>
  </div>` : ''
```

E no template final, logo depois de `${tabelasSelecionadas}` (antes do `<div class="footer">`), adicionar `${blocoFrete}`:

```html
  ${tabelasSelecionadas}

  ${blocoFrete}

  <div class="footer">MOVA · Simulação gerada em ${data} · Valores sujeitos a alteração sem aviso prévio · Financiamento sujeito a aprovação de crédito</div>
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 6: Teste manual**

`npm run dev`, logar como `admin_geral`, ir em `/simulador`, selecionar um modelo. Confirmar:
1. Bloco "Frete de Entrega" aparece com um seletor de loja (admin).
2. Selecionar a loja que já tem CEP configurado (Task 3, ex: Poços de Caldas).
3. Digitar um CEP de destino distante (ex: `01310-100`, Av. Paulista/SP) e sair do campo (blur) — deve mostrar "Calculando frete..." e depois a distância e o valor do frete (ou "Grátis" se dentro de 40km).
4. Confirmar que aparece "Total com frete (PIX): R$ X" logo abaixo.
5. Clicar "Imprimir / Salvar PDF" e confirmar que o bloco de frete aparece no PDF gerado.
6. Trocar pra uma loja sem CEP configurado e confirmar que aparece o aviso "Configure o CEP desta loja em Admin > Lojas" no lugar do campo de CEP.
7. Logar como `vendedor` (sem papel admin) e confirmar que não aparece seletor de loja — usa a loja do próprio vendedor automaticamente.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/simulador/page.tsx" "src/app/(dashboard)/simulador/actions.ts" "src/app/(dashboard)/simulador/components/frete-simulador.tsx" "src/app/(dashboard)/simulador/components/simulador-client.tsx"
git commit -m "feat: simulação de custo de entrega no Simulador"
```

---

## Verificação final

- [ ] `npm run type-check` limpo em todos os tasks.
- [ ] Admin consegue cadastrar/editar CEP de uma loja e ver lat/long preenchidos.
- [ ] Precificação tem aba "Frete" configurável por grupo, com defaults R$3,00/km e 40km grátis.
- [ ] Simulador calcula frete corretamente pra loja com CEP configurado, mostra aviso pra loja sem CEP, e trata CEP de destino inválido sem travar a tela.
- [ ] Total com frete aparece na tela e no PDF impresso; parcelas de cartão/financiamento não mudam com o frete.
- [ ] Vendedor/aux_adm usam automaticamente a própria loja; admin escolhe entre as lojas do grupo ativo.
