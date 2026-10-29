// Teste de banco: Postgres descartável, como src/lib/venda-do-usuario.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import type { DadosRenave } from '@/lib/notagateway/veiculo'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Modulo = typeof import('@/lib/renave-da-moto')
let db: Db['db']
let gravarRenaveDaMoto: Modulo['gravarRenaveDaMoto']
let renaveParaEmissao: Modulo['renaveParaEmissao']
let SEM_VENDA: Modulo['SEM_VENDA']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ gravarRenaveDaMoto, renaveParaEmissao, SEM_VENDA } = await import('@/lib/renave-da-moto'))
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

const RENAVE: DadosRenave = {
  chassi: '9C2ABC1D2EF345678', tipoOperacao: 'VendaConcessionaria', corCodigo: '11', corDescricao: 'PRETA',
  corDenatran: 'Preta', potenciaMotor: '1.36', cilindradas: '0', pesoLiquido: '0.085', pesoBruto: '0.235',
  numeroSerie: 'EF345678', tipoCombustivel: '07', numeroMotor: 'MOTORA', capacidadeMaximaTracao: '0',
  distanciaEixos: '1300', anoModelo: '2026', anoFabricacao: '2026', tipoPintura: 'S', tipoVeiculo: '02',
  especie: 'Passageiro', condicaoVin: 'Normal', condicao: 'Acabado', codigoMarcaModelo: '777777', lotacao: '2',
  restricao: 'NaoHa',
}

async function modeloCiclomotor(tx: Tx) {
  // Modelo do catálogo global (sem Conta): o mesmo modelo pode estar em duas Contas.
  const [m] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', 'RENAVE241', 'ciclomotor', '1000', 'hub', '32') returning id`)
  return m.id as string
}

async function semearConta(tx: Tx, nome: string, cnpj: string, modeloId: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'RV241 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'RV241 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja RV241 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-rv241' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${'RV241-' + nome}, ${modeloId}, ${loja.id}, 'PRETA', '1', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${moto.id}, ${loja.id}, ${aux.id}, 'efetivado') returning id`)
  await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${loja.id}, ${aux.id}, ${aux.id}, 'Cliente', '52998224725', 1000, 'pix')`)
  return {
    motoId: moto.id as string,
    grupoId: grupo.id as string,
    auxId: aux.id as string,
    aux: { papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [grupo.id as string], contaId: conta.id as string },
  }
}

const renaveDe = async (tx: Tx, motoId: string) =>
  linhas(tx, sql`select codigo_marca_modelo, numero_motor from motos_renave where moto_id = ${motoId}`)

test('a própria Conta grava o RENAVE da moto vendida', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000024101', await modeloCiclomotor(tx))
    assert.deepEqual(await gravarRenaveDaMoto(a.aux, a.motoId, RENAVE, a.auxId, tx), { ok: true })
    assert.equal((await renaveDe(tx, a.motoId))[0]?.codigo_marca_modelo, '777777')
  })
})

test('Conta B (aux e sócio) não grava nem sobrescreve o RENAVE da moto da Conta A, com a frase de moto sem venda', async () => {
  await emTransacaoDesfeita(async tx => {
    const modeloId = await modeloCiclomotor(tx)
    const a = await semearConta(tx, 'A', '00000000024102', modeloId)
    const b = await semearConta(tx, 'B', '00000000024103', modeloId)
    for (const usuario of [b.aux, b.socio]) {
      assert.deepEqual(await gravarRenaveDaMoto(usuario, a.motoId, RENAVE, b.auxId, tx), { ok: false, erro: SEM_VENDA })
    }
    assert.equal((await renaveDe(tx, a.motoId)).length, 0, 'nada gravado na moto da Conta A')

    await gravarRenaveDaMoto(a.aux, a.motoId, RENAVE, a.auxId, tx)
    for (const usuario of [b.aux, b.socio]) {
      await gravarRenaveDaMoto(usuario, a.motoId, { ...RENAVE, codigoMarcaModelo: '000001', numeroMotor: 'DA-B' }, b.auxId, tx)
    }
    assert.deepEqual(await renaveDe(tx, a.motoId), [{ codigo_marca_modelo: '777777', numero_motor: 'MOTORA' }])
    // Mesma frase de uma moto que não existe.
    assert.deepEqual(await gravarRenaveDaMoto(b.aux, crypto.randomUUID(), RENAVE, b.auxId, tx), { ok: false, erro: SEM_VENDA })
  })
})

test('a sugestão da primeira vez não herda o RENAVE do mesmo modelo de outra Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const modeloId = await modeloCiclomotor(tx)
    const a = await semearConta(tx, 'A', '00000000024104', modeloId)
    const b = await semearConta(tx, 'B', '00000000024105', modeloId)
    await gravarRenaveDaMoto(a.aux, a.motoId, RENAVE, a.auxId, tx)
    const base = { modeloId, chassi: '9C2ABC1D2EF999999', cor: 'PRETA', motor: 'MB', potenciaW: '1000', anoAtual: 2026 }

    const deB = await renaveParaEmissao({ ...base, motoId: b.motoId, grupoId: b.grupoId }, tx)
    assert.equal(deB.codigoMarcaModelo, '', 'B não recebe o código RENAVAM gravado pela Conta A')
    assert.equal(deB.distanciaEixos, '')

    // A moto da Conta A pedida com o grupo de B também não volta com os dados de A.
    const motoDeAPeloGrupoB = await renaveParaEmissao({ ...base, motoId: a.motoId, grupoId: b.grupoId }, tx)
    assert.equal(motoDeAPeloGrupoB.numeroMotor, 'MB')

    // Controle: na própria Conta a herança do modelo acontece.
    const [outra] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
      select 'RV241-A2', ${modeloId}, loja_id, 'PRETA', '1', 'vendida' from motos where id = ${a.motoId} returning id`)
    const deA = await renaveParaEmissao({ ...base, motoId: outra.id, grupoId: a.grupoId }, tx)
    assert.equal(deA.codigoMarcaModelo, '777777')
  })
})
