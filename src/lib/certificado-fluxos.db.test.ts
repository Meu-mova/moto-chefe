import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario, semearAdesao } from '@/test/semear-conta'
import { createTestPfx } from '@/test/certificado-pfx'
import { adesoesMova, certificadosDigitais, grupos, usuarios } from '@/lib/db/schema'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use Postgres descartável em loopback')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'b'.repeat(64)
let session: typeof usuarios.$inferSelect
let activeGroup: string
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => session } }),
  mock.module('next/headers', { namedExports: { cookies: async () => ({ get: (name: string) => name === 'grupoAtivo' ? { value: activeGroup } : undefined }) } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
]
let db: typeof import('@/lib/db')['db']
let upload: typeof import('@/app/(dashboard)/admin/certificados/actions')['enviarCertificado']
let apply: typeof import('@/app/(dashboard)/admin/adesoes/actions')['aplicarCertificadoAction']
let encrypt: typeof import('@/lib/cripto')['cifrar']
let decrypt: typeof import('@/lib/cripto')['decifrar']
let save: typeof import('@/lib/sefaz/certificado')['salvarCertificado']
before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ enviarCertificado: upload } = await import('@/app/(dashboard)/admin/certificados/actions'))
  ;({ aplicarCertificadoAction: apply } = await import('@/app/(dashboard)/admin/adesoes/actions'))
  ;({ cifrar: encrypt, decifrar: decrypt } = await import('@/lib/cripto'))
  ;({ salvarCertificado: save } = await import('@/lib/sefaz/certificado'))
})
after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const runId = randomUUID()
let sequence = 0
async function fixture(kind: 'same' | 'other' | 'absent' | 'different' | 'equal') {
  const root = `8190${String(++sequence).padStart(4, '0')}`
  const parentCnpj = `${root}000195`
  const branchCnpj = kind === 'equal' ? parentCnpj : kind === 'different' ? '99999999000276' : `${root}000276`
  const target = await semearContaBase(db, { prefixo: 'CERT819', nome: `filial-${runId}-${sequence}`, cnpj: branchCnpj })
  const foreign = await semearContaBase(db, { prefixo: 'CERT819', nome: `outra-${runId}-${sequence}`, cnpj: kind === 'other' ? parentCnpj : '88888888000191' })
  const parent = kind === 'same' || kind === 'different'
    ? await semearGrupo(db, target.contaId, { prefixo: 'CERT819', nome: `matriz-${runId}-${sequence}`, cnpj: parentCnpj })
    : null
  const userId = await semearUsuario(db, target, { papel: 'admin_geral' })
  ;[session] = await db.select().from(usuarios).where(eq(usuarios.id, userId))
  activeGroup = target.grupoId
  const pfx = createTestPfx(parentCnpj)
  const enrollmentId = await semearAdesao(db, target, { versao: 2 })
  await db.update(adesoesMova).set({ certArquivo: encrypt(pfx), certSenha: encrypt('senha-a1') }).where(eq(adesoesMova.id, enrollmentId))
  if (parent) await save(parent.grupoId, createTestPfx(parentCnpj), 'senha-a1', 'MG')
  await save(target.grupoId, createTestPfx(branchCnpj), 'senha-a1', 'MG')
  await save(foreign.grupoId, createTestPfx('88888888000191'), 'senha-a1', 'MG')
  return { target, foreign, parent, parentCnpj, branchCnpj, pfx, enrollmentId }
}
function form(pfx: Buffer, password = 'senha-a1', uf = 'MG') {
  const data = new FormData()
  data.set('arquivo', new File([new Uint8Array(pfx)], 'teste.pfx'))
  data.set('senha', password)
  data.set('uf', uf)
  return data
}
const certificates = (ids: string[]) => db.select().from(certificadosDigitais).where(inArray(certificadosDigitais.grupoId, ids)).orderBy(certificadosDigitais.grupoId)
const enrollment = async (id: string) => (await db.select().from(adesoesMova).where(eq(adesoesMova.id, id)))[0]

for (const flow of ['upload', 'adesao'] as const) {
  for (const kind of ['same', 'other', 'absent', 'different', 'equal'] as const) {
    test(`${flow}: certificado ${kind} respeita Conta, mensagem e gravação`, async () => {
      const f = await fixture(kind)
      const ids = [f.target.grupoId, f.foreign.grupoId, ...(f.parent ? [f.parent.grupoId] : [])]
      if (flow === 'adesao' && kind === 'same') activeGroup = f.foreign.grupoId
      const previous = await certificates(ids)
      const previousEnrollment = await enrollment(f.enrollmentId)
      const result = flow === 'upload' ? await upload(form(f.pfx)) : await apply(f.enrollmentId, 'MG')
      if (kind === 'same' || kind === 'equal') {
        if (flow === 'adesao' && kind === 'same') assert.equal(activeGroup, f.foreign.grupoId)
        assert.deepEqual(result, { ok: true, titular: 'EMPRESA TESTE' })
        const current = await certificates(ids)
        assert.equal(current.length, ids.length)
        const target = current.find(c => c.grupoId === f.target.grupoId)!
        assert.equal(target.cnpj, f.parentCnpj)
        assert.deepEqual(decrypt(target.arquivo), f.pfx)
        assert.equal(decrypt(target.senha).toString(), 'senha-a1')
        assert.notEqual(target.arquivo, f.pfx.toString('base64'))
        for (const otherGroup of ids.filter(id => id !== f.target.grupoId)) {
          assert.deepEqual(current.find(c => c.grupoId === otherGroup), previous.find(c => c.grupoId === otherGroup))
        }
        if (flow === 'adesao') {
          const a = await enrollment(f.enrollmentId)
          assert.equal(a.certArquivo, null)
          assert.equal(a.certSenha, null)
          assert.ok(a.certificadoAplicadoEm)
        } else {
          assert.deepEqual(await upload(form(f.pfx)), result)
          assert.equal((await certificates(ids)).length, ids.length)
        }
      } else {
        const [group] = await db.select().from(grupos).where(eq(grupos.id, f.target.grupoId))
        const message = flow === 'upload'
          ? `Este certificado é de EMPRESA TESTE (CNPJ ${f.parentCnpj}), e o grupo ativo é ${group.nome} (CNPJ ${f.branchCnpj}). Troque de grupo no topo da tela ou envie o certificado certo.`
          : `O certificado da adesão é de EMPRESA TESTE (CNPJ ${f.parentCnpj}), e o grupo ${group.nome} é do CNPJ ${f.branchCnpj}.`
        assert.deepEqual(result, { ok: false, erro: message })
        assert.deepEqual(await certificates(ids), previous)
        assert.deepEqual(await enrollment(f.enrollmentId), previousEnrollment)
      }
    })
  }
}

test('ações recusam personas não admin_geral antes de gravar', async () => {
  const f = await fixture('same')
  const previous = await certificates([f.target.grupoId, f.foreign.grupoId])
  const previousEnrollment = await enrollment(f.enrollmentId)
  for (const role of ['admin_socio', 'admin_rede', 'aux_adm', 'vendedor', 'mecanico']) {
    const id = await semearUsuario(db, f.target, { papel: role, comConta: true, comGrupo: true })
    ;[session] = await db.select().from(usuarios).where(eq(usuarios.id, id))
    assert.deepEqual(await upload(form(f.pfx)), { ok: false, erro: 'Sem permissão' })
    await assert.rejects(apply(f.enrollmentId, 'MG'), /Acesso restrito ao Admin Geral/)
  }
  assert.deepEqual(await certificates([f.target.grupoId, f.foreign.grupoId]), previous)
  assert.deepEqual(await enrollment(f.enrollmentId), previousEnrollment)
})

test('senha, arquivo e UF inválidos não substituem certificado', async () => {
  const f = await fixture('equal')
  const previous = await certificates([f.target.grupoId])
  for (const data of [form(f.pfx, 'errada'), form(Buffer.from('inválido')), form(f.pfx, 'senha-a1', 'XX'), form(Buffer.alloc(0))]) {
    const result = await upload(data)
    assert.equal(result.ok, false)
    assert.deepEqual(await certificates([f.target.grupoId]), previous)
  }
})
