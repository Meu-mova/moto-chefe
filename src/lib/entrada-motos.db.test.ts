// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Loja de destino da entrada de motos (#488): o aux_adm com a Entrada liberada usa só
// loja da própria Conta, e loja de outra Conta recebe a mesma resposta de loja inexistente.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { nomeDeTeste, semearContaBase, semearLoja, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let entrada: typeof import('@/lib/entrada-motos')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  entrada = await import('@/lib/entrada-motos')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const base = await semearContaBase(tx, { prefixo: 'EM488', nome, cnpj })
  const loja2Id = await semearLoja(tx, base.grupoId, nomeDeTeste('EM488', nome, 'Loja 2'))
  const usuario = { papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId }
  return { lojaId: base.lojaId, loja2Id, usuario }
}

test('aux_adm usa loja da própria Conta; loja da Conta A para o aux_adm da Conta B é igual a loja inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    assert.deepEqual(await entrada.lojaDestinoDaEntrada(b.usuario, b.loja2Id, tx), { loja: { id: b.loja2Id } })
    const deOutraConta = await entrada.lojaDestinoDaEntrada(b.usuario, a.lojaId, tx)
    const inexistente = await entrada.lojaDestinoDaEntrada(b.usuario, '00000000-0000-0000-0000-000000000000', tx)
    assert.deepEqual(deOutraConta, { error: 'Loja não encontrada' })
    assert.deepEqual(deOutraConta, inexistente)
  })
})

// Lote do onboarding (scripts/importar-motos-xml.ts): tudo ou nada.
const ficha = { codigo: 'GIGA', descricao: 'GIGA MOTO CHEFE', ncm: '87116000', cest: '2600100', cfopEntrada: '5405', unidade: 'UN', origem: '4', cstIcmsEntrada: '60', cstPis: '01', cstCofins: '01', classTribIbsCbs: '', tpPint: '', valorUnitario: '6400.00' }
const emitente = { cnpj: '53780554000115', nome: 'Fornecedor EM', nfNumero: '2110', nfChave: '35260753780554000115550010000021101667320864' }

async function cenarioLote(tx: Tx) {
  const a = await semearContaBase(tx, { prefixo: 'EMLOTE', nome: 'A', cnpj: '33333333000191' })
  const b = await semearContaBase(tx, { prefixo: 'EMLOTE', nome: 'B', cnpj: '44444444000191' })
  const usuarioId = await semearUsuario(tx, a, { papel: 'admin_socio' })
  const r = (await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'EMLOTE GIGA', 'autopropelido', '1000', 'hub', '32') returning id`)) as unknown as { rows: { id: string }[] }
  const moto = (chassi: string) => ({ chassi, cor: 'CINZA', motor: '', modeloId: r.rows[0].id, precoCompra: '6400', notaFiscal: '2110' })
  return { a, b, usuarioId, moto }
}

const motosDoLote = async (tx: Tx, chassis: string[]) => ((await tx.execute(sql`
  select m.chassi, m.loja_id, m.grupo_entrada_id, m.status, m.nota_fiscal_entrada, f.cest, f.nf_chave,
    (select count(*)::int from historico_estoque h where h.moto_id = m.id and h.tipo = 'entrada') as historico
  from motos m left join motos_fiscal f on f.moto_id = m.id
  where m.chassi = any(${sql.param(chassis)}::text[]) order by m.chassi`)) as unknown as { rows: Record<string, unknown>[] }).rows

test('lote do onboarding: grava as motos na loja, com ficha fiscal e histórico de entrada', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    const r = await entrada.gravarLoteDeEntrada(tx, {
      lojaId: c.a.lojaId, usuarioId: c.usuarioId,
      motos: [c.moto('EMLOTE0000000001'), c.moto('emlote0000000002')],
      fiscais: [{ chassi: 'EMLOTE0000000001', emitente, ficha }],
    })
    assert.deepEqual(r, { motos: 2, fichas: 1 })
    assert.deepEqual(await motosDoLote(tx, ['EMLOTE0000000001', 'EMLOTE0000000002']), [
      { chassi: 'EMLOTE0000000001', loja_id: c.a.lojaId, grupo_entrada_id: c.a.grupoId, status: 'caixa', nota_fiscal_entrada: '2110', cest: '2600100', nf_chave: emitente.nfChave, historico: 1 },
      { chassi: 'EMLOTE0000000002', loja_id: c.a.lojaId, grupo_entrada_id: c.a.grupoId, status: 'caixa', nota_fiscal_entrada: '2110', cest: null, nf_chave: null, historico: 1 },
    ])
  })
})

test('lote do onboarding: um chassi já cadastrado (até em outra Conta) recusa o lote inteiro', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    await entrada.gravarLoteDeEntrada(tx, { lojaId: c.b.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000009')], fiscais: [] })
    await assert.rejects(
      entrada.gravarLoteDeEntrada(tx, {
        lojaId: c.a.lojaId, usuarioId: c.usuarioId,
        motos: [c.moto('EMLOTE0000000003'), c.moto('EMLOTE0000000009')],
        fiscais: [{ chassi: 'EMLOTE0000000009', emitente, ficha }],
      }),
      /Chassi já cadastrado, nada foi gravado: EMLOTE0000000009/,
    )
    const gravadas = await motosDoLote(tx, ['EMLOTE0000000003', 'EMLOTE0000000009'])
    assert.deepEqual(gravadas.map(m => [m.chassi, m.loja_id, m.cest]), [['EMLOTE0000000009', c.b.lojaId, null]], 'a da B ficou como estava, sem a ficha do lote da A')
  })
})

test('lote do onboarding: loja inativa ou inexistente não recebe moto', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    await tx.execute(sql`update lojas set ativa = false where id = ${c.a.lojaId}`)
    for (const lojaId of [c.a.lojaId, '00000000-0000-0000-0000-000000000000']) {
      await assert.rejects(entrada.gravarLoteDeEntrada(tx, { lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000004')], fiscais: [] }), /Loja não encontrada/)
    }
    assert.deepEqual(await motosDoLote(tx, ['EMLOTE0000000004']), [])
  })
})
