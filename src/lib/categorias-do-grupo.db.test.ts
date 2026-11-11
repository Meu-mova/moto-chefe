// Teste de banco: Postgres descartável, como src/lib/maquininhas-admin.db.test.ts.
// Categorias de despesa e de caixa por grupo (#834): a Conta B não vê, não edita, não apaga e não
// usa na classificação as categorias da Conta A.
// Os casos de cadastro rodam numa transação desfeita; configDespesas e o DRE usam o db global, então
// esses gravam de verdade e o after apaga pelo prefixo CAT834 e pelos CNPJs do teste.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let admin: typeof import('@/lib/categorias-admin')
let leitura: typeof import('@/lib/categorias-do-grupo')
let configDespesas: typeof import('@/lib/queries/config-despesas')['configDespesas']
let dreDoMes: typeof import('@/lib/queries/dre')['dreDoMes']

const CNPJS_GLOBAIS = ['83400000000101', '83400000000202']
const NAO_ENCONTRADA = { message: 'Categoria não encontrada' }
const REPETIDA = { message: 'Já existe uma categoria com esse nome' }

before(async () => {
  ;({ db } = await import('@/lib/db'))
  admin = await import('@/lib/categorias-admin')
  leitura = await import('@/lib/categorias-do-grupo')
  ;({ configDespesas } = await import('@/lib/queries/config-despesas'))
  ;({ dreDoMes } = await import('@/lib/queries/dre'))
})

after(async () => {
  await db.execute(sql`delete from despesas where categoria like 'CAT834 %'`)
  await db.execute(sql`delete from categorias_despesa where nome like 'CAT834 %'`)
  await db.execute(sql`delete from categorias_caixa where nome like 'CAT834 %'`)
  await db.execute(sql`delete from usuarios where email like '%-cat834-%@teste.invalid'`)
  await db.execute(sql`delete from lojas where grupo_id in (select id from grupos where cnpj in (${sql.join(CNPJS_GLOBAIS.map(c => sql`${c}`), sql`, `)}))`)
  await db.execute(sql`delete from grupos where cnpj in (${sql.join(CNPJS_GLOBAIS.map(c => sql`${c}`), sql`, `)})`)
  await db.execute(sql`delete from contas where nome like 'CAT834 %'`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

type Exec = Pick<Db['db'], 'execute'>

/** Conta + grupo + loja + sócio: o mínimo para gravar despesa e lançamento de caixa. */
async function semearGrupo(exec: Exec, nome: string, cnpj: string) {
  const base = await semearContaBase(exec, { prefixo: 'CAT834', nome, cnpj })
  return { ...base, usuarioId: await semearUsuario(exec, base, { papel: 'admin_socio' }) }
}

async function despesa(exec: Exec, g: { grupoId: string; lojaId: string; usuarioId: string }, categoria: string, data = '2026-09-10') {
  await exec.execute(sql`insert into despesas (grupo_id, loja_id, usuario_id, categoria, valor, data, forma_pagamento, banco)
    values (${g.grupoId}, ${g.lojaId}, ${g.usuarioId}, ${categoria}, '100.00', ${data}, 'Pix', 'Banco')`)
}

const OPERACIONAL = { contaComoDespesa: true, motivoNaoOperacional: null, grupoDre: null }
const nomesDespesa = async (exec: Tx, grupoId: string) => (await leitura.categoriasDespesaDoGrupo(exec, grupoId)).map(c => c.nome)
const nomesCaixa = async (exec: Tx, grupoId: string) => (await leitura.categoriasCaixaDoGrupo(exec, grupoId)).map(c => c.nome)

test('categoria criada no grupo A aparece só no A (despesa e caixa) (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Cria A', '83400000001001')
    const b = await semearGrupo(tx, 'Cria B', '83400000001002')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Aluguel', ...OPERACIONAL })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Troco', tipo: 'saida' })

    assert.ok((await nomesDespesa(tx, a.grupoId)).includes('CAT834 Aluguel'))
    assert.ok((await nomesCaixa(tx, a.grupoId)).includes('CAT834 Troco'))
    assert.ok(!(await nomesDespesa(tx, b.grupoId)).includes('CAT834 Aluguel'), 'B não vê a despesa do A')
    assert.ok(!(await nomesCaixa(tx, b.grupoId)).includes('CAT834 Troco'), 'B não vê o caixa do A')
  })
})

test('grupo B não edita, não exclui nem liga/desliga categoria do A; mesma frase do id inexistente (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Edita A', '83400000002001')
    const b = await semearGrupo(tx, 'Edita B', '83400000002002')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Frete', ...OPERACIONAL })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Deposito', tipo: 'saida' })
    const [despA] = (await leitura.categoriasDespesaDoGrupo(tx, a.grupoId)).filter(c => c.nome === 'CAT834 Frete')
    const [caixaA] = (await leitura.categoriasCaixaDoGrupo(tx, a.grupoId)).filter(c => c.nome === 'CAT834 Deposito')
    const inexistente = '00000000-0000-4000-8000-000000000834'

    for (const id of [despA.id, inexistente]) {
      await assert.rejects(admin.editarCategoriaDespesa(tx, b.grupoId, id, { nome: 'CAT834 Invadida', ...OPERACIONAL }), NAO_ENCONTRADA)
      await assert.rejects(admin.definirCategoriaDespesaAtiva(tx, b.grupoId, id, false), NAO_ENCONTRADA)
      await assert.rejects(admin.excluirCategoriaDespesa(tx, b.grupoId, id), NAO_ENCONTRADA)
    }
    for (const id of [caixaA.id, inexistente]) {
      await assert.rejects(admin.editarCategoriaCaixa(tx, b.grupoId, id, { nome: 'CAT834 Invadida', tipo: 'entrada' }), NAO_ENCONTRADA)
      await assert.rejects(admin.definirCategoriaCaixaAtiva(tx, b.grupoId, id, false), NAO_ENCONTRADA)
      await assert.rejects(admin.definirContaComoDespesaCaixa(tx, b.grupoId, id, false), NAO_ENCONTRADA)
      await assert.rejects(admin.excluirCategoriaCaixa(tx, b.grupoId, id), NAO_ENCONTRADA)
    }

    const [despDepois] = (await leitura.categoriasDespesaDoGrupo(tx, a.grupoId)).filter(c => c.id === despA.id)
    assert.deepEqual([despDepois?.nome, despDepois?.ativo], ['CAT834 Frete', true], 'despesa do A intacta')
    const [caixaDepois] = (await leitura.categoriasCaixaDoGrupo(tx, a.grupoId)).filter(c => c.id === caixaA.id)
    assert.deepEqual([caixaDepois?.nome, caixaDepois?.tipo, caixaDepois?.ativo, caixaDepois?.contaComoDespesa],
      ['CAT834 Deposito', 'saida', true, true], 'caixa do A intacto')
  })
})

test('mesmo nome em A e B pode; repetido no mesmo grupo não, nem com caixa e espaço diferentes (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Nome A', '83400000003001')
    const b = await semearGrupo(tx, 'Nome B', '83400000003002')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Energia', ...OPERACIONAL })
    await admin.criarCategoriaDespesa(tx, b.grupoId, { nome: 'CAT834 Energia', ...OPERACIONAL })
    await assert.rejects(admin.criarCategoriaDespesa(tx, a.grupoId, { nome: ' cat834 energia ', ...OPERACIONAL }), REPETIDA)

    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Agua', ...OPERACIONAL })
    const [agua] = (await leitura.categoriasDespesaDoGrupo(tx, a.grupoId)).filter(c => c.nome === 'CAT834 Agua')
    await assert.rejects(admin.editarCategoriaDespesa(tx, a.grupoId, agua.id, { nome: 'CAT834 ENERGIA', ...OPERACIONAL }), REPETIDA)
    // Renomear para o próprio nome não é repetição.
    await admin.editarCategoriaDespesa(tx, a.grupoId, agua.id, { nome: 'CAT834 Agua', ...OPERACIONAL })

    assert.equal((await nomesDespesa(tx, a.grupoId)).filter(n => n.toLowerCase() === 'cat834 energia').length, 1)
  })
})

test('caixa: o mesmo nome vale uma vez por tipo no grupo (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Tipo A', '83400000004001')
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Ajuste', tipo: 'entrada' })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Ajuste', tipo: 'saida' })
    await assert.rejects(admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'cat834 ajuste', tipo: 'saida' }), REPETIDA)

    const [entrada] = (await leitura.categoriasCaixaDoGrupo(tx, a.grupoId)).filter(c => c.tipo === 'entrada' && c.nome === 'CAT834 Ajuste')
    await assert.rejects(admin.editarCategoriaCaixa(tx, a.grupoId, entrada.id, { nome: 'CAT834 Ajuste', tipo: 'saida' }), REPETIDA)
    assert.equal((await nomesCaixa(tx, a.grupoId)).filter(n => n === 'CAT834 Ajuste').length, 2)
  })
})

test('excluir categoria com lançamento no grupo recusa e orienta desativar; sem lançamento no grupo exclui (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Exclui A', '83400000005001')
    const b = await semearGrupo(tx, 'Exclui B', '83400000005002')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Usada', ...OPERACIONAL })
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 SoNoB', ...OPERACIONAL })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Gaveta', tipo: 'saida' })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Gaveta', tipo: 'entrada' })
    await despesa(tx, a, 'cat834 usada')
    await despesa(tx, b, 'CAT834 SoNoB')
    await tx.execute(sql`insert into lancamentos_caixa (loja_id, usuario_id, tipo, categoria, valor, data)
      values (${a.lojaId}, ${a.usuarioId}, 'saida', 'CAT834 Gaveta', '10.00', '2026-09-10')`)
    const doA = await leitura.categoriasDespesaDoGrupo(tx, a.grupoId)
    const usada = doA.find(c => c.nome === 'CAT834 Usada')!
    const soNoB = doA.find(c => c.nome === 'CAT834 SoNoB')!
    const caixaDoA = await leitura.categoriasCaixaDoGrupo(tx, a.grupoId)
    const gaveta = caixaDoA.find(c => c.nome === 'CAT834 Gaveta' && c.tipo === 'saida')!
    const gavetaEntrada = caixaDoA.find(c => c.nome === 'CAT834 Gaveta' && c.tipo === 'entrada')!

    const recusa = { message: 'Esta categoria já tem lançamentos. Desative em vez de excluir.' }
    await assert.rejects(admin.excluirCategoriaDespesa(tx, a.grupoId, usada.id), recusa)
    await assert.rejects(admin.excluirCategoriaCaixa(tx, a.grupoId, gaveta.id), recusa)
    assert.ok((await nomesDespesa(tx, a.grupoId)).includes('CAT834 Usada'))
    assert.ok((await nomesCaixa(tx, a.grupoId)).includes('CAT834 Gaveta'))

    // O lançamento com o mesmo nome é do B: no A a categoria não tem uso e sai.
    await admin.excluirCategoriaDespesa(tx, a.grupoId, soNoB.id)
    assert.ok(!(await nomesDespesa(tx, a.grupoId)).includes('CAT834 SoNoB'))
    // O lançamento é de saída: a "Gaveta" de entrada não tem uso e sai.
    await admin.excluirCategoriaCaixa(tx, a.grupoId, gavetaEntrada.id)
    assert.deepEqual((await leitura.categoriasCaixaDoGrupo(tx, a.grupoId)).filter(c => c.nome === 'CAT834 Gaveta').map(c => c.tipo), ['saida'])
  })
})

test('contagem de lançamentos da categoria só vê o próprio grupo (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Conta A', '83400000006001')
    const b = await semearGrupo(tx, 'Conta B', '83400000006002')
    await despesa(tx, a, 'CAT834 Contada')
    await despesa(tx, b, 'CAT834 Contada')
    await despesa(tx, b, 'CAT834 Contada')
    assert.equal(await admin.contarLancamentosDaCategoriaDespesa(tx, a.grupoId, 'CAT834 Contada'), 1)
    assert.equal(await admin.contarLancamentosDaCategoriaDespesa(tx, b.grupoId, 'CAT834 Contada'), 2)
  })
})

test('gravar lançamento confere a categoria no grupo: a do A é "não encontrada" no B (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Grava A', '83400000007001')
    const b = await semearGrupo(tx, 'Grava B', '83400000007002')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 SoDoA', ...OPERACIONAL })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 CaixaDoA', tipo: 'saida' })

    await assert.rejects(leitura.conferirCategoriaDespesa(tx, b.grupoId, 'CAT834 SoDoA'), NAO_ENCONTRADA)
    await assert.rejects(leitura.conferirCategoriaCaixaDaLoja(tx, b.lojaId, 'CAT834 CaixaDoA'), NAO_ENCONTRADA)
    assert.deepEqual(await leitura.conferirCategoriaDespesa(tx, a.grupoId, 'CAT834 SoDoA'), { exigeBeneficiario: false })
    await leitura.conferirCategoriaCaixaDaLoja(tx, a.lojaId, 'CAT834 CaixaDoA')

    // Inativa continua valendo: a despesa antiga segue editável.
    const [soDoA] = (await leitura.categoriasDespesaDoGrupo(tx, a.grupoId)).filter(c => c.nome === 'CAT834 SoDoA')
    await admin.definirCategoriaDespesaAtiva(tx, a.grupoId, soDoA.id, false)
    assert.deepEqual(await leitura.conferirCategoriaDespesa(tx, a.grupoId, 'CAT834 SoDoA'), { exigeBeneficiario: false })
  })
})

test('configDespesas e DRE do B não usam a classificação que o A deu à categoria (#834)', async () => {
  const a = await semearGrupo(db, 'Global A', CNPJS_GLOBAIS[0])
  const b = await semearGrupo(db, 'Global B', CNPJS_GLOBAIS[1])
  await admin.criarCategoriaDespesa(db, a.grupoId, { nome: 'CAT834 Retirada', contaComoDespesa: false, motivoNaoOperacional: 'retirada_socio', grupoDre: null })
  await admin.criarCategoriaCaixa(db, a.grupoId, { nome: 'CAT834 Sangria', tipo: 'saida' })
  const [sangria] = (await leitura.categoriasCaixaDoGrupo(db, a.grupoId)).filter(c => c.nome === 'CAT834 Sangria')
  await admin.definirContaComoDespesaCaixa(db, a.grupoId, sangria.id, false)
  await admin.criarCategoriaDespesa(db, a.grupoId, { nome: 'CAT834 Folha', contaComoDespesa: true, motivoNaoOperacional: null, grupoDre: 'pessoal' })

  const configA = await configDespesas(a.grupoId)
  assert.ok(configA.categoriasForaDoCalculo.has('CAT834 Retirada'), 'no A a categoria fica fora')
  assert.ok(configA.categoriasCaixaForaDoCalculo?.has('CAT834 Sangria'))

  const configB = await configDespesas(b.grupoId)
  assert.ok(!configB.categoriasForaDoCalculo.has('CAT834 Retirada'), 'B não herda a despesa fora do cálculo do A')
  assert.ok(!configB.motivoPorCategoria?.has('CAT834 Retirada'))
  assert.ok(!configB.categoriasCaixaForaDoCalculo?.has('CAT834 Sangria'), 'B não herda o caixa fora do cálculo do A')

  // B lança com o mesmo nome que o A classificou como "pessoal": no B ela não tem linha do DRE.
  await despesa(db, b, 'CAT834 Folha')
  const dreB = await dreDoMes({ grupoId: b.grupoId, lojaIds: [b.lojaId], ano: 2026, mes: 9 })
  assert.deepEqual(dreB.semGrupo, ['CAT834 Folha'])
  assert.deepEqual(dreB.colunas.map(c => c.entrada.despesasPorGrupo), [{ outras: 100 }])
})

test('mesma categoria com outra grafia (caixa e espaços): confere, conta e casa com o catálogo (#834)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'Grafia A', '83400000008001')
    await admin.criarCategoriaDespesa(tx, a.grupoId, { nome: 'CAT834 Estorno', ...OPERACIONAL })
    await admin.criarCategoriaCaixa(tx, a.grupoId, { nome: 'CAT834 Sangria', tipo: 'saida' })
    await despesa(tx, a, 'CAT834 ESTORNO')
    await despesa(tx, a, ' cat834 estorno ')

    assert.deepEqual(await leitura.conferirCategoriaDespesa(tx, a.grupoId, 'cat834 ESTORNO '), { exigeBeneficiario: false })
    await leitura.conferirCategoriaCaixaDaLoja(tx, a.lojaId, ' CAT834 sangria')
    assert.equal(await admin.contarLancamentosDaCategoriaDespesa(tx, a.grupoId, 'CAT834 Estorno'), 2)
  })
})
