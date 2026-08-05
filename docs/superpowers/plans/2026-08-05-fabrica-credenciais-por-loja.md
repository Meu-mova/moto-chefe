# Credenciais da fábrica por loja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o acesso ao portal da fábrica de "uma conta por bandeira" para "uma conta por loja", em garantias e no alerta de pedidos de compra do Telegram.

**Architecture:** A credencial passa a morar em `lojas` (`fabrica_email`, `fabrica_senha`). Um módulo novo, `src/lib/fabrica-contas.ts`, é o único lugar que decide quais contas um usuário pode usar: quem tem `lojaId` vê só a loja dele, admin sem loja vê o grupo ativo inteiro. Garantias e o cron do Telegram consomem esse escopo e passam a iterar loja a loja, sequencialmente, tolerando falha de uma loja sem derrubar as outras.

**Tech Stack:** Next.js App Router (server actions), Drizzle ORM sobre Postgres/Supabase, `node:test` + `tsx` para os testes, migrações via Supabase MCP.

## Global Constraints

- **Nunca `npm run db:generate` nem `npm run db:migrate`** — o journal do Drizzle deste repo está quebrado. Migração é SQL escrito à mão em `src/lib/db/migrations/`, aplicado pelo script `scripts/sql.ts` (criado na Task 1) contra a `DATABASE_URL` do `.env.local`. O MCP do Supabase, que era o caminho anterior, está com o `client_id` do OAuth rejeitado no lado deles e não autentica.
- **`DATABASE_URL` do `.env.local` aponta para produção.** Todo passo destrutivo (`delete`, `drop column`) tem um passo de conferência antes; não pule.
- **Nenhuma senha em arquivo commitado.** Migração cria coluna; credencial é digitada na tela.
- Rodar testes com `npm test`. Todo arquivo `*.test.ts` novo precisa ser acrescentado à lista do script `test` no `package.json`, senão nunca roda.
- Rodar `npm run type-check` antes de cada commit.
- Português nos identificadores e nas mensagens de UI, seguindo o código existente.
- Papéis com acesso: `admin_geral`, `admin_socio`, `aux_adm`. O `aux_adm` é quem opera a loja — nunca deixar ele de fora de uma funcionalidade de loja.
- O portal da fábrica é frágil: **login sempre sequencial**, nunca em paralelo.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/sql.ts` | **Novo.** Roda um arquivo `.sql` ou uma consulta avulsa contra a `DATABASE_URL` — único caminho de migração que resta |
| `src/lib/db/schema.ts` | Colunas novas em `lojas` e `pedidos_fabrica_alerta`; remoção das colunas de fábrica em `grupos` |
| `src/lib/db/migrations/0044_fabrica_credencial_por_loja.sql` | Colunas em `lojas` + cópia da credencial do BH |
| `src/lib/db/migrations/0045_pedidos_fabrica_alerta_loja.sql` | `loja_id` no controle de alertas + troca da unique |
| `src/lib/db/migrations/0046_grupos_sem_fabrica.sql` | Remove `fabrica_email`/`fabrica_senha` de `grupos` |
| `src/lib/fabrica-contas.ts` | **Novo.** Única regra de escopo: quais contas do portal cada usuário usa |
| `src/lib/fabrica-contas.test.ts` | **Novo.** Testa a regra de escopo (onde um erro vazaria dado entre lojas) |
| `src/lib/fabrica-scraper.ts` | Credencial vira obrigatória em `loginFabrica` |
| `src/app/(dashboard)/admin/lojas/*` | Campos de credencial no cadastro de loja |
| `src/app/(dashboard)/garantias/actions.ts` | Sincronizar e importar passam a varrer conta por conta |
| `src/app/(dashboard)/garantias/components/*-button.tsx` | Toasts com resumo por loja |
| `src/app/(dashboard)/garantias/page.tsx` | Libera o botão de importar para `aux_adm` |
| `src/lib/telegram/pedidos-fabrica.ts` | Alerta passa a ser por loja |
| `src/app/(dashboard)/admin/grupos/*` | Remove os campos de fábrica do grupo |

**Ordem das tarefas importa:** as colunas entram primeiro (Task 1), o escopo depois (Task 2), a tela em seguida (Task 3) para que a credencial já possa ser digitada, e só no fim (Task 7) o fallback de env é removido — antes disso o sistema continua funcionando com o comportamento antigo.

---

### Task 1: Colunas de credencial em `lojas`

**Files:**
- Create: `scripts/sql.ts`
- Create: `src/lib/db/migrations/0044_fabrica_credencial_por_loja.sql`
- Modify: `src/lib/db/schema.ts:71-81` (tabela `lojas`)

**Interfaces:**
- Consumes: nada.
- Produces: `lojas.fabricaEmail` e `lojas.fabricaSenha`, ambos `text | null` no `$inferSelect` de `lojas`; e o comando de migração usado pelas Tasks 6 e 7:
  - `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file <arquivo.sql>`
  - `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "<select ...>"`

- [ ] **Step 1: Criar o script de execução de SQL**

Criar `scripts/sql.ts`:

```ts
/**
 * Roda SQL avulso contra a DATABASE_URL — o caminho de migração deste repo.
 *
 * `drizzle-kit migrate` não roda aqui: o journal em src/lib/db/migrations/meta
 * está quebrado desde a fusão multi-grupo. Então a migração é SQL escrito à mão
 * e aplicado por aqui.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0039_algo.sql
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select 1"
 *
 * O caminho de --file é relativo a src/lib/db/migrations.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const [modo, valor] = process.argv.slice(2)

if ((modo !== '--file' && modo !== '--query') || !valor) {
  console.error('Uso: scripts/sql.ts --file <arquivo.sql> | --query "<sql>"')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  process.exit(1)
}

const texto = modo === '--file'
  ? readFileSync(resolve(process.cwd(), 'src/lib/db/migrations', valor), 'utf8')
  : valor

// max:1 e prepare:false — script avulso, e o pooler Supavisor não aceita prepared.
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

async function main() {
  // .simple() permite várias instruções num arquivo só; o Postgres trata o lote
  // como uma transação implícita, então ou passa tudo ou não passa nada.
  const linhas = await sql.unsafe(texto).simple()
  if (Array.isArray(linhas) && linhas.length > 0) {
    console.log(JSON.stringify(linhas, null, 1))
  } else {
    console.log('OK — sem linhas de retorno')
  }
  await sql.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await sql.end({ timeout: 5 })
  process.exit(1)
})
```

Conferir que roda:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*)::int as lojas from lojas"
```

Esperado: `[{"lojas": 8}]`.

- [ ] **Step 2: Escrever o arquivo de migração**

Criar `src/lib/db/migrations/0044_fabrica_credencial_por_loja.sql`:

```sql
-- O portal da fábrica passou a ter um cadastro por loja, não mais por bandeira.
-- O login antigo do Sul de Minas virou a conta da loja de Pouso Alegre.
alter table "lojas" add column if not exists "fabrica_email" text;
alter table "lojas" add column if not exists "fabrica_senha" text;

-- O BH já tinha a credencial no grupo; traz pra loja para não redigitar.
-- As contas do Sul de Minas são cadastradas pela tela (senha não entra em
-- arquivo commitado).
update "lojas" l
set "fabrica_email" = g."fabrica_email",
    "fabrica_senha" = g."fabrica_senha"
from "grupos" g
where l."grupo_id" = g."id"
  and g."fabrica_email" is not null
  and l."nome" = 'Raja BH';
```

- [ ] **Step 3: Aplicar a migração**

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0044_fabrica_credencial_por_loja.sql
```

Expected: `OK — sem linhas de retorno`. Não rodar `npm run db:migrate`.

- [ ] **Step 4: Conferir que a credencial do BH veio junto**

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select nome, fabrica_email, fabrica_senha is not null as tem_senha from lojas order by nome"
```

Esperado: 8 linhas; `Raja BH` com `motochefe@icloud.com` e `tem_senha` verdadeiro; as outras 7 com `fabrica_email` nulo. Se `Raja BH` vier sem senha, anotar no relatório — a Task 7 apaga a coluna de origem.

- [ ] **Step 5: Refletir as colunas no schema Drizzle**

Em `src/lib/db/schema.ts`, na tabela `lojas`, trocar:

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
  // Login da loja no portal da fábrica (motochefebrasil.store). Cada loja é um
  // cadastro distinto lá — o que uma conta enxerga a outra não enxerga.
  fabricaEmail: text('fabrica_email'),
  fabricaSenha: text('fabrica_senha'),
})
```

- [ ] **Step 6: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add scripts/sql.ts src/lib/db/migrations/0044_fabrica_credencial_por_loja.sql src/lib/db/schema.ts
git commit -m "feat(fabrica): credencial do portal passa a ser por loja"
```

---

### Task 2: Regra de escopo — `src/lib/fabrica-contas.ts`

**Files:**
- Create: `src/lib/fabrica-contas.ts`
- Create: `src/lib/fabrica-contas.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `lojas.fabricaEmail` / `lojas.fabricaSenha` (Task 1); `getGrupoAtivo` de `@/lib/grupo`.
- Produces:
  - `type ContaFabrica = { lojaId: string; lojaNome: string; email: string; senha: string }`
  - `type LojaCredencial = { id: string; nome: string; fabricaEmail: string | null; fabricaSenha: string | null }`
  - `type EscopoFabrica = { contas: ContaFabrica[]; semCredencial: string[] }`
  - `filtrarContasDoUsuario(usuario: { papel: string; lojaId: string | null }, lojasDoGrupo: LojaCredencial[]): EscopoFabrica`
  - `listarContasFabrica(usuario: { papel: string; lojaId: string | null }): Promise<EscopoFabrica>`

O escopo é decidido pelo **papel**, não pela presença de `lojaId`: 3 dos 5 sócios
têm loja fixa cadastrada, e escopar por `lojaId` os prenderia a uma loja só — e
os deixaria sem nenhuma conta ao trocar de grupo, já que a loja fixa deles não
está no grupo aberto. É também o que o resto do sistema faz: `garantias/page.tsx`
já trata `admin_socio` como admin no filtro de loja.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/fabrica-contas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarContasDoUsuario, type LojaCredencial } from './fabrica-contas'

const LOJAS: LojaCredencial[] = [
  { id: 'l1', nome: 'Pouso Alegre', fabricaEmail: 'pouso@x.com',    fabricaSenha: 's' },
  { id: 'l2', nome: 'Varginha',     fabricaEmail: 'varginha@x.com', fabricaSenha: 's' },
  { id: 'l3', nome: 'Lavras',       fabricaEmail: null,             fabricaSenha: null },
]

const AUX  = { papel: 'aux_adm',     lojaId: 'l2' }
const SOCIO_COM_LOJA = { papel: 'admin_socio', lojaId: 'l1' }
const GERAL = { papel: 'admin_geral', lojaId: null }

test('quem opera a loja só enxerga a conta dela', () => {
  const { contas } = filtrarContasDoUsuario(AUX, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Varginha'])
  assert.equal(contas[0].email, 'varginha@x.com')
})

test('admin geral enxerga todas as lojas do grupo que têm login', () => {
  const { contas } = filtrarContasDoUsuario(GERAL, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Pouso Alegre', 'Varginha'])
})

test('sócio com loja fixa enxerga o grupo inteiro, não só a loja dele', () => {
  const { contas } = filtrarContasDoUsuario(SOCIO_COM_LOJA, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Pouso Alegre', 'Varginha'])
})

test('sócio que trocou de grupo enxerga as lojas do grupo aberto', () => {
  // A loja fixa dele (l1) não está na lista: é outro grupo. Escopar por lojaId
  // devolveria vazio — o bug que motivou escopar por papel.
  const { contas } = filtrarContasDoUsuario(SOCIO_COM_LOJA, [LOJAS[1]])
  assert.deepEqual(contas.map(c => c.lojaNome), ['Varginha'])
})

test('loja sem login sai em semCredencial, não vira conta', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, LOJAS)
  assert.equal(contas.some(c => c.lojaNome === 'Lavras'), false)
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('usuário de loja sem login não recebe a conta de outra loja', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ papel: 'aux_adm', lojaId: 'l3' }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('credencial só com espaço em branco conta como ausente', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, [
    { id: 'l4', nome: 'Itajuba', fabricaEmail: '   ', fabricaSenha: 's' },
  ])
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Itajuba'])
})

test('senha só com espaço em branco também conta como ausente', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, [
    { id: 'l5', nome: 'Poços de Caldas', fabricaEmail: 'pocos@x.com', fabricaSenha: '  ' },
  ])
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Poços de Caldas'])
})

test('não-admin sem loja não devolve nada', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ papel: 'aux_adm', lojaId: null }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, [])
})
```

- [ ] **Step 2: Registrar o teste no `package.json`**

No script `test`, logo depois de `src/lib/grupo-cnpj.test.ts`, acrescentar ` src/lib/fabrica-contas.test.ts`. O script é uma linha só com os arquivos separados por espaço; um arquivo que não estiver na lista nunca roda.

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module './fabrica-contas'`.

- [ ] **Step 4: Implementar**

Criar `src/lib/fabrica-contas.ts`:

```ts
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getGrupoAtivo } from '@/lib/grupo'

export type ContaFabrica = {
  lojaId: string
  lojaNome: string
  email: string
  senha: string
}

export type LojaCredencial = {
  id: string
  nome: string
  fabricaEmail: string | null
  fabricaSenha: string | null
}

export type EscopoFabrica = {
  contas: ContaFabrica[]
  /** Lojas do escopo que ainda não têm login cadastrado. Não é erro. */
  semCredencial: string[]
}

const PAPEIS_GRUPO_INTEIRO = ['admin_geral', 'admin_socio']

/**
 * Quais contas do portal da fábrica o usuário pode usar.
 *
 * Quem opera a loja só enxerga a conta dela: no portal cada loja é um cadastro
 * distinto, e o adm de Varginha não tem o que fazer com a caixa de trocas de
 * Itajuba. Admin e sócio varrem o grupo ativo inteiro.
 *
 * O escopo sai do papel, não de ter `lojaId`: sócio tem loja fixa cadastrada, e
 * escopar pela loja o prenderia a ela — e o deixaria sem conta nenhuma ao trocar
 * de grupo, porque a loja fixa dele não está no grupo aberto.
 *
 * Pura de propósito — é aqui que um erro vazaria dado de uma loja pra outra, e
 * é o que os testes cobrem.
 */
export function filtrarContasDoUsuario(
  usuario: { papel: string; lojaId: string | null },
  lojasDoGrupo: LojaCredencial[],
): EscopoFabrica {
  const noEscopo = PAPEIS_GRUPO_INTEIRO.includes(usuario.papel)
    ? lojasDoGrupo
    : lojasDoGrupo.filter(l => l.id === usuario.lojaId)

  const contas: ContaFabrica[] = []
  const semCredencial: string[] = []

  for (const loja of noEscopo) {
    const email = loja.fabricaEmail?.trim()
    const senha = loja.fabricaSenha?.trim()
    if (email && senha) {
      contas.push({ lojaId: loja.id, lojaNome: loja.nome, email, senha })
    } else {
      semCredencial.push(loja.nome)
    }
  }

  return { contas, semCredencial }
}

/** Contas do portal no escopo do usuário, lidas do banco. */
export async function listarContasFabrica(
  usuario: { papel: string; lojaId: string | null },
): Promise<EscopoFabrica> {
  const grupo = await getGrupoAtivo(usuario)
  const doGrupo = await db
    .select({
      id: lojas.id,
      nome: lojas.nome,
      fabricaEmail: lojas.fabricaEmail,
      fabricaSenha: lojas.fabricaSenha,
    })
    .from(lojas)
    .where(and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)))
    .orderBy(lojas.nome)

  return filtrarContasDoUsuario(usuario, doGrupo)
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npm test`
Expected: PASS nos 6 testes novos, e nenhuma regressão no resto.

- [ ] **Step 6: Verificar tipos e commitar**

```bash
npm run type-check
git add src/lib/fabrica-contas.ts src/lib/fabrica-contas.test.ts package.json
git commit -m "feat(fabrica): escopo de contas do portal por loja do usuario"
```

---

### Task 3: Credencial editável em `/admin/lojas`

**Files:**
- Modify: `src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/lojas/actions.ts:44-56` (`editarLojaAction`)
- Modify: `src/app/(dashboard)/admin/lojas/page.tsx:17-28` e `:69`

**Interfaces:**
- Consumes: colunas de Task 1.
- Produces: `editarLojaAction` passa a ler os campos `fabricaEmail` e `fabricaSenha` do `FormData`.

- [ ] **Step 1: Aceitar os campos na action**

Em `src/app/(dashboard)/admin/lojas/actions.ts`, substituir o corpo de `editarLojaAction`:

```ts
export async function editarLojaAction(id: string, formData: FormData): Promise<{ geocodificado: boolean }> {
  await assertAdmin()
  const { geo, geocodificado } = await geocodificarSeInformado(formData.get('cep') as string | null)
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    fabricaEmail: (formData.get('fabricaEmail') as string | null)?.trim() || null,
    fabricaSenha: (formData.get('fabricaSenha') as string | null)?.trim() || null,
    ...geo,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
  revalidatePath('/simulador')
  revalidatePath('/garantias')
  return { geocodificado }
}
```

`criarLojaAction` fica como está: loja nova nasce sem login e recebe o dela pela edição.

- [ ] **Step 2: Levar os valores atuais até o dialog**

Em `src/app/(dashboard)/admin/lojas/page.tsx`, no `select` das lojas, acrescentar as duas colunas:

```ts
    db
      .select({
        id: lojas.id, nome: lojas.nome, cidade: lojas.cidade, endereco: lojas.endereco,
        ativa: lojas.ativa, grupoNome: grupos.nome, cep: lojas.cep,
        fabricaEmail: lojas.fabricaEmail, fabricaSenha: lojas.fabricaSenha,
      })
      .from(lojas)
      .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
      .orderBy(lojas.nome),
```

e no uso do dialog (linha 69) passar os campos novos:

```tsx
                        <EditarLojaDialog loja={{ id: loja.id, nome: loja.nome, cidade: loja.cidade, endereco: loja.endereco, cep: loja.cep, fabricaEmail: loja.fabricaEmail, fabricaSenha: loja.fabricaSenha }} />
```

- [ ] **Step 3: Campos no dialog**

Em `src/app/(dashboard)/admin/lojas/components/editar-loja-dialog.tsx`:

Trocar o type e o estado:

```tsx
type Loja = {
  id: string
  nome: string
  cidade: string
  endereco: string
  cep: string | null
  fabricaEmail: string | null
  fabricaSenha: string | null
}
```

Depois de `const [cep, setCep] = useState(loja.cep ?? '')`, acrescentar:

```tsx
  const [fabricaEmail, setFabricaEmail] = useState(loja.fabricaEmail ?? '')
  const [fabricaSenha, setFabricaSenha] = useState(loja.fabricaSenha ?? '')
```

Em `handleOpen()`, depois de `setCep(loja.cep ?? '')`, acrescentar:

```tsx
    setFabricaEmail(loja.fabricaEmail ?? '')
    setFabricaSenha(loja.fabricaSenha ?? '')
```

Em `handleSalvar()`, depois de `formData.set('cep', cep)`, acrescentar:

```tsx
      formData.set('fabricaEmail', fabricaEmail)
      formData.set('fabricaSenha', fabricaSenha)
```

E dentro do `<div className="space-y-4 py-2">`, depois do bloco do CEP, acrescentar a seção:

```tsx
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Portal da fábrica</p>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mail</Label>
                <Input value={fabricaEmail} onChange={e => setFabricaEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Senha</Label>
                <Input type="password" value={fabricaSenha} onChange={e => setFabricaSenha(e.target.value)} className="h-9 text-sm" />
              </div>
              <p className="text-[11px] text-slate-400">
                Cada loja tem o cadastro dela no portal. Em branco, esta loja fica
                de fora da sincronização de garantias e do aviso de pedidos.
              </p>
            </div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Conferir na tela**

Rodar `npm run dev`, abrir `/admin/lojas` como admin geral, editar uma loja e salvar. Confirmar que o toast "Loja atualizada!" aparece e que ao reabrir o dialog os valores voltam preenchidos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/admin/lojas"
git commit -m "feat(lojas): cadastro do login da loja no portal da fabrica"
```

---

### Task 4: Sincronizar garantias conta por conta

**Files:**
- Modify: `src/app/(dashboard)/garantias/actions.ts:82-116` (`sincronizarFabricaAction`)
- Modify: `src/app/(dashboard)/garantias/components/sincronizar-button.tsx`

**Interfaces:**
- Consumes: `listarContasFabrica` (Task 2); `loginFabrica({ email, senha })` e `buscarStatusGarantiaFabrica` de `@/lib/fabrica-scraper`.
- Produces: `sincronizarFabricaAction(): Promise<{ porLoja: { loja: string; atualizadas: number; erros: number }[]; semCredencial: string[] }>`

- [ ] **Step 1: Ajustar os imports da action**

Em `src/app/(dashboard)/garantias/actions.ts`, trocar a linha de import do drizzle:

```ts
import { eq, isNotNull } from 'drizzle-orm'
```

por:

```ts
import { and, eq, isNotNull } from 'drizzle-orm'
```

e acrescentar depois do import de `exportarRelatorioGarantias`:

```ts
import { listarContasFabrica } from '@/lib/fabrica-contas'
```

- [ ] **Step 2: Reescrever `sincronizarFabricaAction`**

Substituir a função inteira por:

```ts
export async function sincronizarFabricaAction(): Promise<{
  porLoja: { loja: string; atualizadas: number; erros: number }[]
  semCredencial: string[]
}> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const { contas, semCredencial } = await listarContasFabrica(usuario)
  const porLoja: { loja: string; atualizadas: number; erros: number }[] = []

  // Sequencial: o portal é frágil e login em paralelo na mesma origem arrisca
  // derrubar a sessão da outra loja.
  for (const conta of contas) {
    const lista = await db
      .select({ id: garantias.id, numeroPedidoFabrica: garantias.numeroPedidoFabrica })
      .from(garantias)
      .where(and(eq(garantias.lojaId, conta.lojaId), isNotNull(garantias.numeroPedidoFabrica)))

    if (lista.length === 0) {
      porLoja.push({ loja: conta.lojaNome, atualizadas: 0, erros: 0 })
      continue
    }

    let atualizadas = 0
    let erros = 0

    try {
      const session = await loginFabrica({ email: conta.email, senha: conta.senha })
      const agora = new Date()
      for (const g of lista) {
        if (!g.numeroPedidoFabrica) continue
        try {
          const status = await buscarStatusGarantiaFabrica(session, g.numeroPedidoFabrica)
          await db
            .update(garantias)
            .set({ statusFabrica: status, statusFabricaSyncEm: agora })
            .where(eq(garantias.id, g.id))
          atualizadas++
        } catch {
          erros++
        }
      }
    } catch {
      // Login recusado ou portal fora do ar: a loja inteira falhou, mas as
      // outras ainda têm que sincronizar.
      erros = lista.length
    }

    porLoja.push({ loja: conta.lojaNome, atualizadas, erros })
  }

  revalidatePath('/garantias')
  return { porLoja, semCredencial }
}
```

- [ ] **Step 3: Toast com resumo por loja**

Substituir o corpo de `handleSync` em `src/app/(dashboard)/garantias/components/sincronizar-button.tsx`:

```tsx
  async function handleSync() {
    setLoading(true)
    try {
      const res = await sincronizarFabricaAction()
      const total  = res.porLoja.reduce((s, l) => s + l.atualizadas, 0)
      const erros  = res.porLoja.reduce((s, l) => s + l.erros, 0)
      const plural = total !== 1 ? 's' : ''

      const detalhe = res.porLoja
        .filter(l => l.atualizadas > 0 || l.erros > 0)
        .map(l => `${l.loja}: ${l.atualizadas}${l.erros > 0 ? ` (${l.erros} com erro)` : ''}`)
        .join(' · ')

      const semLogin = res.semCredencial.length > 0
        ? `\nSem login cadastrado: ${res.semCredencial.join(', ')}`
        : ''

      const resumo = `${total} garantia${plural} sincronizada${plural}${detalhe ? `\n${detalhe}` : ''}${semLogin}`
      if (erros > 0) toast.warning(resumo)
      else toast.success(resumo)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar')
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/garantias/actions.ts" "src/app/(dashboard)/garantias/components/sincronizar-button.tsx"
git commit -m "feat(garantias): sincronizar fabrica varre conta por loja"
```

---

### Task 5: Importar garantias de todas as contas do escopo

**Files:**
- Modify: `src/app/(dashboard)/garantias/actions.ts:118-187` (`importarUltimaGarantiaFabricaAction`)
- Modify: `src/app/(dashboard)/garantias/components/importar-fabrica-button.tsx`
- Modify: `src/app/(dashboard)/garantias/page.tsx:87`

**Interfaces:**
- Consumes: `listarContasFabrica` (Task 2); `listarPedidosGarantiaFabrica` e `buscarDetalhePedidoGarantia` de `@/lib/fabrica-scraper`.
- Produces: `importarGarantiasFabricaAction(): Promise<ResultadoImportacaoFabrica>`, com
  `type ResultadoImportacaoFabrica = { porLoja: { loja: string; importadas: number; semChassi: number; erro?: string }[]; semCredencial: string[] }`.
  A função antiga `importarUltimaGarantiaFabricaAction` deixa de existir.

- [ ] **Step 1: Reescrever a action**

Em `src/app/(dashboard)/garantias/actions.ts`, substituir `importarUltimaGarantiaFabricaAction` inteira por:

```ts
export type ResultadoImportacaoFabrica = {
  porLoja: { loja: string; importadas: number; semChassi: number; erro?: string }[]
  semCredencial: string[]
}

export async function importarGarantiasFabricaAction(): Promise<ResultadoImportacaoFabrica> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const { contas, semCredencial } = await listarContasFabrica(usuario)
  const supabase = await createClient()
  const porLoja: ResultadoImportacaoFabrica['porLoja'] = []

  for (const conta of contas) {
    let importadas = 0
    let semChassi = 0

    try {
      const session = await loginFabrica({ email: conta.email, senha: conta.senha })
      const lista = await listarPedidosGarantiaFabrica(session)

      // Do mais recente pro mais antigo, parando no primeiro já cadastrado: é o
      // corte que evita varrer o histórico inteiro do portal a cada clique.
      for (const { numeroPedido, dataAbertura } of lista) {
        const [jaExiste] = await db
          .select({ id: garantias.id })
          .from(garantias)
          .where(eq(garantias.numeroPedidoFabrica, numeroPedido))
          .limit(1)
        if (jaExiste) break

        const { chassi, peca, status } = await buscarDetalhePedidoGarantia(session, numeroPedido)
        if (!chassi) {
          semChassi++
          continue
        }

        // Busca na base toda, não só na loja da conta: o chassi é único e a loja
        // da garantia sai de moto.loja_id, então moto transferida cai certo.
        const [moto] = await db
          .select({ id: motos.id, lojaId: motos.lojaId })
          .from(motos)
          .where(eq(motos.chassi, chassi))
          .limit(1)
        if (!moto) {
          semChassi++
          continue
        }

        const fim = new Date(dataAbertura)
        fim.setDate(fim.getDate() + 30)

        const { error } = await supabase.rpc('abrir_garantia', {
          p_moto_id: moto.id,
          p_loja_id: moto.lojaId,
          p_aberta_por: usuario.id,
          p_os_id: null,
          p_descricao: peca ?? `Pedido fábrica #${numeroPedido}`,
          p_data_inicio: dataAbertura,
          p_data_fim: fim.toISOString().split('T')[0],
          p_data_pedido_peca: null,
          p_numero_pedido_fabrica: numeroPedido,
        })
        if (error) throw new Error(error.message)

        if (status) {
          await db
            .update(garantias)
            .set({ statusFabrica: status, statusFabricaSyncEm: new Date() })
            .where(eq(garantias.numeroPedidoFabrica, numeroPedido))
        }

        importadas++
      }

      porLoja.push({ loja: conta.lojaNome, importadas, semChassi })
    } catch (e) {
      // Falha numa loja não pode calar as outras; o que já entrou fica.
      porLoja.push({
        loja: conta.lojaNome,
        importadas,
        semChassi,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/garantias')
  return { porLoja, semCredencial }
}
```

- [ ] **Step 2: Atualizar o botão**

Substituir `src/app/(dashboard)/garantias/components/importar-fabrica-button.tsx` inteiro por:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { importarGarantiasFabricaAction } from '../actions'

export function ImportarFabricaButton() {
  const [loading, setLoading] = useState(false)

  async function handleImportar() {
    setLoading(true)
    try {
      const res = await importarGarantiasFabricaAction()
      const total = res.porLoja.reduce((s, l) => s + l.importadas, 0)
      const comErro = res.porLoja.filter(l => l.erro)

      const detalhe = res.porLoja
        .filter(l => l.importadas > 0)
        .map(l => `${l.loja}: ${l.importadas}`)
        .join(' · ')

      const semLogin = res.semCredencial.length > 0
        ? `\nSem login cadastrado: ${res.semCredencial.join(', ')}`
        : ''

      if (res.porLoja.length === 0) {
        toast.info(`Nenhuma loja com login da fábrica cadastrado${semLogin}`)
      } else if (total === 0 && comErro.length === 0) {
        toast.info(`Nenhuma garantia nova na fábrica${semLogin}`)
      } else {
        const plural = total !== 1 ? 's' : ''
        const resumo = `${total} garantia${plural} importada${plural}${detalhe ? `\n${detalhe}` : ''}${semLogin}`
        if (comErro.length > 0) {
          toast.warning(`${resumo}\nFalhou em: ${comErro.map(l => l.loja).join(', ')}`)
        } else {
          toast.success(resumo)
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar da fábrica')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleImportar} disabled={loading}>
      <Download size={14} className="mr-1.5" />
      {loading ? 'Importando...' : 'Importar da Fábrica'}
    </Button>
  )
}
```

- [ ] **Step 3: Liberar o botão para o `aux_adm`**

Em `src/app/(dashboard)/garantias/page.tsx`, trocar:

```tsx
          {isAdmin && <ImportarFabricaButton />}
```

por:

```tsx
          {(isAdmin || usuario.papel === 'aux_adm') && <ImportarFabricaButton />}
```

O `aux_adm` é quem opera a loja; com a conta por loja, é ele quem tem uma garantia própria para importar.

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: sem erros. Se sobrar referência a `importarUltimaGarantiaFabricaAction`, é chamada esquecida — corrigir.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/garantias"
git commit -m "feat(garantias): importar da fabrica varre as contas do escopo"
```

---

### Task 6: Alerta de pedidos de compra por loja

**Files:**
- Create: `src/lib/db/migrations/0045_pedidos_fabrica_alerta_loja.sql`
- Modify: `src/lib/db/schema.ts:58-68` (`pedidosFabricaAlerta`)
- Modify: `src/lib/telegram/pedidos-fabrica.ts`
- Modify: `src/lib/telegram/pedidos-fabrica.test.ts:86-121`

**Interfaces:**
- Consumes: `lojas.fabricaEmail`/`fabricaSenha` (Task 1).
- Produces:
  - `formatarAvisoPedidosFabrica(params: { loja: string; novos: PedidoAviso[]; pendentes: PedidoAviso[] }): string | null` — o parâmetro `grupo` vira `loja`.
  - `type ResultadoLoja = { loja: string; grupo: string; status: 'enviado' | 'nada_pendente' | 'sem_chat' | 'sem_credencial' | 'erro'; novos?: number; pendentes?: number; erro?: string }`
  - `alertarPedidosFabricaDaLoja(loja, agora): Promise<ResultadoLoja>` — substitui `alertarPedidosFabricaDoGrupo`.
  - `alertarPedidosFabrica(agora?: Date): Promise<ResultadoLoja[]>` — assinatura igual, retorno por loja.

- [ ] **Step 1: Escrever a migração**

Criar `src/lib/db/migrations/0045_pedidos_fabrica_alerta_loja.sql`:

```sql
-- O alerta passou a ser por loja: cada loja tem sua conta no portal e sua
-- própria fila de "aguardando pagamento". A unique por grupo faria duas lojas
-- da mesma bandeira se atropelarem no controle de "pendente há N dias".
alter table "pedidos_fabrica_alerta" add column if not exists "loja_id" uuid references "lojas"("id") on delete cascade;

-- As linhas existentes vieram do login do grupo, que hoje é a conta de Pouso
-- Alegre (Sul de Minas) e de Raja BH (BH).
update "pedidos_fabrica_alerta" a
set "loja_id" = l."id"
from "grupos" g
join "lojas" l on l."grupo_id" = g."id"
where g."id" = a."grupo_id"
  and l."nome" = case g."nome" when 'Sul de Minas' then 'Pouso Alegre' when 'BH' then 'Raja BH' end;

-- Sobra de grupo sem loja correspondente: é só memória de alerta, e sem loja
-- não há como saber de qual conta veio.
delete from "pedidos_fabrica_alerta" where "loja_id" is null;

alter table "pedidos_fabrica_alerta" alter column "loja_id" set not null;
alter table "pedidos_fabrica_alerta" drop constraint if exists "pedidos_fabrica_alerta_grupo_pedido_key";
alter table "pedidos_fabrica_alerta" add constraint "pedidos_fabrica_alerta_loja_pedido_key" unique ("loja_id", "numero_pedido");
```

- [ ] **Step 2: Conferir o que será apagado, antes de aplicar**

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select g.nome as grupo, count(*)::int as linhas from pedidos_fabrica_alerta a join grupos g on g.id = a.grupo_id group by g.nome"
```

Esperado: nenhuma linha, ou só `BH` — o Sul de Minas nunca teve credencial no grupo, então não gerou alerta. **Se aparecer um grupo fora de `Sul de Minas`/`BH`, parar e reportar** com status DONE_WITH_CONCERNS antes de aplicar: essas linhas seriam apagadas pelo `delete` da migração.

- [ ] **Step 3: Aplicar a migração**

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0045_pedidos_fabrica_alerta_loja.sql
```

Expected: `OK — sem linhas de retorno`.

- [ ] **Step 4: Refletir no schema Drizzle**

Em `src/lib/db/schema.ts`, substituir a tabela `pedidosFabricaAlerta` por:

```ts
export const pedidosFabricaAlerta = pgTable('pedidos_fabrica_alerta', {
  id:               uuid('id').primaryKey().defaultRandom(),
  grupoId:          uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  // Cada loja tem sua conta no portal e sua própria fila de pendências.
  lojaId:           uuid('loja_id').notNull().references(() => lojas.id, { onDelete: 'cascade' }),
  numeroPedido:     text('numero_pedido').notNull(),
  valor:            numeric('valor', { precision: 12, scale: 2 }),
  dataPedido:       text('data_pedido'),
  primeiroAlertaEm: timestamp('primeiro_alerta_em', { withTimezone: true }).notNull().defaultNow(),
  ultimoAlertaEm:   timestamp('ultimo_alerta_em', { withTimezone: true }).notNull().defaultNow(),
  // Preenchido quando o pedido some da lista de "aguardando pagamento".
  resolvidoEm:      timestamp('resolvido_em', { withTimezone: true }),
}, t => [unique('pedidos_fabrica_alerta_loja_pedido_key').on(t.lojaId, t.numeroPedido)])
```

`pedidosFabricaAlerta` está declarada **antes** de `lojas` no arquivo. A referência `() => lojas.id` é lazy, então funciona — não mover a tabela de lugar.

- [ ] **Step 5: Ajustar os testes de formatação**

Em `src/lib/telegram/pedidos-fabrica.test.ts`, trocar `grupo:` por `loja:` nas seis chamadas de `formatarAvisoPedidosFabrica` (linhas 87, 96, 107, 113 e 118), e o valor `'Sul de Minas'` por `'Pouso Alegre'` e `'BH'` por `'Raja BH'`. O teste da linha 89 vira:

```ts
  assert.match(texto, /Pouso Alegre/)
```

- [ ] **Step 6: Rodar os testes e ver falhar**

Run: `npm test`
Expected: FAIL — o objeto passado não tem mais `grupo`, e o texto ainda não traz o nome da loja.

- [ ] **Step 7: Trocar o rótulo na formatação**

Em `src/lib/telegram/pedidos-fabrica.ts`, substituir a assinatura e o cabeçalho de `formatarAvisoPedidosFabrica`:

```ts
export function formatarAvisoPedidosFabrica(params: {
  loja: string
  novos: PedidoAviso[]
  pendentes: PedidoAviso[]
}): string | null {
  const { loja, novos, pendentes } = params
  if (novos.length === 0 && pendentes.length === 0) return null

  const linhas: string[] = [`💸 Pedido de compras aguardando pagamento — ${loja}`]
```

O resto da função não muda.

- [ ] **Step 8: Rodar os testes e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Trocar a rotina de grupo para loja**

Em `src/lib/telegram/pedidos-fabrica.ts`, trocar o import do schema:

```ts
import { grupos, lojas, pedidosFabricaAlerta } from '@/lib/db/schema'
```

Substituir `ResultadoGrupo` e `alertarPedidosFabricaDoGrupo` por:

```ts
export type ResultadoLoja = {
  loja: string
  grupo: string
  status: 'enviado' | 'nada_pendente' | 'sem_chat' | 'sem_credencial' | 'erro'
  novos?: number
  pendentes?: number
  erro?: string
}

/**
 * Roda o alerta para uma loja: entra no portal com a conta dela, lista o que
 * está aguardando pagamento e avisa o Telegram da bandeira.
 *
 * Nunca lança — o cron roda todas as lojas e a falha de uma não pode calar as
 * outras.
 */
export async function alertarPedidosFabricaDaLoja(
  loja: {
    id: string
    nome: string
    grupoId: string
    grupoNome: string
    fabricaEmail: string | null
    fabricaSenha: string | null
    telegramChatId: string | null
  },
  agora: Date,
): Promise<ResultadoLoja> {
  const base = { loja: loja.nome, grupo: loja.grupoNome }
  const chatId = loja.telegramChatId?.trim()
  const email  = loja.fabricaEmail?.trim()
  const senha  = loja.fabricaSenha?.trim()

  if (!email || !senha) return { ...base, status: 'sem_credencial' }
  if (!chatId)          return { ...base, status: 'sem_chat' }

  try {
    const session = await loginFabrica({ email, senha })
    const pedidos = await listarPedidosCompraFabrica(session, STATUS_AGUARDANDO_PAGAMENTO)

    // O filtro do portal é por texto e já vem certo, mas uma mudança de rótulo lá
    // devolveria a lista inteira — conferimos o status de cada linha.
    const aguardando = pedidos.filter(p =>
      (p.status ?? '').toLowerCase().includes('aguardando pagamento'),
    )
    const numeros = aguardando.map(p => p.numeroPedido)

    const jaAlertados = await db
      .select({
        numeroPedido:     pedidosFabricaAlerta.numeroPedido,
        primeiroAlertaEm: pedidosFabricaAlerta.primeiroAlertaEm,
      })
      .from(pedidosFabricaAlerta)
      .where(and(
        eq(pedidosFabricaAlerta.lojaId, loja.id),
        isNull(pedidosFabricaAlerta.resolvidoEm),
      ))

    const conhecidos = new Map(jaAlertados.map(a => [a.numeroPedido, a.primeiroAlertaEm]))

    const novos: PedidoAviso[]     = []
    const pendentes: PedidoAviso[] = []

    for (const p of aguardando) {
      const primeiro = conhecidos.get(p.numeroPedido)
      const aviso: PedidoAviso = {
        numeroPedido: p.numeroPedido,
        valor:        p.valor,
        metodo:       p.metodo,
        dataPedido:   p.dataPedido,
        diasPendente: primeiro ? diasEntre(new Date(primeiro), agora) : 0,
      }
      if (primeiro) pendentes.push(aviso)
      else novos.push(aviso)
    }

    // Pedido que saiu da lista foi pago ou cancelado — fecha pra não voltar como
    // "pendente há N dias" caso a fábrica reabra o mesmo número mais tarde.
    const resolvidos = jaAlertados
      .map(a => a.numeroPedido)
      .filter(n => !numeros.includes(n))
    if (resolvidos.length > 0) {
      await db.update(pedidosFabricaAlerta)
        .set({ resolvidoEm: agora })
        .where(and(
          eq(pedidosFabricaAlerta.lojaId, loja.id),
          inArray(pedidosFabricaAlerta.numeroPedido, resolvidos),
        ))
    }

    const texto = formatarAvisoPedidosFabrica({ loja: loja.nome, novos, pendentes })
    if (!texto) return { ...base, status: 'nada_pendente' }

    await enviarMensagem(chatId, texto)

    // Só grava depois do envio: se o Telegram falhar, o pedido continua "novo" e
    // a próxima rodada tenta de novo em vez de perder o aviso pra sempre.
    for (const p of aguardando) {
      await db.insert(pedidosFabricaAlerta)
        .values({
          grupoId:          loja.grupoId,
          lojaId:           loja.id,
          numeroPedido:     p.numeroPedido,
          valor:            p.valor != null ? String(p.valor) : null,
          dataPedido:       p.dataPedido,
          primeiroAlertaEm: agora,
          ultimoAlertaEm:   agora,
        })
        .onConflictDoUpdate({
          target: [pedidosFabricaAlerta.lojaId, pedidosFabricaAlerta.numeroPedido],
          set:    { ultimoAlertaEm: agora, resolvidoEm: null },
        })
    }

    return { ...base, status: 'enviado', novos: novos.length, pendentes: pendentes.length }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error(`alerta de pedidos da fábrica falhou para ${loja.nome}:`, erro)
    return { ...base, status: 'erro', erro }
  }
}

/** Roda o alerta para todas as lojas ativas de grupos ativos. */
export async function alertarPedidosFabrica(agora: Date = new Date()): Promise<ResultadoLoja[]> {
  const ativas = await db
    .select({
      id:             lojas.id,
      nome:           lojas.nome,
      grupoId:        lojas.grupoId,
      grupoNome:      grupos.nome,
      fabricaEmail:   lojas.fabricaEmail,
      fabricaSenha:   lojas.fabricaSenha,
      telegramChatId: grupos.telegramChatId,
    })
    .from(lojas)
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(and(eq(grupos.ativo, true), eq(lojas.ativa, true)))
    .orderBy(grupos.nome, lojas.nome)

  const resultados: ResultadoLoja[] = []
  // Sequencial: o portal da fábrica é frágil e paralelizar login na mesma origem
  // não vale o risco de derrubar a sessão de outra loja.
  for (const l of ativas) {
    resultados.push(await alertarPedidosFabricaDaLoja(l, agora))
  }
  return resultados
}
```

- [ ] **Step 10: Aumentar o tempo do cron**

Em `src/app/api/cron/pedidos-fabrica/route.ts`, trocar:

```ts
// Login + scraping do portal da fábrica para os dois grupos leva mais que o
// default do Next.
export const maxDuration = 120
```

por:

```ts
// Login + scraping do portal da fábrica, agora uma conta por loja, leva bem mais
// que o default do Next.
export const maxDuration = 300
```

- [ ] **Step 11: Rodar testes e tipos**

Run: `npm test && npm run type-check`
Expected: PASS e sem erros de tipo.

- [ ] **Step 12: Commit**

```bash
git add src/lib/db/migrations/0045_pedidos_fabrica_alerta_loja.sql src/lib/db/schema.ts src/lib/telegram/pedidos-fabrica.ts src/lib/telegram/pedidos-fabrica.test.ts "src/app/api/cron/pedidos-fabrica/route.ts"
git commit -m "feat(fabrica): alerta de pedidos de compra passa a ser por loja"
```

---

### Task 7: Tirar a credencial de `grupos` e o fallback de env

**Files:**
- Create: `src/lib/db/migrations/0046_grupos_sem_fabrica.sql`
- Modify: `src/lib/fabrica-scraper.ts:50-64`
- Modify: `src/lib/db/schema.ts:35-53` (tabela `grupos`)
- Modify: `src/app/(dashboard)/admin/grupos/actions.ts`
- Modify: `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`

**Interfaces:**
- Consumes: tudo das tasks anteriores já usa credencial explícita.
- Produces: `loginFabrica(cred: CredencialFabrica)` — argumento obrigatório. `grupos` perde `fabricaEmail` e `fabricaSenha`.

- [ ] **Step 1: Tornar a credencial obrigatória no scraper**

Em `src/lib/fabrica-scraper.ts`, substituir o bloco de doc e a assinatura:

```ts
/**
 * Faz login no portal da fábrica.
 *
 * Sem argumento usa FABRICA_EMAIL/FABRICA_SENHA do ambiente (conta única, legado).
 * Com `cred` usa a conta daquela bandeira — cada grupo tem seu próprio cadastro
 * no portal, então o que uma conta enxerga não é o que a outra enxerga.
 */
export async function loginFabrica(cred?: CredencialFabrica): Promise<FabricaSession> {
  const email = cred?.email ?? process.env.FABRICA_EMAIL
  const senha = cred?.senha ?? process.env.FABRICA_SENHA
  if (!email || !senha) throw new Error('Variáveis FABRICA_EMAIL / FABRICA_SENHA não configuradas no ambiente')
```

por:

```ts
/**
 * Faz login no portal da fábrica com a conta de uma loja.
 *
 * A credencial é obrigatória: cada loja tem seu próprio cadastro no portal e o
 * que uma conta enxerga não é o que a outra enxerga. Sem argumento não há como
 * saber de qual loja é a sessão — por isso não existe mais fallback de ambiente.
 */
export async function loginFabrica(cred: CredencialFabrica): Promise<FabricaSession> {
  const email = cred.email?.trim()
  const senha = cred.senha?.trim()
  if (!email || !senha) throw new Error('Login da fábrica sem e-mail ou senha — confira o cadastro da loja')
```

- [ ] **Step 2: Verificar que ninguém mais chama sem credencial**

Run: `npm run type-check`
Expected: sem erros. Um erro aqui significa chamada esquecida de `loginFabrica()` — corrigir passando a conta da loja.

- [ ] **Step 3: Remover os campos do dialog de grupo**

Em `src/app/(dashboard)/admin/grupos/components/grupo-dialog.tsx`:

- no `type Grupo`, apagar as linhas `fabricaEmail: string | null` e `fabricaSenha: string | null`;
- apagar as duas linhas de `useState` de `fabricaEmail` e `fabricaSenha`;
- em `handleSalvar`, tirar `fabricaEmail, fabricaSenha,` do objeto `dados`;
- apagar os dois blocos `<div className="space-y-1.5">` dos campos "Fábrica — E-mail" e "Fábrica — Senha";
- trocar o texto final da seção de integrações:

```tsx
            <p className="text-xs text-slate-400">
              ValidaPix ainda não é usada pelo sistema — será ativada em uma etapa futura. Bling já está em uso (emissão de NF-e). O login da fábrica agora fica no cadastro de cada loja.
            </p>
```

- [ ] **Step 4: Remover os campos da action de grupo**

Em `src/app/(dashboard)/admin/grupos/actions.ts`, tirar `fabricaEmail?: string` e `fabricaSenha?: string` do `type GrupoInput`, e as linhas `fabricaEmail: ...` e `fabricaSenha: ...` dos objetos de `criarGrupoAction` e `editarGrupoAction`.

- [ ] **Step 5: Remover as colunas do schema Drizzle**

Em `src/lib/db/schema.ts`, na tabela `grupos`, apagar as linhas:

```ts
  fabricaEmail:       text('fabrica_email'),
  fabricaSenha:       text('fabrica_senha'),
```

- [ ] **Step 6: Escrever e aplicar a migração**

Criar `src/lib/db/migrations/0046_grupos_sem_fabrica.sql`:

```sql
-- O login da fábrica virou por loja (0044). A coluna de grupo não tem mais uso e
-- guardar senha em dois lugares só cria divergência.
alter table "grupos" drop column if exists "fabrica_email";
alter table "grupos" drop column if exists "fabrica_senha";
```

**Antes de aplicar**, confirmar que a credencial do BH chegou na loja — esta migração descarta a origem do dado:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select nome, fabrica_email, fabrica_senha is not null as tem_senha from lojas where nome = 'Raja BH'"
```

Esperado: `fabrica_email` = `motochefe@icloud.com`. Se vier nulo, **parar e reportar DONE_WITH_CONCERNS** em vez de aplicar.

Aplicar:

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0046_grupos_sem_fabrica.sql
```

- [ ] **Step 7: Rodar testes e tipos**

Run: `npm test && npm run type-check`
Expected: PASS e sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/migrations/0046_grupos_sem_fabrica.sql src/lib/db/schema.ts src/lib/fabrica-scraper.ts "src/app/(dashboard)/admin/grupos"
git commit -m "refactor(fabrica): credencial sai do grupo e do ambiente"
```

---

### Task 8: Cadastrar as contas e validar em produção

**Files:** nenhum — é operação, feita com o Cesar.

**Interfaces:**
- Consumes: tudo acima.
- Produces: nada em código.

- [ ] **Step 1: Deploy**

```bash
git push
```

Acompanhar o deploy na Vercel até ficar `Ready`.

- [ ] **Step 2: Cadastrar as quatro contas do Sul de Minas**

Em `/admin/lojas`, editar cada loja e preencher e-mail e senha:

| Loja | E-mail |
|---|---|
| Varginha | `varginha@motochefebrasil.com.br` |
| Itajuba | `itajuba@motochefebrasil.com.br` |
| Poços de Caldas | `pocosdecaldas@motochefebrasil.com.br` |

A senha das três é a mesma, informada pelo Cesar (não fica escrita aqui).

- [ ] **Step 3: Cadastrar Pouso Alegre**

O login de Pouso Alegre é o antigo, hoje só nas envs `FABRICA_EMAIL` /
`FABRICA_SENHA` do projeto na Vercel. Ler os dois valores no painel da Vercel
(Settings → Environment Variables) e cadastrá-los na loja Pouso Alegre.

- [ ] **Step 4: Conferir Raja BH**

Abrir a loja Raja BH em `/admin/lojas` e confirmar que o e-mail
`motochefe@icloud.com` e a senha já vieram da migração 0044. Se a senha estiver
vazia, preencher.

- [ ] **Step 4b: Conferir de qual conta são os pedidos antigos**

Antes de sincronizar, entre em `motochefebrasil.store` **como Varginha** e procure um
pedido de garantia dela que já esteja no sistema. É a pergunta que a revisão final
não conseguiu fechar: se os pedidos antigos de Varginha/Itajubá vivem na conta velha
(a de Pouso Alegre, que ficou com o histórico), a garantia daquela loja nunca vai
achar o próprio pedido pela conta dela.

A correção já aplicada impede o estrago — status não encontrado agora conta como
erro em vez de apagar o status bom. Mas se o descasamento existir, o Sincronizar de
Varginha vai reportar erro em todas as garantias antigas, e aí a solução é guardar em
`garantias` a loja **da conta** que abriu o pedido, separada da loja da moto.

- [ ] **Step 5: Validar garantias**

Logado como admin geral, em `/garantias`, clicar em **Sincronizar Fábrica** e
conferir que o toast lista as lojas do grupo ativo — e que `Galpão Matriz` e
`Lavras` aparecem em "Sem login cadastrado", não como erro. Trocar para o grupo
BH e repetir.

Depois clicar em **Importar da Fábrica** e conferir que o resumo vem por loja.

Uma loja que nunca abriu garantia deve dizer "nenhuma garantia nova", e **não**
"Sessão da fábrica expirou". A checagem de sessão expirada distingue as duas coisas
pelo token CSRF, o que só é confiável se a página de trocas vazia não tiver outro
formulário — ninguém verificou isso contra o HTML real. Se aparecer o erro errado
numa loja vazia, a condição precisa ancorar em algo exclusivo da tela de login (os
campos `email` e `senha` no mesmo `<form>`) em vez do token.

- [ ] **Step 6: Validar o escopo do aux_adm**

Entrar com um usuário `aux_adm` de uma loja (validando pelo banco quem é, e
pedindo F5 por causa do cache do sidebar) e confirmar que os dois botões
aparecem e que o toast cita **só a loja dele**.

- [ ] **Step 7: Disparar o cron manualmente**

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://moto-chefe.vercel.app/api/cron/pedidos-fabrica
```

Conferir no JSON que vem uma linha por loja, com `sem_credencial` nas três sem
login e `enviado`/`nada_pendente` nas cinco com login.

- [ ] **Step 8: Limpar as envs**

Com a leitura por loja confirmada em produção, remover `FABRICA_EMAIL` e
`FABRICA_SENHA` das Environment Variables do projeto na Vercel. Só depois da
validação — elas são a única cópia do login de Pouso Alegre até o Step 3.
