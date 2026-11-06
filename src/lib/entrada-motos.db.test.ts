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

// Lote do onboarding (scripts/importar-motos-xml.ts): o que entra e o que recusa o lote antes de gravar.
const ficha = { codigo: 'GIGA', descricao: 'GIGA MOTO CHEFE', ncm: '87116000', cest: '2600100', cfopEntrada: '5405', unidade: 'UN', origem: '4', cstIcmsEntrada: '60', cstPis: '01', cstCofins: '01', classTribIbsCbs: '', tpPint: '', valorUnitario: '6400.00' }
const emitente = { cnpj: '11222333000181', nome: 'Fornecedor EM', nfNumero: '9901', nfChave: '35261011222333000181550010000099011000000010' }

async function cenarioLote(tx: Tx) {
  const a = await semearContaBase(tx, { prefixo: 'EMLOTE', nome: 'A', cnpj: '33333333000191' })
  const b = await semearContaBase(tx, { prefixo: 'EMLOTE', nome: 'B', cnpj: '44444444000191' })
  const usuarioId = await semearUsuario(tx, a, { papel: 'admin_socio' })
  const r = (await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'EMLOTE GIGA', 'autopropelido', '1000', 'hub', '32') returning id`)) as unknown as { rows: { id: string }[] }
  const moto = (chassi: string) => ({ chassi, cor: 'CINZA', motor: '', modeloId: r.rows[0].id, precoCompra: '6400', notaFiscal: '9901' })
  return { a, b, usuarioId, moto }
}

const motosDoLote = async (tx: Tx, chassis: string[]) => ((await tx.execute(sql`
  select m.chassi, m.loja_id, m.grupo_entrada_id, m.status, m.nota_fiscal_entrada, f.cest, f.nf_chave,
    (select count(*)::int from historico_estoque h where h.moto_id = m.id and h.tipo = 'entrada') as historico
  from motos m left join motos_fiscal f on f.moto_id = m.id
  where m.chassi = any(${sql.param(chassis)}::text[]) order by m.chassi`)) as unknown as { rows: Record<string, unknown>[] }).rows

// Mensagem da recusa do lote; falha o teste se o lote entrar.
async function recusaDoLote(tx: Tx, e: Parameters<typeof entrada.gravarLoteDeEntrada>[1]): Promise<string> {
  try {
    await entrada.gravarLoteDeEntrada(tx, e)
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro)
  }
  throw new Error('o lote deveria ter sido recusado')
}

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
      { chassi: 'EMLOTE0000000001', loja_id: c.a.lojaId, grupo_entrada_id: c.a.grupoId, status: 'caixa', nota_fiscal_entrada: '9901', cest: '2600100', nf_chave: emitente.nfChave, historico: 1 },
      { chassi: 'EMLOTE0000000002', loja_id: c.a.lojaId, grupo_entrada_id: c.a.grupoId, status: 'caixa', nota_fiscal_entrada: '9901', cest: null, nf_chave: null, historico: 1 },
    ])
  })
})

test('lote do onboarding: chassi de outra Conta recusa o lote sem dizer que existe lá (#456)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    await entrada.gravarLoteDeEntrada(tx, { lojaId: c.b.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000009')], fiscais: [] })
    const erro = await recusaDoLote(tx, {
      lojaId: c.a.lojaId, usuarioId: c.usuarioId,
      motos: [c.moto('EMLOTE0000000003'), c.moto('EMLOTE0000000009')],
      fiscais: [{ chassi: 'EMLOTE0000000009', emitente, ficha }],
    })
    assert.match(erro, /EMLOTE0000000009: não deu para registrar este chassi\. Confira o número\./)
    assert.doesNotMatch(erro, /já existe|cadastrado/)
    const gravadas = await motosDoLote(tx, ['EMLOTE0000000003', 'EMLOTE0000000009'])
    assert.deepEqual(gravadas.map(m => [m.chassi, m.loja_id, m.cest]), [['EMLOTE0000000009', c.b.lojaId, null]], 'a da B ficou como estava, sem a ficha do lote da A')
  })
})

test('lote do onboarding: chassi já na própria Conta recusa o lote dizendo que já existe', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    await entrada.gravarLoteDeEntrada(tx, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000008')], fiscais: [] })
    const erro = await recusaDoLote(tx, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000005'), c.moto('EMLOTE0000000008')], fiscais: [] })
    assert.match(erro, /EMLOTE0000000008: chassi já existe no sistema/)
    assert.deepEqual(await motosDoLote(tx, ['EMLOTE0000000005']), [])
  })
})

const arquivar = (tx: Tx, chassi: string, usuarioId: string) =>
  tx.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${usuarioId}, motivo_arquivo = 'golpe' where chassi = ${chassi}`)

test('lote do onboarding: chassi arquivado na própria Conta orienta desarquivar pelo RADAR (#691)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    await entrada.gravarLoteDeEntrada(tx, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000010')], fiscais: [] })
    await arquivar(tx, 'EMLOTE0000000010', c.usuarioId)
    const erro = await recusaDoLote(tx, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000011'), c.moto('EMLOTE0000000010')], fiscais: [] })
    assert.match(erro, /EMLOTE0000000010: Este chassi está arquivado\. Desarquive pelo RADAR\./)
    assert.deepEqual(await motosDoLote(tx, ['EMLOTE0000000011']), [])
  })
})

test('chassi já cadastrado (#691, #456): arquivado ou ativo de outra Conta recebe a mesma frase neutra, nos dois sentidos', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    const gravar = (lojaId: string, chassi: string) => entrada.gravarLoteDeEntrada(tx, { lojaId, usuarioId: c.usuarioId, motos: [c.moto(chassi)], fiscais: [] })
    for (const [conta, ativa, arquivada] of [[c.a, 'EMLOTE00000000A1', 'EMLOTE00000000A2'], [c.b, 'EMLOTE00000000B1', 'EMLOTE00000000B2']] as const) {
      await gravar(conta.lojaId, ativa)
      await gravar(conta.lojaId, arquivada)
      await arquivar(tx, arquivada, c.usuarioId)
    }
    const neutra = (chassi: string) => `${chassi}: não deu para registrar este chassi. Confira o número.`
    assert.deepEqual(
      await entrada.recusasDeChassiCadastrado(tx, c.a.contaId, ['EMLOTE00000000A1', 'EMLOTE00000000A2', 'EMLOTE00000000B1', 'EMLOTE00000000B2', 'EMLOTE0000NOVO']),
      ['EMLOTE00000000A1: chassi já existe no sistema', 'EMLOTE00000000A2: Este chassi está arquivado. Desarquive pelo RADAR.', neutra('EMLOTE00000000B1'), neutra('EMLOTE00000000B2')],
    )
    assert.deepEqual(
      await entrada.recusasDeChassiCadastrado(tx, c.b.contaId, ['EMLOTE00000000A1', 'EMLOTE00000000A2']),
      [neutra('EMLOTE00000000A1'), neutra('EMLOTE00000000A2')],
    )
  })
})

test('insert duplicado da Entrada manual e por planilha (#691): frase neutra para outra Conta, RADAR para a arquivada, "já existe" para a ativa', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    const gravar = (lojaId: string, chassi: string) => entrada.gravarLoteDeEntrada(tx, { lojaId, usuarioId: c.usuarioId, motos: [c.moto(chassi)], fiscais: [] })
    await gravar(c.b.lojaId, 'EMLOTE00000000C1')
    await gravar(c.a.lojaId, 'EMLOTE00000000C2')
    await gravar(c.a.lojaId, 'EMLOTE00000000C3')
    await arquivar(tx, 'EMLOTE00000000C2', c.usuarioId)
    // O insert de verdade, num savepoint: a chave única do chassi recusa e a transação segue.
    const recusaDoInsert = async (chassi: string) => {
      try {
        await tx.transaction(sp => entrada.inserirMotoDaEntrada(sp, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, chassi, moto: c.moto(chassi), precoCompra: '6400' }))
      } catch (erro) {
        return entrada.recusaDoInsertDaMoto(tx, c.a.lojaId, chassi, erro)
      }
      throw new Error(`${chassi} deveria ter sido recusado`)
    }
    assert.equal(await recusaDoInsert('EMLOTE00000000C1'), 'EMLOTE00000000C1: não deu para registrar este chassi. Confira o número.')
    assert.equal(await recusaDoInsert('EMLOTE00000000C2'), 'EMLOTE00000000C2: Este chassi está arquivado. Desarquive pelo RADAR.')
    assert.equal(await recusaDoInsert('EMLOTE00000000C3'), 'EMLOTE00000000C3: chassi já existe no sistema')
  })
})

test('lote do onboarding: modelo de outra Conta recusa o lote', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenarioLote(tx)
    const r = (await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('M', 'EMLOTE SO DA B', 'autopropelido', '1000', 'hub', '32', ${c.b.contaId}) returning id`)) as unknown as { rows: { id: string }[] }
    const daB = { ...c.moto('EMLOTE0000000006'), modeloId: r.rows[0].id }
    const erro = await recusaDoLote(tx, { lojaId: c.a.lojaId, usuarioId: c.usuarioId, motos: [c.moto('EMLOTE0000000007'), daB], fiscais: [] })
    assert.match(erro, /EMLOTE0000000006: selecione o modelo antes de registrar/)
    assert.deepEqual(await motosDoLote(tx, ['EMLOTE0000000006', 'EMLOTE0000000007']), [])
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
