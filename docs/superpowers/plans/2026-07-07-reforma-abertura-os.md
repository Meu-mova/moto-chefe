# Reforma do Formulário de Abertura de OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a distinção "Tipo de OS" (interna/pós-venda/externa) do sistema inteiro, adicionar cadastro inline de veículo e cliente quando a busca por chassi/CPF não encontra nada, tornar o campo KM sempre visível, e trocar a entrada de texto livre de serviço/peça na aba de itens por seleção dos catálogos já existentes.

**Architecture:** Mudança de schema (`DROP COLUMN tipo_os`) com efeito cascata em 11 arquivos que já referenciam essa coluna — a maior parte é remoção mecânica de badge/filtro; a parte que exige desenho é substituir a condicional `tipoOs === 'externa'` (que hoje decide mostrar placa/km/cliente-externo) por duas condições diretas: placa/km sempre visíveis, campos de cliente externo condicionados a `!clienteId`. Cadastro inline de veículo grava em `veiculos_historico` (tabela já existente). Cadastro inline de cliente reaproveita `ClienteForm` via uma prop nova (`onCreated`), aditiva e não-quebrante. Seleção de catálogo na aba de itens consome `servicos_catalogo`/`pecas_catalogo` (já em produção).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM + Postgres (Supabase), `@base-ui/react` (Dialog), Tailwind, `sonner` (toast).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-07-reforma-abertura-os-design.md`.
- **`tipoOs` é removido de tudo** — banco, queries, actions, UI. Não substituir por outro campo. OS existentes perdem essa categorização (decisão explícita e já autorizada pelo usuário).
- **Placa e KM sempre visíveis** no formulário de abertura e na edição da OS — sem condicional de tipo.
- **Campos de cliente externo (nome/telefone digitados) visíveis apenas quando não há `clienteId`** — essa é a substituta direta da condição antiga `tipoOs === 'externa'`.
- **Não usar `npm run db:generate` nem `npm run db:migrate`.** SQL manual, aplicado via Supabase MCP `apply_migration` (`project_id: "bzlaradpofaecqzawyym"`), com confirmação do usuário — última tarefa deste plano.
- Este projeto não tem suíte de testes automatizada — só `tsc --noEmit` via `npm run type-check`. Ciclo de verificação por tarefa: type-check limpo + verificação manual descrita no passo.
- Sem uso de props Radix (`asChild`, `onPointerDownOutside`) em Dialog — trigger é `<div onClick=...>` (padrão já usado em `cliente-form.tsx`/`servico-form.tsx`).
- `ClienteForm` ganha uma prop nova **opcional** (`onCreated`) — não pode quebrar o uso existente em `/clientes` (que não passa essa prop).
- `adicionarItemOSAction` ganha parâmetros **opcionais** `servicoId`/`pecaId` — item sem vínculo a catálogo continua válido (descrição livre).

---

### Task 1: Schema — remover `tipoOs`

**Files:**
- Modify: `src/lib/db/schema.ts` (remover linha `tipoOs` de `ordensServico`, atualmente linha 197)
- Create: `src/lib/db/migrations/0016_remove_tipo_os.sql`

**Interfaces:**
- Produces: `ordensServico` sem a coluna `tipoOs`. Todas as tarefas seguintes que tocam `ordensServico` (queries, actions) partem desse estado.

- [ ] **Step 1: Remover a coluna do schema**

Em `src/lib/db/schema.ts`, localize a definição de `ordensServico` (por volta da linha 189) e remova a linha:

```ts
  tipoOs: text('tipo_os').notNull().default('interna'),
```

O restante da tabela `ordensServico` não muda.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: **vai falhar** — isso é esperado nesta etapa, porque `queries/ordens-servico.ts`, `ordens-servico/actions.ts`, `agenda/actions.ts`, `clientes/actions.ts` e vários componentes ainda referenciam `ordensServico.tipoOs`/`os.tipoOs`. Anote a lista de erros no relatório; as tarefas seguintes resolvem cada um. Não tente corrigir esses arquivos nesta tarefa — está fora do escopo desta tarefa.

- [ ] **Step 3: Escrever a migração manualmente**

Crie `src/lib/db/migrations/0016_remove_tipo_os.sql`:

```sql
ALTER TABLE "ordens_servico" DROP COLUMN "tipo_os";
```

Não rode `db:generate` nem `db:migrate` — aplicação real é a última tarefa deste plano, via Supabase MCP `apply_migration`, com confirmação do usuário.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0016_remove_tipo_os.sql
git commit -m "feat: remover coluna tipo_os do schema (quebra type-check temporariamente, corrigido nas próximas tarefas)"
```

---

### Task 2: Backend — remover `tipoOs` de queries e actions; `adicionarItemOSAction` ganha `servicoId`/`pecaId`

**Files:**
- Modify: `src/lib/queries/ordens-servico.ts`
- Modify: `src/app/(dashboard)/ordens-servico/actions.ts`
- Modify: `src/app/(dashboard)/agenda/actions.ts`
- Modify: `src/app/(dashboard)/clientes/actions.ts`

**Interfaces:**
- Consumes: `ordensServico` sem `tipoOs` (Task 1); `servicosCatalogo`, `pecasCatalogo` já existem em `@/lib/db/schema`.
- Produces: `abrirOSAction` sem `tipoOs` no input; `adicionarItemOSAction(osId, item: { tipo, descricao, quantidade, valorUnitario, servicoId?: string | null, pecaId?: string | null })` — tarefa 8 (os-itens-panel) consome essa assinatura nova.

- [ ] **Step 1: `src/lib/queries/ordens-servico.ts` — remover `tipoOs`**

Remova a linha `tipoOs: ordensServico.tipoOs,` de `buildSelect` (atualmente linha 15).

Em `listarTodasOS`, remova o parâmetro `tipoOs?: string[]` da assinatura (atualmente linha 63) e a linha do filtro (atualmente linha 79):

```ts
      filtros?.tipoOs?.length   ? inArray(ordensServico.tipoOs, filtros.tipoOs) : undefined,
```

Em `listarOSPorMoto`, remova a linha `tipoOs:        ordensServico.tipoOs,` do select (atualmente linha 125).

- [ ] **Step 2: `src/app/(dashboard)/ordens-servico/actions.ts` — remover `tipoOs`, adicionar `servicoId`/`pecaId`**

Remova `tipoOs: 'interna' | 'pos_venda' | 'externa'` do tipo `AbrirOSInput` (atualmente linha 31) e a linha `tipoOs: input.tipoOs,` do `db.insert(ordensServico).values({...})` em `abrirOSAction` (atualmente linha 59).

Em `adicionarItemOSAction`, altere a assinatura e o insert para aceitar os novos campos opcionais:

```ts
export async function adicionarItemOSAction(osId: string, item: {
  tipo: 'servico' | 'peca'
  descricao: string
  quantidade: number
  valorUnitario: number
  servicoId?: string | null
  pecaId?: string | null
}) {
  await verificarAcessoOS(osId, EDITORES)
  await db.insert(osItens).values({
    osId,
    tipo:          item.tipo,
    descricao:     item.descricao,
    quantidade:    String(item.quantidade),
    valorUnitario: String(item.valorUnitario),
    servicoId:     item.servicoId || null,
    pecaId:        item.pecaId || null,
  })
  await recalcularTotal(osId)
  revalidatePath(`/ordens-servico/${osId}`)
}
```

Adicione `osItens` continua importado do topo (já está); não precisa importar `servicosCatalogo`/`pecasCatalogo` neste arquivo — os IDs chegam prontos do client.

- [ ] **Step 3: `src/app/(dashboard)/agenda/actions.ts` — remover `tipoOs` do insert**

Em `agendamentoVirarOSAction`, remova a linha `tipoOs:       'externa',` do `db.insert(ordensServico).values({...})` (atualmente linha 88).

- [ ] **Step 4: `src/app/(dashboard)/clientes/actions.ts` — remover `tipoOs` do select de histórico**

Em `buscarHistoricoClienteAction`, remova a linha `tipoOs: ordensServico.tipoOs,` do select de `osCliente` (atualmente linha 194).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: os erros relacionados a esses 4 arquivos desaparecem. Ainda vão sobrar erros nos componentes (Tasks 3-4) — normal nesta etapa.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/ordens-servico.ts src/app/\(dashboard\)/ordens-servico/actions.ts src/app/\(dashboard\)/agenda/actions.ts src/app/\(dashboard\)/clientes/actions.ts
git commit -m "feat: remover tipoOs do backend de OS; adicionarItemOSAction aceita servicoId/pecaId"
```

---

### Task 3: UI — remover badge/filtro de tipo (listagem, card, detalhe, impressão)

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/components/os-filtros.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/page.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/components/os-card.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/[id]/page.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/[id]/components/os-editar-panel.tsx`
- Modify: `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx`

**Interfaces:**
- Consumes: backend sem `tipoOs` (Task 2).
- Produces: `OSEditarPanel` sem a prop `tipoOs`; ganha prop nova `temCliente: boolean`. Task 10 (reescrita do `abrir-os-dialog.tsx`) não usa `OSEditarPanel`, então não é afetada por essa mudança de props.

- [ ] **Step 1: `os-filtros.tsx` — remover filtro de tipo**

Remova o array `TIPO_OPTS` (atualmente linhas 11-15) e o bloco JSX que o usa:

```tsx
      <div className="flex gap-1.5">
        {TIPO_OPTS.map(o => (
          <ToggleChip
            key={o.value}
            label={o.label}
            active={tipo.includes(o.value)}
            onClick={() => toggleMulti('tipo', tipo, o.value)}
          />
        ))}
      </div>
```

Remova também a linha `const tipo   = searchParams.get('tipo')?.split(',').filter(Boolean) ?? []` (atualmente linha 37).

- [ ] **Step 2: `page.tsx` — remover `tipoOs` da chamada a `listarTodasOS`**

Em `OrdensServicoPage`, remova a leitura de `tipo` dos `searchParams` (atualmente linha 21, tipo `{ status?: string; tipo?: string; q?: string }` → `{ status?: string; q?: string }`) e a linha `const tipoFiltro   = parseParam(params.tipo)` (atualmente linha 28). Remova `tipoOs: tipoFiltro,` da chamada a `listarTodasOS` (atualmente linha 34):

```ts
    isAdmin
      ? listarTodasOS({ status: statusFiltro, busca: params.q, lojaId: lojaIdsGrupo })
      : listarOSPorLoja(usuario.lojaId!),
```

- [ ] **Step 3: `os-card.tsx` — remover badge de tipo**

Remova `tipoLabel`, `tipoCor` (atualmente linhas 18-25) e o `<span>` que os usa dentro do header row:

```tsx
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoCor[os.tipoOs] ?? ''}`}>
                  {tipoLabel[os.tipoOs] ?? os.tipoOs}
                </span>
```

- [ ] **Step 4: `[id]/page.tsx` — remover badge de tipo e prop `tipoOs`**

Remova `tipoLabel`, `tipoCor` (atualmente linhas 20-27) e o `<span>` do badge de tipo no header (atualmente linhas 72-74):

```tsx
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${tipoCor[os.tipoOs] ?? ''}`}>
                {tipoLabel[os.tipoOs] ?? os.tipoOs}
              </span>
```

Na chamada a `<OSEditarPanel .../>`, troque a linha `tipoOs={os.tipoOs}` (atualmente linha 142) por `temCliente={Boolean(os.clienteId)}`.

- [ ] **Step 5: `os-editar-panel.tsx` — trocar `tipoOs` por `temCliente`, placa/km sempre visíveis**

No tipo `Props`, troque `tipoOs: string` (atualmente linha 24) por `temCliente: boolean`.

O bloco condicional que hoje é (atualmente linhas 120-140):

```tsx
        {/* Moto externa: placa e km */}
        {editing && props.tipoOs === 'externa' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Placa</Label>
              <Input value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">KM</Label>
              <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} className="text-sm" />
            </div>
          </div>
        )}
```

vira dois blocos separados — placa/km sempre visíveis quando editando, cliente externo só quando `!props.temCliente`:

```tsx
        {/* Placa e KM — sempre visíveis */}
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Placa</Label>
              <Input value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">KM</Label>
              <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} className="text-sm" />
            </div>
          </div>
        )}

        {/* Cliente externo — só quando não há cliente cadastrado vinculado */}
        {editing && !props.temCliente && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} className="text-sm" />
            </div>
          </div>
        )}
```

- [ ] **Step 6: `imprimir/page.tsx` — remover badge de tipo**

Remova `tipoLabel` (atualmente linhas 10-12) e a linha `<span className="badge bt">{tipoLabel[os.tipoOs] ?? os.tipoOs}</span>` (atualmente linha 87) de dentro de `<div className="badges">`.

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: sem erros relacionados a `tipoOs`. Podem restar erros em `abrir-os-dialog.tsx`/`chassi-lookup.tsx`/`os-itens-panel.tsx` — resolvidos nas Tasks 6, 7 e 8.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/components/os-filtros.tsx src/app/\(dashboard\)/ordens-servico/page.tsx src/app/\(dashboard\)/ordens-servico/components/os-card.tsx "src/app/(dashboard)/ordens-servico/[id]/page.tsx" "src/app/(dashboard)/ordens-servico/[id]/components/os-editar-panel.tsx" "src/app/(print)/ordens-servico/[id]/imprimir/page.tsx"
git commit -m "feat: remover badge/filtro de tipo da UI; placa/km sempre visíveis, cliente externo condicionado a ausência de clienteId"
```

---

### Task 4: `ClienteForm` ganha prop opcional `onCreated`

**Files:**
- Modify: `src/app/(dashboard)/clientes/components/cliente-form.tsx`

**Interfaces:**
- Produces: `ClienteForm` aceita `onCreated?: (id: string) => void`, chamada com o id retornado por `criarClienteAction` após criar com sucesso (não chamada no fluxo de edição). Task 6 (`ChassiLookup`) consome essa prop.

- [ ] **Step 1: Adicionar a prop e chamá-la após criar**

Em `src/app/(dashboard)/clientes/components/cliente-form.tsx`, no tipo `Props` (atualmente linhas 17-20), adicione:

```ts
type Props = {
  trigger: React.ReactNode
  clienteInicial?: ClienteInput & { id: string }
  onCreated?: (id: string) => void
}
```

Em `ClienteForm`, desestruture a nova prop:

```ts
export function ClienteForm({ trigger, clienteInicial, onCreated }: Props) {
```

Em `handleSalvar` (atualmente linhas 78-99), o branch de criação hoje é:

```ts
      } else {
        await criarClienteAction(form)
        toast.success('Cliente cadastrado!')
      }
```

vira:

```ts
      } else {
        const id = await criarClienteAction(form)
        toast.success('Cliente cadastrado!')
        onCreated?.(id)
      }
```

(`criarClienteAction` já retorna `Promise<string>` — sem mudança na action.)

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros. A prop é opcional, então o uso existente em `/clientes` (que não passa `onCreated`) continua compilando.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/clientes/components/cliente-form.tsx
git commit -m "feat: ClienteForm ganha callback opcional onCreated"
```

---

### Task 5: `cadastrarVeiculoHistoricoAction`

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/buscar-veiculo-action.ts`

**Interfaces:**
- Consumes: `veiculosHistorico` de `@/lib/db/schema` (já existe, sem mudança de schema).
- Produces: `cadastrarVeiculoHistoricoAction(input: { chassi: string; marca: string; modelo: string; cor?: string | null; numeroMotor?: string | null }): Promise<VeiculoEncontrado>`. Task 6 (`ChassiLookup`) consome essa função.

- [ ] **Step 1: Adicionar a action**

Em `src/app/(dashboard)/ordens-servico/buscar-veiculo-action.ts`, adicione ao final do arquivo:

```ts
export async function cadastrarVeiculoHistoricoAction(input: {
  chassi: string
  marca: string
  modelo: string
  cor?: string | null
  numeroMotor?: string | null
}): Promise<VeiculoEncontrado> {
  await getUsuarioLogado()

  const chassi = input.chassi.trim().toUpperCase()
  const marca  = input.marca.trim()
  const modelo = input.modelo.trim()
  if (!chassi) throw new Error('Chassi é obrigatório')
  if (!marca)  throw new Error('Marca é obrigatória')
  if (!modelo) throw new Error('Modelo é obrigatório')

  try {
    const [novo] = await db.insert(veiculosHistorico).values({
      chassi,
      marca,
      modelo,
      cor:         input.cor?.trim() || null,
      numeroMotor: input.numeroMotor?.trim() || null,
    }).returning()

    return {
      fonte:       'historico',
      chassi:      novo.chassi,
      numeroMotor: novo.numeroMotor,
      marca:       novo.marca,
      modelo:      novo.modelo,
      cor:         novo.cor,
      ano:         novo.ano,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('chassi')) throw new Error('Já existe um veículo cadastrado com esse chassi')
    throw e
  }
}
```

Adicione `veiculosHistorico` ao import de `@/lib/db/schema` no topo do arquivo (atualmente `import { motos, modelos, veiculosHistorico, clientes, vendas } from '@/lib/db/schema'` já inclui — confirme, e não duplique o import).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/buscar-veiculo-action.ts
git commit -m "feat: action para cadastro inline de veículo no histórico"
```

---

### Task 6: `ChassiLookup` — cadastro inline de veículo e cliente

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/components/chassi-lookup.tsx`

**Interfaces:**
- Consumes: `cadastrarVeiculoHistoricoAction` de `../buscar-veiculo-action` (Task 5); `ClienteForm` de `@/app/(dashboard)/clientes/components/cliente-form` com a prop `onCreated` (Task 4); `buscarClientePorIdAction` de `@/app/(dashboard)/clientes/actions` (já existe).
- Produces: mesmo contrato público de `ChassiLookup` (`onVeiculoEncontrado`, `onClienteEncontrado`, `chassiInicial`) — Task 7 (`abrir-os-dialog.tsx`) não muda como consome este componente.

- [ ] **Step 1: Adicionar estado e formulário de cadastro de veículo**

No topo do arquivo, a linha 3 atual é:

```ts
import { Search, CheckCircle2, AlertCircle, Loader2, X, Bike, Archive } from 'lucide-react'
```

Troque por (adiciona `UserPlus` à mesma linha, não como import separado):

```ts
import { Search, CheckCircle2, AlertCircle, Loader2, X, Bike, Archive, UserPlus } from 'lucide-react'
```

Adicione também estes três imports novos (linha 4, atualmente `import { buscarVeiculoPorChassisAction, buscarClientePorCpfAction } from '../buscar-veiculo-action'`, ganha `cadastrarVeiculoHistoricoAction`):

```ts
import { buscarVeiculoPorChassisAction, buscarClientePorCpfAction, cadastrarVeiculoHistoricoAction } from '../buscar-veiculo-action'
import { buscarClientePorIdAction } from '@/app/(dashboard)/clientes/actions'
import { ClienteForm } from '@/app/(dashboard)/clientes/components/cliente-form'
```

Dentro de `ChassiLookup`, adicione estado para o formulário de cadastro de veículo, logo após as declarações de estado existentes (`erroChassi`, `erroCpf`, etc.):

```ts
  const [cadastrandoVeiculo, setCadastrandoVeiculo] = useState(false)
  const [novoVeiculo, setNovoVeiculo] = useState({ marca: '', modelo: '', cor: '', numeroMotor: '' })
  const [pendingCadastro, startCadastro] = useTransition()
```

Adicione a função de submit do cadastro, próxima das outras funções (`buscar`, `selecionarVeiculo`, etc.):

```ts
  function cadastrarVeiculo() {
    if (!novoVeiculo.marca.trim() || !novoVeiculo.modelo.trim()) {
      setErroChassi('Informe marca e modelo')
      return
    }
    startCadastro(async () => {
      try {
        const v = await cadastrarVeiculoHistoricoAction({
          chassi: chassi,
          marca: novoVeiculo.marca,
          modelo: novoVeiculo.modelo,
          cor: novoVeiculo.cor || null,
          numeroMotor: novoVeiculo.numeroMotor || null,
        })
        selecionarVeiculo(v)
        setCadastrandoVeiculo(false)
        setNovoVeiculo({ marca: '', modelo: '', cor: '', numeroMotor: '' })
      } catch (e: unknown) {
        setErroChassi(e instanceof Error ? e.message : 'Erro ao cadastrar veículo')
      }
    })
  }
```

- [ ] **Step 2: Mostrar a opção de cadastro quando a busca não encontra nada**

Localize o bloco `{erroChassi && (...)}` dentro da busca por chassi (atualmente linhas 167-171):

```tsx
            {erroChassi && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                <AlertCircle size={12} /> {erroChassi}
              </p>
            )}
```

Substitua por (mantém a mensagem de erro quando houver, e adiciona a opção de cadastro inline quando a busca não encontrou nada e o usuário ainda não abriu o formulário):

```tsx
            {erroChassi && !cadastrandoVeiculo && (
              <div className="mt-1 space-y-1.5">
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {erroChassi}
                </p>
                {chassi.trim().length >= 3 && (
                  <button
                    type="button"
                    onClick={() => setCadastrandoVeiculo(true)}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <UserPlus size={12} /> Cadastrar este veículo
                  </button>
                )}
              </div>
            )}

            {cadastrandoVeiculo && (
              <div className="mt-2 border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Cadastrar veículo — chassi {chassi}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={novoVeiculo.marca}
                    onChange={e => setNovoVeiculo(v => ({ ...v, marca: e.target.value }))}
                    placeholder="Marca *"
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.modelo}
                    onChange={e => setNovoVeiculo(v => ({ ...v, modelo: e.target.value }))}
                    placeholder="Modelo *"
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.cor}
                    onChange={e => setNovoVeiculo(v => ({ ...v, cor: e.target.value }))}
                    placeholder="Cor"
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.numeroMotor}
                    onChange={e => setNovoVeiculo(v => ({ ...v, numeroMotor: e.target.value }))}
                    placeholder="Motor"
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cadastrarVeiculo}
                    disabled={pendingCadastro}
                    className="flex-1 bg-slate-800 text-white text-xs font-medium rounded-md py-1.5 hover:bg-slate-700 disabled:opacity-50"
                  >
                    {pendingCadastro ? 'Salvando…' : 'Salvar veículo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCadastrandoVeiculo(false)}
                    disabled={pendingCadastro}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
```

- [ ] **Step 3: Adicionar cadastro inline de cliente**

Localize o bloco `{erroCpf && (...)}` dentro da busca por CPF (atualmente linhas 203-207):

```tsx
            {erroCpf && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <AlertCircle size={12} /> {erroCpf}
              </p>
            )}
```

Substitua por:

```tsx
            {erroCpf && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <AlertCircle size={12} /> {erroCpf}
                </p>
                <ClienteForm
                  trigger={
                    <span className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0">
                      <UserPlus size={12} /> Cadastrar cliente
                    </span>
                  }
                  onCreated={async (id) => {
                    const c = await buscarClientePorIdAction(id)
                    if (c) {
                      const info = { id: c.id, nome: c.nome, cpfCnpj: c.cpfCnpj, celular: c.celular, email: c.email }
                      setCliente(info)
                      onClienteEncontrado(info)
                      setErroCpf(null)
                    }
                  }}
                />
              </div>
            )}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: sem erros. Confira especificamente que `buscarClientePorIdAction` retorna um objeto com `id`, `nome`, `cpfCnpj`, `celular`, `email` (compatível com o tipo `ClienteInfo` já declarado neste arquivo) — se o type-check reclamar de campos faltando/sobrando, ajuste o mapeamento no Step 3, não o tipo `ClienteInfo`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/components/chassi-lookup.tsx
git commit -m "feat: cadastro inline de veículo e cliente na busca da OS"
```

---

### Task 7: `abrir-os-dialog.tsx` — remover seletor de tipo, placa/km sempre visíveis

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/components/abrir-os-dialog.tsx`

**Interfaces:**
- Consumes: `abrirOSAction` sem `tipoOs` (Task 2); `ChassiLookup` com cadastro inline (Task 6).
- Produces: mesmo componente `AbrirOSDialog({ mecanicos, lojas, papel, lojaIdUsuario })` — nenhuma tarefa futura depende de mudança de props aqui.

- [ ] **Step 1: Remover o conceito de tipo**

Remova a constante `TIPOS` (atualmente linhas 23-27) e o estado `const [tipo, setTipo] = useState<'pos_venda'|'externa'|'interna'>('pos_venda')` (atualmente linha 37). Remova `setTipo('pos_venda')` de dentro de `resetar()` (atualmente linha 49).

Remova o bloco JSX inteiro do seletor de tipo (atualmente linhas 101-116):

```tsx
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo de OS</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipo(t.value as any)}
                    className={`rounded-lg border p-2.5 text-xs font-medium text-left transition-colors ${
                      tipo === t.value
                        ? 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 hover:border-slate-400 text-slate-700'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 2: Simplificar os blocos condicionais de placa/km e cliente externo**

O bloco atual tem três variações condicionadas a `tipo`/`veiculo` (atualmente linhas 138-183):

```tsx
            {/* Info do veículo não encontrado — campos manuais (apenas externa) */}
            {!veiculo && tipo === 'externa' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Dados do veículo (preenchimento manual)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Placa</Label>
                    <Input value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC-1234" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>KM atual</Label>
                    <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="Ex: 15000" />
                  </div>
                </div>
              </div>
            )}

            {/* Placa + KM quando veiculo encontrado */}
            {veiculo && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Placa</Label>
                  <Input value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC-1234" />
                </div>
                <div className="space-y-1.5">
                  <Label>KM atual</Label>
                  <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="Ex: 15000" />
                </div>
              </div>
            )}

            {/* Cliente externo quando não encontrado por CPF */}
            {tipo === 'externa' && !cliente && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome do cliente</Label>
                  <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} placeholder="(35) 99999-9999" />
                </div>
              </div>
            )}
```

Substitua pelos dois blocos simplificados (placa/km sempre visíveis; cliente externo só quando `!cliente`):

```tsx
            {/* Placa e KM — sempre visíveis */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Placa</Label>
                <Input value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC-1234" />
              </div>
              <div className="space-y-1.5">
                <Label>KM atual</Label>
                <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="Ex: 15000" />
              </div>
            </div>

            {/* Cliente externo — só quando não encontrado/cadastrado */}
            {!cliente && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome do cliente</Label>
                  <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} placeholder="(35) 99999-9999" />
                </div>
              </div>
            )}
```

- [ ] **Step 3: Ajustar `salvar()` para não enviar `tipoOs`, e simplificar campos derivados de tipo**

Em `salvar()`, o objeto passado para `abrirOSAction` hoje é (atualmente linhas 62-78):

```ts
        await abrirOSAction({
          tipoOs:             tipo,
          lojaId:             form.lojaId,
          chassiOs:           veiculo.chassi,
          motoId:             veiculo?.motoId || null,
          clienteId:          cliente?.id || null,
          mecanicoId:         form.mecanicoId || null,
          descricao:          form.descricao,
          dataPrevisao:       form.dataPrevisao || null,
          // Para externa: marca/modelo vêm do veiculo encontrado, ou vazios
          marcaExterna:       tipo === 'externa' ? (veiculo?.marca || null) : null,
          modeloExterno:      tipo === 'externa' ? (veiculo?.modelo || null) : null,
          placa:              form.placa || null,
          km:                 form.km ? parseInt(form.km) : null,
          clienteNomeExterno: tipo === 'externa' ? (cliente?.nome || form.clienteNomeExterno || null) : null,
          clienteFoneExterno: tipo === 'externa' ? (cliente?.celular || form.clienteFoneExterno || null) : null,
        })
```

Substitua por (marca/modelo externos preenchidos sempre que o veículo não tiver `motoId` — ou seja, veio do histórico/cadastro inline, não do estoque; cliente externo preenchido sempre que não há `cliente` selecionado):

```ts
        await abrirOSAction({
          lojaId:             form.lojaId,
          chassiOs:           veiculo.chassi,
          motoId:             veiculo?.motoId || null,
          clienteId:          cliente?.id || null,
          mecanicoId:         form.mecanicoId || null,
          descricao:          form.descricao,
          dataPrevisao:       form.dataPrevisao || null,
          marcaExterna:       !veiculo?.motoId ? (veiculo?.marca || null) : null,
          modeloExterno:      !veiculo?.motoId ? (veiculo?.modelo || null) : null,
          placa:              form.placa || null,
          km:                 form.km ? parseInt(form.km) : null,
          clienteNomeExterno: !cliente ? (form.clienteNomeExterno || null) : null,
          clienteFoneExterno: !cliente ? (form.clienteFoneExterno || null) : null,
        })
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/components/abrir-os-dialog.tsx
git commit -m "feat: remover seletor de tipo do formulário de abertura de OS; placa/km sempre visíveis"
```

---

### Task 8: `os-itens-panel.tsx` — selecionar serviço/peça do catálogo

**Files:**
- Modify: `src/app/(dashboard)/ordens-servico/[id]/components/os-itens-panel.tsx`
- Modify: `src/app/(dashboard)/ordens-servico/[id]/page.tsx` (buscar catálogos e repassar como props)

**Interfaces:**
- Consumes: `listarServicosAction({ apenasAtivos: true })` de `@/app/(dashboard)/servicos/actions`; `listarPecasAction({ apenasAtivos: true })` de `@/app/(dashboard)/pecas/actions`; `adicionarItemOSAction` com `servicoId`/`pecaId` (Task 2).
- Produces: `OSItensPanel` ganha props `servicos: { id: string; nome: string; valor: string; tempoPrevistoMinutos: number | null }[]` e `pecas: { id: string; nome: string; valor: string }[]`.

- [ ] **Step 1: `[id]/page.tsx` — buscar os catálogos ativos**

No topo do arquivo, adicione os imports:

```ts
import { listarServicosAction } from '@/app/(dashboard)/servicos/actions'
import { listarPecasAction } from '@/app/(dashboard)/pecas/actions'
```

No `Promise.all` que busca `os, itens, usuario, mecanicos` (atualmente linhas 31-38), adicione as duas novas chamadas:

```ts
  const [os, itens, usuario, mecanicos, servicos, pecas] = await Promise.all([
    buscarOS(id),
    listarItensOS(id),
    getUsuarioLogado(),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, ['mecanico', 'aux_adm', 'admin_geral', 'admin_socio'] as any[])),
    listarServicosAction({ apenasAtivos: true }),
    listarPecasAction({ apenasAtivos: true }),
  ])
```

Na chamada `<OSItensPanel osId={id} itens={itens} podeEditar={podeEditar} />` (atualmente linha 147), adicione as duas novas props:

```tsx
      <OSItensPanel osId={id} itens={itens} podeEditar={podeEditar} servicos={servicos} pecas={pecas} />
```

- [ ] **Step 2: `os-itens-panel.tsx` — seletor de catálogo**

Substitua o conteúdo completo do arquivo por:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, Wrench, Package } from 'lucide-react'
import { adicionarItemOSAction, removerItemOSAction } from '../../actions'
import { toast } from 'sonner'
import type { OSItem } from '@/lib/queries/ordens-servico'

type CatalogoServico = { id: string; nome: string; valor: string; tempoPrevistoMinutos: number | null }
type CatalogoPeca    = { id: string; nome: string; valor: string }

type Props = {
  osId: string
  itens: OSItem[]
  podeEditar: boolean
  servicos: CatalogoServico[]
  pecas: CatalogoPeca[]
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OSItensPanel({ osId, itens, podeEditar, servicos, pecas }: Props) {
  const [pending, start] = useTransition()
  const [tipo, setTipo]  = useState<'servico'|'peca'>('servico')
  const [catalogoId, setCatalogoId] = useState('')
  const [form, setForm]  = useState({ descricao: '', quantidade: '1', valorUnitario: '' })

  function setF(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function trocarTipo(t: 'servico' | 'peca') {
    setTipo(t)
    setCatalogoId('')
    setForm({ descricao: '', quantidade: '1', valorUnitario: '' })
  }

  function selecionarDoCatalogo(id: string) {
    setCatalogoId(id)
    if (!id) return
    if (tipo === 'servico') {
      const s = servicos.find(s => s.id === id)
      if (s) setForm(f => ({ ...f, descricao: s.nome, valorUnitario: s.valor }))
    } else {
      const p = pecas.find(p => p.id === id)
      if (p) setForm(f => ({ ...f, descricao: p.nome, valorUnitario: p.valor }))
    }
  }

  function adicionar() {
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return }
    const qty = parseFloat(form.quantidade)
    const val = parseFloat(form.valorUnitario)
    if (!qty || !val) { toast.error('Quantidade e valor devem ser maiores que zero'); return }
    start(async () => {
      try {
        await adicionarItemOSAction(osId, {
          tipo,
          descricao: form.descricao,
          quantidade: qty,
          valorUnitario: val,
          servicoId: tipo === 'servico' ? (catalogoId || null) : null,
          pecaId:    tipo === 'peca'    ? (catalogoId || null) : null,
        })
        setForm({ descricao: '', quantidade: '1', valorUnitario: '' })
        setCatalogoId('')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function remover(id: string) {
    start(async () => {
      try { await removerItemOSAction(id, osId) }
      catch (e: any) { toast.error(e.message) }
    })
  }

  const servicosItens = itens.filter(i => i.tipo === 'servico')
  const pecasItens     = itens.filter(i => i.tipo === 'peca')

  function ItemRow({ item }: { item: OSItem }) {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.valorUnitario)
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{item.descricao}</p>
          <p className="text-xs text-slate-400">
            {parseFloat(item.quantidade).toLocaleString('pt-BR')} × {fmt(parseFloat(item.valorUnitario))}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-slate-700">{fmt(subtotal)}</span>
          {podeEditar && (
            <button onClick={() => remover(item.id)} disabled={pending}
              className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const opcoesCatalogo = tipo === 'servico' ? servicos : pecas

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Serviços e Peças</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Serviços */}
        {servicosItens.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Wrench size={12} /> Mão de obra
            </p>
            {servicosItens.map(i => <ItemRow key={i.id} item={i} />)}
          </div>
        )}

        {/* Peças */}
        {pecasItens.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Package size={12} /> Peças
            </p>
            {pecasItens.map(i => <ItemRow key={i.id} item={i} />)}
          </div>
        )}

        {itens.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Nenhum item adicionado ainda.</p>
        )}

        {/* Adicionar item */}
        {podeEditar && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Adicionar item</p>

            <div className="flex gap-2">
              {(['servico', 'peca'] as const).map(t => (
                <button key={t} onClick={() => trocarTipo(t)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    tipo === t
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}>
                  {t === 'servico' ? 'Serviço / Mão de obra' : 'Peça'}
                </button>
              ))}
            </div>

            <select
              value={catalogoId}
              onChange={e => selecionarDoCatalogo(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">
                {tipo === 'servico' ? 'Escolher serviço do catálogo (opcional)' : 'Escolher peça do catálogo (opcional)'}
              </option>
              {opcoesCatalogo.map(o => (
                <option key={o.id} value={o.id}>
                  {o.nome} — {fmt(parseFloat(o.valor))}
                </option>
              ))}
            </select>

            <Input placeholder="Descrição" value={form.descricao} onChange={e => setF('descricao', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Qtd" type="number" min="0.001" step="0.001"
                value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} />
              <Input placeholder="Valor unit. (R$)" type="number" min="0" step="0.01"
                value={form.valorUnitario} onChange={e => setF('valorUnitario', e.target.value)} />
            </div>
            <Button size="sm" onClick={adicionar} disabled={pending} className="w-full gap-1.5">
              <Plus size={14} /> {pending ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/ordens-servico/[id]/components/os-itens-panel.tsx" "src/app/(dashboard)/ordens-servico/[id]/page.tsx"
git commit -m "feat: seleção de serviço/peça do catálogo na aba de itens da OS"
```

---

### Task 9: Migração no banco + verificação

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build limpo, sem erros de tipo. Confirme visualmente que nenhuma rota de `/ordens-servico` sumiu da lista de rotas.

- [ ] **Step 2: Confirmar com o usuário antes de migrar**

Pare aqui e pergunte ao usuário: "Vou aplicar `0016_remove_tipo_os.sql` (remove a coluna `tipo_os` de `ordens_servico` — **irreversível sem backup**, apaga a categorização interna/pós-venda/externa das OS existentes) no banco real via Supabase MCP `apply_migration`. Confirma?" — só prossiga com o Step 3 após confirmação explícita. (Se o usuário já autorizou execução automática nesta sessão, registre isso no relatório como a confirmação.)

- [ ] **Step 3: Aplicar a migração**

Use `mcp__plugin_supabase_supabase__apply_migration` com `project_id: "bzlaradpofaecqzawyym"`, `name: "remove_tipo_os"`, e `query: 'ALTER TABLE "ordens_servico" DROP COLUMN "tipo_os";'`.

Expected: retorno de sucesso. Confirme com `mcp__plugin_supabase_supabase__list_migrations` que `remove_tipo_os` aparece na lista, e com uma consulta a `information_schema.columns` que `tipo_os` não existe mais em `ordens_servico`.

- [ ] **Step 4: Verificação manual**

No navegador:
1. Abra `/ordens-servico`, clique em "Nova OS" — confirme que não há mais seletor de "Tipo de OS".
2. Busque um chassi que não existe em nenhuma base — confirme que aparece a opção "Cadastrar este veículo", preencha marca/modelo/cor/motor, salve, e confirme que o veículo aparece selecionado no formulário.
3. Busque um CPF que não existe — confirme que aparece "Cadastrar cliente", abra o formulário, salve um cliente de teste, confirme que ele aparece selecionado.
4. Confirme que os campos Placa e KM aparecem sempre, independente de o veículo ter sido encontrado ou cadastrado agora.
5. Abra uma OS existente, vá até "Serviços e Peças", confirme que o seletor "Escolher serviço do catálogo" lista os serviços ativos cadastrados em `/servicos`, que escolher um preenche descrição/valor, e que dá pra ajustar o valor antes de adicionar. Repita para peça.
6. Confirme que a listagem de OS (`/ordens-servico`) não mostra mais badge de tipo, e que os filtros da página não têm mais a seção de tipo.
7. Confirme que a tela de detalhe da OS e a impressão não mostram mais o badge de tipo.
8. Na Agenda, confirme que "Virar OS" a partir de um agendamento continua funcionando (não deve dar erro de coluna inexistente).

---

## Fora de escopo deste plano

- Checklist de avarias com foto — spec ainda não escrito.
- Categoria de serviço/peça, preço por loja, relatórios de produtividade.
- Constraint de banco garantindo no máximo um de `servico_id`/`peca_id` preenchido em `os_itens` (achado da revisão do Catálogo de Peças, registrado como recomendação futura, não bloqueante).
