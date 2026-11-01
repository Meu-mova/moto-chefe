// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'b'.repeat(64)

type Db = typeof import('@/lib/db')
type Limite = typeof import('@/lib/limite-tentativas')
let db: Db['db']
let adesoesMova: typeof import('@/lib/db/schema')['adesoesMova']
let colunasFiscais: typeof import('@/lib/adesao-fiscal')['colunasFiscais']
let permitirTentativa: Limite['permitirTentativa']
let apagarTentativasAntigas: Limite['apagarTentativasAntigas']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ adesoesMova } = await import('@/lib/db/schema'))
  ;({ colunasFiscais } = await import('@/lib/adesao-fiscal'))
  ;({ permitirTentativa, apagarTentativasAntigas } = await import('@/lib/limite-tentativas'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const emTransacaoDesfeita = (fn: (tx: Tx) => Promise<void>) =>
  assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
const rows = async <T>(tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: T[] }).rows

const CNPJ = '12345678000195'
const FISCAL = {
  razaoSocial: 'EMPRESA TESTE LTDA', nomeFantasia: '', telefone: '1133330000',
  endereco: { cep: '01001000', logradouro: 'Rua de Teste', numero: '100', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' },
  codigoIbge: '3550308', situacao: 'ATIVA', regime: 'mei',
  inscricaoEstadual: '12.345-x', ieIsenta: false, inscricaoMunicipal: '', emailNotas: 'contador@exemplo.com',
  jaEmite: true, nfSerie: '1', nfUltimoNumero: '1532',
}
const BASE = { loja: 'Loja Teste', responsavel: 'Resp', celular: '11999990000', cnpjArquivoPath: 'x/cnpj.pdf', storeLogin: 'loja@exemplo.com', usuarios: [] }

test('adesão grava os dados fiscais com o CNPJ do A1 e só dígitos', async () => {
  await emTransacaoDesfeita(async tx => {
    const f = colunasFiscais(FISCAL, CNPJ)
    assert.ok(f.ok)
    const [a] = await tx.insert(adesoesMova).values({ ...BASE, ...f.colunas }).returning({ id: adesoesMova.id })
    const [g] = await rows<Record<string, unknown>>(tx, sql`
      select cnpj, regime, inscricao_estadual, ie_isenta, sede_cep, sede_codigo_ibge, email_notas, nf_serie_anterior, nf_ultimo_numero, endereco_sede
      from adesoes_mova where id = ${a.id}`)
    assert.deepEqual(g, {
      cnpj: CNPJ, regime: 'mei', inscricao_estadual: '12345', ie_isenta: false, sede_cep: '01001-000', sede_codigo_ibge: '3550308',
      email_notas: 'contador@exemplo.com', nf_serie_anterior: '1', nf_ultimo_numero: '1532',
      endereco_sede: 'Rua de Teste, 100, Centro, CEP 01001-000, São Paulo – SP',
    })
  })
})

test('banco recusa inscrição estadual com pontuação mesmo se escapar da limpeza', async () => {
  await assert.rejects(db.transaction(async tx => {
    await tx.insert(adesoesMova).values({ ...BASE, inscricaoEstadual: '12.345' })
  }), /check|inscricao_estadual/)
})

test('limite por IP: a 6ª consulta em 10 minutos é recusada; outro IP e outra ação seguem', async () => {
  await emTransacaoDesfeita(async tx => {
    for (let i = 0; i < 5; i++) assert.equal(await permitirTentativa('consultar_empresa', '203.0.113.7', tx), true)
    assert.equal(await permitirTentativa('consultar_empresa', '203.0.113.7', tx), false)
    assert.equal(await permitirTentativa('consultar_empresa', '203.0.113.8', tx), true)
    assert.equal(await permitirTentativa('registrar_adesao', '203.0.113.7', tx), true)

    const [r] = await rows<{ n: number; puro: number }>(tx, sql`
      select count(*)::int n, count(*) filter (where ip_hash like '%203.0.113%')::int puro from tentativas_acao`)
    assert.equal(r.n, 7, 'a recusada não grava')
    assert.equal(r.puro, 0, 'IP puro nunca vai ao banco')
  })
})

test('registrar adesão: 3 por hora; tentativa de mais de 1 hora atrás não conta', async () => {
  await emTransacaoDesfeita(async tx => {
    for (let i = 0; i < 3; i++) assert.equal(await permitirTentativa('registrar_adesao', '198.51.100.1', tx), true)
    assert.equal(await permitirTentativa('registrar_adesao', '198.51.100.1', tx), false)
    await tx.execute(sql`update tentativas_acao set criado_em = now() - interval '61 minutes'`)
    assert.equal(await permitirTentativa('registrar_adesao', '198.51.100.1', tx), true)
  })
})

test('limpeza do cron apaga só o que passou de 1 dia', async () => {
  await emTransacaoDesfeita(async tx => {
    await permitirTentativa('consultar_empresa', '192.0.2.1', tx)
    await permitirTentativa('consultar_empresa', '192.0.2.2', tx)
    await tx.execute(sql`update tentativas_acao set criado_em = now() - interval '2 days' where id = (select min(id) from tentativas_acao)`)
    assert.equal(await apagarTentativasAntigas(tx), 1)
    const [r] = await rows<{ n: number }>(tx, sql`select count(*)::int n from tentativas_acao`)
    assert.equal(r.n, 1)
  })
})
