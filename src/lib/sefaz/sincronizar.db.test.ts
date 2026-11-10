import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import https, { type RequestOptions } from 'node:https'
import { EventEmitter } from 'node:events'
import { gzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { semearContaBase, semearGrupo } from '@/test/semear-conta'
import { createTestPfx } from '@/test/certificado-pfx'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use Postgres descartável em loopback')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'b'.repeat(64)
let db: typeof import('@/lib/db')['db']
let sync: typeof import('./sincronizar')['sincronizarGrupo']
let save: typeof import('./certificado')['salvarCertificado']
let load: typeof import('./certificado')['carregarCertificado']
const requests: { body: string; pfx: Buffer }[] = []
const documents = new Map<string, string>()
// A fronteira HTTPS devolve documentos distintos conforme o CNPJ que o XML realmente pediu.
const transport = mock.method(https, 'request', ((options: RequestOptions, callback: (res: EventEmitter) => void) => {
  const request = new EventEmitter()
  return Object.assign(request, {
    end(body: string) {
      requests.push({ body, pfx: options.pfx as Buffer })
      const cnpj = /<CNPJ>([^<]+)<\/CNPJ>/.exec(body)?.[1] ?? ''
      const key = documents.get(cnpj)
      const xml = `<resNFe><chNFe>${key}</chNFe><CNPJ>11111111000191</CNPJ><xNome>FORNECEDOR TESTE</xNome><vNF>100.00</vNF><dhEmi>2026-11-09T12:00:00-03:00</dhEmi></resNFe>`
      const zipped = key ? `<loteDistDFeInt><docZip NSU="9" schema="resNFe_v1.01.xsd">${gzipSync(xml).toString('base64')}</docZip></loteDistDFeInt>` : ''
      const response = Object.assign(new EventEmitter(), { statusCode: 200 })
      queueMicrotask(() => {
        callback(response)
        response.emit('data', Buffer.from(`<retDistDFeInt><cStat>${key ? 138 : 137}</cStat><xMotivo>Teste</xMotivo><ultNSU>9</ultNSU><maxNSU>9</maxNSU>${zipped}</retDistDFeInt>`))
        response.emit('end')
      })
      return request
    },
  })
}) as typeof https.request)

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ sincronizarGrupo: sync } = await import('./sincronizar'))
  ;({ salvarCertificado: save, carregarCertificado: load } = await import('./certificado'))
})
after(async () => {
  transport.mock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})
const runId = randomUUID()
let sequence = 0
async function fixture(kind: 'parent' | 'own' | 'foreign' | 'absent' | 'different') {
  const root = `8191${String(++sequence).padStart(4, '0')}`
  const parentCnpj = `${root}000195`
  const branchCnpj = `${root}000276`
  const target = await semearContaBase(db, { prefixo: 'RAD819', nome: `filial-${runId}-${sequence}`, cnpj: branchCnpj })
  const other = await semearContaBase(db, { prefixo: 'RAD819', nome: `outra-${runId}-${sequence}`, cnpj: kind === 'foreign' ? parentCnpj : '88888888000191' })
  const parent = kind === 'parent' ? await semearGrupo(db, target.contaId, { prefixo: 'RAD819', nome: `matriz-${runId}-${sequence}`, cnpj: parentCnpj }) : null
  if (kind === 'different') await semearGrupo(db, target.contaId, { prefixo: 'RAD819', nome: `matriz-outra-raiz-${runId}-${sequence}`, cnpj: '77777777000191' })
  const key = `${sequence}`.padStart(44, '0')
  documents.clear()
  documents.set(branchCnpj, key)
  documents.set(parentCnpj, '9'.repeat(44))
  const pfx = createTestPfx(kind === 'own' ? branchCnpj : parentCnpj)
  await save(target.grupoId, pfx, 'senha-a1', 'MG')
  await db.insert(nfeRecebidas).values({ grupoId: other.grupoId, chave: key, nsu: '4', emitenteCnpj: '11111111000191', emitenteNome: 'OUTRA CONTA', valor: '999', dataEmissao: new Date('2026-01-01'), situacao: 'resumo' })
  await db.insert(nfeDfeSync).values({ grupoId: other.grupoId, ultNsu: '4', maxNsu: '8' })
  await db.insert(nfeDfeSync).values({ grupoId: target.grupoId, ultNsu: '7', maxNsu: '9' })
  requests.length = 0
  return { target, other, parent, parentCnpj, branchCnpj, key, pfx }
}
const snapshot = async (groupId: string) => ({
  notes: await db.select().from(nfeRecebidas).where(eq(nfeRecebidas.grupoId, groupId)),
  state: await db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, groupId)),
})
for (const kind of ['parent', 'own'] as const) {
  test(`Radar ${kind}: consulta o grupo, mantém A1 e não altera outra Conta`, async () => {
    const f = await fixture(kind)
    const previousOther = await snapshot(f.other.grupoId)
    const result = await sync({ id: f.target.grupoId, nome: f.target.nome })
    assert.equal(result.status, 'ok')
    assert.equal(result.documentos, 1)
    const target = await snapshot(f.target.grupoId)
    assert.deepEqual(target.notes.map(n => ({ key: n.chave, supplier: n.emitenteNome })), [{ key: f.key, supplier: 'FORNECEDOR TESTE' }])
    assert.equal(target.state[0].ultNsu, '9')
    assert.match(requests[0].body, new RegExp(`<CNPJ>${f.branchCnpj}</CNPJ>`))
    assert.match(requests[0].body, /<ultNSU>000000000000007<\/ultNSU>/)
    assert.deepEqual(requests[0].pfx, f.pfx)
    assert.equal((await load(f.target.grupoId))?.cnpj, kind === 'own' ? f.branchCnpj : f.parentCnpj)
    assert.deepEqual(await snapshot(f.other.grupoId), previousOther)
    if (f.parent) assert.deepEqual(await snapshot(f.parent.grupoId), { notes: [], state: [] })
  })
}

test('Radar recusa A1 de outra Conta ou sem grupo titular sem revelar existência', async () => {
  const errors = []
  for (const kind of ['foreign', 'absent', 'different'] as const) {
    const f = await fixture(kind)
    const beforeOther = await snapshot(f.other.grupoId)
    const result = await sync({ id: f.target.grupoId, nome: f.target.nome })
    assert.equal(result.status, 'erro')
    errors.push(result.erro)
    assert.deepEqual(requests, [], 'nenhum pedido externo com vínculo inválido')
    assert.deepEqual((await snapshot(f.target.grupoId)).notes, [])
    assert.equal((await snapshot(f.target.grupoId)).state[0].ultNsu, '7')
    assert.deepEqual(await snapshot(f.other.grupoId), beforeOther)
    const notes = await db.select().from(nfeRecebidas).where(inArray(nfeRecebidas.grupoId, [f.target.grupoId, f.other.grupoId]))
    assert.equal(notes.length, 1)
  }
  assert.deepEqual(new Set(errors), new Set(['Certificado incompatível com o grupo. Envie o certificado em /admin/certificados.']))
})
