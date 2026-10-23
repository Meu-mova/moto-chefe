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
let db: Db['db']
let vc: typeof import('@/lib/venda-comprador')
let gravarCorrecaoDaNf: typeof import('@/lib/notagateway/correcao')['gravarCorrecaoDaNf']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  vc = await import('@/lib/venda-comprador')
  ;({ gravarCorrecaoDaNf } = await import('@/lib/notagateway/correcao'))
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

const CNPJ = '11222333000181'

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CO347 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'CO347 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja CO347 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-co347' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'CO347' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  // Cliente com o mesmo CNPJ em cada Conta: a IE gravada numa não pode chegar na outra.
  await linhas(tx, sql`insert into clientes (nome, tipo_pessoa, cpf_cnpj, conta_id, indicador_ie, inscricao_estadual)
    values ('Empresa', 'juridica', ${CNPJ}, ${conta.id}, 'contribuinte', '111')`)
  return {
    contaId: conta.id as string, grupoId: grupo.id as string, lojaId: loja.id as string, auxId: aux.id as string, modeloId: modelo.id as string,
    usuario: { papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
  }
}

async function semearVenda(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>, chassi: string, statusNota: string | null,
  motivo = '237 - Rejeição: CPF do destinatário inválido', documento = '529.982.247-25') {
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  await linhas(tx, sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, cest, x_prod) values (${moto.id}, 'X', '87116000', null, 'MOTO LITERAL')`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${c.lojaId}, ${c.auxId}) returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, cliente_celular, cliente_cidade, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, 'Cliente', ${documento}, '35999990000', 'Cidade Velha', 1000, 'pix') returning id, numero`)
  if (statusNota) {
    await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, payload)
      values (${venda.id}, ${venda.numero}, ${c.grupoId}, ${`mova-${venda.numero}-1`}, 'Producao', ${statusNota}, ${motivo}, '{}'::jsonb)`)
  }
  return { id: venda.id as string, numero: venda.numero as number, motoId: moto.id as string }
}

const vendaDb = async (tx: Tx, id: string) => (await linhas(tx, sql`select * from vendas where id = ${id}`))[0]

test('a edição da venda (formulário inteiro) grava o comprador como antes: vazio apaga, IE vai ao cliente só da Conta (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234701')
    const b = await semearConta(tx, 'B', '00000000234702')
    const venda = await semearVenda(tx, a, 'CO347E', null)
    const dados = {
      clienteNome: 'Empresa Nova', clienteCpf: CNPJ, clienteCelular: null, clienteEmail: null, clienteCep: null,
      clienteLogradouro: 'Rua A', clienteNumero: '1', clienteComplemento: null, clienteBairro: 'B', clienteCidade: 'Cidade Nova', clienteEstado: 'MG',
      representanteNome: 'Rep', representanteCpf: '11144477735', clienteIndicadorIe: 'contribuinte', clienteInscricaoEstadual: '0012345',
    }
    await vc.gravarCompradorDaVenda(tx, { id: venda.id, lojaId: a.lojaId }, vc.conferirCompradorDaVenda(dados, '529.982.247-25'))

    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_nome, 'Empresa Nova')
    assert.equal(v.cliente_cpf, '11.222.333/0001-81')
    assert.equal(v.cliente_celular, null, 'campo vazio do formulário apaga')
    assert.equal(v.cliente_cidade, 'Cidade Nova')
    assert.equal(v.representante_cpf, '111.444.777-35')
    assert.equal(v.cliente_inscricao_estadual, '0012345')
    const ies = await linhas(tx, sql`select conta_id, inscricao_estadual from clientes where cpf_cnpj = ${CNPJ} and conta_id in (${a.contaId}, ${b.contaId})`)
    assert.equal(ies.find(r => r.conta_id === a.contaId)?.inscricao_estadual, '0012345')
    assert.equal(ies.find(r => r.conta_id === b.contaId)?.inscricao_estadual, '111', 'o cliente da Conta B não é tocado')
  })
})

test('a correção da NF grava comprador e ficha e não mexe no que não veio (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234703')
    const venda = await semearVenda(tx, a, 'CO347C', 'Negada')
    await gravarCorrecaoDaNf(tx, a.usuario, venda.motoId, 'Producao', {
      comprador: { clienteNome: 'Cliente', clienteCpf: '111.444.777-35', clienteCidade: 'Cidade Certa' },
      moto: { ncm: '8711.60.00', cest: '01.077.00' },
    })
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_cpf, '111.444.777-35')
    assert.equal(v.cliente_cidade, 'Cidade Certa')
    assert.equal(v.cliente_celular, '35999990000', 'campo que a correção não mandou fica')
    const [f] = await linhas(tx, sql`select ncm, cest, x_prod from motos_fiscal where moto_id = ${venda.motoId}`)
    assert.deepEqual({ ...f }, { ncm: '87116000', cest: '0107700', x_prod: 'MOTO LITERAL' })
  })
})

test('CPF inválido barra a correção e nada é gravado (ADR-0015)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234704')
    const venda = await semearVenda(tx, a, 'CO347I', 'Negada')
    await assert.rejects(gravarCorrecaoDaNf(tx, a.usuario, venda.motoId, 'Producao', {
      comprador: { clienteNome: 'Cliente', clienteCpf: '111.111.111-11' }, moto: { ncm: '87116000', cest: '0107700' },
    }))
    assert.equal((await vendaDb(tx, venda.id)).cliente_cpf, '529.982.247-25')
    const [f] = await linhas(tx, sql`select cest from motos_fiscal where moto_id = ${venda.motoId}`)
    assert.equal(f.cest, null)
  })
})

test('só corrige se a última tentativa foi recusada com reenvio pelo mesmo número (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234705')
    const autorizada = await semearVenda(tx, a, 'CO347AU', 'Autorizada')
    await assert.rejects(gravarCorrecaoDaNf(tx, a.usuario, autorizada.motoId, 'Producao', { moto: { ncm: '87116000', cest: '' } }), /não está recusada/)
  })
})

test('usuário da Conta B não corrige a venda da Conta A e o erro não revela que ela existe (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234706')
    const b = await semearConta(tx, 'B', '00000000234707')
    const venda = await semearVenda(tx, a, 'CO347X', 'Negada')
    await assert.rejects(gravarCorrecaoDaNf(tx, b.usuario, venda.motoId, 'Producao', {
      comprador: { clienteNome: 'Invasor', clienteCpf: '111.444.777-35' }, moto: { ncm: '11111111', cest: '' },
    }), /Venda não encontrada/)
    assert.equal((await vendaDb(tx, venda.id)).cliente_nome, 'Cliente')
    const [f] = await linhas(tx, sql`select ncm from motos_fiscal where moto_id = ${venda.motoId}`)
    assert.equal(f.ncm, '87116000')
  })
})

const CNPJ_FORMATADO = '11.222.333/0001-81'

test('denegada 302: corrige só a IE do comprador, na venda e no cliente da Conta (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234708')
    const b = await semearConta(tx, 'B', '00000000234709')
    const venda = await semearVenda(tx, a, 'CO347D', 'Negada', '302 - Uso Denegado: Irregularidade fiscal do destinatário', CNPJ_FORMATADO)
    await gravarCorrecaoDaNf(tx, a.usuario, venda.motoId, 'Producao', { ieComprador: { clienteIndicadorIe: 'isento', clienteInscricaoEstadual: null } })
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_indicador_ie, 'isento')
    assert.equal(v.cliente_inscricao_estadual, null)
    assert.equal(v.cliente_nome, 'Cliente', 'o resto do comprador fica')
    const ies = await linhas(tx, sql`select conta_id, indicador_ie from clientes where cpf_cnpj = ${CNPJ} and conta_id in (${a.contaId}, ${b.contaId})`)
    assert.equal(ies.find(r => r.conta_id === a.contaId)?.indicador_ie, 'isento')
    assert.equal(ies.find(r => r.conta_id === b.contaId)?.indicador_ie, 'contribuinte', 'o cliente da Conta B não é tocado')
  })
})

test('denegada 302 não aceita outros campos; 301 não aceita nenhum (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000234710')
    const d302 = await semearVenda(tx, a, 'CO347D2', 'Negada', '302 - Uso Denegado', CNPJ_FORMATADO)
    await assert.rejects(gravarCorrecaoDaNf(tx, a.usuario, d302.motoId, 'Producao', { moto: { ncm: '87116000', cest: '' } }), /Inscrição Estadual/)
    const d301 = await semearVenda(tx, a, 'CO347D1', 'Negada', '301 - Uso Denegado: Irregularidade fiscal do emitente', CNPJ_FORMATADO)
    await assert.rejects(gravarCorrecaoDaNf(tx, a.usuario, d301.motoId, 'Producao', { ieComprador: { clienteIndicadorIe: 'isento', clienteInscricaoEstadual: null } }), /não há o que corrigir/)
  })
})
