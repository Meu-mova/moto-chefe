# Importação de vendas de cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão no dashboard que importa as vendas de cartão das três operadoras (InfinitePay, Stone, PagueVeloz) e as concilia, sem ninguém baixar e subir CSV.

**Architecture:** O botão (Vercel) cria um pedido numa fila no banco. Um agente rodando no PC da loja pega o pedido, abre cada painel num navegador com sessão persistente, dispara as chamadas internas de cada operadora reusando o cabeçalho de autenticação da própria página, e manda o resultado normalizado para o `POST /api/conciliacao/cartao`, que já existe e já faz toda a conciliação. Nenhuma credencial das operadoras é lida, copiada ou guardada.

**Tech Stack:** TypeScript, Node 20, `tsx`, `node:test` + `node:assert/strict`, Playwright (novo, devDependency), Drizzle + postgres.js, Next.js App Router, @base-ui/react.

Spec: `docs/superpowers/specs/2026-08-04-importacao-vendas-cartao-design.md`

## Global Constraints

- **Toda funcionalidade nasce escopada por grupo.** Grupos: Sul de Minas `57.113.017/0001-72`, BH `63.009.605/0001-63`.
- **Migração de banco só via Supabase MCP** (`apply_migration`). **Nunca** `db:generate`/`db:migrate` — o journal do Drizzle neste repo está quebrado. Depois de aplicar, refletir a tabela à mão em `src/lib/db/schema.ts`.
- **Testes:** `node --import tsx --test`. Todo `*.test.ts` novo precisa ser **acrescentado à mão** à lista do script `test` no `package.json` — não há glob.
- **Nunca `Date` cru dentro de `` sql`` ``** (postgres.js com `prepare:false` estoura em runtime; o `tsc` não pega). Usar string ISO.
- **BRT é UTC−3 o ano inteiro** (sem horário de verão desde 2019).
- **UI é @base-ui/react, não Radix.** Nada de `asChild`/`onPointerDownOutside`; usar `buttonVariants`.
- **`operadora` continua `'infinitypay'`** (grafia gravada no banco), com `'stone'` e `'pagueveloz'` para as outras.
- **`playwright` é devDependency**, usada só pelo agente local. Nunca importada por nada dentro de `src/app/`.
- **Papéis com acesso ao botão:** `admin_geral`, `admin_socio`, `aux_adm`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/conciliacao-cartao.ts` (criar) | Tipos do payload (`TransacaoCartao`, `PayloadConciliacao`), hoje presos no route handler. Precisam sair de lá para os scripts importarem sem arrastar `next/server` e o banco. Mais `chaveDedup()` e `dataBrt()`, comuns às três. |
| `src/lib/conciliacao-infinitepay.ts` (criar) | Tradução InfinitePay → `TransacaoCartao`. Pura. |
| `src/lib/conciliacao-stone.ts` (criar) | Tradução Stone (lista + detalhe) → `TransacaoCartao`. Pura. |
| `src/lib/conciliacao-pagueveloz.ts` (criar) | Tradução PagueVeloz, incluindo a leitura de crédito/débito no cupom. Pura. |
| `src/lib/importacao-cartao.ts` (criar) | Regras de estado da fila (offline, travado). Puras. |
| `src/app/api/conciliacao/cartao/route.ts` (modificar) | Exige `grupoCnpj`; dedup com chave reserva. |
| `src/app/api/conciliacao/fila/route.ts` (criar) | `GET` (agente pega pedido) e `POST` (agente devolve resultado), por `x-cron-secret`. |
| `src/app/(dashboard)/dashboard/components/importar-cartao-button.tsx` (criar) | O botão + o acompanhamento na tela. |
| `src/app/(dashboard)/dashboard/actions.ts` (criar) | `solicitarImportacaoAction`, `consultarImportacaoAction`. |
| `scripts/conciliacao/agente.ts` (criar) | Laço do agente: pergunta, executa as três, devolve. |
| `scripts/conciliacao/navegador.ts` (criar) | Abrir perfil persistente, interceptar cabeçalho de auth, avisar no Telegram. |
| `scripts/conciliacao/operadoras/{infinitepay,stone,pagueveloz}.ts` (criar) | Um coletor por operadora, mesma assinatura. |
| `scripts/conciliacao/infinitypay.mjs` (apagar) | Tentativa anterior, com endpoint e campos chutados. |

---

### Task 1: Tipos comuns e tradutor da InfinitePay

**Files:**
- Create: `src/lib/conciliacao-cartao.ts`
- Create: `src/lib/conciliacao-infinitepay.ts`
- Test: `src/lib/conciliacao-infinitepay.test.ts`
- Modify: `package.json` (lista do `test`)
- Modify: `src/app/api/conciliacao/cartao/route.ts:6-21`

**Interfaces:**
- Produces: `TransacaoCartao`, `Operadora`, `PayloadConciliacao`, `dataBrt(iso)`, `chaveDedup(t)` em `conciliacao-cartao.ts`; `VendaInfinitePay`, `mapearInfinitePay(vendas)` em `conciliacao-infinitepay.ts`.
- Consumes: nada.

- [ ] **Step 1: Criar os tipos e helpers comuns**

Criar `src/lib/conciliacao-cartao.ts`:

```ts
// Tipos e regras comuns aos coletores das três operadoras. Ficam aqui, e não
// dentro do route handler, porque os scripts de coleta precisam importá-los
// sem arrastar next/server e a conexão de banco junto.

export type TransacaoCartao = {
  nsu?: string
  autorizacao?: string
  dataTransacao: string   // YYYY-MM-DD
  valorBruto: number
  valorLiquido?: number
  parcelas: number
  tipo: 'credito' | 'debito'
  status: string
  rawData?: Record<string, unknown>
}

export type Operadora = 'infinitypay' | 'stone' | 'pagueveloz'

export type PayloadConciliacao = {
  operadora: Operadora
  // CNPJ do grupo dono das maquininhas, com pontuação, como em grupos.cnpj.
  grupoCnpj: string
  transacoes: TransacaoCartao[]
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

/**
 * Instante (com Z ou com offset) → dia do calendário em Brasília.
 *
 * Uma venda às 01:20Z do dia 04 aconteceu às 22:20 do dia 03 em Brasília.
 * Cortar a string ISO no "T" gravaria dia 04, e o casamento com a venda no
 * MOVA (janela de ±1 dia) passaria a depender de sorte. BRT é UTC−3 fixo desde
 * o fim do horário de verão em 2019. Funciona tanto para "…Z" (InfinitePay,
 * Stone) quanto para "…-03:00" (PagueVeloz), porque o Date já normaliza.
 */
export function dataBrt(iso: string): string {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) throw new Error(`Data inválida: ${iso}`)
  return new Date(instante.getTime() - TRES_HORAS_MS).toISOString().slice(0, 10)
}

/**
 * Chave de deduplicação. O NSU é a chave natural, mas a Stone não manda NSU —
 * nesse caso o id da operadora (guardado em rawData) evita reinserir a mesma
 * venda a cada rodada.
 */
export function chaveDedup(t: TransacaoCartao): { campo: 'nsu' | 'id'; valor: string } | null {
  if (t.nsu) return { campo: 'nsu', valor: t.nsu }
  const id = t.rawData?.id
  if (id != null && id !== '') return { campo: 'id', valor: String(id) }
  return null
}
```

- [ ] **Step 2: Escrever os testes da InfinitePay**

Criar `src/lib/conciliacao-infinitepay.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearInfinitePay, type VendaInfinitePay } from './conciliacao-infinitepay'
import { dataBrt, chaveDedup, type TransacaoCartao } from './conciliacao-cartao'

// Venda real capturada do painel em 2026-08-04.
const VENDA: VendaInfinitePay = {
  id: 2611297499,
  datetime: '2026-08-03T19:28:52.425Z',
  type: 'contactless',
  amount: 26000,
  net_amount: 24706,
  brand: 'visa',
  method: 'credit',
  installments: 4,
  serial_number: 'PB1F248T73089',
  status: 'approved',
  nsu: 'SPB1F248T7308922050320260803160002',
  transaction_origin: 'pos',
  fee_percentage: 4.98,
}

test('centavos viram reais', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.equal(t.valorBruto, 260)
  assert.equal(t.valorLiquido, 247.06)
})

test('crédito e débito viram os nomes usados no banco', () => {
  assert.equal(mapearInfinitePay([VENDA])[0].tipo, 'credito')
  assert.equal(mapearInfinitePay([{ ...VENDA, method: 'debit' }])[0].tipo, 'debito')
})

test('venda em dinheiro digitada na maquininha é descartada', () => {
  assert.deepEqual(mapearInfinitePay([{ ...VENDA, method: 'money' }]), [])
})

test('venda negada é descartada', () => {
  assert.deepEqual(mapearInfinitePay([{ ...VENDA, status: 'denied' }]), [])
})

test('venda depois das 21h fica no dia certo em Brasília', () => {
  // 01:20Z do dia 04 é 22:20 do dia 03 em Brasília.
  assert.equal(dataBrt('2026-08-04T01:20:00.000Z'), '2026-08-03')
})

test('venda no meio da tarde fica no mesmo dia', () => {
  assert.equal(dataBrt('2026-08-03T19:28:52.425Z'), '2026-08-03')
})

test('data inválida estoura em vez de gravar dia errado', () => {
  assert.throws(() => dataBrt('ontem'))
})

test('rawData preserva o que o banco não tem coluna para guardar', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.equal(t.rawData?.fee_percentage, 4.98)
  assert.equal(t.rawData?.serial_number, 'PB1F248T73089')
})

test('status normalizado para a grafia do banco', () => {
  assert.equal(mapearInfinitePay([VENDA])[0].status, 'aprovado')
})

test('nsu vazio vira undefined, não string vazia', () => {
  assert.equal(mapearInfinitePay([{ ...VENDA, nsu: '' }])[0].nsu, undefined)
})

test('parcelas zero vira 1', () => {
  assert.equal(mapearInfinitePay([{ ...VENDA, installments: 0 }])[0].parcelas, 1)
})

test('dedup usa o nsu quando existe', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.deepEqual(chaveDedup(t), { campo: 'nsu', valor: VENDA.nsu! })
})

test('dedup cai no id da operadora quando não há nsu', () => {
  const [t] = mapearInfinitePay([{ ...VENDA, nsu: null }])
  assert.deepEqual(chaveDedup(t), { campo: 'id', valor: '2611297499' })
})

test('sem nsu e sem id não inventa chave', () => {
  const solta: TransacaoCartao = { dataTransacao: '2026-08-03', valorBruto: 10, parcelas: 1, tipo: 'credito', status: 'aprovado' }
  assert.equal(chaveDedup(solta), null)
})
```

- [ ] **Step 3: Registrar o teste no package.json**

Acrescentar `src/lib/conciliacao-infinitepay.test.ts` ao fim da lista do script `test`.

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx tsx --test src/lib/conciliacao-infinitepay.test.ts`
Expected: FAIL — `Cannot find module './conciliacao-infinitepay'`

- [ ] **Step 5: Implementar o tradutor**

Criar `src/lib/conciliacao-infinitepay.ts`:

```ts
import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// Formato de sales-index/v1/sales/search, o serviço interno que o painel da
// InfinitePay usa na tela "Suas vendas". Não é API pública: pode mudar sem
// aviso, por isso o coletor valida a resposta antes de enviar qualquer coisa.
export type VendaInfinitePay = {
  id: number
  datetime: string          // ISO com Z
  amount: number            // centavos, bruto
  net_amount: number | null // centavos, já com a taxa descontada
  method: string            // 'credit' | 'debit' | 'money'
  installments: number
  status: string            // 'approved' | 'denied'
  nsu: string | null
  brand?: string
  serial_number?: string | null
  fee_percentage?: number | null
  type?: string
  transaction_origin?: string
}

/**
 * Descarta o que não é cartão aprovado:
 * - `status !== 'approved'` — negadas (23 em cada 100 na amostra de 30 dias);
 * - `method === 'money'` — venda em dinheiro digitada na maquininha.
 */
export function mapearInfinitePay(vendas: VendaInfinitePay[]): TransacaoCartao[] {
  return vendas
    .filter(v => v.status === 'approved' && v.method !== 'money')
    .map(v => ({
      nsu: v.nsu || undefined,
      dataTransacao: dataBrt(v.datetime),
      valorBruto: v.amount / 100,
      valorLiquido: v.net_amount != null ? v.net_amount / 100 : undefined,
      parcelas: v.installments || 1,
      tipo: v.method === 'debit' ? ('debito' as const) : ('credito' as const),
      status: 'aprovado',
      rawData: v as unknown as Record<string, unknown>,
    }))
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx tsx --test src/lib/conciliacao-infinitepay.test.ts`
Expected: PASS — 14 testes.

- [ ] **Step 7: Fazer o route handler usar os tipos do lib**

Em `src/app/api/conciliacao/cartao/route.ts`, apagar `export type TransacaoCartao` (linhas 6-16) e `export type PayloadConciliacao` (linhas 18-21) e importar:

```ts
import type { PayloadConciliacao } from '@/lib/conciliacao-cartao'
```

- [ ] **Step 8: Conferir que nada quebrou**

Run: `npm run type-check && npm test`
Expected: sem erro de tipo; suíte inteira passa.

- [ ] **Step 9: Commit**

```bash
git add src/lib/conciliacao-cartao.ts src/lib/conciliacao-infinitepay.ts src/lib/conciliacao-infinitepay.test.ts package.json src/app/api/conciliacao/cartao/route.ts
git commit -m "feat(conciliacao): tipos comuns e tradutor da InfinitePay"
```

---

### Task 2: Tradutor da Stone

**Files:**
- Create: `src/lib/conciliacao-stone.ts`
- Test: `src/lib/conciliacao-stone.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `dataBrt`, `TransacaoCartao` (Task 1).
- Produces: `VendaStone`, `DetalheStone`, `mapearStone(pares)`.

- [ ] **Step 1: Escrever os testes**

Criar `src/lib/conciliacao-stone.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearStone, type VendaStone, type DetalheStone } from './conciliacao-stone'

// Par real capturado do painel em 2026-08-04.
const VENDA: VendaStone = {
  id: '31263367049280',
  created_at: '2026-07-31T20:15:04.267+00:00',
  payment_method: 'card',
  installments: 12,
  card_brand: 'MasterCard',
  card_transaction_type: 'credit',
  status: 'paid',
  amount: 334289,
  situation: 'Approved',
  origin: { type: 'pos', serial_number: 'PB0923AB76138' },
}

const DETALHE: DetalheStone = {
  id: '31263367049280',
  amount: 334289,
  net_amount: 298687,
  status: 'paid',
  card_transaction: {
    type: 'credit',
    authorization_code: '015507',
    installments: 12,
    mdr_amount: 7374,
  },
  origin: { type: 'pos', serial_number: 'PB0923AB76138' },
}

test('bruto e líquido saem em reais', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.valorBruto, 3342.89)
  assert.equal(t.valorLiquido, 2986.87)
})

test('a Stone não manda NSU — a chave é o código de autorização', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.nsu, undefined)
  assert.equal(t.autorizacao, '015507')
})

test('crédito e débito', () => {
  assert.equal(mapearStone([{ venda: VENDA, detalhe: DETALHE }])[0].tipo, 'credito')
  const [d] = mapearStone([{
    venda: { ...VENDA, card_transaction_type: 'debit' },
    detalhe: { ...DETALHE, card_transaction: { ...DETALHE.card_transaction, type: 'debit' } },
  }])
  assert.equal(d.tipo, 'debito')
})

test('venda não paga é descartada', () => {
  assert.deepEqual(mapearStone([{ venda: { ...VENDA, status: 'canceled' }, detalhe: DETALHE }]), [])
})

test('venda que não é cartão é descartada', () => {
  assert.deepEqual(mapearStone([{ venda: { ...VENDA, payment_method: 'pix' }, detalhe: DETALHE }]), [])
})

test('data em BRT, não no UTC de created_at', () => {
  assert.equal(mapearStone([{ venda: VENDA, detalhe: DETALHE }])[0].dataTransacao, '2026-07-31')
  const [virada] = mapearStone([{
    venda: { ...VENDA, created_at: '2026-08-01T02:10:00.000+00:00' },
    detalhe: DETALHE,
  }])
  assert.equal(virada.dataTransacao, '2026-07-31')
})

test('rawData guarda o id, o serial e a taxa', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.rawData?.id, '31263367049280')
  assert.equal(t.rawData?.serial_number, 'PB0923AB76138')
  assert.equal(t.rawData?.mdr_amount, 7374)
})

test('sem detalhe a venda não é enviada — líquido e autorização faltariam', () => {
  assert.deepEqual(mapearStone([{ venda: VENDA, detalhe: null }]), [])
})
```

- [ ] **Step 2: Registrar no package.json e ver falhar**

Acrescentar `src/lib/conciliacao-stone.test.ts` ao script `test`.

Run: `npx tsx --test src/lib/conciliacao-stone.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/conciliacao-stone.ts`:

```ts
import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// A lista da Stone (payments-web-bff/sales/v1/organizations/{cnpj}) não traz
// valor líquido nem código de autorização — os dois só existem no detalhe
// (.../details/{id}). Por isso o tradutor recebe os dois juntos.
export type VendaStone = {
  id: string
  created_at: string        // ISO com offset
  payment_method: string    // 'card' | 'pix' | ...
  installments: number
  card_brand?: string
  card_transaction_type?: string  // 'credit' | 'debit'
  status: string            // 'paid' | 'canceled' | ...
  amount: number            // centavos
  situation?: string
  origin?: { type?: string; serial_number?: string }
}

export type DetalheStone = {
  id: string
  amount: number
  net_amount: number        // centavos
  status: string
  card_transaction: {
    type?: string
    authorization_code?: string
    installments?: number
    mdr_amount?: number
  }
  origin?: { type?: string; serial_number?: string }
}

export function mapearStone(
  pares: { venda: VendaStone; detalhe: DetalheStone | null }[],
): TransacaoCartao[] {
  return pares
    // Sem detalhe faltariam líquido e autorização; melhor não enviar do que
    // gravar uma transação capenga que depois ninguém consegue conferir.
    .filter(p => p.detalhe && p.venda.status === 'paid' && p.venda.payment_method === 'card')
    .map(({ venda, detalhe }) => {
      const d = detalhe!
      const tipo = (d.card_transaction.type ?? venda.card_transaction_type) === 'debit'
        ? ('debito' as const)
        : ('credito' as const)
      return {
        autorizacao: d.card_transaction.authorization_code || undefined,
        dataTransacao: dataBrt(venda.created_at),
        valorBruto: venda.amount / 100,
        valorLiquido: d.net_amount / 100,
        parcelas: venda.installments || 1,
        tipo,
        status: 'aprovado',
        rawData: {
          id: venda.id,
          serial_number: venda.origin?.serial_number ?? d.origin?.serial_number ?? null,
          card_brand: venda.card_brand ?? null,
          mdr_amount: d.card_transaction.mdr_amount ?? null,
          origin_type: venda.origin?.type ?? null,
        },
      }
    })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/conciliacao-stone.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conciliacao-stone.ts src/lib/conciliacao-stone.test.ts package.json
git commit -m "feat(conciliacao): tradutor de vendas da Stone"
```

---

### Task 3: Tradutor da PagueVeloz

**Files:**
- Create: `src/lib/conciliacao-pagueveloz.ts`
- Test: `src/lib/conciliacao-pagueveloz.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `dataBrt`, `TransacaoCartao` (Task 1).
- Produces: `OperacaoPagueVeloz`, `tipoDoCupom(cupom, parcelas)`, `mapearPagueVeloz(operacoes)`.

- [ ] **Step 1: Escrever os testes**

Criar `src/lib/conciliacao-pagueveloz.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearPagueVeloz, tipoDoCupom, type OperacaoPagueVeloz } from './conciliacao-pagueveloz'

const CUPOM_CREDITO = `      VIA ESTABELECIMENTO | VENDA
           07/07/2026 14:58
MOTOCHEFE SUL DE MINAS
CNPJ:57.113.017/0001-72
PAYWAVE/VISA          R$6.531,12
VISA CREDITO 15x - Aprovado por senha
  AUTO:799092 TERM:A0088080`

// Operação real capturada do painel em 2026-08-04.
const OPERACAO: OperacaoPagueVeloz = {
  Id: 43997874,
  NSU: 508833108,
  CodigoAutorizacao: '799092',
  ValorBruto: 6531.12,
  ValorLiquido: 5790.77,
  QtdeParcelas: 15,
  Bandeira: 'VISA',
  DataVenda: '2026-07-07T14:59:04.928-03:00',
  Status: { Nome: 'Pago', Valor: 'Pago' },
  POS: { Id: 330475, Identificador: 'A0088080', Apelido: 'Loja PA' },
  CupomEstabelecimento: CUPOM_CREDITO,
  NumeroCartao: '48546430***0617',
}

test('valores já vêm em reais — não dividir por 100', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.valorBruto, 6531.12)
  assert.equal(t.valorLiquido, 5790.77)
})

test('NSU e autorização', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.nsu, '508833108')
  assert.equal(t.autorizacao, '799092')
})

test('operação recusada é descartada', () => {
  const recusada = { ...OPERACAO, Status: { Nome: 'Recusado', Valor: 'Recusado' } }
  assert.deepEqual(mapearPagueVeloz([recusada]), [])
})

test('NSU zero não vira string "0"', () => {
  assert.equal(mapearPagueVeloz([{ ...OPERACAO, NSU: 0 }])[0].nsu, undefined)
})

test('data já vem em -03:00 e não pode ser deslocada de novo', () => {
  assert.equal(mapearPagueVeloz([OPERACAO])[0].dataTransacao, '2026-07-07')
})

test('venda depois das 21h fica no dia certo', () => {
  const [t] = mapearPagueVeloz([{ ...OPERACAO, DataVenda: '2026-07-07T22:30:00.000-03:00' }])
  assert.equal(t.dataTransacao, '2026-07-07')
})

// A PagueVeloz não tem campo de crédito/débito: a informação só existe no
// texto do cupom. Sem cupom, a única pista é a quantidade de parcelas.
test('crédito lido do cupom', () => {
  assert.equal(tipoDoCupom(CUPOM_CREDITO, 15), 'credito')
})

test('débito lido do cupom, mesmo com 1 parcela', () => {
  assert.equal(tipoDoCupom('MASTERCARD DEBITO - Aprovado por senha', 1), 'debito')
})

test('sem cupom, mais de uma parcela é crédito', () => {
  assert.equal(tipoDoCupom(null, 12), 'credito')
})

test('sem cupom e parcela única é débito', () => {
  assert.equal(tipoDoCupom('', 1), 'debito')
})

test('rawData guarda o id, o terminal e o apelido da loja', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.rawData?.id, 43997874)
  assert.equal(t.rawData?.terminal, 'A0088080')
  assert.equal(t.rawData?.apelido, 'Loja PA')
})
```

- [ ] **Step 2: Registrar no package.json e ver falhar**

Acrescentar `src/lib/conciliacao-pagueveloz.test.ts` ao script `test`.

Run: `npx tsx --test src/lib/conciliacao-pagueveloz.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/conciliacao-pagueveloz.ts`:

```ts
import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// Formato de /api/v2/PagamentoCartao/ObterRelatorioOperacoes. Duas diferenças
// em relação às outras operadoras: os valores já vêm em reais (não centavos) e
// as datas já vêm em -03:00 (não em UTC).
export type OperacaoPagueVeloz = {
  Id: number
  NSU: number
  CodigoAutorizacao: string
  ValorBruto: number        // reais
  ValorLiquido: number      // reais
  QtdeParcelas: number
  Bandeira: string
  DataVenda: string         // ISO com offset -03:00
  Status: { Nome: string; Valor: string }
  POS?: { Id?: number; Identificador?: string; Apelido?: string }
  CupomEstabelecimento?: string | null
  NumeroCartao?: string | null
}

/**
 * A PagueVeloz não devolve se a venda foi crédito ou débito — a informação só
 * existe no texto do cupom fiscal ("VISA CREDITO 15x", "MASTERCARD DEBITO").
 * Quando o cupom não vem, a única pista é a quantidade de parcelas.
 *
 * Errar aqui troca o rótulo da transação; não muda o valor nem o casamento com
 * a venda, que é feito por valor e data.
 */
export function tipoDoCupom(cupom: string | null | undefined, parcelas: number): 'credito' | 'debito' {
  const texto = (cupom ?? '').toUpperCase()
  if (texto.includes('DEBITO')) return 'debito'
  if (texto.includes('CREDITO')) return 'credito'
  return parcelas > 1 ? 'credito' : 'debito'
}

export function mapearPagueVeloz(operacoes: OperacaoPagueVeloz[]): TransacaoCartao[] {
  return operacoes
    .filter(o => o.Status?.Nome === 'Pago')
    .map(o => ({
      nsu: o.NSU ? String(o.NSU) : undefined,
      autorizacao: o.CodigoAutorizacao || undefined,
      dataTransacao: dataBrt(o.DataVenda),
      valorBruto: o.ValorBruto,
      valorLiquido: o.ValorLiquido || undefined,
      parcelas: o.QtdeParcelas || 1,
      tipo: tipoDoCupom(o.CupomEstabelecimento, o.QtdeParcelas),
      status: 'aprovado',
      rawData: {
        id: o.Id,
        terminal: o.POS?.Identificador ?? null,
        apelido: o.POS?.Apelido ?? null,
        bandeira: o.Bandeira ?? null,
        numero_cartao: o.NumeroCartao ?? null,
      },
    }))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/conciliacao-pagueveloz.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conciliacao-pagueveloz.ts src/lib/conciliacao-pagueveloz.test.ts package.json
git commit -m "feat(conciliacao): tradutor de vendas da PagueVeloz"
```

---

### Task 4: Endpoint escopado por grupo e dedup com chave reserva

**Files:**
- Modify: `src/app/api/conciliacao/cartao/route.ts:25-53` e `:118-136`

**Interfaces:**
- Consumes: `PayloadConciliacao`, `chaveDedup` (Task 1).
- Produces: endpoint que responde 400 sem `grupoCnpj` válido e grava no grupo certo.

- [ ] **Step 1: Resolver o grupo pelo CNPJ**

Depois de ler o body, antes do laço, substituir a validação atual por:

```ts
const { operadora, grupoCnpj, transacoes } = body

if (!operadora || !grupoCnpj || !Array.isArray(transacoes) || transacoes.length === 0) {
  return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
}

// O grupo vem do payload, nunca do dado: cada grupo tem sua própria conta na
// operadora, e adivinhar pelo conteúdo já colocou transação de BH em Sul de
// Minas uma vez.
const [grupo] = await db
  .select({ id: grupos.id })
  .from(grupos)
  .where(eq(grupos.cnpj, grupoCnpj))
  .limit(1)

if (!grupo) {
  return NextResponse.json({ error: `Grupo não encontrado para o CNPJ ${grupoCnpj}` }, { status: 400 })
}
```

Acrescentar `grupos` ao import de `@/lib/db/schema` e, no topo:

```ts
import { chaveDedup } from '@/lib/conciliacao-cartao'
```

- [ ] **Step 2: Trocar a detecção de duplicata**

Substituir o bloco `if (t.nsu) { ... }` (linhas 47-54) por:

```ts
// Duplicata: NSU é a chave natural; a Stone não manda NSU, então o id da
// operadora (guardado em rawData) evita reinserir a mesma venda a cada rodada.
const chave = chaveDedup(t)
if (chave) {
  const condicao = chave.campo === 'nsu'
    ? eq(conciliacoesCartao.nsu, chave.valor)
    : sql`${conciliacoesCartao.rawData}->>'id' = ${chave.valor}`

  const [existente] = await db
    .select({ id: conciliacoesCartao.id })
    .from(conciliacoesCartao)
    .where(and(eq(conciliacoesCartao.operadora, operadora), condicao))
    .limit(1)
  if (existente) { duplicadas++; continue }
}
```

`chave.valor` já é string — nunca passar `Date` ou número cru dentro de `` sql`` ``.

- [ ] **Step 3: Usar o grupo resolvido no insert**

Trocar o UUID fixo (linha 120) e apagar o comentário de 3 linhas acima dele:

```ts
      grupoId: grupo.id,
```

- [ ] **Step 4: Conferir**

Run: `npm run type-check && npm test`
Expected: passa.

- [ ] **Step 5: Verificar o 400 na prática**

Com `npm run dev` rodando, em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/conciliacao/cartao \
  -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" \
  -d '{"operadora":"infinitypay","grupoCnpj":"00.000.000/0001-00","transacoes":[{"dataTransacao":"2026-08-03","valorBruto":10,"parcelas":1,"tipo":"credito","status":"aprovado"}]}'
```

Expected: `400`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/conciliacao/cartao/route.ts
git commit -m "fix(conciliacao): grupo vem do payload e dedup nao depende so do NSU"
```

---

### Task 5: A fila no banco

**Files:**
- Migration: via Supabase MCP `apply_migration`
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/importacao-cartao.ts`
- Test: `src/lib/importacao-cartao.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: tabela `importacoes_cartao`; `importacoesCartao` no schema; `situacaoDoPedido(pedido, agora)`; `LIMITE_AGENTE_MS`; `LIMITE_EXECUCAO_MS`; tipo `SituacaoPedido`.

- [ ] **Step 1: Aplicar a migração**

Pelo Supabase MCP (`apply_migration`, nome `importacoes_cartao`):

```sql
CREATE TABLE importacoes_cartao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupos(id),
  solicitado_por uuid REFERENCES usuarios(id),
  status         text NOT NULL DEFAULT 'pendente',
  criado_em      timestamptz NOT NULL DEFAULT now(),
  iniciado_em    timestamptz,
  concluido_em   timestamptz,
  resultado      jsonb,
  erro           text
);

-- O agente busca sempre "o pedido pendente mais antigo deste grupo".
CREATE INDEX importacoes_cartao_fila_idx
  ON importacoes_cartao (grupo_id, status, criado_em);
```

- [ ] **Step 2: Refletir no schema.ts**

Acrescentar em `src/lib/db/schema.ts`, junto das outras tabelas de conciliação:

```ts
// ─── importacoes_cartao ──────────────────────────────────────────────────────
// Fila entre o botão no dashboard (Vercel) e o agente que roda no PC da loja.
// O botão não consegue falar com o PC; ele deixa um pedido aqui e o agente
// pergunta de tempos em tempos se tem serviço.
export const importacoesCartao = pgTable('importacoes_cartao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  solicitadoPor: uuid('solicitado_por').references(() => usuarios.id),
  status: text('status').notNull().default('pendente'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }),
  concluidoEm: timestamp('concluido_em', { withTimezone: true }),
  resultado: jsonb('resultado'),
  erro: text('erro'),
})
```

- [ ] **Step 3: Escrever os testes das regras de estado**

Criar `src/lib/importacao-cartao.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situacaoDoPedido, LIMITE_AGENTE_MS, LIMITE_EXECUCAO_MS } from './importacao-cartao'

const AGORA = new Date('2026-08-04T12:00:00.000Z')
const segundosAtras = (s: number) => new Date(AGORA.getTime() - s * 1000)

test('pedido recém-criado está só esperando o agente', () => {
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: segundosAtras(5), iniciadoEm: null }, AGORA), 'pendente')
})

test('pendente há muito tempo significa agente offline', () => {
  const velho = new Date(AGORA.getTime() - LIMITE_AGENTE_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: velho, iniciadoEm: null }, AGORA), 'offline')
})

test('rodando dentro do prazo continua rodando', () => {
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: segundosAtras(60), iniciadoEm: segundosAtras(30) }, AGORA), 'rodando')
})

test('rodando além do prazo é agente que morreu no meio', () => {
  const inicio = new Date(AGORA.getTime() - LIMITE_EXECUCAO_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: inicio, iniciadoEm: inicio }, AGORA), 'travado')
})

test('concluída e erro passam direto', () => {
  assert.equal(situacaoDoPedido({ status: 'concluida', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'concluida')
  assert.equal(situacaoDoPedido({ status: 'erro', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'erro')
})
```

Acrescentar `src/lib/importacao-cartao.test.ts` ao script `test` do `package.json`.

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx tsx --test src/lib/importacao-cartao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 5: Implementar**

Criar `src/lib/importacao-cartao.ts`:

```ts
// Quanto a tela espera antes de dizer que ninguém do outro lado respondeu.
export const LIMITE_AGENTE_MS = 60_000
// Quanto uma coleta pode demorar antes de ser considerada travada. As três
// operadoras juntas levam bem menos que isso.
export const LIMITE_EXECUCAO_MS = 5 * 60_000

export type SituacaoPedido = 'pendente' | 'offline' | 'rodando' | 'travado' | 'concluida' | 'erro'

type Pedido = {
  status: string
  criadoEm: Date
  iniciadoEm: Date | null
}

/**
 * Traduz o estado gravado no banco para o que a tela mostra. A diferença entre
 * "pendente" e "offline" é só tempo: o agente pergunta a cada 15 segundos, então
 * um pedido parado há mais de um minuto significa que não tem ninguém ouvindo.
 */
export function situacaoDoPedido(pedido: Pedido, agora: Date): SituacaoPedido {
  if (pedido.status === 'concluida') return 'concluida'
  if (pedido.status === 'erro') return 'erro'

  if (pedido.status === 'rodando') {
    const inicio = pedido.iniciadoEm ?? pedido.criadoEm
    return agora.getTime() - inicio.getTime() > LIMITE_EXECUCAO_MS ? 'travado' : 'rodando'
  }

  return agora.getTime() - pedido.criadoEm.getTime() > LIMITE_AGENTE_MS ? 'offline' : 'pendente'
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx tsx --test src/lib/importacao-cartao.test.ts && npm run type-check`
Expected: PASS — 5 testes; sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/importacao-cartao.ts src/lib/importacao-cartao.test.ts package.json
git commit -m "feat(conciliacao): fila de importacao de vendas de cartao"
```

---

### Task 6: Rotas da fila para o agente

**Files:**
- Create: `src/app/api/conciliacao/fila/route.ts`

**Interfaces:**
- Consumes: `importacoesCartao`, `grupos` (Task 5).
- Produces: `GET /api/conciliacao/fila?grupoCnpj=…` → `{ pedido: { id, grupoCnpj } | null }`; `POST /api/conciliacao/fila` com `{ id, resultado?, erro? }` → `{ ok: true }`. Ambas por `x-cron-secret`.

- [ ] **Step 1: Escrever a rota**

Criar `src/app/api/conciliacao/fila/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { importacoesCartao, grupos } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

function autorizado(req: NextRequest): boolean {
  return req.headers.get('x-cron-secret') === process.env.CRON_SECRET
}

// O agente do PC da loja pergunta se tem pedido para este grupo. A busca e a
// marcação acontecem numa instrução só, com SKIP LOCKED: se dois agentes
// estiverem no ar por engano, cada um leva um pedido diferente — nunca o mesmo.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grupoCnpj = req.nextUrl.searchParams.get('grupoCnpj')
  if (!grupoCnpj) return NextResponse.json({ error: 'grupoCnpj obrigatório' }, { status: 400 })

  const [grupo] = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.cnpj, grupoCnpj)).limit(1)
  if (!grupo) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 })

  const linhas = await db.execute(sql`
    UPDATE importacoes_cartao
       SET status = 'rodando', iniciado_em = now()
     WHERE id = (
       SELECT id FROM importacoes_cartao
        WHERE grupo_id = ${grupo.id} AND status = 'pendente'
        ORDER BY criado_em
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id
  `)

  const id = (linhas as unknown as { id: string }[])[0]?.id ?? null
  return NextResponse.json({ pedido: id ? { id, grupoCnpj } : null })
}

// O agente devolve o resultado. Falha parcial (uma operadora deu errado) chega
// aqui como `erro` preenchido junto com o `resultado` das que funcionaram —
// nunca como sucesso limpo.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, resultado, erro } = await req.json() as {
    id?: string
    resultado?: Record<string, unknown>
    erro?: string
  }
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  await db.update(importacoesCartao)
    .set({
      status: erro ? 'erro' : 'concluida',
      resultado: resultado ?? null,
      erro: erro ?? null,
      concluidoEm: new Date(),
    })
    .where(eq(importacoesCartao.id, id))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Conferir tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 3: Verificar as duas rotas na prática**

Com `npm run dev` rodando e uma linha `pendente` inserida à mão pelo Supabase MCP para o grupo Sul de Minas:

```bash
curl -s "http://localhost:3000/api/conciliacao/fila?grupoCnpj=57.113.017/0001-72" -H "x-cron-secret: $CRON_SECRET"
```

Expected: `{"pedido":{"id":"…","grupoCnpj":"57.113.017/0001-72"}}`. Chamar de novo: `{"pedido":null}` (o primeiro já virou `rodando`). Sem o cabeçalho: `401`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/conciliacao/fila/route.ts
git commit -m "feat(conciliacao): rotas da fila para o agente local"
```

---

### Task 7: O botão no dashboard

**Files:**
- Create: `src/app/(dashboard)/dashboard/actions.ts`
- Create: `src/app/(dashboard)/dashboard/components/importar-cartao-button.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `importacoesCartao`, `situacaoDoPedido`, `SituacaoPedido` (Task 5); `getUsuarioLogado` (`@/lib/auth`); `getGrupoAtivo` (`@/lib/grupo`).
- Produces: `solicitarImportacaoAction()` → `{ id } | { erro }`; `consultarImportacaoAction(id)` → `{ situacao, resultado, erro }`.

- [ ] **Step 1: Escrever as server actions**

Criar `src/app/(dashboard)/dashboard/actions.ts`:

```ts
'use server'
import { db } from '@/lib/db'
import { importacoesCartao } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { situacaoDoPedido, type SituacaoPedido } from '@/lib/importacao-cartao'

const PAPEIS_IMPORTACAO = ['admin_geral', 'admin_socio', 'aux_adm']

type ResumoOperadora = { importadas: number; duplicadas: number; conciliadas: number }

/**
 * Cria o pedido de importação. Se já existe um em aberto para o grupo,
 * devolve aquele: clicar duas vezes não coleta duas vezes.
 */
export async function solicitarImportacaoAction(): Promise<{ id: string } | { erro: string }> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_IMPORTACAO.includes(usuario.papel)) return { erro: 'Sem permissão' }

  const grupo = await getGrupoAtivo(usuario)

  const [emAberto] = await db
    .select({ id: importacoesCartao.id })
    .from(importacoesCartao)
    .where(and(
      eq(importacoesCartao.grupoId, grupo.id),
      inArray(importacoesCartao.status, ['pendente', 'rodando']),
    ))
    .orderBy(desc(importacoesCartao.criadoEm))
    .limit(1)

  if (emAberto) return { id: emAberto.id }

  const [novo] = await db
    .insert(importacoesCartao)
    .values({ grupoId: grupo.id, solicitadoPor: usuario.id })
    .returning({ id: importacoesCartao.id })

  return { id: novo.id }
}

export async function consultarImportacaoAction(id: string): Promise<{
  situacao: SituacaoPedido
  resultado: Record<string, ResumoOperadora> | null
  erro: string | null
}> {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const [pedido] = await db
    .select()
    .from(importacoesCartao)
    .where(and(eq(importacoesCartao.id, id), eq(importacoesCartao.grupoId, grupo.id)))
    .limit(1)

  if (!pedido) return { situacao: 'erro', resultado: null, erro: 'Pedido não encontrado' }

  return {
    situacao: situacaoDoPedido(pedido, new Date()),
    resultado: pedido.resultado as Record<string, ResumoOperadora> | null,
    erro: pedido.erro,
  }
}
```

- [ ] **Step 2: Escrever o botão**

Criar `src/app/(dashboard)/dashboard/components/importar-cartao-button.tsx`:

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { solicitarImportacaoAction, consultarImportacaoAction } from '../actions'
import { Button } from '@/components/ui/button'
import type { SituacaoPedido } from '@/lib/importacao-cartao'

const NOMES: Record<string, string> = {
  infinitypay: 'InfinitePay',
  stone: 'Stone',
  pagueveloz: 'PagueVeloz',
}

type Resultado = Record<string, { importadas: number; duplicadas: number; conciliadas: number }>

export function ImportarCartaoButton() {
  const [situacao, setSituacao] = useState<SituacaoPedido | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  async function importar() {
    setResultado(null); setErro(null); setSituacao('pendente')

    const pedido = await solicitarImportacaoAction()
    if ('erro' in pedido) { setSituacao('erro'); setErro(pedido.erro); return }

    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(async () => {
      const atual = await consultarImportacaoAction(pedido.id)
      setSituacao(atual.situacao)
      if (['concluida', 'erro', 'offline', 'travado'].includes(atual.situacao)) {
        if (timer.current) clearInterval(timer.current)
        setResultado(atual.resultado)
        setErro(atual.erro)
      }
    }, 2000)
  }

  const rodando = situacao === 'pendente' || situacao === 'rodando'

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={importar} disabled={rodando}>
        {rodando ? 'Importando…' : 'Importar vendas de cartão'}
      </Button>

      {situacao === 'offline' && (
        <p className="text-sm text-muted-foreground">
          Agente offline no PC da loja — ninguém respondeu ao pedido.
        </p>
      )}
      {situacao === 'travado' && (
        <p className="text-sm text-muted-foreground">
          A importação travou no meio. Tente de novo.
        </p>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {resultado && (
        <p className="text-sm text-muted-foreground">
          {Object.entries(resultado)
            .map(([op, r]) => `${NOMES[op] ?? op}: ${r.importadas} importadas, ${r.conciliadas} conciliadas`)
            .join(' • ')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Colocar o botão no dashboard**

Em `src/app/(dashboard)/dashboard/page.tsx`, importar o componente e renderizá-lo junto dos cards do topo, atrás do gate de papel (o `usuario` já está disponível na página):

```tsx
import { ImportarCartaoButton } from './components/importar-cartao-button'
```

```tsx
{['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel) && <ImportarCartaoButton />}
```

- [ ] **Step 4: Conferir**

Run: `npm run type-check && npm run build`
Expected: compila sem erro.

- [ ] **Step 5: Ver na tela**

Com `npm run dev`, abrir `/dashboard` e clicar no botão. Sem agente rodando, Expected: depois de ~60s aparece "Agente offline no PC da loja". Conferir no banco que existe uma linha `pendente` em `importacoes_cartao`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/actions.ts" "src/app/(dashboard)/dashboard/components/importar-cartao-button.tsx" "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(dashboard): botao de importar vendas de cartao"
```

---

### Task 8: O agente e os três coletores

**Files:**
- Create: `scripts/conciliacao/navegador.ts`
- Create: `scripts/conciliacao/operadoras/infinitepay.ts`
- Create: `scripts/conciliacao/operadoras/stone.ts`
- Create: `scripts/conciliacao/operadoras/pagueveloz.ts`
- Create: `scripts/conciliacao/agente.ts`
- Delete: `scripts/conciliacao/infinitypay.mjs`
- Modify: `package.json` (devDependency `playwright`)

**Interfaces:**
- Consumes: `mapearInfinitePay`, `mapearStone`, `mapearPagueVeloz`, `TransacaoCartao`, `Operadora` (Tasks 1-3); rotas da fila (Task 6) e `/api/conciliacao/cartao` (Task 4).
- Produces: `npx dotenv -e .env.local -- npx tsx scripts/conciliacao/agente.ts --grupo=sul-de-minas`.

- [ ] **Step 1: Instalar o Playwright**

```bash
npm install -D playwright
npx playwright install chromium
```

- [ ] **Step 2: Escrever o utilitário de navegador**

Criar `scripts/conciliacao/navegador.ts`:

```ts
import { chromium, type BrowserContext, type Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'

export const BASE_COLETOR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'mova-coletor')

export class SessaoExpirada extends Error {
  constructor(public operadora: string) {
    super(`Sessão da ${operadora} expirou — faça login na janela aberta`)
  }
}

export async function abrirPerfil(slugGrupo: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(path.join(BASE_COLETOR, `cartao-${slugGrupo}`), {
    headless: false,
  })
}

/**
 * Captura o cabeçalho Authorization da primeira requisição que a própria página
 * fizer batendo em `padrao`, e devolve junto com a página pronta.
 *
 * Por que assim, e não lendo o token do localStorage: na Stone as chaves do
 * localStorage são ofuscadas e o token não é encontrável por nome. Interceptar
 * o cabeçalho que o app já manda funciona nas três operadoras, sem depender de
 * onde cada uma guarda a credencial.
 */
export async function abrirComToken(
  contexto: BrowserContext,
  url: string,
  padrao: RegExp,
): Promise<{ pagina: Page; authorization: string | null }> {
  const pagina = await contexto.newPage()

  const capturado = pagina.waitForRequest(req => padrao.test(req.url()), { timeout: 30_000 })
    .then(req => req.headers()['authorization'] ?? null)
    .catch(() => null)

  await pagina.goto(url, { waitUntil: 'domcontentloaded' })
  const authorization = await capturado
  return { pagina, authorization }
}

export async function avisar(chatId: string | undefined, texto: string): Promise<void> {
  console.error(texto)
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    })
  } catch (e) {
    console.error('aviso no Telegram falhou:', e instanceof Error ? e.message : String(e))
  }
}
```

- [ ] **Step 3: Escrever o coletor da InfinitePay**

Criar `scripts/conciliacao/operadoras/infinitepay.ts`:

```ts
import type { BrowserContext } from 'playwright'
import { abrirComToken, SessaoExpirada } from '../navegador'
import { mapearInfinitePay, type VendaInfinitePay } from '../../../src/lib/conciliacao-infinitepay'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

const HOST = 'https://infinitepay-sales-indexer.services.production.infinitepay.io'

export async function coletarInfinitePay(
  contexto: BrowserContext,
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const { pagina } = await abrirComToken(contexto, 'https://app.infinitepay.io/sales', /sales-index/)

  try {
    if (await pagina.getByText('escaneie o QR', { exact: false }).count() > 0) {
      throw new SessaoExpirada('InfinitePay')
    }
    await pagina.waitForTimeout(5000)  // o app mina o token logo após carregar

    const vendas: VendaInfinitePay[] = await pagina.evaluate(async ({ host, from, to }) => {
      const token = localStorage.getItem('jwtReadToken')
      if (!token) throw new Error('jwtReadToken ausente — app não terminou de carregar')

      const todas: unknown[] = []
      let url = `${host}/sales-index/v1/sales/search?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&pg=true&limit=100`
      while (url) {
        const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) throw new Error(`sales/search respondeu ${r.status}`)
        const json = await r.json()
        if (!Array.isArray(json.results)) throw new Error('resposta sem results[] — endpoint mudou?')
        todas.push(...json.results)
        url = json.pagination?.next_page || ''
      }
      return todas
    }, { host: HOST, from: inicio.toISOString(), to: fim.toISOString() })

    return mapearInfinitePay(vendas)
  } finally {
    await pagina.close()
  }
}
```

- [ ] **Step 4: Escrever o coletor da Stone**

Criar `scripts/conciliacao/operadoras/stone.ts`:

```ts
import type { BrowserContext } from 'playwright'
import { abrirComToken, SessaoExpirada } from '../navegador'
import { mapearStone, type VendaStone, type DetalheStone } from '../../../src/lib/conciliacao-stone'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

const HOST = 'https://payments-api-gateway-prd.pagar.me/payments-web-bff/sales/v1/organizations'

export async function coletarStone(
  contexto: BrowserContext,
  cnpj: string,          // com pontuação, como em grupos.cnpj
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const { pagina, authorization } = await abrirComToken(
    contexto, 'https://conta.stone.com.br/vendas', /payments-web-bff\/sales/,
  )

  try {
    if (!authorization) throw new SessaoExpirada('Stone')

    const cnpjLimpo = cnpj.replace(/\D/g, '')

    // A lista não traz NSU nem líquido: os dois só existem no detalhe, então é
    // uma chamada por venda. Com ~5 vendas por semana, é barato.
    const pares = await pagina.evaluate(async ({ host, cnpjLimpo, auth, from, to }) => {
      const headers = { authorization: auth, 'x-institution': 'stone', accept: 'application/json' }
      const base = `${host}/${cnpjLimpo}`

      const vendas: Record<string, unknown>[] = []
      let url = `${base}?size=100&start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`
      while (url) {
        const r = await fetch(url, { headers })
        if (!r.ok) throw new Error(`sales/v1 respondeu ${r.status}`)
        const json = await r.json()
        if (!Array.isArray(json.items)) throw new Error('resposta sem items[] — endpoint mudou?')
        vendas.push(...json.items)
        url = json.next
          ? `${base}?size=100&page=${json.next}&start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`
          : ''
      }

      const saida = []
      for (const venda of vendas) {
        const r = await fetch(`${base}/details/${(venda as { id: string }).id}`, { headers })
        saida.push({ venda, detalhe: r.ok ? await r.json() : null })
      }
      return saida
    }, { host: HOST, cnpjLimpo, auth: authorization, from: inicio.toISOString(), to: fim.toISOString() })

    return mapearStone(pares as unknown as { venda: VendaStone; detalhe: DetalheStone | null }[])
  } finally {
    await pagina.close()
  }
}
```

- [ ] **Step 5: Escrever o coletor da PagueVeloz**

Criar `scripts/conciliacao/operadoras/pagueveloz.ts`:

```ts
import type { BrowserContext } from 'playwright'
import { SessaoExpirada } from '../navegador'
import { mapearPagueVeloz, type OperacaoPagueVeloz } from '../../../src/lib/conciliacao-pagueveloz'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

// A PagueVeloz espera DD/MM/AAAA, não ISO — diferente das outras duas.
function ddmmaaaa(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const [ano, mes, dia] = brt.toISOString().slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export async function coletarPagueVeloz(
  contexto: BrowserContext,
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const pagina = await contexto.newPage()

  try {
    await pagina.goto('https://www.pagueveloz.com.br/conta/maquininha/relatorios/operacoes/', { waitUntil: 'domcontentloaded' })
    if (pagina.url().includes('/entrar')) throw new SessaoExpirada('PagueVeloz')

    // Aqui não há Bearer: a chamada é same-origin e vai com o cookie da sessão.
    const operacoes: OperacaoPagueVeloz[] = await pagina.evaluate(async ({ de, ate }) => {
      const url = `/api/v2/PagamentoCartao/ObterRelatorioOperacoes?TipoData=venda&equipamento=todos&inicio=${de}&fim=${ate}`
      const r = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } })
      if (r.status === 401 || r.status === 403) throw new Error('SESSAO')
      if (!r.ok) throw new Error(`ObterRelatorioOperacoes respondeu ${r.status}`)
      const json = await r.json()
      if (!Array.isArray(json)) throw new Error('resposta não é array — endpoint mudou?')
      return json
    }, { de: ddmmaaaa(inicio), ate: ddmmaaaa(fim) })

    return mapearPagueVeloz(operacoes)
  } catch (e) {
    if (e instanceof Error && e.message.includes('SESSAO')) throw new SessaoExpirada('PagueVeloz')
    throw e
  } finally {
    await pagina.close()
  }
}
```

- [ ] **Step 6: Escrever o agente**

Criar `scripts/conciliacao/agente.ts`:

```ts
/**
 * Agente de importação de vendas de cartão.
 *
 * Uso:
 *   npx dotenv -e .env.local -- npx tsx scripts/conciliacao/agente.ts --grupo=sul-de-minas
 *
 * Fica perguntando ao MOVA, a cada 15 segundos, se alguém clicou no botão do
 * dashboard. Quando tem pedido, coleta as três operadoras e devolve o resultado.
 *
 * PRIMEIRA EXECUÇÃO: uma janela do Chromium abre em cada painel. Faça o login
 * de cada operadora ali (a InfinitePay é por QR Code no app). As sessões ficam
 * salvas no perfil; a da InfinitePay dura 7 dias, as outras até você sair.
 */
import { abrirPerfil, avisar, SessaoExpirada, BASE_COLETOR } from './navegador'
import { coletarInfinitePay } from './operadoras/infinitepay'
import { coletarStone } from './operadoras/stone'
import { coletarPagueVeloz } from './operadoras/pagueveloz'
import type { TransacaoCartao, Operadora } from '../../src/lib/conciliacao-cartao'

const GRUPOS = {
  'sul-de-minas': { cnpj: '57.113.017/0001-72', nome: 'Sul de Minas' },
  'bh':           { cnpj: '63.009.605/0001-63', nome: 'BH' },
} as const

const INTERVALO_MS = 15_000
const DIAS_PADRAO = 7

const slug = (process.argv.find(a => a.startsWith('--grupo='))?.split('=')[1] || '') as keyof typeof GRUPOS
const grupo = GRUPOS[slug]
if (!grupo) { console.error(`Use --grupo=<${Object.keys(GRUPOS).join('|')}>`); process.exit(1) }

const { MOVA_URL, CRON_SECRET, TELEGRAM_CHAT_ID } = process.env
if (!MOVA_URL || !CRON_SECRET) { console.error('MOVA_URL e CRON_SECRET faltando no .env.local'); process.exit(1) }

const cabecalho = { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET }

async function enviar(operadora: Operadora, transacoes: TransacaoCartao[]) {
  if (transacoes.length === 0) return { importadas: 0, duplicadas: 0, conciliadas: 0 }
  const r = await fetch(`${MOVA_URL}/api/conciliacao/cartao`, {
    method: 'POST',
    headers: cabecalho,
    body: JSON.stringify({ operadora, grupoCnpj: grupo.cnpj, transacoes }),
  })
  if (!r.ok) throw new Error(`MOVA respondeu ${r.status} para ${operadora}: ${await r.text()}`)
  return await r.json()
}

async function processar(pedidoId: string) {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - DIAS_PADRAO * 24 * 60 * 60 * 1000)
  const contexto = await abrirPerfil(slug)

  const resultado: Record<string, unknown> = {}
  const falhas: string[] = []
  let precisaLogin = false

  const etapas: [Operadora, () => Promise<TransacaoCartao[]>][] = [
    ['infinitypay', () => coletarInfinitePay(contexto, inicio, fim)],
    ['stone',       () => coletarStone(contexto, grupo.cnpj, inicio, fim)],
    ['pagueveloz',  () => coletarPagueVeloz(contexto, inicio, fim)],
  ]

  try {
    // Uma operadora que falha não derruba as outras: o que deu certo é gravado
    // e o pedido volta como erro dizendo o que faltou.
    for (const [operadora, coletar] of etapas) {
      try {
        resultado[operadora] = await enviar(operadora, await coletar())
      } catch (e) {
        if (e instanceof SessaoExpirada) precisaLogin = true
        const msg = e instanceof Error ? e.message : String(e)
        falhas.push(`${operadora}: ${msg}`)
        await avisar(TELEGRAM_CHAT_ID, `Importação de cartão (${grupo.nome}) — ${operadora}: ${msg}`)
      }
    }
  } finally {
    // Quando alguma sessão vence, a janela fica aberta na tela de login (ou no
    // QR da InfinitePay) para alguém entrar ali mesmo. Fechar obrigaria a rodar
    // tudo de novo só para ver a tela de login. As outras operadoras já foram
    // importadas normalmente; é só clicar o botão de novo depois de logar.
    if (!precisaLogin) await contexto.close()
  }

  await fetch(`${MOVA_URL}/api/conciliacao/fila`, {
    method: 'POST',
    headers: cabecalho,
    body: JSON.stringify({ id: pedidoId, resultado, erro: falhas.length ? falhas.join(' | ') : undefined }),
  })

  console.log(`[${new Date().toISOString()}] pedido ${pedidoId}:`, JSON.stringify(resultado), falhas.join(' | '))
}

console.log(`Agente de cartão no ar — grupo ${grupo.nome}, perfis em ${BASE_COLETOR}`)

setInterval(async () => {
  try {
    const r = await fetch(
      `${MOVA_URL}/api/conciliacao/fila?grupoCnpj=${encodeURIComponent(grupo.cnpj)}`,
      { headers: cabecalho },
    )
    if (!r.ok) return
    const { pedido } = await r.json() as { pedido: { id: string } | null }
    if (pedido) await processar(pedido.id)
  } catch (e) {
    console.error('laço do agente:', e instanceof Error ? e.message : String(e))
  }
}, INTERVALO_MS)
```

- [ ] **Step 7: Apagar a tentativa anterior**

```bash
git rm scripts/conciliacao/infinitypay.mjs
```

- [ ] **Step 8: Conferir tipos**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 9: Primeira execução, apontando para o dev local**

Com `npm run dev` rodando e `MOVA_URL=http://localhost:3000` no `.env.local`:

```bash
npx dotenv -e .env.local -- npx tsx scripts/conciliacao/agente.ts --grupo=sul-de-minas
```

Fazer o login das três operadoras nas janelas que abrirem. Depois clicar o botão no `/dashboard` local. Expected: o agente loga o pedido e a tela mostra o resumo por operadora.

- [ ] **Step 10: Commit**

```bash
git add scripts/conciliacao package.json package-lock.json
git commit -m "feat(conciliacao): agente local e coletores das tres operadoras"
```

---

### Task 9: Validação contra os painéis e subida com o Windows

**Files:** nenhum arquivo de código.

- [ ] **Step 1: Rodar contra produção**

Com `MOVA_URL=https://moto-chefe.vercel.app`, subir o agente e clicar o botão no dashboard de produção.

- [ ] **Step 2: Conferir número por número**

Para cada operadora, abrir o painel no mesmo período de 7 dias e comparar a contagem de vendas **aprovadas** com o que a tela mostrou. Referências colhidas em 2026-08-04: InfinitePay 166 vendas em 30 dias (77 aprovadas nas 100 primeiras); Stone 5 vendas em 7 dias, R$ 26.705,97; PagueVeloz 71 operações em 30 dias, 31 pagas.

Divergências esperadas: venda em dinheiro (`money`) e negadas contam no painel e não aqui. Qualquer outra diferença é bug — investigar antes de seguir.

- [ ] **Step 3: Conferir a conciliação**

Abrir `/conciliacao` e verificar que as transações apareceram, que parte casou com vendas/OS, e que o que sobrou pendente faz sentido.

- [ ] **Step 4: Clicar o botão duas vezes**

Expected: na segunda vez, `importadas: 0` e `duplicadas` igual ao total. Se importar de novo, **parar**: o dedup está furado.

- [ ] **Step 5: Subir o agente com o Windows**

```powershell
schtasks /Create /TN "MOVA - Agente de cartao" /SC ONLOGON /TR "cmd /c cd /d D:\Claude\Teste && npx dotenv -e .env.local -- npx tsx scripts/conciliacao/agente.ts --grupo=sul-de-minas" /RL HIGHEST
```

Testar sem reiniciar: `schtasks /Run /TN "MOVA - Agente de cartao"`.

- [ ] **Step 6: Conferir o caminho do erro**

Sair da conta da PagueVeloz no perfil do agente e clicar o botão. Expected: as outras duas importam normalmente, a tela mostra o erro dizendo `pagueveloz`, e o aviso chega no Telegram. Falha parcial nunca pode aparecer como sucesso.

---

## Fora deste plano

Está no spec como fora de escopo e **não deve ser implementado aqui**: taxa da maquininha no financeiro, amarrar venda à loja pelo `POS.Apelido` da PagueVeloz, cruzamento com o extrato do Open Finance, alerta de venda não lançada no MOVA, e rodar a coleta na nuvem.
