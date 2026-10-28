// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Nota com motos e peças (#429, decisão do Luis de 27/10): entra inteira ou não entra.
// Nada é gravado na Conta errada, e o usuário de outra Conta não usa a loja.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let nota: typeof import('@/lib/entrada-nota')
let catalogo: typeof import('@/lib/pecas-da-conta')
let saldos: typeof import('@/lib/estoque-pecas-loja')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  nota = await import('@/lib/entrada-nota')
  catalogo = await import('@/lib/pecas-da-conta')
  saldos = await import('@/lib/estoque-pecas-loja')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'EN429 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'EN429 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja EN429 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-en429' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id)
    values ('M', ${'EN429 ' + nome}, 'autopropelido', '1000', 'hub', '32', ${conta.id}) returning id`)
  const peca = await catalogo.inserirPeca(tx, conta.id, { nome: 'Capacete ' + nome, valor: 90 })
  const usuario = { id: aux.id as string, papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  return { contaId: conta.id as string, lojaId: loja.id as string, usuario, modeloId: modelo.id as string, pecaId: peca.id }
}

const NOTA = { chaveAcesso: '7'.repeat(44), numero: '50001', fornecedorCnpj: '12345678000199' }
const moto = (modeloId: string, chassi: string) => ({ chassi, cor: 'PRETO', motor: 'M1', modeloId, precoCompra: '5000', notaFiscal: NOTA.numero })
const capacete = (pecaId: string, quantidade = 3) => ({ codigo: '26302', nomeXml: 'CAPACETE AZUL', quantidade, custoUnitario: 32.61, pecaId })

const motosGravadas = (tx: Tx, chassis: string[]) =>
  linhas(tx, sql`select chassi from motos where chassi in (${sql.join(chassis.map(c => sql`${c}`), sql`, `)}) order by chassi`)

// Savepoint: a recusa desfaz só ela, e dá para conferir que nada ficou.
const tentar = (tx: Tx, e: Parameters<typeof nota.registrarNotaComPecas>[1]) =>
  tx.transaction(t => nota.registrarNotaComPecas(t, e)).then(() => null, (erro: unknown) => erro)

test('nota com motos e peças grava as duas na loja de destino', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await nota.registrarNotaComPecas(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(a.modeloId, 'EN429CHA1'), moto(a.modeloId, 'EN429CHA2')],
      pecas: [capacete(a.pecaId)],
    })
    assert.deepEqual(await motosGravadas(tx, ['EN429CHA1', 'EN429CHA2']), [{ chassi: 'EN429CHA1' }, { chassi: 'EN429CHA2' }])
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 3)
  })
})

test('nota mista grava a ficha fiscal da moto com o xProd literal da nota (ADR-0008)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const ficha = { codigo: 'MT-X12', descricao: 'X12 MOTO CHEFE &amp; CIA', ncm: '87116000', cest: '', cfopEntrada: '6102', unidade: 'UN',
      origem: '1', cstIcmsEntrada: '00', cstPis: '', cstCofins: '', classTribIbsCbs: '' }
    const emitente = { cnpj: NOTA.fornecedorCnpj, nome: 'FORNECEDOR', nfNumero: NOTA.numero, nfChave: NOTA.chaveAcesso }
    await nota.registrarNotaComPecas(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(a.modeloId, 'EN429FICHA')], fiscais: [{ chassi: 'en429ficha', emitente, ficha }],
      pecas: [capacete(a.pecaId)],
    })
    const [f] = await linhas(tx, sql`select f.x_prod from motos_fiscal f join motos m on m.id = f.moto_id where m.chassi = 'EN429FICHA'`)
    assert.equal(f.x_prod, 'X12 MOTO CHEFE &amp; CIA')
  })
})

test('o total devolvido conta só as motos com chassi e as linhas de peça', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const total = await nota.registrarNotaComPecas(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(a.modeloId, 'EN429T1'), moto(a.modeloId, '  ')],
      pecas: [capacete(a.pecaId)],
    })
    assert.deepEqual(total, { motos: 1, pecas: 1 })
  })
})

test('chassi que já existe recusa a nota inteira: as peças também não entram', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await nota.registrarNotaComPecas(tx, { usuario: a.usuario, lojaId: a.lojaId, nota: NOTA, motos: [moto(a.modeloId, 'EN429DUP')], pecas: [capacete(a.pecaId, 1)] })

    const erro = await tentar(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(a.modeloId, 'EN429NOVA'), moto(a.modeloId, 'EN429DUP')],
      pecas: [capacete(a.pecaId, 5)],
    })
    assert.ok(erro instanceof nota.NotaRecusada)
    assert.deepEqual(erro.erros, ['EN429DUP: chassi já existe no sistema'])
    assert.deepEqual(await motosGravadas(tx, ['EN429NOVA']), [])
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 1)
  })
})

test('peça recusada recusa a nota, com os erros de moto e de peça na mesma lista, e nenhuma moto entra', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const erro = await tentar(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(a.modeloId, 'EN429SOLO'), { ...moto(a.modeloId, 'EN429SEMPRECO'), precoCompra: '' }],
      pecas: [capacete(a.pecaId, 1.5)],
    })
    assert.ok(erro instanceof nota.NotaRecusada)
    assert.deepEqual(erro.erros, [
      'EN429SEMPRECO: informe o preço de compra',
      'CAPACETE AZUL: a quantidade precisa ser um número inteiro maior que zero',
    ])
    assert.deepEqual(await motosGravadas(tx, ['EN429SOLO']), [])
  })
})

test('aux_adm da Conta B não lança nota na loja da Conta A, e nada é gravado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const erro = await tentar(tx, {
      usuario: b.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(b.modeloId, 'EN429INTRUSA')],
      pecas: [capacete(b.pecaId)],
    })
    assert.ok(erro instanceof nota.NotaRecusada)
    assert.deepEqual(erro.erros, ['Loja de destino não encontrada'])
    assert.deepEqual(await motosGravadas(tx, ['EN429INTRUSA']), [])
    assert.deepEqual(await linhas(tx, sql`select 1 from pecas_estoque_loja where loja_id = ${a.lojaId}`), [])
    assert.deepEqual(await linhas(tx, sql`select 1 from notas_entrada where loja_id = ${a.lojaId}`), [])
  })
})

test('modelo próprio da Conta B não serve para moto da nota na loja da Conta A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const erro = await tentar(tx, {
      usuario: a.usuario, lojaId: a.lojaId, nota: NOTA,
      motos: [moto(b.modeloId, 'EN429MODB')],
      pecas: [capacete(a.pecaId)],
    })
    assert.ok(erro instanceof nota.NotaRecusada)
    assert.deepEqual(erro.erros, ['EN429MODB: selecione o modelo antes de registrar'])
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 0)
  })
})

test('chassi que só existe na Conta A recusa a nota da Conta B com frase neutra, e nada é gravado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    await nota.registrarNotaComPecas(tx, { usuario: a.usuario, lojaId: a.lojaId, nota: NOTA, motos: [moto(a.modeloId, 'EN429DEA')], pecas: [capacete(a.pecaId, 1)] })

    const erro = await tentar(tx, {
      usuario: b.usuario, lojaId: b.lojaId, nota: NOTA,
      motos: [moto(b.modeloId, 'EN429NOVAB'), moto(b.modeloId, 'EN429DEA')],
      pecas: [capacete(b.pecaId, 2)],
    })
    assert.ok(erro instanceof nota.NotaRecusada)
    assert.deepEqual(erro.erros, ['EN429DEA: não deu para registrar este chassi. Confira o número.'])
    assert.deepEqual(await motosGravadas(tx, ['EN429NOVAB']), [])
    assert.equal(await saldos.saldoNaLoja(tx, b.pecaId, b.lojaId), 0)
  })
})
