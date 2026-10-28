// Teste de banco: Postgres descartável, como src/lib/pecas-da-conta.db.test.ts.
// Cargos da Conta (#449): a Conta B não lê, não edita, não apaga nem atribui cargo da A.
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
let mod: typeof import('@/lib/cargos')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/cargos')
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

const PODE_DAR = ['clientes', 'agenda']

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CG449 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'CG449 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja CG449 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const quem = { papel: 'admin_socio', contaId: conta.id as string }
  const criado = await mod.criarCargo(tx, quem, { nome: 'Recepção', modulos: ['clientes'] }, PODE_DAR)
  assert.ok(criado.ok)
  return { quem, lojaId: loja.id as string, cargoId: criado.id }
}

test('Conta B não lista, não edita e não apaga cargo da Conta A; recusa igual a id inexistente (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const inexistente = '00000000-0000-0000-0000-000000000000'

    const daB = (await mod.listarCargos(tx, b.quem)).map(c => c.id)
    assert.deepEqual(daB, [b.cargoId])

    for (const id of [a.cargoId, inexistente]) {
      assert.deepEqual(await mod.editarCargo(tx, b.quem, id, { nome: 'X', modulos: [] }, PODE_DAR),
        { ok: false, erro: 'Cargo não encontrado' })
      assert.deepEqual(await mod.apagarCargo(tx, b.quem, id), { ok: false, erro: 'Cargo não encontrado' })
      assert.equal(await mod.cargoDaConta(tx, b.quem.contaId, id), null)
    }
    const [cargoA] = await linhas(tx, sql`select nome, modulos from cargos where id = ${a.cargoId}`)
    assert.deepEqual(cargoA, { nome: 'Recepção', modulos: ['clientes'] })
  })
})

test('admin_geral vê os cargos de todas as Contas (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const ids = (await mod.listarCargos(tx, { papel: 'admin_geral', contaId: b.quem.contaId })).map(c => c.id)
    assert.ok(ids.includes(a.cargoId) && ids.includes(b.cargoId))
  })
})

test('nome repetido só conta dentro da Conta; nome de papel fixo é recusado (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await semearConta(tx, 'B', '22222222000191')
    assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome: ' recepção ', modulos: [] }, PODE_DAR),
      { ok: false, erro: 'Já existe um cargo com esse nome' })
    assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome: 'Vendedor', modulos: [] }, PODE_DAR),
      { ok: false, erro: 'Esse nome é de um cargo fixo do MOVA' })
    assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome: '  ', modulos: [] }, PODE_DAR),
      { ok: false, erro: 'Informe o nome do cargo' })
  })
})

test('nome repetido ignora acento, maiúscula e espaços (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    for (const nome of ['Recepcao', 'RECEPÇÃO', 'Re cepção', 'Recepção'.normalize('NFD')]) {
      assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome, modulos: [] }, PODE_DAR),
        { ok: false, erro: 'Já existe um cargo com esse nome' }, nome)
    }
  })
})

test('o banco recusa cargo repetido sem acento na mesma Conta e aceita em outra (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    // semearConta grava 'Recepção' também na B: outra Conta repetir passa no índice.
    await semearConta(tx, 'B', '22222222000191')
    await assert.rejects(
      tx.transaction(async sp => {
        await sp.execute(sql`insert into cargos (conta_id, nome) values (${a.quem.contaId}, 'RECEP CAO')`)
      }),
      (e: { cause?: { code?: string } }) => e.cause?.code === '23505',
    )
  })
})

test('nome de papel fixo é recusado também no feminino e com variações (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    for (const nome of ['Vendedora', 'Mecânica', 'Sócia', 'Admin Sócia', 'Auxiliar Administrativa',
      'Aux. Administrativa', 'aux_adm', 'Admin  Geral', 'AuxAdm', 'adminGeral', 'Aux-Adm',
      'Vendedor(a)', 'Mecânico(a)', 'Admin', 'ADMIN.', 'Administrador', 'Administradora', 'Administrador(a)']) {
      assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome, modulos: [] }, PODE_DAR),
        { ok: false, erro: 'Esse nome é de um cargo fixo do MOVA' }, nome)
    }
  })
})

test('sócio não dá módulo fora do que pode dar (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    assert.deepEqual(await mod.criarCargo(tx, a.quem, { nome: 'Caixa', modulos: ['caixa'] }, PODE_DAR),
      { ok: false, erro: 'Módulo não disponível para cargo' })
    assert.deepEqual(await mod.editarCargo(tx, a.quem, a.cargoId, { nome: 'Recepção', modulos: ['usuarios'] }, PODE_DAR),
      { ok: false, erro: 'Módulo não disponível para cargo' })
    assert.deepEqual(await mod.editarCargo(tx, a.quem, a.cargoId, { nome: 'Recepção', modulos: ['agenda'] }, PODE_DAR),
      { ok: true })
  })
})

test('cargo em uso não se apaga; sem usuário, apaga (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, cargo_id)
      values (gen_random_uuid(), 'Ana', 'ana-cg449@teste.invalid', 'cargo', ${a.lojaId}, ${a.cargoId})`)
    assert.deepEqual(await mod.apagarCargo(tx, a.quem, a.cargoId), { ok: false, erro: 'Cargo em uso por 1 usuário' })

    const outro = await mod.criarCargo(tx, a.quem, { nome: 'Estoquista', modulos: [] }, PODE_DAR)
    assert.ok(outro.ok)
    assert.deepEqual(await mod.apagarCargo(tx, a.quem, outro.id), { ok: true })
  })
})

test('papel cargo exige cargo_id, e cargo_id só com papel cargo (#449)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await assert.rejects(linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
      values (gen_random_uuid(), 'Sem', 'sem-cg449@teste.invalid', 'cargo', ${a.lojaId})`))
  })
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await assert.rejects(linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, cargo_id)
      values (gen_random_uuid(), 'Vend', 'vend-cg449@teste.invalid', 'vendedor', ${a.lojaId}, ${a.cargoId})`))
  })
})

test('atribuir cargo só aceita cargo da Conta do usuário; o da outra Conta recebe a frase do id inexistente (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const inexistente = '00000000-0000-0000-0000-000000000000'
    assert.deepEqual(await mod.cargoParaGravar(tx, { papel: 'cargo', contaId: b.quem.contaId, cargoId: b.cargoId }),
      { ok: true, cargoId: b.cargoId })
    for (const cargoId of [a.cargoId, inexistente, null]) {
      assert.deepEqual(await mod.cargoParaGravar(tx, { papel: 'cargo', contaId: b.quem.contaId, cargoId }),
        { ok: false, erro: 'Cargo não encontrado' })
    }
    // Outro papel não carrega cargo, nem se a tela mandar um.
    assert.deepEqual(await mod.cargoParaGravar(tx, { papel: 'vendedor', contaId: b.quem.contaId, cargoId: b.cargoId }),
      { ok: true, cargoId: null })
  })
})

test('módulos do cargo do usuário: só de cargo da Conta da loja dele (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    assert.deepEqual(await mod.modulosDoCargoDoUsuario(tx, { papel: 'cargo', lojaId: a.lojaId, cargoId: a.cargoId }), ['clientes'])
    // Cargo de A ligado a usuário da loja de B (só por fora do código): não vale nada.
    assert.deepEqual(await mod.modulosDoCargoDoUsuario(tx, { papel: 'cargo', lojaId: b.lojaId, cargoId: a.cargoId }), [])
    assert.deepEqual(await mod.modulosDoCargoDoUsuario(tx, { papel: 'vendedor', lojaId: a.lojaId, cargoId: null }), [])
  })
})
