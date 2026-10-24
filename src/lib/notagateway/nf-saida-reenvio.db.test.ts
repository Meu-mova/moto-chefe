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

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Tentativa = typeof import('@/lib/notagateway/tentativa')
let db: Db['db']
let escolherTentativa: Tentativa['escolherTentativa']
let gravarEnvio: Tentativa['gravarEnvio']
let registrarEnvio: Tentativa['registrarEnvio']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ escolherTentativa, gravarEnvio, registrarEnvio } = await import('@/lib/notagateway/tentativa'))
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
  const [grupo] = await linhas(tx, sql`with c as (insert into contas (nome) values (${'RE347 ' + nome}) returning id)
    insert into grupos (nome, cnpj, conta_id) select ${'RE347 ' + nome}, ${cnpj}, id from c returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja RE347 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vend', ${'vend-re347' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'RE347' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  return { grupoId: grupo.id as string, lojaId: loja.id as string, vendId: vend.id as string, modeloId: modelo.id as string }
}

async function semearVenda(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>, chassi: string) {
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${c.lojaId}, ${c.vendId}) returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.vendId}, ${c.vendId}, 'Cliente', '52998224725', 1000, 'pix') returning id, numero`)
  return { id: venda.id as string, numero: venda.numero as number }
}

async function semearNota(tx: Tx, venda: { id: string, numero: number }, grupoId: string, tentativa: number, status: string, motivo: string | null) {
  const [nota] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, payload)
    values (${venda.id}, ${venda.numero}, ${grupoId}, ${`mova-${venda.numero}-${tentativa}`}, 'Producao', ${status}, ${motivo}, '1001', '{"velho":true}'::jsonb) returning id`)
  return nota.id as string
}

test('recusa comum: o reenvio usa o mesmo id e atualiza a mesma linha; a recusa anterior fica no log (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134701')
    const venda = await semearVenda(tx, c, 'RE347A')
    await semearNota(tx, venda, c.grupoId, 1, 'Negada', '225 - Rejeição: Falha no Schema XML')
    await registrarEnvio(tx, { usuarioId: c.vendId, grupoId: c.grupoId, vendaId: venda.id, numeroVenda: venda.numero, ambiente: 'Producao' },
      { id: 'x', numero: '1001', status: 'Negada', motivoStatus: '225 - Rejeição: Falha no Schema XML' })

    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.equal(escolha.idExterno, `mova-${venda.numero}-1`)
    const notaId = await gravarEnvio(tx, escolha, { vendaId: venda.id, vendaNumero: venda.numero, grupoId: c.grupoId, ambiente: 'Producao', payload: { novo: true }, emitidaPor: c.vendId })

    const notas = await linhas(tx, sql`select id, status, motivo_status, payload, numero from notas_fiscais_saida where venda_id = ${venda.id}`)
    assert.equal(notas.length, 1)
    assert.equal(notas[0].id, notaId)
    assert.equal(notas[0].status, 'Enviando')
    assert.equal(notas[0].motivo_status, null)
    assert.deepEqual(notas[0].payload, { novo: true })
    assert.equal(notas[0].numero, '1001', 'o número da nota continua o mesmo')

    const log = await linhas(tx, sql`select detalhe from log_acoes where tipo = 'nf_emitida' and grupo_id = ${c.grupoId} and detalhe->>'motivoStatus' is not null`)
    assert.equal(log.length, 1)
    assert.equal(log[0].detalhe.motivoStatus, '225 - Rejeição: Falha no Schema XML')
  })
})

test('reenvio de Negada sem log anterior (antes do deploy) registra o status e o motivo que a linha tinha (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134706')
    const venda = await semearVenda(tx, c, 'RE347L')
    const notaId = await semearNota(tx, venda, c.grupoId, 1, 'Negada', 'Nota Gateway recusou a nota: GEN002')

    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    await gravarEnvio(tx, escolha, { vendaId: venda.id, vendaNumero: venda.numero, grupoId: c.grupoId, ambiente: 'Producao', payload: {}, emitidaPor: c.vendId })

    const log = await linhas(tx, sql`select detalhe from log_acoes where tipo = 'nf_emitida' and grupo_id = ${c.grupoId}`)
    assert.equal(log.length, 1)
    assert.equal(log[0].detalhe.notaId, notaId)
    assert.equal(log[0].detalhe.statusAnterior, 'Negada')
    assert.equal(log[0].detalhe.motivoAnterior, 'Nota Gateway recusou a nota: GEN002')
  })
})

test('erro GW da Nota Gateway: o reenvio usa o mesmo id na mesma linha (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134707')
    const venda = await semearVenda(tx, c, 'RE347G')
    const notaId = await semearNota(tx, venda, c.grupoId, 1, 'Negada', 'Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.')
    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.equal(escolha.notaId, notaId)
    assert.equal(escolha.idExterno, `mova-${venda.numero}-1`)
  })
})

test('denegada: a próxima tentativa sai com id novo, numa linha nova (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134702')
    const venda = await semearVenda(tx, c, 'RE347D')
    const denegada = await semearNota(tx, venda, c.grupoId, 1, 'Negada', '301 - Uso Denegado: Irregularidade fiscal do emitente')

    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.equal(escolha.idExterno, `mova-${venda.numero}-2`)
    const notaId = await gravarEnvio(tx, escolha, { vendaId: venda.id, vendaNumero: venda.numero, grupoId: c.grupoId, ambiente: 'Producao', payload: {}, emitidaPor: c.vendId })
    assert.notEqual(notaId, denegada)
    const [antiga] = await linhas(tx, sql`select status, motivo_status from notas_fiscais_saida where id = ${denegada}`)
    assert.equal(antiga.status, 'Negada', 'a denegada fica como estava')
  })
})

test('só a última tentativa conta: recusa antiga seguida de cancelada não é reenviada (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134703')
    const venda = await semearVenda(tx, c, 'RE347U')
    await semearNota(tx, venda, c.grupoId, 1, 'Negada', '225 - Falha')
    await semearNota(tx, venda, c.grupoId, 2, 'Cancelada', null)
    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.equal(escolha.idExterno, `mova-${venda.numero}-3`)
  })
})

test('a Conta B não reenvia nem sobrescreve a nota recusada da Conta A (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000134704')
    const b = await semearConta(tx, 'B', '00000000134705')
    const vendaA = await semearVenda(tx, a, 'RE347IA')
    const notaA = await semearNota(tx, vendaA, a.grupoId, 1, 'Negada', '225 - Falha')

    // Venda da A pedida com o grupo da B: a nota da A não aparece como reenviável.
    const escolha = await escolherTentativa(tx, { vendaId: vendaA.id, grupoId: b.grupoId, numeroVenda: vendaA.numero, ambiente: 'Producao' })
    assert.equal(escolha.notaId, null)
    // Reenvio forjado com a nota da A e o grupo da B não grava nada.
    await assert.rejects(gravarEnvio(tx, { notaId: notaA, idExterno: `mova-${vendaA.numero}-1` },
      { vendaId: vendaA.id, vendaNumero: vendaA.numero, grupoId: b.grupoId, ambiente: 'Producao', payload: { b: true }, emitidaPor: b.vendId }))
    const [n] = await linhas(tx, sql`select grupo_id, status, payload from notas_fiscais_saida where id = ${notaA}`)
    assert.equal(n.grupo_id, a.grupoId)
    assert.equal(n.status, 'Negada')
    assert.deepEqual(n.payload, { velho: true })
  })
})

test('primeira emissão: id com sufixo 1, numa linha nova em Enviando com o número da venda (regressão #347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134708')
    const venda = await semearVenda(tx, c, 'RE347P')
    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.deepEqual(escolha, { notaId: null, idExterno: `mova-${venda.numero}-1`, tentativa: 1 })
    const notaId = await gravarEnvio(tx, escolha, { vendaId: venda.id, vendaNumero: venda.numero, grupoId: c.grupoId, ambiente: 'Producao', payload: { a: 1 }, emitidaPor: c.vendId })
    const [n] = await linhas(tx, sql`select id_externo, status, venda_numero, grupo_id from notas_fiscais_saida where id = ${notaId}`)
    assert.deepEqual({ ...n }, { id_externo: `mova-${venda.numero}-1`, status: 'Enviando', venda_numero: venda.numero, grupo_id: c.grupoId })
  })
})

test('tentativa descartada não é reenviada: a próxima sai com id novo (regressão #347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134709')
    const venda = await semearVenda(tx, c, 'RE347X')
    await semearNota(tx, venda, c.grupoId, 1, 'Descartada', null)
    const escolha = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.deepEqual(escolha, { notaId: null, idExterno: `mova-${venda.numero}-2`, tentativa: 2 })
  })
})

test('homologação e produção numeram separadas: a recusa de um ambiente não vira reenvio no outro (regressão #347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearConta(tx, 'A', '00000000134710')
    const venda = await semearVenda(tx, c, 'RE347H')
    const [homolog] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, payload)
      values (${venda.id}, ${venda.numero}, ${c.grupoId}, ${`mova-homolog-${venda.numero}-1`}, 'Homologacao', 'Negada', '225 - Falha', '{}'::jsonb) returning id`)

    const producao = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Producao' })
    assert.deepEqual(producao, { notaId: null, idExterno: `mova-${venda.numero}-1`, tentativa: 1 })
    const homologacao = await escolherTentativa(tx, { vendaId: venda.id, grupoId: c.grupoId, numeroVenda: venda.numero, ambiente: 'Homologacao' })
    assert.deepEqual(homologacao, { notaId: homolog.id, idExterno: `mova-homolog-${venda.numero}-1`, tentativa: 1 })
  })
})
