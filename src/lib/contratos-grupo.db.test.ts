// Teste de banco: Postgres descartável, como src/lib/venda-do-usuario.db.test.ts.
// Local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
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
type Mod = typeof import('@/lib/contratos-grupo')
let db: Db['db']
let m: Mod
let montarHtmlDocumento: typeof import('@/lib/assinatura/documento')['montarHtmlDocumento']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/contratos-grupo')
  ;({ montarHtmlDocumento } = await import('@/lib/assinatura/documento'))
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

const TEXTO = '# CONTRATO DE {modelo}\n{comprador_qualificacao}\nChassi {chassi}, R$ {valor} ({valor_extenso}).'

const DADOS = {
  vendaId: 'x', clienteNome: 'Cliente', clienteCpf: '52998224725', clienteEmail: 'c@teste.invalid',
  clienteEndereco: 'Rua', vendedoraRazaoSocial: 'Empresa', vendedoraCnpj: '11222333000181',
  vendedoraEndereco: 'Sede', cidadeSede: 'Cidade', comarcaForo: 'Cidade', lojaNome: 'Loja', lojaCidade: 'Cidade',
  marca: 'M', modelo: 'X11', chassi: 'CHASSI1', cor: 'Azul', motor: '', valor: '1.000,00',
  formaPagamento: 'pix', pagamentos: [], dataVenda: '29/10/2026',
}

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CG ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'CG ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja CG ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
    values (gen_random_uuid(), 'Aux', ${'aux-cg' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}, ${conta.id}) returning id`)
  return {
    contaId: conta.id as string, grupoId: grupo.id as string, lojaId: loja.id as string, auxId: aux.id as string,
    socio: { papel: 'admin_socio', contaId: conta.id as string },
    aux: { id: aux.id as string, papel: 'aux_adm', contaId: conta.id as string },
  }
}

async function venderModelo(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>, categoria: string, chassi: string) {
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'CG ' + chassi}, ${categoria}, '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${chassi}, ${modelo.id}, ${c.lojaId}, 'AZUL', '1', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}, 'efetivado') returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, 'Cliente', '52998224725', 1000, 'pix') returning id`)
  return { vendaId: venda.id as string, modeloId: modelo.id as string }
}

test('sócio salva o contrato do grupo; cada salvar é uma versão nova', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    assert.deepEqual(await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO }, tx), { ok: true, versao: 1 })
    assert.deepEqual(await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO + '\nfim' }, tx), { ok: true, versao: 2 })
    assert.deepEqual(await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'autopropelido', texto: TEXTO }, tx), { ok: true, versao: 1 })
    const versoes = await m.listarContratosDoGrupo(a.aux, a.grupoId, tx)
    assert.deepEqual(versoes!.map(v => [v.categoria, v.versao]), [['autopropelido', 1], ['ciclomotor', 2], ['ciclomotor', 1]])
  })
})

test('salvar recusa texto sem chassi ou com campo desconhecido, e não grava nada', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const r1 = await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: '{cliente_nome} {valor}' }, tx)
    assert.equal(r1.ok, false)
    assert.match(!r1.ok ? r1.erro : '', /chassi/)
    const r2 = await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO + ' {placa}' }, tx)
    assert.match(!r2.ok ? r2.erro : '', /\{placa\}/)
    assert.equal(await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'moto', texto: TEXTO }, tx).then(r => r.ok), false)
    assert.deepEqual(await linhas(tx, sql`select 1 from contratos_grupo where grupo_id = ${a.grupoId}`), [])
  })
})

test('aux_adm vê o contrato mas não edita', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    assert.deepEqual(await m.salvarContratoGrupo(a.aux, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO }, tx),
      { ok: false, erro: 'Sem permissão para editar o contrato' })
    assert.deepEqual(await m.listarContratosDoGrupo(a.aux, a.grupoId, tx), [])
    assert.equal(await m.listarContratosDoGrupo({ papel: 'vendedor', contaId: a.contaId }, a.grupoId, tx), null)
  })
})

test('Conta B não lê nem grava contrato do grupo da Conta A; a recusa é igual a grupo inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const b = await semearConta(tx, 'B', '00000000000272')
    await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO }, tx)

    assert.equal(await m.listarContratosDoGrupo(b.socio, a.grupoId, tx), null)
    assert.equal(await m.listarContratosDoGrupo(b.aux, a.grupoId, tx), null)
    const deB = await m.salvarContratoGrupo(b.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO + ' B' }, tx)
    const inexistente = await m.salvarContratoGrupo(b.socio, { grupoId: '00000000-0000-4000-8000-000000000000', categoria: 'ciclomotor', texto: TEXTO }, tx)
    assert.deepEqual(deB, { ok: false, erro: 'Grupo não encontrado' })
    assert.deepEqual(deB, inexistente)
    const textos = await linhas(tx, sql`select texto from contratos_grupo where grupo_id = ${a.grupoId}`)
    assert.deepEqual(textos.map(t => t.texto), [TEXTO])

    // Venda de ciclomotor da B não pega o contrato da A.
    const vendaB = await venderModelo(tx, b, 'ciclomotor', 'CHB1')
    assert.equal((await m.contratoDaVenda(vendaB.vendaId, b.grupoId, DADOS, tx)).ok, false)
    // E a venda da B, pedida com o grupo da A, não acha categoria.
    assert.equal(await m.categoriaDaVenda(vendaB.vendaId, a.grupoId, tx), null)
  })
})

test('admin_geral edita o contrato de qualquer grupo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    assert.deepEqual(await m.salvarContratoGrupo({ papel: 'admin_geral', contaId: null }, { grupoId: a.grupoId, categoria: 'triciclo', texto: TEXTO }, tx),
      { ok: true, versao: 1 })
  })
})

test('a venda usa o contrato do grupo pela categoria, na versão mais nova', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const venda = await venderModelo(tx, a, 'ciclomotor', 'CHA1')
    await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO }, tx)
    await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'ciclomotor', texto: TEXTO + '\nVersão dois.' }, tx)
    const [v2] = await linhas(tx, sql`select id from contratos_grupo where grupo_id = ${a.grupoId} and versao = 2`)

    const r = await m.contratoDaVenda(venda.vendaId, a.grupoId, DADOS, tx)
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.contratoGrupoId, v2.id)
    assert.ok(r.html.includes('<h1>CONTRATO DE X11</h1>'))
    assert.ok(r.html.includes('R$ 1.000,00 (mil reais)'))
    assert.ok(r.html.includes('Versão dois.'))
  })
})

test('a categoria ajustada pela Conta vale sobre a do modelo da plataforma', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const b = await semearConta(tx, 'B', '00000000000272')
    const venda = await venderModelo(tx, a, 'autopropelido', 'CHA2')
    await linhas(tx, sql`insert into modelo_ajustes (conta_id, modelo_id, categoria) values (${a.contaId}, ${venda.modeloId}, 'ciclomotor')`)
    // Ajuste de outra Conta no mesmo modelo não conta para a venda da A.
    await linhas(tx, sql`insert into modelo_ajustes (conta_id, modelo_id, categoria) values (${b.contaId}, ${venda.modeloId}, 'triciclo')`)
    assert.equal(await m.categoriaDaVenda(venda.vendaId, a.grupoId, tx), 'ciclomotor')
  })
})

test('sem contrato do grupo: autopropelido usa o texto do MOVA, idêntico; ciclomotor não gera e avisa', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const auto = await venderModelo(tx, a, 'autopropelido', 'CHA3')
    const ciclo = await venderModelo(tx, a, 'ciclomotor', 'CHA4')
    // Contrato de ciclomotor de OUTRO grupo da mesma Conta não serve para este.
    const [outro] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('CG A2', '49366097000140', ${a.contaId}) returning id`)
    await m.salvarContratoGrupo(a.socio, { grupoId: outro.id, categoria: 'ciclomotor', texto: TEXTO }, tx)

    assert.deepEqual(await m.contratoDaVenda(auto.vendaId, a.grupoId, DADOS, tx),
      { ok: true, html: montarHtmlDocumento('contrato_venda', DADOS), contratoGrupoId: null })
    assert.deepEqual(await m.contratoDaVenda(ciclo.vendaId, a.grupoId, DADOS, tx), {
      ok: false, aviso: 'Esta empresa ainda não cadastrou o contrato de venda de ciclomotor. Fale com o administrador.',
    })
  })
})

test('grupo com contrato próprio de autopropelido usa o dele, não o do MOVA', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11222333000181')
    const auto = await venderModelo(tx, a, 'autopropelido', 'CHA5')
    await m.salvarContratoGrupo(a.socio, { grupoId: a.grupoId, categoria: 'autopropelido', texto: TEXTO }, tx)
    const r = await m.contratoDaVenda(auto.vendaId, a.grupoId, DADOS, tx)
    assert.ok(r.ok && r.contratoGrupoId && r.html.includes('<h1>CONTRATO DE X11</h1>'))
  })
})
