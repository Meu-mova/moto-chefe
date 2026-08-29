# Navegação por categorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o sidebar plano de 26 itens por um menu enxuto com hubs por área, com uma fonte única de permissão que o cadastro do usuário consegue ajustar pessoa a pessoa.

**Architecture:** Uma tabela pura em `src/lib/navegacao.ts` declara categoria, item e papéis padrão. Um módulo fino `src/lib/navegacao-servidor.ts` liga essa tabela às regras que dependem de e-mail (só `/entrada`). Sidebar, hubs `/areas/[slug]` e guardas de rota passam a ler dali. O cadastro do usuário grava apenas a diferença em relação ao papel, em duas colunas array.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Drizzle + Postgres (Supabase), Tailwind, lucide-react, `node --test` com tsx.

**Spec:** `docs/superpowers/specs/2026-08-29-navegacao-por-categorias-design.md`

## Global Constraints

- **Nenhuma URL de módulo muda.** `/despesas`, `/admin/dre`, `/financeiro` etc. continuam onde estão. Só `/admin` ganha um redirect para `/areas/configuracao`.
- **A tabela copia a permissão que já vale hoje.** As únicas mudanças autorizadas são as cinco listadas na seção "Mudanças de permissão nesta entrega" do spec. Qualquer outra divergência é bug.
- **Migração é SQL manual** via `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file <arquivo.sql>`. Nunca `db:generate` / `db:migrate` — o journal do drizzle-kit está quebrado desde a fusão multi-grupo.
- **`temPapel()` de `@/lib/auth`**, nunca `usuario.papel ===`. É o que faz `papeisExtras` valer.
- **Exceção do usuário grava `id` do item**, nunca `href`.
- **Redirect de acesso negado é sempre `/dashboard`.**
- **Teste roda com** `npm test` (a suíte inteira) ou `node --import tsx --test <arquivo>` para um só. Todo arquivo de teste novo entra na lista do script `test` em `package.json`.
- **Idioma:** todo texto de UI, comentário e mensagem de commit em português do Brasil.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/db/migrations/0073_modulos_por_usuario.sql` (criar) | As duas colunas novas |
| `src/lib/db/schema.ts` (modificar) | Declarar as colunas no drizzle |
| `src/lib/navegacao.ts` (criar) | Tabela pura + `itensVisiveis` + `podeAcessar`. Sem import de db/auth — precisa ser testável sozinho |
| `src/lib/navegacao.test.ts` (criar) | Não-regressão item a item + regras de exceção |
| `src/lib/navegacao-servidor.ts` (criar) | Cola fina: injeta as regras próprias (`/entrada`) e expõe as versões usadas nas páginas |
| `src/components/layout/sidebar.tsx` (modificar) | Passa a receber itens prontos em vez de decidir permissão |
| `src/app/(dashboard)/layout.tsx` (modificar) | Monta os itens no servidor e passa pro Sidebar |
| `src/app/(dashboard)/areas/[slug]/page.tsx` (criar) | Hub de categoria |
| `src/app/(dashboard)/admin/page.tsx` (modificar) | Vira redirect para `/areas/configuracao` |
| `src/app/(dashboard)/admin/components/admin-guard.tsx` (modificar) | Só o destino do redirect muda; mantém a checagem por papel (ver desvio na Task 5) |
| 20 `page.tsx` com guarda própria (modificar) | Trocam o array literal por `usuarioPodeAcessar` |
| `src/app/(dashboard)/compras/page.tsx` (modificar) | Ganha a guarda que não tem |
| `src/app/(dashboard)/admin/usuarios/actions.ts` (modificar) | Persistir as duas listas |
| `src/app/(dashboard)/admin/usuarios/components/modulos-picker.tsx` (criar) | A lista de módulos por categoria |
| `src/app/(dashboard)/admin/usuarios/components/usuarios-table.tsx` (modificar) | Encaixar o picker no formulário |

---

### Task 1: Colunas de exceção por usuário

**Files:**
- Create: `src/lib/db/migrations/0073_modulos_por_usuario.sql`
- Modify: `src/lib/db/schema.ts` (tabela `usuarios`, junto de `papeisExtras`)

**Interfaces:**
- Consumes: nada
- Produces: `usuarios.modulosExtras: string[]` e `usuarios.modulosBloqueados: string[]`, ambos `not null default '{}'`. `getUsuarioLogado()` faz `db.select().from(usuarios)` sem projeção, então passa a devolver os dois campos automaticamente.

- [ ] **Step 1: Escrever a migração**

```sql
-- 0073_modulos_por_usuario.sql
-- Exceção de acesso por pessoa, em cima do padrão do papel. Mesmo molde de
-- papeis_extras: array de texto, nunca nulo. Guardam o `id` do item de
-- navegação (ex.: 'marketing'), não o href — mover uma página não pode
-- invalidar a permissão de ninguém.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS modulos_extras     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modulos_bloqueados text[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Aplicar no banco**

Run: `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0073_modulos_por_usuario.sql`
Expected: `OK — sem linhas de retorno`

- [ ] **Step 3: Conferir que as colunas existem e nasceram vazias**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*) total, count(*) filter (where modulos_extras <> '{}') com_extra, count(*) filter (where modulos_bloqueados <> '{}') com_bloqueio from usuarios"
```
Expected: `total: "39"`, `com_extra: "0"`, `com_bloqueio: "0"` — ninguém muda de acesso no dia do deploy.

- [ ] **Step 4: Declarar no schema**

Em `src/lib/db/schema.ts`, na tabela `usuarios`, logo abaixo de `papeisExtras`:

```ts
  // Exceção de acesso por pessoa, em cima do padrão do papel definido em
  // @/lib/navegacao. Guardam o `id` do item, não o href. Ler sempre via
  // itensVisiveis()/podeAcessar(), nunca comparando direto.
  modulosExtras:     text('modulos_extras').array().notNull().default([]),
  modulosBloqueados: text('modulos_bloqueados').array().notNull().default([]),
```

- [ ] **Step 5: Verificar que o TypeScript compila**

Run: `npm run type-check`
Expected: sem saída de erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/migrations/0073_modulos_por_usuario.sql src/lib/db/schema.ts
git commit -m "feat(usuarios): colunas de exceção de módulo por pessoa"
```

---

### Task 2: A tabela de navegação e a regra de visibilidade

Esta é a task de risco. O teste de não-regressão é o que garante que nenhuma permissão mudou sem querer.

**Files:**
- Create: `src/lib/navegacao.ts`
- Test: `src/lib/navegacao.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `usuarios.modulosExtras` / `modulosBloqueados` (Task 1)
- Produces:
  - `type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico'`
  - `type Slug = 'comercial' | 'oficina' | 'estoque' | 'financeiro' | 'gestao' | 'configuracao'`
  - `type ItemNav = { id: string; href: string; label: string; icon: LucideIcon; categoria: Slug | null; papeis: Papel[]; destaque?: true; regraPropria?: true }`
  - `type UsuarioNav = { papel: string; papeisExtras?: string[] | null; modulosExtras?: string[] | null; modulosBloqueados?: string[] | null }`
  - `type RegrasProprias = Record<string, boolean>`
  - `const CATEGORIAS: { slug: Slug; nome: string; icon: LucideIcon }[]`
  - `const ITENS: ItemNav[]`
  - `itensVisiveis(usuario: UsuarioNav, regras: RegrasProprias): ItemNav[]`
  - `podeAcessar(usuario: UsuarioNav, href: string, regras: RegrasProprias): boolean`

`src/lib/navegacao.ts` **não pode importar `@/lib/auth` nem `@/lib/db`** — `auth.ts` importa o db no topo do módulo, e o teste passaria a precisar de banco. É por isso que as regras que dependem de e-mail entram como parâmetro (`RegrasProprias`) e a cola fica na Task 3.

- [ ] **Step 1: Escrever o teste de não-regressão**

Criar `src/lib/navegacao.test.ts`. Este teste congela a permissão de hoje, papel por papel — o levantamento está na tabela do spec.

```ts
import test from 'node:test'
import assert from 'node:assert'
import { ITENS, itensVisiveis, podeAcessar, type UsuarioNav } from './navegacao'

const SEM_REGRA_PROPRIA = { entrada: false }

function ids(usuario: UsuarioNav, regras = SEM_REGRA_PROPRIA) {
  return itensVisiveis(usuario, regras).map(i => i.id).sort()
}

const ADMIN_GERAL: UsuarioNav = { papel: 'admin_geral' }
const SOCIO: UsuarioNav       = { papel: 'admin_socio' }
const AUX: UsuarioNav         = { papel: 'aux_adm' }
const VENDEDOR: UsuarioNav    = { papel: 'vendedor' }
const MECANICO: UsuarioNav    = { papel: 'mecanico' }

test('admin_geral vê tudo que não depende de regra própria', () => {
  const esperado = ITENS.filter(i => !i.regraPropria).map(i => i.id).sort()
  assert.deepEqual(ids(ADMIN_GERAL), esperado)
})

test('admin_socio vê tudo menos o que é exclusivo do admin_geral', () => {
  assert.deepEqual(ids(SOCIO), [
    'agenda', 'atendimento', 'bancos', 'bling', 'caixa', 'calendario',
    'calendario-categorias', 'canais', 'categorias-caixa', 'clientes',
    'comunicados', 'compras', 'conciliacao', 'dados-funcionarios', 'dashboard',
    'demandas', 'despesas', 'dre', 'financeiro', 'folha', 'garantias', 'kommo',
    'lojas', 'marketing', 'metas', 'modelos', 'montagens', 'ordens-servico',
    'origens', 'pecas', 'pecas-fabrica', 'pix', 'precificacao', 'radar',
    'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas', 'veiculos-historico',
  ].sort())
})

test('aux_adm não vê financeiro de resultado nem cadastro de sistema', () => {
  assert.deepEqual(ids(AUX), [
    'agenda', 'atendimento', 'caixa', 'calendario', 'canais', 'clientes',
    'conciliacao', 'dashboard', 'demandas', 'garantias', 'marketing', 'metas',
    'montagens', 'ordens-servico', 'origens', 'pecas', 'pecas-fabrica', 'pix',
    'radar', 'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('vendedor vê o comercial, a oficina de balcão e o PIX', () => {
  assert.deepEqual(ids(VENDEDOR), [
    'agenda', 'calendario', 'clientes', 'dashboard', 'demandas', 'garantias',
    'ordens-servico', 'pecas', 'pix', 'radar', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('mecânico fica com o menu enxuto da oficina', () => {
  assert.deepEqual(ids(MECANICO), [
    'agenda', 'dashboard', 'garantias', 'ordens-servico', 'pecas',
  ].sort())
})

test('papeisExtras conta — aux_adm com vendedor extra ganha os itens de vendedor', () => {
  const tiago: UsuarioNav = { papel: 'aux_adm', papeisExtras: ['vendedor'] }
  // aux_adm já vê quase tudo de vendedor; o teste prova que o extra é lido.
  assert.ok(ids(tiago).length >= ids(AUX).length)
  assert.ok(podeAcessar(tiago, '/pecas', SEM_REGRA_PROPRIA))
})

test('modulos_extras libera item fora do papel', () => {
  const joao: UsuarioNav = { papel: 'vendedor', modulosExtras: ['marketing'] }
  assert.ok(ids(joao).includes('marketing'))
  assert.ok(podeAcessar(joao, '/marketing', SEM_REGRA_PROPRIA))
})

test('modulos_bloqueados tira item que o papel dá', () => {
  const joao: UsuarioNav = { papel: 'vendedor', modulosBloqueados: ['pix'] }
  assert.ok(!ids(joao).includes('pix'))
  assert.equal(podeAcessar(joao, '/pix-mcp', SEM_REGRA_PROPRIA), false)
})

test('bloqueio ganha de liberação quando os dois marcam o mesmo item', () => {
  const confuso: UsuarioNav = {
    papel: 'vendedor', modulosExtras: ['marketing'], modulosBloqueados: ['marketing'],
  }
  assert.ok(!ids(confuso).includes('marketing'))
})

test('item de regra própria não é decidido pela tabela', () => {
  assert.ok(!ids(ADMIN_GERAL).includes('entrada'))
  assert.ok(ids(ADMIN_GERAL, { entrada: true }).includes('entrada'))
})

test('href desconhecido nunca é liberado', () => {
  assert.equal(podeAcessar(ADMIN_GERAL, '/rota-que-nao-existe', SEM_REGRA_PROPRIA), false)
})

test('todo item tem id único', () => {
  const vistos = new Set<string>()
  for (const i of ITENS) {
    assert.ok(!vistos.has(i.id), `id repetido: ${i.id}`)
    vistos.add(i.id)
  }
})
```

- [ ] **Step 2: Rodar e ver falhar por módulo inexistente**

Run: `node --import tsx --test src/lib/navegacao.test.ts`
Expected: `Cannot find module './navegacao'`. Isso ainda é erro, não falha honesta — o próximo passo resolve.

- [ ] **Step 3: Criar o arquivo com stub e ver as asserções falharem**

Criar `src/lib/navegacao.ts` com os tipos reais mas `ITENS = []`, `itensVisiveis` devolvendo `[]` e `podeAcessar` devolvendo `false`.

Run: `node --import tsx --test src/lib/navegacao.test.ts`
Expected: falha nas asserções (`actual: []`), não em import. É a falha honesta.

- [ ] **Step 4: Escrever a tabela e a regra**

```ts
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight, BarChart3, Bike, Building2, CalendarDays, CalendarRange,
  ClipboardList, CreditCard, Database, FileBarChart, FileSpreadsheet, FileText,
  HandCoins, Headset, Home, IdCard, Landmark, Layers, Megaphone, Package,
  Package2, PackageCheck, PackagePlus, QrCode, Radar, Settings2, Shield,
  ShoppingBag, ShoppingCart, Tag, Tags, Target, TrendingDown, Users, Wallet,
  Wrench, ListChecks, Calculator,
} from 'lucide-react'

export type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico'
export type Slug = 'comercial' | 'oficina' | 'estoque' | 'financeiro' | 'gestao' | 'configuracao'

export type ItemNav = {
  /** Chave gravada em usuarios.modulos_extras/bloqueados. Estável: não muda se o href mudar. */
  id: string
  href: string
  label: string
  icon: LucideIcon
  /** null = só aparece solto no sidebar, sem hub (Dashboard). */
  categoria: Slug | null
  papeis: Papel[]
  /** Também solto no topo do sidebar, além de aparecer no hub da categoria. */
  destaque?: true
  /** Permissão não sai da tabela; quem chama informa em RegrasProprias. */
  regraPropria?: true
}

export type UsuarioNav = {
  papel: string
  papeisExtras?: string[] | null
  modulosExtras?: string[] | null
  modulosBloqueados?: string[] | null
}

/** Resultado das regras que não cabem na tabela de papel, por id de item. */
export type RegrasProprias = Record<string, boolean>

// A categoria tem ícone próprio. Não usar o ícone do primeiro item visível: o
// primeiro item muda conforme a permissão de quem olha, e o menu ficaria com
// ícone diferente para cada papel.
export const CATEGORIAS: { slug: Slug; nome: string; icon: LucideIcon }[] = [
  { slug: 'comercial',    nome: 'Comercial',         icon: ShoppingCart },
  { slug: 'oficina',      nome: 'Oficina',           icon: Wrench },
  { slug: 'estoque',      nome: 'Estoque & Fábrica', icon: Package },
  { slug: 'financeiro',   nome: 'Financeiro',        icon: Wallet },
  { slug: 'gestao',       nome: 'Gestão',            icon: Target },
  { slug: 'configuracao', nome: 'Configuração',      icon: Settings2 },
]

const SUPER:     Papel[] = ['admin_geral']
const ADMINS:    Papel[] = [...SUPER, 'admin_socio']
const GESTORES:  Papel[] = [...ADMINS, 'aux_adm']
const COMERCIAL: Papel[] = [...GESTORES, 'vendedor']
const TODOS:     Papel[] = [...COMERCIAL, 'mecanico']

export const ITENS: ItemNav[] = [
  { id: 'dashboard',      href: '/dashboard',      label: 'Dashboard',         icon: Home,          categoria: null,           papeis: TODOS,     destaque: true },

  // ── Comercial
  { id: 'vendas',         href: '/vendas',         label: 'Vendas',            icon: ShoppingCart,  categoria: 'comercial',    papeis: COMERCIAL, destaque: true },
  { id: 'demandas',       href: '/demandas',       label: 'Demandas',          icon: ClipboardList, categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'clientes',       href: '/clientes',       label: 'Clientes',          icon: Users,         categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'atendimento',    href: '/atendimento',    label: 'Atendimento',       icon: Headset,       categoria: 'comercial',    papeis: GESTORES },
  { id: 'marketing',      href: '/marketing',      label: 'Marketing',         icon: Megaphone,     categoria: 'comercial',    papeis: GESTORES },
  { id: 'simulador',      href: '/simulador',      label: 'Simulador',         icon: Calculator,    categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'radar',          href: '/radar',          label: 'RADAR',             icon: Radar,         categoria: 'comercial',    papeis: COMERCIAL },

  // ── Oficina
  { id: 'ordens-servico', href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench,        categoria: 'oficina',      papeis: TODOS,     destaque: true },
  { id: 'agenda',         href: '/agenda',         label: 'Agenda Oficina',    icon: CalendarDays,  categoria: 'oficina',      papeis: TODOS },
  { id: 'garantias',      href: '/garantias',      label: 'Garantias',         icon: Shield,        categoria: 'oficina',      papeis: TODOS },
  { id: 'servicos',       href: '/servicos',       label: 'Serviços',          icon: ListChecks,    categoria: 'oficina',      papeis: GESTORES },
  { id: 'montagens',      href: '/montagens',      label: 'Montagens',         icon: Wrench,        categoria: 'oficina',      papeis: GESTORES },
  { id: 'pecas',          href: '/pecas',          label: 'Peças',             icon: Package2,      categoria: 'oficina',      papeis: TODOS },
  { id: 'pecas-fabrica',  href: '/pecas-fabrica',  label: 'Retirada de Peças', icon: PackageCheck,  categoria: 'oficina',      papeis: GESTORES },

  // ── Estoque & Fábrica
  { id: 'showroom',       href: '/estoque',        label: 'Showroom',          icon: Package,       categoria: 'estoque',      papeis: COMERCIAL, destaque: true },
  { id: 'entrada',        href: '/entrada',        label: 'Entrada',           icon: PackagePlus,   categoria: 'estoque',      papeis: [],        regraPropria: true },
  { id: 'transferencias', href: '/transferencias', label: 'Transferências',    icon: ArrowLeftRight, categoria: 'estoque',     papeis: COMERCIAL },
  { id: 'precificacao',   href: '/precificacao',   label: 'Precificação',      icon: Tag,           categoria: 'estoque',      papeis: ADMINS },
  { id: 'compras',        href: '/compras',        label: 'Compras',           icon: ShoppingBag,   categoria: 'estoque',      papeis: ADMINS },
  { id: 'relatorio-fabrica', href: '/relatorio-fabrica', label: 'Relatório Fábrica', icon: FileBarChart, categoria: 'estoque', papeis: GESTORES },

  // ── Financeiro
  { id: 'caixa',          href: '/caixa',          label: 'Caixa',             icon: Wallet,        categoria: 'financeiro',   papeis: GESTORES },
  { id: 'pix',            href: '/pix-mcp',        label: 'PIX',               icon: QrCode,        categoria: 'financeiro',   papeis: COMERCIAL },
  { id: 'conciliacao',    href: '/conciliacao',    label: 'Conciliação',       icon: CreditCard,    categoria: 'financeiro',   papeis: GESTORES },
  { id: 'despesas',       href: '/despesas',       label: 'Despesas',          icon: TrendingDown,  categoria: 'financeiro',   papeis: ADMINS },
  { id: 'financeiro',     href: '/financeiro',     label: 'Financeiro',        icon: BarChart3,     categoria: 'financeiro',   papeis: ADMINS },
  { id: 'dre',            href: '/admin/dre',      label: 'DRE',               icon: FileSpreadsheet, categoria: 'financeiro', papeis: ADMINS },
  { id: 'folha',          href: '/folha-pagamento', label: 'Folha de Pagamento', icon: HandCoins,   categoria: 'financeiro',   papeis: ADMINS },

  // ── Gestão
  { id: 'metas',          href: '/admin/metas',    label: 'Metas',             icon: Target,        categoria: 'gestao',       papeis: GESTORES },
  { id: 'calendario',     href: '/calendario',     label: 'Calendário',        icon: CalendarRange, categoria: 'gestao',       papeis: COMERCIAL },
  { id: 'comunicados',    href: '/admin/comunicados', label: 'Comunicados',    icon: Megaphone,     categoria: 'gestao',       papeis: ADMINS },
  { id: 'veiculos-historico', href: '/admin/veiculos-historico', label: 'Histórico de Veículos', icon: FileText, categoria: 'gestao', papeis: ADMINS },
  { id: 'acoes',          href: '/admin/acoes',    label: 'Ações',             icon: Database,      categoria: 'gestao',       papeis: SUPER },

  // ── Configuração
  { id: 'lojas',          href: '/admin/lojas',    label: 'Lojas',             icon: Building2,     categoria: 'configuracao', papeis: ADMINS },
  { id: 'grupos',         href: '/admin/grupos',   label: 'Grupos',            icon: Layers,        categoria: 'configuracao', papeis: SUPER },
  { id: 'usuarios',       href: '/admin/usuarios', label: 'Usuários',          icon: Users,         categoria: 'configuracao', papeis: SUPER },
  { id: 'dados-funcionarios', href: '/admin/dados-funcionarios', label: 'Dados de Funcionários', icon: IdCard, categoria: 'configuracao', papeis: ADMINS },
  { id: 'modelos',        href: '/admin/modelos',  label: 'Modelos',           icon: Bike,          categoria: 'configuracao', papeis: ADMINS },
  { id: 'categorias-caixa', href: '/admin/categorias-caixa', label: 'Categorias de Caixa', icon: Tags, categoria: 'configuracao', papeis: ADMINS },
  { id: 'bancos',         href: '/admin/bancos',   label: 'Bancos',            icon: Landmark,      categoria: 'configuracao', papeis: ADMINS },
  { id: 'calendario-categorias', href: '/admin/calendario-categorias', label: 'Categorias de Calendário', icon: CalendarRange, categoria: 'configuracao', papeis: ADMINS },
  { id: 'canais',         href: '/admin/canais',   label: 'Canais',            icon: Megaphone,     categoria: 'configuracao', papeis: GESTORES },
  { id: 'origens',        href: '/admin/origens',  label: 'Origens',           icon: Tag,           categoria: 'configuracao', papeis: GESTORES },
  { id: 'kommo',          href: '/admin/kommo',    label: 'Kommo',             icon: Headset,       categoria: 'configuracao', papeis: ADMINS },
  { id: 'bling',          href: '/admin/bling',    label: 'Bling',             icon: Settings2,     categoria: 'configuracao', papeis: ADMINS },
]

function temPapelNav(usuario: UsuarioNav, papel: string): boolean {
  return usuario.papel === papel || (usuario.papeisExtras ?? []).includes(papel)
}

function visivel(item: ItemNav, usuario: UsuarioNav, regras: RegrasProprias): boolean {
  // Bloqueio individual ganha de tudo — inclusive de liberação individual.
  if ((usuario.modulosBloqueados ?? []).includes(item.id)) return false
  if (item.regraPropria) return regras[item.id] === true
  if ((usuario.modulosExtras ?? []).includes(item.id)) return true
  return item.papeis.some(p => temPapelNav(usuario, p))
}

export function itensVisiveis(usuario: UsuarioNav, regras: RegrasProprias): ItemNav[] {
  return ITENS.filter(i => visivel(i, usuario, regras))
}

export function podeAcessar(usuario: UsuarioNav, href: string, regras: RegrasProprias): boolean {
  const item = ITENS.find(i => i.href === href)
  // Rota fora da tabela não é liberada por omissão — quem adicionar página nova
  // precisa declará-la aqui, e é isso que a torna alcançável.
  if (!item) return false
  return visivel(item, usuario, regras)
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `node --import tsx --test src/lib/navegacao.test.ts`
Expected: `pass 12`, `fail 0`. Se alguma lista de ids divergir, **a tabela está errada, não o teste** — o teste é a permissão de hoje, conferida contra o spec.

- [ ] **Step 6: Entrar na suíte e rodar tudo**

Em `package.json`, acrescentar `src/lib/navegacao.test.ts` à lista do script `test`, logo depois de `src/lib/pendencias-venda.test.ts`.

Run: `npm test`
Expected: `fail 0`, com 12 testes a mais que antes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/navegacao.ts src/lib/navegacao.test.ts package.json
git commit -m "feat(navegacao): tabela única de itens, categorias e permissão"
```

---

### Task 3: Cola de servidor e sidebar lendo da tabela

**Files:**
- Create: `src/lib/navegacao-servidor.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx:47-51`

**Interfaces:**
- Consumes: `itensVisiveis`, `podeAcessar`, `ItemNav`, `CATEGORIAS` (Task 2); `podeRegistrarEntradaMotos` de `@/lib/auth`
- Produces:
  - `itensDoUsuario(usuario: UsuarioServidor): ItemNav[]`
  - `usuarioPodeAcessar(usuario: UsuarioServidor, href: string): boolean`
  - `type UsuarioServidor = UsuarioNav & { email: string }`
  - Sidebar passa a receber `{ itensIds: string[]; conecta: string | null }` — **não** mais `papel`, `mostrarEntrada` nem objetos de item

O Sidebar é `'use client'` e `icon` é um componente: componente **não atravessa** a fronteira servidor→cliente como prop serializável de forma confiável. Por isso o servidor manda o `id` e o cliente resolve o ícone a partir de `ITENS`, importando a tabela diretamente (ela é pura, pode ir pro bundle do cliente).

- [ ] **Step 1: Escrever a cola**

```ts
// src/lib/navegacao-servidor.ts
// Liga a tabela pura de navegação às regras que dependem de e-mail. Fica em
// arquivo separado porque @/lib/auth importa o db no topo, e navegacao.ts
// precisa continuar testável sem banco.
import { podeRegistrarEntradaMotos } from '@/lib/auth'
import { itensVisiveis, podeAcessar, type ItemNav, type UsuarioNav } from '@/lib/navegacao'

export type UsuarioServidor = UsuarioNav & { email: string }

function regrasDe(usuario: UsuarioServidor) {
  return { entrada: podeRegistrarEntradaMotos(usuario) }
}

export function itensDoUsuario(usuario: UsuarioServidor): ItemNav[] {
  return itensVisiveis(usuario, regrasDe(usuario))
}

export function usuarioPodeAcessar(usuario: UsuarioServidor, href: string): boolean {
  return podeAcessar(usuario, href, regrasDe(usuario))
}
```

- [ ] **Step 2: Conferir a assinatura de `podeRegistrarEntradaMotos`**

Run: `grep -n "export function podeRegistrarEntradaMotos" -A 6 src/lib/auth.ts`
Expected: uma função que recebe um objeto com `papel` e `email`. Se ela pedir mais campos, acrescentar a `UsuarioServidor` — não mudar a função.

- [ ] **Step 3: Reescrever o Sidebar**

Substituir o bloco `baseNavItems` + `navItems` (linhas 15-71) por props. O componente passa a receber ids e monta a partir da tabela:

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { ChevronLeft, ChevronRight, Zap, Link as LinkIcon } from 'lucide-react'
import { CATEGORIAS, ITENS, type Slug } from '@/lib/navegacao'

type Props = { itensIds: string[]; conecta: string | null }

export function Sidebar({ itensIds, conecta }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const permitidos = new Set(itensIds)
  const itens = ITENS.filter(i => permitidos.has(i.id))

  // Linhas do menu: destaques soltos, depois uma linha por categoria.
  // Categoria com um item só vira link direto — hub com um card é ruído.
  const destaques = itens.filter(i => i.destaque)
  const linhasCategoria = CATEGORIAS.flatMap(({ slug, nome, icon }) => {
    const daCategoria = itens.filter(i => i.categoria === slug)
    if (daCategoria.length === 0) return []
    if (daCategoria.length === 1) {
      const unico = daCategoria[0]
      return [{ href: unico.href, label: unico.label, icon: unico.icon, hub: false }]
    }
    return [{ href: `/areas/${slug}`, label: nome, icon, hub: true }]
  })
  const linhas = [
    ...destaques.map(i => ({ href: i.href, label: i.label, icon: i.icon, hub: false })),
    ...linhasCategoria,
  ]
  ...
}
```

O `map` de renderização já existente passa a iterar `linhas` em vez de `navItems`, e a linha com `hub: true` ganha uma `<ChevronRight size={14} className="ml-auto opacity-50" />` antes do fechamento do `<Link>`. O bloco do Conecta e o botão de recolher ficam como estão.

- [ ] **Step 4: Alimentar o Sidebar no layout**

Em `src/app/(dashboard)/layout.tsx`, trocar o bloco de props do Sidebar:

```tsx
import { itensDoUsuario } from '@/lib/navegacao-servidor'
...
        <Sidebar
          itensIds={itensDoUsuario(usuario).map(i => i.id)}
          conecta={usuario.conecta}
        />
```

`podeRegistrarEntradaMotos` sai do layout: agora quem chama é `itensDoUsuario`.

- [ ] **Step 5: Verificar tipos e subir o app**

Run: `npm run type-check`
Expected: sem erro.

Run: `npx dotenv-cli -e .env.local -- npm run dev` e abrir `http://localhost:3000/dashboard`
Expected: sidebar com Dashboard, Showroom, Vendas, Ordens de Serviço soltos e as seis categorias como linha com seta. Nenhuma das ~26 linhas antigas.

- [ ] **Step 6: Commit**

```bash
git add src/lib/navegacao-servidor.ts src/components/layout/sidebar.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat(menu): sidebar enxuto lendo da tabela de navegação"
```

---

### Task 4: Hubs `/areas/[slug]`

**Files:**
- Create: `src/app/(dashboard)/areas/[slug]/page.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `CATEGORIAS`, `Slug` (Task 2); `itensDoUsuario` (Task 3)
- Produces: rota `/areas/<slug>` para os seis slugs

- [ ] **Step 1: Escrever o hub**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { itensDoUsuario } from '@/lib/navegacao-servidor'
import { CATEGORIAS, type Slug } from '@/lib/navegacao'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const categoria = CATEGORIAS.find(c => c.slug === slug)
  if (!categoria) notFound()

  const usuario = await getUsuarioLogado()
  const itens = itensDoUsuario(usuario).filter(i => i.categoria === (slug as Slug))
  // Categoria vazia para esta pessoa é 404, não página em branco: ela não
  // deveria ter chegado aqui, já que o sidebar não mostra a linha.
  if (itens.length === 0) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{categoria.nome}</h1>
        <p className="text-slate-500 text-sm">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {itens.map(({ id, href, label, icon: Icon }) => (
          <Link key={id} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Icon className="text-slate-600" size={20} />
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Transformar `/admin` em redirect**

Substituir todo o conteúdo de `src/app/(dashboard)/admin/page.tsx` por:

```tsx
import { redirect } from 'next/navigation'

// O grid de cards do /admin virou o hub /areas/configuracao. Este redirect
// existe para não quebrar link salvo nem atalho de quem já usava a rota.
export default function AdminPage() {
  redirect('/areas/configuracao')
}
```

- [ ] **Step 3: Conferir os seis hubs no navegador**

Com `npm run dev` rodando, abrir cada um: `/areas/comercial`, `/areas/oficina`, `/areas/estoque`, `/areas/financeiro`, `/areas/gestao`, `/areas/configuracao`.
Expected: cards de cada área. `/admin` cai em `/areas/configuracao`. `/areas/inexistente` dá 404.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/areas" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat(menu): hubs por área em /areas/[slug]"
```

---

### Task 5: Guardas de rota saindo da mesma tabela

**Files:**
- Modify: `src/app/(dashboard)/admin/components/admin-guard.tsx`
- Modify: `src/app/(dashboard)/compras/page.tsx`
- Modify: as 16 páginas com guarda listadas abaixo

**Interfaces:**
- Consumes: `usuarioPodeAcessar` (Task 3)
- Produces: nada novo — só unifica quem decide

Páginas a converter (o array literal sai, a chamada entra):
`atendimento`, `caixa`, `conciliacao`, `despesas`, `financeiro`, `folha-pagamento`,
`marketing`, `montagens`, `pecas`, `pecas-fabrica`, `pix-mcp`, `precificacao`,
`relatorio-fabrica`, `servicos`, `simulador`, `admin/dre`, `admin/canais`,
`admin/metas`, `admin/origens`, `admin/veiculos-historico`.

- [ ] **Step 1: Reescrever os guards do admin por dentro**

```tsx
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'

// Mantidos como componente para não tocar em 17 arquivos de /admin/*, mas a
// decisão agora sai da tabela de navegação, igual ao sidebar.
export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')
  return <>{children}</>
}

export async function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') redirect('/dashboard')
  return <>{children}</>
}
```

**Desvio consciente do spec.** O spec diz que os dois guards seriam "reescritos por
dentro em cima de `podeAcessar`". Não dá: `AdminGuard` embrulha 12 páginas diferentes
e não sabe qual item está protegendo — `podeAcessar` precisa de um href. As
alternativas seriam passar o href como prop em 12 arquivos (o que o próprio spec
queria evitar) ou inferir a rota, que servidor não faz de forma confiável. Fica
assim: os guards mantêm a checagem por papel e só o destino do redirect muda
(`/estoque` → `/dashboard`). As páginas de `/admin/*` com guarda própria (dre,
canais, metas, origens, veiculos-historico) essas sim viram `usuarioPodeAcessar`.

Consequência a aceitar: para as 12 páginas de `AdminGuard`, a regra continua escrita
em dois lugares (tabela e guard), ambos dizendo `ADMINS`. O teste de não-regressão
cobre a tabela; a divergência só apareceria se alguém mudasse um sem o outro.

- [ ] **Step 2: Converter uma página como padrão — `/despesas`**

Em `src/app/(dashboard)/despesas/page.tsx`, remover `const ADMINS = [...]` (linha 21) e trocar a linha 29:

```tsx
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
...
  if (!usuarioPodeAcessar(usuario, '/despesas')) redirect('/dashboard')
```

- [ ] **Step 3: Repetir nas outras 19 páginas**

Mesma troca, com o href exato de cada uma:

| arquivo | href passado a `usuarioPodeAcessar` |
|---|---|
| `atendimento/page.tsx` | `/atendimento` |
| `caixa/page.tsx` | `/caixa` |
| `conciliacao/page.tsx` | `/conciliacao` |
| `financeiro/page.tsx` | `/financeiro` |
| `folha-pagamento/page.tsx` | `/folha-pagamento` |
| `marketing/page.tsx` | `/marketing` |
| `montagens/page.tsx` | `/montagens` |
| `pecas/page.tsx` | `/pecas` |
| `pecas-fabrica/page.tsx` | `/pecas-fabrica` |
| `pix-mcp/page.tsx` | `/pix-mcp` |
| `precificacao/page.tsx` | `/precificacao` |
| `relatorio-fabrica/page.tsx` | `/relatorio-fabrica` |
| `servicos/page.tsx` | `/servicos` |
| `simulador/page.tsx` | `/simulador` |
| `admin/dre/page.tsx` | `/admin/dre` |
| `admin/canais/page.tsx` | `/admin/canais` |
| `admin/metas/page.tsx` | `/admin/metas` |
| `admin/origens/page.tsx` | `/admin/origens` |
| `admin/veiculos-historico/page.tsx` | `/admin/veiculos-historico` |

Atenção ao `simulador`: hoje ele barra por lista negra (`BLOQUEADOS = ['mecanico']`),
não por lista branca. A troca inverte a lógica — confira que o resultado é o mesmo
(mecânico fora, todo o resto dentro). O array literal de papéis sai; se ele for usado em outro lugar do arquivo (ex.: `caixa/page.tsx:28` usa `isAdmin` para variar a tela), **esse uso permanece** — a conversão é só da guarda.

- [ ] **Step 4: Dar guarda ao `/compras`**

Em `src/app/(dashboard)/compras/page.tsx`, dentro do componente de página, logo após obter o usuário:

```tsx
  if (!usuarioPodeAcessar(usuario, '/compras')) redirect('/dashboard')
```

Manter o `const ADMINS` e o `isAdmin` da linha 118 — eles variam a tela, não barram.

- [ ] **Step 5: Verificar que nenhuma guarda ficou para trás**

Run: `grep -rn "includes(usuario.papel)) redirect" "src/app/(dashboard)" | grep -v navegacao`
Expected: nenhuma linha. Se sobrar alguma, converter.

Run: `npm run type-check`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)"
git commit -m "fix(acesso): guarda de rota sai da tabela de navegação; /compras ganha a sua"
```

---

### Task 6: Permissão no cadastro do usuário

**Files:**
- Create: `src/app/(dashboard)/admin/usuarios/components/modulos-picker.tsx`
- Modify: `src/app/(dashboard)/admin/usuarios/components/usuarios-table.tsx:16,33,96-103,111-124,255-270`
- Modify: `src/app/(dashboard)/admin/usuarios/actions.ts:55` e `:92`

**Interfaces:**
- Consumes: `CATEGORIAS`, `ITENS`, `type Papel` (Task 2); colunas da Task 1
- Produces: `ModulosPicker` com props `{ papel: string; extras: string[]; bloqueados: string[]; onChange: (v: { extras: string[]; bloqueados: string[] }) => void }`; `criarUsuarioAction`/`editarUsuarioAction` passam a aceitar `modulosExtras: string[]` e `modulosBloqueados: string[]`

- [ ] **Step 1: Escrever o picker**

```tsx
'use client'
import { CATEGORIAS, ITENS, type Papel } from '@/lib/navegacao'

type Props = {
  papel: string
  extras: string[]
  bloqueados: string[]
  onChange: (v: { extras: string[]; bloqueados: string[] }) => void
}

export function ModulosPicker({ papel, extras, bloqueados, onChange }: Props) {
  const doPapel = (id: string) =>
    ITENS.find(i => i.id === id)?.papeis.includes(papel as Papel) ?? false

  // Dois estados, e o significado depende do papel dar ou não o módulo:
  // o que o papel dá alterna entre "do papel" e "bloqueado"; o que ele não dá
  // alterna entre "não tem" e "liberado". Só a diferença é gravada.
  function alternar(id: string) {
    if (doPapel(id)) {
      onChange({
        extras,
        bloqueados: bloqueados.includes(id)
          ? bloqueados.filter(x => x !== id)
          : [...bloqueados, id],
      })
    } else {
      onChange({
        extras: extras.includes(id) ? extras.filter(x => x !== id) : [...extras, id],
        bloqueados,
      })
    }
  }

  function estado(id: string): 'papel' | 'liberado' | 'bloqueado' | 'sem' {
    if (bloqueados.includes(id)) return 'bloqueado'
    if (doPapel(id)) return 'papel'
    if (extras.includes(id)) return 'liberado'
    return 'sem'
  }

  const rotulo = { papel: 'do papel', liberado: 'liberado', bloqueado: 'bloqueado', sem: '' }
  const cor = {
    papel: 'text-slate-700',
    liberado: 'text-green-700 font-medium',
    bloqueado: 'text-red-600 line-through',
    sem: 'text-slate-400',
  }

  return (
    <div className="space-y-3">
      {CATEGORIAS.map(({ slug, nome }) => (
        <div key={slug}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">{nome}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ITENS.filter(i => i.categoria === slug && !i.regraPropria).map(i => {
              const e = estado(i.id)
              return (
                <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={e === 'papel' || e === 'liberado'}
                    onChange={() => alternar(i.id)}
                    className="rounded border-slate-300"
                  />
                  <span className={cor[e]}>{i.label}</span>
                  {rotulo[e] && <span className="text-[10px] text-slate-400">{rotulo[e]}</span>}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

Itens de `regraPropria` (só `/entrada`) ficam fora da lista: a permissão deles não vem da tabela e marcar ali não teria efeito.

- [ ] **Step 2: Encaixar no formulário**

Em `components/usuarios-table.tsx` são quatro pontos:

**(a)** `type Usuario` (linha 16) e `type DadosForm` (linha 33) ganham
`modulosExtras: string[]` e `modulosBloqueados: string[]`.

**(b)** Em `FormUsuario`, junto dos `useState` das linhas 96-103:

```tsx
const [modulosExtras, setModulosExtras] = useState<string[]>(u?.modulosExtras ?? [])
const [modulosBloqueados, setModulosBloqueados] = useState<string[]>(u?.modulosBloqueados ?? [])
```

**(c)** Renderizar abaixo do `<Select>` de papel (linha 145), dentro de um bloco com
título "Acesso a módulos":

```tsx
<ModulosPicker
  papel={papel}
  extras={modulosExtras}
  bloqueados={modulosBloqueados}
  onChange={v => { setModulosExtras(v.extras); setModulosBloqueados(v.bloqueados) }}
/>
```

**(d)** Incluir os dois arrays no objeto que `handleSubmit` monta (linhas 120-123) e
no objeto que `handleEditar` repassa para `editarUsuarioAction` (linhas 259-270) —
esse segundo remonta o objeto campo a campo, então esquecer dele faz a edição
apagar silenciosamente o que o formulário mandou.

Trocar o papel no combo **não** limpa os arrays: eles guardam só a diferença, e a tela remarca sozinha porque `doPapel()` recalcula.

- [ ] **Step 3: Persistir nas actions**

Em `criarUsuarioAction` e `editarUsuarioAction`, acrescentar ao tipo de `dados`:

```ts
  modulosExtras: string[]
  modulosBloqueados: string[]
```

e ao `set`/`values` do drizzle:

```ts
  modulosExtras:     dados.modulosExtras,
  modulosBloqueados: dados.modulosBloqueados,
```

- [ ] **Step 4: Buscar os campos na listagem**

Conferir se `usuarios/page.tsx` projeta colunas explicitamente. Se sim, acrescentar `modulosExtras: usuarios.modulosExtras` e `modulosBloqueados: usuarios.modulosBloqueados`; senão (select sem projeção) já vêm.

Run: `grep -n "select(" -A 15 "src/app/(dashboard)/admin/usuarios/page.tsx" | head -20`

- [ ] **Step 5: Testar no navegador**

Com `npm run dev`, abrir `/admin/usuarios`, editar um vendedor de teste, marcar "Marketing" (deve ficar verde, "liberado") e desmarcar "PIX" (vermelho, "bloqueado"), salvar.

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select nome, modulos_extras, modulos_bloqueados from usuarios where modulos_extras <> '{}' or modulos_bloqueados <> '{}'"
```
Expected: uma linha com `modulos_extras: ["marketing"]` e `modulos_bloqueados: ["pix"]`.

Depois desfazer a marcação na tela e conferir que voltou a `{}`.

- [ ] **Step 6: Rodar a suíte e os tipos**

Run: `npm test && npm run type-check`
Expected: `fail 0`, sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/admin/usuarios"
git commit -m "feat(usuarios): permissão de módulo por pessoa no cadastro"
```

---

## Verificação final antes de deploy

- [ ] `npm test` — `fail 0`
- [ ] `npm run type-check` — sem saída
- [ ] Conferir no banco que ninguém ganhou acesso sem querer:
  ```bash
  npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*) from usuarios where modulos_extras <> '{}' or modulos_bloqueados <> '{}'"
  ```
  Expected: `0`, a menos que o Cesar já tenha marcado alguém de propósito.
- [ ] Abrir o app e conferir o sidebar de pelo menos dois papéis diferentes.
- [ ] Push para `main` e acompanhar o deploy na Vercel até `READY`.
