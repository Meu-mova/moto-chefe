# Cadastro complementar de funcionários — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar CPF, chave PIX e data de nascimento de cada funcionário, preenchidos por ele mesmo, obrigatoriamente antes de usar o sistema.

**Architecture:** Tabela `usuarios_dados` (1:1 com `usuarios`, separada para o dado sensível não circular junto do usuário logado). O layout do dashboard redireciona quem não preencheu para `/completar-cadastro`, que fica fora do grupo `(dashboard)` para não cair na própria trava. `admin_geral` é isento, como válvula de escape. Validação em funções puras, testadas sem banco.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle + postgres.js, @base-ui/react, `node:test` + `node:assert/strict`.

Spec: `docs/superpowers/specs/2026-08-04-dados-funcionarios-design.md`

## Global Constraints

- **Migração só por SQL manual**, aplicado direto no banco com postgres.js e `DATABASE_URL` do `.env.local` (padrão de `scripts/importar-motos.ts`), com script temporário apagado depois. **Nunca** `db:generate`/`db:migrate` — o journal do Drizzle neste repo está quebrado. O MCP do Supabase não está autenticado.
- **Testes:** `node --import tsx --test`. O script `test` do `package.json` é uma **lista explícita de arquivos, sem glob** — arquivo novo tem que ser acrescentado à mão.
- **UI é @base-ui/react, não Radix.** Nada de `asChild`/`onPointerDownOutside`.
- **Para o seletor de tipo da chave PIX, usar `<select>` nativo, não o `<Select>` do base-ui** — o componente do projeto mostra o *value* cru quando ele difere do rótulo exibido (valor `cpf`, rótulo "CPF"), o que já causou bug antes.
- **Data:** `"YYYY-MM-DD"` dentro de `new Date()` vira 21h do dia anterior em Brasília. A coluna é `date` puro; conversão para `Date` só via `parseDataInput()` de `src/lib/data-venda.ts`.
- **Checagem de papel dentro da server action**, nunca só no gate visual — server action é endpoint público do Next.
- Comentários e textos de tela em português brasileiro.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/dados-funcionario.ts` (criar) | Validação e normalização puras: CPF, chave PIX por tipo, data de nascimento. Sem I/O. |
| `src/lib/dados-funcionario.test.ts` (criar) | Testes dos validadores. |
| `src/lib/db/schema.ts` (modificar) | Reflete a tabela `usuarios_dados`. |
| `src/app/completar-cadastro/page.tsx` (criar) | A tela do formulário. Fora do grupo `(dashboard)`. |
| `src/app/completar-cadastro/form.tsx` (criar) | O formulário em si (client component). |
| `src/app/completar-cadastro/actions.ts` (criar) | `salvarDadosFuncionarioAction`. |
| `src/app/(dashboard)/layout.tsx` (modificar) | A trava: redireciona quem não preencheu. |
| `src/components/layout/header.tsx` (modificar) | Link "Meus dados" para a pessoa corrigir depois. |
| `src/app/(dashboard)/admin/dados-funcionarios/page.tsx` (criar) | Listagem para `admin_geral` + `admin_socio`. |
| `src/app/(dashboard)/admin/page.tsx` (modificar) | Card levando à listagem nova. |

---

### Task 1: Validadores

**Files:**
- Create: `src/lib/dados-funcionario.ts`
- Test: `src/lib/dados-funcionario.test.ts`
- Modify: `package.json` (lista do `test`)

**Interfaces:**
- Produces: `TipoChavePix`, `normalizarCpf`, `cpfValido`, `normalizarChavePix`, `chavePixValida`, `nascimentoValido`, `IDADE_MINIMA`.
- Consumes: nada.

- [ ] **Step 1: Escrever os testes**

Criar `src/lib/dados-funcionario.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCpf, cpfValido, normalizarChavePix, chavePixValida, nascimentoValido, IDADE_MINIMA,
} from './dados-funcionario'

// ─── CPF ──────────────────────────────────────────────────────────────────
test('CPF com dígito verificador correto é aceito', () => {
  assert.equal(cpfValido('529.982.247-25'), true)
})

test('CPF com dígito verificador errado é recusado', () => {
  assert.equal(cpfValido('529.982.247-26'), false)
})

test('CPF de dígitos repetidos é recusado', () => {
  // Passa na conta do dígito verificador, mas não existe.
  assert.equal(cpfValido('111.111.111-11'), false)
  assert.equal(cpfValido('000.000.000-00'), false)
})

test('CPF com menos de 11 dígitos é recusado', () => {
  assert.equal(cpfValido('5299822472'), false)
})

test('a pontuação é descartada na normalização', () => {
  assert.equal(normalizarCpf('529.982.247-25'), '52998224725')
})

// ─── chave PIX ────────────────────────────────────────────────────────────
test('chave do tipo CPF segue a regra de CPF', () => {
  assert.equal(chavePixValida('cpf', '529.982.247-25'), true)
  assert.equal(chavePixValida('cpf', '529.982.247-26'), false)
})

test('celular exige DDD e o nono dígito', () => {
  assert.equal(chavePixValida('celular', '(35) 99999-1234'), true)
  assert.equal(chavePixValida('celular', '99999-1234'), false)   // sem DDD
  assert.equal(chavePixValida('celular', '(35) 3999-1234'), false) // fixo, sem o 9
})

test('celular é normalizado no formato que o PIX usa', () => {
  assert.equal(normalizarChavePix('celular', '(35) 99999-1234'), '+5535999991234')
  assert.equal(normalizarChavePix('celular', '+55 35 99999-1234'), '+5535999991234')
})

test('e-mail precisa ter cara de e-mail', () => {
  assert.equal(chavePixValida('email', 'luiz@motochefe.com.br'), true)
  assert.equal(chavePixValida('email', 'luiz.motochefe.com.br'), false)
})

test('e-mail é normalizado em minúsculas', () => {
  assert.equal(normalizarChavePix('email', ' Luiz@MotoChefe.com.br '), 'luiz@motochefe.com.br')
})

test('chave aleatória tem 32 caracteres hexadecimais, com ou sem traços', () => {
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567e89b12d3a456426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456'), false)
  assert.equal(chavePixValida('aleatoria', 'zzz'), false)
})

// ─── nascimento ───────────────────────────────────────────────────────────
const HOJE = new Date('2026-08-04T12:00:00.000Z')

test('nascimento válido é aceito', () => {
  assert.equal(nascimentoValido('1990-03-15', HOJE), true)
})

test('data no futuro é recusada', () => {
  assert.equal(nascimentoValido('2027-01-01', HOJE), false)
})

test(`idade abaixo de ${IDADE_MINIMA} é recusada — quase sempre erro de digitação no ano`, () => {
  assert.equal(nascimentoValido('2020-03-15', HOJE), false)
})

test('quem faz aniversário hoje já tem a idade', () => {
  assert.equal(nascimentoValido('2012-08-04', HOJE), true)   // faz 14 hoje
  assert.equal(nascimentoValido('2012-08-05', HOJE), false)  // faz 14 amanhã
})

test('ano absurdo é recusado', () => {
  assert.equal(nascimentoValido('1899-01-01', HOJE), false)
})

test('formato fora de YYYY-MM-DD é recusado', () => {
  assert.equal(nascimentoValido('15/03/1990', HOJE), false)
  assert.equal(nascimentoValido('', HOJE), false)
})
```

- [ ] **Step 2: Registrar o teste no package.json**

Acrescentar `src/lib/dados-funcionario.test.ts` ao fim da lista do script `test`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx tsx --test src/lib/dados-funcionario.test.ts`
Expected: FAIL — `Cannot find module './dados-funcionario'`

- [ ] **Step 4: Implementar**

Criar `src/lib/dados-funcionario.ts`:

```ts
// Validação dos dados que o próprio funcionário preenche em /completar-cadastro.
// Tudo puro: sem banco, sem fetch — é o que permite testar as bordas sem subir nada.

export type TipoChavePix = 'cpf' | 'celular' | 'email' | 'aleatoria'

export const TIPOS_CHAVE_PIX: { valor: TipoChavePix; rotulo: string }[] = [
  { valor: 'cpf',       rotulo: 'CPF' },
  { valor: 'celular',   rotulo: 'Celular' },
  { valor: 'email',     rotulo: 'E-mail' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória' },
]

/** Abaixo disso é praticamente sempre erro de digitação no ano. */
export const IDADE_MINIMA = 14
const ANO_MINIMO = 1930

export function normalizarCpf(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function cpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor)
  if (cpf.length !== 11) return false
  // 111.111.111-11 e afins passam na conta do dígito verificador mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digito = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

function normalizarCelular(valor: string): string {
  let digitos = (valor ?? '').replace(/\D/g, '')
  // Aceita com ou sem o código do país; guardamos sempre com.
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2)
  return digitos
}

export function normalizarChavePix(tipo: TipoChavePix, chave: string): string {
  const bruto = (chave ?? '').trim()
  if (tipo === 'cpf') return normalizarCpf(bruto)
  if (tipo === 'celular') return `+55${normalizarCelular(bruto)}`
  if (tipo === 'email') return bruto.toLowerCase()
  return bruto.replace(/-/g, '').toLowerCase()
}

export function chavePixValida(tipo: TipoChavePix, chave: string): boolean {
  const bruto = (chave ?? '').trim()
  if (!bruto) return false

  if (tipo === 'cpf') return cpfValido(bruto)

  if (tipo === 'celular') {
    const digitos = normalizarCelular(bruto)
    // DDD (2) + 9 + 8 dígitos. Fixo não é aceito como chave de celular.
    return digitos.length === 11 && digitos[2] === '9'
  }

  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(bruto)

  return /^[0-9a-f]{32}$/.test(bruto.replace(/-/g, '').toLowerCase())
}

/**
 * `iso` no formato "YYYY-MM-DD", como vem do <input type="date">.
 * Comparação feita em número (ano/mês/dia), nunca com `new Date(iso)`, que
 * ancora o instante na meia-noite UTC e vira 21h do dia anterior em Brasília.
 */
export function nascimentoValido(iso: string, hoje: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false

  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano < ANO_MINIMO) return false
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false

  const hojeAno = hoje.getUTCFullYear()
  const hojeMes = hoje.getUTCMonth() + 1
  const hojeDia = hoje.getUTCDate()

  const noFuturo = ano > hojeAno
    || (ano === hojeAno && mes > hojeMes)
    || (ano === hojeAno && mes === hojeMes && dia > hojeDia)
  if (noFuturo) return false

  let idade = hojeAno - ano
  if (mes > hojeMes || (mes === hojeMes && dia > hojeDia)) idade--
  return idade >= IDADE_MINIMA
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsx --test src/lib/dados-funcionario.test.ts && npm run type-check`
Expected: PASS — 16 testes; sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dados-funcionario.ts src/lib/dados-funcionario.test.ts package.json
git commit -m "feat(funcionarios): validadores de CPF, chave PIX e nascimento"
```

---

### Task 2: A tabela

**Files:**
- Migration: SQL manual aplicado direto no banco
- Modify: `src/lib/db/schema.ts`

**Interfaces:**
- Produces: tabela `usuarios_dados`; `usuariosDados` no schema.
- Consumes: nada.

- [ ] **Step 1: Aplicar a migração**

Com script temporário (postgres.js + `DATABASE_URL` do `.env.local`, padrão de `scripts/importar-motos.ts`), rodar e depois apagar o script:

```sql
CREATE TABLE usuarios_dados (
  usuario_id      uuid PRIMARY KEY REFERENCES usuarios(id),
  cpf             text        NOT NULL,
  pix_tipo        text        NOT NULL,
  pix_chave       text        NOT NULL,
  data_nascimento date        NOT NULL,
  preenchido_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
```

Conferir depois, pelo catálogo do Postgres, que a tabela existe com as 7 colunas, e colar a saída real no relatório. Atenção: este `DATABASE_URL` é o banco que a produção usa. Criar tabela é aditivo e seguro — **não altere nem apague nada existente**.

- [ ] **Step 2: Refletir no schema.ts**

Acrescentar em `src/lib/db/schema.ts`, logo depois da tabela `usuarios`:

```ts
// ─── usuarios_dados ──────────────────────────────────────────────────────────
// Dado pessoal do funcionário, preenchido por ele mesmo em /completar-cadastro.
// Fica em tabela separada de `usuarios` de propósito: getUsuarioLogado() faz
// select() na linha inteira de `usuarios`, que circula pelo layout e chega a
// componentes de cliente — CPF e chave PIX não podem pegar carona nisso.
export const usuariosDados = pgTable('usuarios_dados', {
  usuarioId:       uuid('usuario_id').primaryKey().references(() => usuarios.id),
  cpf:             text('cpf').notNull(),            // só dígitos
  pixTipo:         text('pix_tipo').notNull(),       // cpf | celular | email | aleatoria
  pixChave:        text('pix_chave').notNull(),
  dataNascimento:  date('data_nascimento').notNull(),
  preenchidoEm:    timestamp('preenchido_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm:    timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Conferir**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(funcionarios): tabela usuarios_dados"
```

---

### Task 3: Formulário, trava e link no header

**Files:**
- Create: `src/app/completar-cadastro/page.tsx`
- Create: `src/app/completar-cadastro/form.tsx`
- Create: `src/app/completar-cadastro/actions.ts`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/header.tsx`

**Interfaces:**
- Consumes: validadores (Task 1), `usuariosDados` (Task 2), `getUsuarioLogado` (`@/lib/auth`).
- Produces: rota `/completar-cadastro`; `salvarDadosFuncionarioAction(dados)`.

- [ ] **Step 1: A server action**

Criar `src/app/completar-cadastro/actions.ts`:

```ts
'use server'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import {
  cpfValido, normalizarCpf, chavePixValida, normalizarChavePix, nascimentoValido,
  type TipoChavePix,
} from '@/lib/dados-funcionario'

type Entrada = {
  cpf: string
  pixTipo: TipoChavePix
  pixChave: string
  dataNascimento: string   // "YYYY-MM-DD"
}

export async function salvarDadosFuncionarioAction(
  dados: Entrada,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const usuario = await getUsuarioLogado()

  if (!cpfValido(dados.cpf)) return { ok: false, erro: 'CPF inválido — confira os números.' }
  if (!chavePixValida(dados.pixTipo, dados.pixChave)) {
    return { ok: false, erro: 'Chave PIX não confere com o tipo escolhido.' }
  }
  if (!nascimentoValido(dados.dataNascimento, new Date())) {
    return { ok: false, erro: 'Data de nascimento inválida.' }
  }

  const valores = {
    cpf: normalizarCpf(dados.cpf),
    pixTipo: dados.pixTipo,
    pixChave: normalizarChavePix(dados.pixTipo, dados.pixChave),
    dataNascimento: dados.dataNascimento,
    atualizadoEm: new Date(),
  }

  // Mesma tela serve para preencher e para corrigir depois.
  await db.insert(usuariosDados)
    .values({ usuarioId: usuario.id, ...valores })
    .onConflictDoUpdate({ target: usuariosDados.usuarioId, set: valores })

  return { ok: true }
}
```

- [ ] **Step 2: O formulário**

Criar `src/app/completar-cadastro/form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TIPOS_CHAVE_PIX, type TipoChavePix } from '@/lib/dados-funcionario'
import { salvarDadosFuncionarioAction } from './actions'

const AJUDA: Record<TipoChavePix, string> = {
  cpf:       'Mesmo número do seu CPF',
  celular:   'Com DDD, ex.: (35) 99999-1234',
  email:     'ex.: seunome@email.com',
  aleatoria: 'A chave gerada pelo banco, com 32 caracteres',
}

export function CompletarCadastroForm({ inicial }: {
  inicial: { cpf: string; pixTipo: TipoChavePix; pixChave: string; dataNascimento: string } | null
}) {
  const router = useRouter()
  const [cpf, setCpf] = useState(inicial?.cpf ?? '')
  const [pixTipo, setPixTipo] = useState<TipoChavePix>(inicial?.pixTipo ?? 'cpf')
  const [pixChave, setPixChave] = useState(inicial?.pixChave ?? '')
  const [dataNascimento, setDataNascimento] = useState(inicial?.dataNascimento ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarDadosFuncionarioAction({ cpf, pixTipo, pixChave, dataNascimento })
      if (!r.ok) { setErro(r.erro); return }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setErro('Não consegui salvar agora. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" inputMode="numeric" value={cpf} onChange={e => setCpf(e.target.value)}
               placeholder="000.000.000-00" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pixTipo">Tipo da chave PIX</Label>
        {/* <select> nativo de propósito: o <Select> do base-ui mostra o value cru
            quando ele difere do rótulo (valor "cpf", rótulo "CPF"). */}
        <select id="pixTipo" value={pixTipo}
                onChange={e => setPixTipo(e.target.value as TipoChavePix)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          {TIPOS_CHAVE_PIX.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pixChave">Chave PIX</Label>
        <Input id="pixChave" value={pixChave} onChange={e => setPixChave(e.target.value)} />
        <p className="text-xs text-slate-500">{AJUDA[pixTipo]}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nascimento">Data de nascimento</Label>
        <Input id="nascimento" type="date" value={dataNascimento}
               onChange={e => setDataNascimento(e.target.value)} />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar e continuar'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: A página**

Criar `src/app/completar-cadastro/page.tsx`:

```tsx
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { CompletarCadastroForm } from './form'
import type { TipoChavePix } from '@/lib/dados-funcionario'

export default async function CompletarCadastroPage() {
  const usuario = await getUsuarioLogado()

  const [existente] = await db
    .select()
    .from(usuariosDados)
    .where(eq(usuariosDados.usuarioId, usuario.id))
    .limit(1)

  const inicial = existente
    ? {
        cpf: existente.cpf,
        pixTipo: existente.pixTipo as TipoChavePix,
        pixChave: existente.pixChave,
        dataNascimento: existente.dataNascimento,
      }
    : null

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg border p-6 shadow-sm">
        <h1 className="text-xl font-bold">
          {inicial ? 'Meus dados' : `Bem-vindo, ${usuario.nome.split(' ')[0]}`}
        </h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          {inicial
            ? 'Atualize seus dados quando precisar.'
            : 'Antes de continuar, precisamos de três informações suas. Leva um minuto.'}
        </p>
        <CompletarCadastroForm inicial={inicial} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: A trava no layout**

Em `src/app/(dashboard)/layout.tsx`, depois do `getUsuarioLogado()` e **antes** de qualquer outra busca:

```tsx
import { redirect } from 'next/navigation'
import { usuariosDados } from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
```

```tsx
  const usuario = await getUsuarioLogado()

  // Ninguém usa o sistema sem CPF, chave PIX e nascimento preenchidos.
  // admin_geral fica de fora de propósito: se esta trava tiver defeito, ela
  // roda em toda página para todo usuário — precisa sobrar alguém que consiga
  // entrar e corrigir.
  if (usuario.papel !== 'admin_geral') {
    const [dados] = await db
      .select({ usuarioId: usuariosDados.usuarioId })
      .from(usuariosDados)
      .where(eq(usuariosDados.usuarioId, usuario.id))
      .limit(1)
    if (!dados) redirect('/completar-cadastro')
  }
```

- [ ] **Step 5: Link no header**

Em `src/components/layout/header.tsx`, dentro da `div` que já mostra nome e papel, acrescentar antes do formulário de logout:

```tsx
<Link href="/completar-cadastro" className="text-sm text-slate-500 hover:text-slate-900">
  Meus dados
</Link>
```

com `import Link from 'next/link'` no topo.

- [ ] **Step 6: Verificar**

Run: `npm run type-check && npm run build`
Expected: compila limpo.

Depois, com `npm run dev`: entrar como um funcionário **sem** dados preenchidos e confirmar que qualquer URL do dashboard (`/dashboard`, `/estoque`, `/vendas`) cai em `/completar-cadastro`; preencher e confirmar que volta ao dashboard e não é mais interrompido; entrar como `admin_geral` e confirmar que passa direto mesmo sem dados. Conferir no banco que a linha foi gravada com CPF só de dígitos e a data correta (nascido dia 10 tem que estar dia 10).

- [ ] **Step 7: Commit**

```bash
git add src/app/completar-cadastro "src/app/(dashboard)/layout.tsx" src/components/layout/header.tsx
git commit -m "feat(funcionarios): formulario obrigatorio de dados no primeiro acesso"
```

---

### Task 4: Listagem para os sócios

**Files:**
- Create: `src/app/(dashboard)/admin/dados-funcionarios/page.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `usuariosDados` (Task 2), `AdminGuard` (`../components/admin-guard`).

- [ ] **Step 1: A página**

Criar `src/app/(dashboard)/admin/dados-funcionarios/page.tsx`:

```tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { usuarios, usuariosDados } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TIPOS_CHAVE_PIX } from '@/lib/dados-funcionario'

function formatCpf(cpf: string) {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

function formatData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function DadosFuncionariosPage() {
  const linhas = await db
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      cpf: usuariosDados.cpf,
      pixTipo: usuariosDados.pixTipo,
      pixChave: usuariosDados.pixChave,
      dataNascimento: usuariosDados.dataNascimento,
    })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .orderBy(asc(usuarios.nome))

  const rotulo = (t: string | null) =>
    TIPOS_CHAVE_PIX.find(x => x.valor === t)?.rotulo ?? '—'

  return (
    <AdminGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Dados dos funcionários</h1>
          <p className="text-slate-500 text-sm">
            Preenchidos pelo próprio funcionário no primeiro acesso.
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Chave PIX</TableHead>
              <TableHead>Nascimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map(l => (
              <TableRow key={l.email}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell>{l.cpf ? formatCpf(l.cpf) : <span className="text-slate-400">não preencheu</span>}</TableCell>
                <TableCell>{rotulo(l.pixTipo)}</TableCell>
                <TableCell>{l.pixChave ?? '—'}</TableCell>
                <TableCell>{l.dataNascimento ? formatData(l.dataNascimento) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminGuard>
  )
}
```

O `leftJoin` é proposital: quem ainda não preencheu aparece na lista marcado como "não preencheu", que é justamente o que o sócio quer saber.

- [ ] **Step 2: Card no /admin**

Em `src/app/(dashboard)/admin/page.tsx`, acrescentar `IdCard` ao import existente do `lucide-react` (linha 6) e o card abaixo, dentro do mesmo `<div className="grid grid-cols-4 gap-4">` dos outros:

```tsx
          <Link href="/admin/dados-funcionarios">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <IdCard className="text-slate-600" size={20} />
                <CardTitle className="text-base">Dados dos funcionários</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">CPF, chave PIX e nascimento</p></CardContent>
            </Card>
          </Link>
```

O card fica no bloco visível a `admin_geral` e `admin_socio` — **não** dentro de nenhum bloco condicionado a `isSuperAdmin`.

- [ ] **Step 3: Verificar**

Run: `npm run type-check && npm run build`
Expected: compila limpo.

Com `npm run dev`: abrir `/admin/dados-funcionarios` como `admin_socio` e confirmar que a lista aparece; abrir como `vendedor` e confirmar que é redirecionado para `/estoque` pelo `AdminGuard`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/dados-funcionarios" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat(admin): listagem dos dados dos funcionarios"
```

---

## Fora deste plano

Está no spec como fora de escopo e **não deve ser implementado aqui**: exportação da folha usando esses dados, aviso de aniversário no Telegram, e qualquer campo além dos três.
