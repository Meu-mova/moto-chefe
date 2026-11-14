// Teste de banco: salvar as taxas da Precificação grava só os campos do formulário, sempre no
// grupo ativo do servidor; o que vier a mais no envio não muda a linha de outro grupo.
// Roda no Postgres descartável do CI. Local: `npm run test:db:local`.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import type { TaxasPayload } from './actions'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

let sessao: Record<string, unknown> = {}
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => sessao } }),
  mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let execRows: Db['execRows']
let salvarTaxasAction: typeof import('./actions')['salvarTaxasAction']
const s = { contaA: '', grupoA: '', contaB: '', grupoB: '' }

const TAXAS_B: TaxasPayload = {
  taxasCartao: { '1': 3 }, taxasDebito: { '1': 1 }, taxasLink: {}, taxasFinanciamento: {},
  freteValorKm: '5.00', freteKmGratis: 10, freteValorFixo: '0.00', imposto: '0.0800',
}
const ENVIO: TaxasPayload = {
  taxasCartao: { '1': 9.9 }, taxasDebito: { '1': 9.9 }, taxasLink: { '1': 9.9 }, taxasFinanciamento: { '12': 9.9 },
  freteValorKm: '9.99', freteKmGratis: 99, freteValorFixo: '99.00', imposto: '0.9900',
}

const taxasDo = async (grupoId: string) => (await execRows(sql`
  select taxas_cartao, taxas_debito, taxas_link, taxas_financiamento, frete_valor_km, frete_km_gratis,
    frete_valor_fixo, imposto, padrao_simulador
  from configuracao_taxas where grupo_id = ${grupoId}`))[0]

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ salvarTaxasAction } = await import('./actions'))
  // A action usa o db global: a semente é gravada e apagada no after.
  const a = await semearContaBase(db, { prefixo: 'PT924', nome: 'A', cnpj: '00000000092401' })
  const b = await semearContaBase(db, { prefixo: 'PT924', nome: 'B', cnpj: '00000000092402' })
  Object.assign(s, { contaA: a.contaId, grupoA: a.grupoId, contaB: b.contaId, grupoB: b.grupoId })
  const socioA = await semearUsuario(db, a, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  sessao = { id: socioA, papel: 'admin_socio', lojaId: null, gruposAcesso: [a.grupoId], contaId: a.contaId, grupoLiberado: null }
  await db.execute(sql`insert into configuracao_taxas (grupo_id, taxas_cartao, taxas_debito, frete_valor_km, frete_km_gratis, imposto)
    values (${b.grupoId}, ${JSON.stringify(TAXAS_B.taxasCartao)}::jsonb, ${JSON.stringify(TAXAS_B.taxasDebito)}::jsonb,
      ${TAXAS_B.freteValorKm}, ${TAXAS_B.freteKmGratis}, ${TAXAS_B.imposto})`)
})

after(async () => {
  await db.execute(sql`delete from configuracao_taxas where grupo_id in (${s.grupoA}, ${s.grupoB})`)
  await db.execute(sql`delete from usuarios where email like '%-pt924-%'`)
  await db.execute(sql`delete from lojas where grupo_id in (${s.grupoA}, ${s.grupoB})`)
  await db.execute(sql`delete from grupos where id in (${s.grupoA}, ${s.grupoB})`)
  await db.execute(sql`delete from contas where id in (${s.contaA}, ${s.contaB})`)
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const comoNoBanco = (t: TaxasPayload) => ({
  taxas_cartao: t.taxasCartao, taxas_debito: t.taxasDebito, taxas_link: t.taxasLink, taxas_financiamento: t.taxasFinanciamento,
  frete_valor_km: t.freteValorKm, frete_km_gratis: t.freteKmGratis, frete_valor_fixo: t.freteValorFixo, imposto: t.imposto,
  padrao_simulador: 'taxas',
})

test('o envio com o grupo de outra Conta grava no grupo ativo e não muda as taxas da outra', async () => {
  const forjado = { ...ENVIO, grupoId: s.grupoB, padraoSimulador: 'avista_12x', atualizadoEm: new Date('2020-01-01') }
  await salvarTaxasAction(forjado as TaxasPayload)
  assert.deepEqual(await taxasDo(s.grupoB), comoNoBanco(TAXAS_B))
  assert.deepEqual(await taxasDo(s.grupoA), comoNoBanco(ENVIO))
})

test('salvar de novo atualiza a mesma linha do grupo ativo', async () => {
  const outra: TaxasPayload = { ...ENVIO, imposto: '0.0500', freteKmGratis: 30 }
  await salvarTaxasAction(outra)
  assert.deepEqual(await taxasDo(s.grupoA), comoNoBanco(outra))
  const [{ n }] = await execRows(sql`select count(*)::int n from configuracao_taxas where grupo_id = ${s.grupoA}`)
  assert.equal(n, 1)
})
