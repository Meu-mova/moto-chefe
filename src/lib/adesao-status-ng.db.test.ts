// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import forge from 'node-forge'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'b'.repeat(64)

type Db = typeof import('@/lib/db')
let db: Db['db']
let statusNgDaAdesao: typeof import('@/lib/adesao-status-ng')['statusNgDaAdesao']
let cifrar: typeof import('@/lib/cripto')['cifrar']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ statusNgDaAdesao } = await import('@/lib/adesao-status-ng'))
  ;({ cifrar } = await import('@/lib/cripto'))
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
const VALIDADE = new Date('2030-07-13T12:00:00Z')

// A1 de teste: CN no formato da ICP-Brasil ("RAZAO:CNPJ"), que é o que lerDadosDoPfx lê.
function pfxDeTeste(cnpj: string, senha: string): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = chaves.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = VALIDADE
  const subject = [{ name: 'commonName', value: `EMPRESA TESTE:${cnpj}` }]
  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.sign(chaves.privateKey)
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, cert, senha, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')
}

async function adesao(tx: Tx, o: { cnpjDoA1?: string; senha?: string; grupoId?: string | null } = {}) {
  const pfx = cifrar(pfxDeTeste(o.cnpjDoA1 ?? CNPJ, 'senha-a1'))
  const [a] = await rows<{ id: string }>(tx, sql`
    insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, cert_arquivo, cert_senha, store_login, usuarios, cnpj, grupo_id)
    values ('Loja', 'Resp', '11999990000', 'x.pdf', ${pfx}, ${cifrar(o.senha ?? 'senha-a1')}, 'l@exemplo.com', '[]'::jsonb, ${CNPJ}, ${o.grupoId ?? null})
    returning id`)
  return a.id
}

test('A1 na adesão: mostra validade e se o CNPJ confere, sem nenhum segredo', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await statusNgDaAdesao(await adesao(tx), tx)
    assert.deepEqual(s, {
      certificado: { recebido: true, validoAte: VALIDADE.toISOString(), cnpjConfere: true, problema: null },
      cadastradaNaNg: false,
    })
    const outro = await statusNgDaAdesao(await adesao(tx, { cnpjDoA1: '00000000000191' }), tx)
    assert.equal(outro?.certificado.recebido && outro.certificado.cnpjConfere, false)
  })
})

test('senha que não abre o A1 vira problema, sem lançar', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await statusNgDaAdesao(await adesao(tx, { senha: 'errada' }), tx)
    assert.deepEqual(s?.certificado, { recebido: true, validoAte: null, cnpjConfere: null, problema: 'Não deu para abrir o certificado da adesão' })
  })
})

test('grupo com empresa na NG: diz só que está cadastrada; token e empresaId não saem', async () => {
  await emTransacaoDesfeita(async tx => {
    const [c] = await rows<{ id: string }>(tx, sql`insert into contas (nome) values ('Cliente') returning id`)
    const [g] = await rows<{ id: string }>(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Cliente', ${CNPJ}, ${c.id}) returning id`)
    await tx.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id) values (${g.id}, 'token-secreto-de-teste', 'empresa-id-de-teste')`)
    const s = await statusNgDaAdesao(await adesao(tx, { grupoId: g.id }), tx)
    assert.equal(s?.cadastradaNaNg, true)
    const json = JSON.stringify(s)
    assert.ok(!json.includes('token-secreto') && !json.includes('empresa-id-de-teste'))
  })
})

test('adesão inexistente devolve null', async () => {
  await emTransacaoDesfeita(async tx => {
    assert.equal(await statusNgDaAdesao('00000000-0000-4000-8000-000000000099', tx), null)
  })
})
