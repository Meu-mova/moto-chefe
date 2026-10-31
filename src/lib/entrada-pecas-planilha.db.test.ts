// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Entrada de peças por planilha (#519): grava na Conta da loja de destino, fica
// registrada como "planilha" e nunca lê nem se liga a peça, vínculo ou loja de outra Conta.
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
let entrada: typeof import('@/lib/entrada-pecas')
let catalogo: typeof import('@/lib/pecas-da-conta')
let saldos: typeof import('@/lib/estoque-pecas-loja')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  entrada = await import('@/lib/entrada-pecas')
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'EP519 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'EP519 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja EP519 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), ${'Aux ' + nome}, ${'aux-ep519' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  // Mesmo nome nas duas Contas: a sugestão por nome não pode cruzar.
  const peca = await catalogo.inserirPeca(tx, conta.id, { nome: 'Capacete EP519', valor: 90 })
  const usuario = { id: aux.id as string, papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  return { contaId: conta.id as string, lojaId: loja.id as string, usuario, pecaId: peca.id }
}

const FORNECEDOR = '11222333000181'
const ITEM = { codigo: 'C1', nomeXml: 'capacete ep519 ', quantidade: 3, custoUnitario: 40 }
const LUVA = { codigo: 'L1', nomeXml: 'Luva EP519', quantidade: 2, custoUnitario: 10 }

test('planilha sem CNPJ: grava saldo, custo e peça nova, registra a entrada como planilha e não cria vínculo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await entrada.gravarEntradaPlanilhaPecas(tx, {
      lojaId: a.lojaId, usuario: a.usuario, fornecedorCnpj: null,
      linhas: [{ ...ITEM, pecaId: a.pecaId }, { ...LUVA, nova: { nome: 'Luva EP519', valor: 25 } }],
    })
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 3)
    const [luva] = await linhas(tx, sql`select id, custo, conta_id from pecas_catalogo where nome = 'Luva EP519'`)
    assert.equal(luva.conta_id, a.contaId)
    assert.equal(Number(luva.custo), 10)
    assert.equal(await saldos.saldoNaLoja(tx, luva.id, a.lojaId), 2)
    assert.deepEqual(await linhas(tx, sql`select 1 from pecas_vinculo_fornecedor where conta_id = ${a.contaId}`), [])
    const notas = await linhas(tx, sql`select origem, chave_acesso, numero, fornecedor_cnpj, impressao_digital is not null as tem
      from notas_entrada where loja_id = ${a.lojaId}`)
    assert.deepEqual(notas, [{ origem: 'planilha', chave_acesso: null, numero: null, fornecedor_cnpj: null, tem: true }])
  })
})

test('planilha com CNPJ grava o vínculo, e a próxima conferência sugere por ele', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const outra = await catalogo.inserirPeca(tx, a.contaId, { nome: 'Outro nome', valor: 50 })
    await entrada.gravarEntradaPlanilhaPecas(tx, {
      lojaId: a.lojaId, usuario: a.usuario, fornecedorCnpj: '11.222.333/0001-81', linhas: [{ ...LUVA, pecaId: outra.id }],
    })
    const vinculos = await linhas(tx, sql`select fornecedor_cnpj, peca_id from pecas_vinculo_fornecedor where conta_id = ${a.contaId}`)
    assert.deepEqual(vinculos, [{ fornecedor_cnpj: FORNECEDOR, peca_id: outra.id }])
    const conf = await entrada.carregarConferenciaPlanilha(tx, a.usuario, a.lojaId, { fornecedorCnpj: FORNECEDOR, itens: [LUVA] })
    assert.deepEqual(conf?.sugestoes, [outra.id])
  })
})

test('conferência sem CNPJ sugere por nome só no catálogo da Conta da loja (A×B)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const confB = await entrada.carregarConferenciaPlanilha(tx, b.usuario, b.lojaId, { fornecedorCnpj: null, itens: [ITEM] })
    assert.deepEqual(confB?.sugestoes, [b.pecaId], 'B: a peça de mesmo nome da B, nunca a da A')
    assert.ok(!confB?.pecas.some(p => p.id === a.pecaId), 'catálogo de B sem peça de A')
  })
})

test('a mesma planilha na mesma loja avisa quando e por quem; em outra Conta, não', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const itens = [ITEM, LUVA]
    const antes = await entrada.carregarConferenciaPlanilha(tx, a.usuario, a.lojaId, { fornecedorCnpj: null, itens })
    assert.equal(antes?.planilhaJaLancada, null)
    await entrada.gravarEntradaPlanilhaPecas(tx, {
      lojaId: a.lojaId, usuario: a.usuario, fornecedorCnpj: null, linhas: itens.map(i => ({ ...i, pecaId: a.pecaId })),
    })
    // Outra ordem das linhas é a mesma planilha.
    const depois = await entrada.carregarConferenciaPlanilha(tx, a.usuario, a.lojaId, { fornecedorCnpj: null, itens: [LUVA, ITEM] })
    assert.equal(depois?.planilhaJaLancada?.por, 'Aux A')
    const deB = await entrada.carregarConferenciaPlanilha(tx, b.usuario, b.lojaId, { fornecedorCnpj: null, itens })
    assert.equal(deB?.planilhaJaLancada, null, 'B não fica sabendo da planilha de A')
    const outra = await entrada.carregarConferenciaPlanilha(tx, a.usuario, a.lojaId, { fornecedorCnpj: null, itens: [{ ...ITEM, quantidade: 4 }] })
    assert.equal(outra?.planilhaJaLancada, null)
  })
})

test('usuário da Conta B na loja da Conta A: mesma frase de loja inexistente, na conferência e na gravação', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    assert.equal(await entrada.carregarConferenciaPlanilha(tx, b.usuario, a.lojaId, { fornecedorCnpj: null, itens: [ITEM] }), null)
    const frase = (lojaId: string) => tx.transaction(t => entrada.gravarEntradaPlanilhaPecas(t, {
      lojaId, usuario: b.usuario, fornecedorCnpj: null, linhas: [{ ...LUVA, nova: { nome: 'Intrusa', valor: 10 } }],
    })).then(() => null, (e: Error) => e.message)
    assert.equal(await frase(a.lojaId), await frase('00000000-0000-0000-0000-000000000000'))
    assert.deepEqual(await linhas(tx, sql`select 1 from pecas_catalogo where nome = 'Intrusa'`), [])
    assert.deepEqual(await linhas(tx, sql`select 1 from notas_entrada where loja_id = ${a.lojaId}`), [])
  })
})

test('uma linha recusada desfaz a planilha inteira; CNPJ inválido também recusa', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const recusa = (e: Partial<Parameters<typeof entrada.gravarEntradaPlanilhaPecas>[1]>) =>
      assert.rejects(tx.transaction(t => entrada.gravarEntradaPlanilhaPecas(t, {
        lojaId: a.lojaId, usuario: a.usuario, fornecedorCnpj: null, linhas: [], ...e,
      })), (erro: unknown) => erro instanceof entrada.EntradaPecasRecusada)
    await recusa({ linhas: [{ ...ITEM, pecaId: a.pecaId }, { ...LUVA, nova: { nome: 'Sem preço', valor: 0 } }] })
    await recusa({ linhas: [{ ...ITEM, pecaId: a.pecaId }, { ...LUVA, pecaId: b.pecaId }] })
    await recusa({ fornecedorCnpj: '123', linhas: [{ ...ITEM, pecaId: a.pecaId }] })
    await recusa({ linhas: [] })
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 0)
    assert.equal(await saldos.saldoNaLoja(tx, b.pecaId, b.lojaId), 0)
    assert.deepEqual(await linhas(tx, sql`select 1 from notas_entrada where loja_id = ${a.lojaId}`), [])
  })
})

test('o banco não aceita nota sem chave nem planilha sem impressão digital', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const [g] = await linhas(tx, sql`select grupo_id from lojas where id = ${a.lojaId}`)
    const inserir = (origem: string, chave: string | null, impressao: string | null) => tx.transaction(t => t.execute(sql`
      insert into notas_entrada (conta_id, grupo_id, loja_id, origem, chave_acesso, numero, fornecedor_cnpj, impressao_digital, criado_por)
      values (${a.contaId}, ${g.grupo_id}, ${a.lojaId}, ${origem}, ${chave}, ${chave && '1'}, ${chave && FORNECEDOR}, ${impressao}, ${a.usuario.id})`))
    await assert.rejects(inserir('nota', null, null))
    await assert.rejects(inserir('planilha', null, null))
    await assert.rejects(inserir('planilha', '5'.repeat(44), 'x'))
    await inserir('nota', '5'.repeat(44), null)
    await inserir('planilha', null, 'x')
  })
})

test('planilha sem custo não altera o custo da peça existente, e a peça nova fica sem custo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await tx.execute(sql`update pecas_catalogo set custo = '55.00' where id = ${a.pecaId}`)
    await entrada.gravarEntradaPlanilhaPecas(tx, {
      lojaId: a.lojaId, usuario: a.usuario, fornecedorCnpj: null,
      linhas: [
        { ...ITEM, custoUnitario: null, pecaId: a.pecaId },
        { ...LUVA, custoUnitario: null, nova: { nome: 'Luva sem custo EP519', valor: 25 } },
      ],
    })
    const [existente] = await linhas(tx, sql`select custo from pecas_catalogo where id = ${a.pecaId}`)
    assert.equal(Number(existente.custo), 55)
    const [nova] = await linhas(tx, sql`select custo from pecas_catalogo where nome = 'Luva sem custo EP519'`)
    assert.equal(nova.custo, null)
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 3)
  })
})
