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
type Mod = typeof import('@/lib/dados-funcionarios')
let db: Db['db']
let listarDadosFuncionarios: Mod['listarDadosFuncionarios']
let corrigirPixDoFuncionario: Mod['corrigirPixDoFuncionario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarDadosFuncionarios, corrigirPixDoFuncionario } = await import('@/lib/dados-funcionarios'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('sócio de uma Conta não recebe dado pessoal de funcionário de outra Conta (#320)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const funcA = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), 'Func A', 'a@teste.invalid', 'vendedor', ${contaA.id}) returning id`)
    const funcB = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), 'Func B', 'b@teste.invalid', 'vendedor', ${contaB.id}) returning id`)
    await tx.execute(sql`insert into usuarios_dados (usuario_id, cpf, pix_tipo, pix_chave, data_nascimento) values
      (${funcA.id}, '11111111111', 'cpf', '11111111111', '1990-01-01'),
      (${funcB.id}, '22222222222', 'cpf', '22222222222', '1991-01-01')`)

    const daB = await listarDadosFuncionarios(contaB.id, tx)
    assert.deepEqual(daB.map(l => l.cpf), ['22222222222'], 'só o funcionário da própria Conta')

    const todos = (await listarDadosFuncionarios(null, tx)).map(l => l.id)
    assert.ok(todos.includes(funcA.id) && todos.includes(funcB.id), 'admin_geral vê todas as Contas')
    throw new Desfazer()
  }), Desfazer)
})

test('sócio de Conta com dois grupos recebe os funcionários dos dois grupos (#320)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Conta Dois Grupos') returning id`)
    const ids: string[] = []
    for (const [nome, cnpj] of [['G1', '00000000032011'], ['G2', '00000000032012']]) {
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values (${'Loja ' + nome}, 'R', 'C', ${grupo.id}) returning id`)
      const func = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id) values (gen_random_uuid(), ${'Func ' + nome}, ${nome + '@teste.invalid'}, 'vendedor', ${loja.id}, ${conta.id}) returning id`)
      ids.push(func.id)
    }

    const daConta = (await listarDadosFuncionarios(conta.id, tx)).map(l => l.id).sort()
    assert.deepEqual(daConta, [...ids].sort())
    throw new Desfazer()
  }), Desfazer)
})

// ─── Correção do PIX pelo admin (#680) ───────────────────────────────────
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type DadosGravados = { cpf: string; pix_tipo: string; pix_chave: string; data_nascimento: string }

async function cenarioDuasContas(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const contaA = await linha(sql`insert into contas (nome) values ('Conta A PIX') returning id`)
  const contaB = await linha(sql`insert into contas (nome) values ('Conta B PIX') returning id`)
  const usuario = (nome: string, papel: string, conta: string) => linha(
    sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), ${nome}, ${nome.replace(/ /g, '') + '@pix.invalid'}, ${papel}, ${conta}) returning id`)
  const funcA = await usuario('Func A PIX', 'vendedor', contaA.id)
  const funcB = await usuario('Func B PIX', 'vendedor', contaB.id)
  const redeA = await usuario('Rede A PIX', 'admin_rede', contaA.id)
  const semDadosA = await usuario('Sem Dados A PIX', 'vendedor', contaA.id)
  await tx.execute(sql`insert into usuarios_dados (usuario_id, cpf, pix_tipo, pix_chave, data_nascimento) values
    (${funcA.id}, '11111111111', 'cpf', '11111111111', '1990-01-01'),
    (${funcB.id}, '22222222222', 'cpf', '22222222222', '1991-01-01'),
    (${redeA.id}, '33333333333', 'cpf', '33333333333', '1992-01-01')`)
  const dados = async (id: string) => ((await tx.execute(
    sql`select cpf, pix_tipo, pix_chave, data_nascimento::text from usuarios_dados where usuario_id = ${id}`,
  )) as unknown as { rows: DadosGravados[] }).rows
  return { contaA: contaA.id, funcA: funcA.id, funcB: funcB.id, redeA: redeA.id, semDadosA: semDadosA.id, dados }
}

const CELULAR = { tipo: 'celular', chave: '(35) 99999-1234' }
const NAO_ENCONTRADO = { ok: false, erro: 'Funcionário não encontrado.' }

test('sócio corrige o PIX de funcionário da própria Conta, com a chave normalizada, sem mexer em CPF e nascimento', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', contaId: c.contaA }, c.funcA, CELULAR, tx)
    assert.deepEqual(r, { ok: true })
    assert.deepEqual(await c.dados(c.funcA), [{ cpf: '11111111111', pix_tipo: 'celular', pix_chave: '+5535999991234', data_nascimento: '1990-01-01' }])
    throw new Desfazer()
  }), Desfazer)
})

test('sócio da Conta A não corrige o PIX de funcionário da Conta B, e recebe a frase do id inexistente', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const socioA = { papel: 'admin_socio', contaId: c.contaA }
    assert.deepEqual(await corrigirPixDoFuncionario(socioA, c.funcB, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual(await corrigirPixDoFuncionario(socioA, '00000000-0000-4000-8000-000000000000', CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.funcB)).map(d => d.pix_chave), ['22222222222'], 'linha da Conta B intacta')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral corrige o PIX em qualquer Conta, inclusive de admin_rede', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const geral = { papel: 'admin_geral', contaId: null }
    assert.deepEqual(await corrigirPixDoFuncionario(geral, c.funcB, CELULAR, tx), { ok: true })
    assert.deepEqual(await corrigirPixDoFuncionario(geral, c.redeA, CELULAR, tx), { ok: true })
    assert.deepEqual((await c.dados(c.funcB)).map(d => d.pix_chave), ['+5535999991234'])
    assert.deepEqual((await c.dados(c.redeA)).map(d => d.pix_chave), ['+5535999991234'])
    throw new Desfazer()
  }), Desfazer)
})

test('sócio não corrige o PIX de admin_rede da própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    assert.deepEqual(await corrigirPixDoFuncionario({ papel: 'admin_socio', contaId: c.contaA }, c.redeA, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.redeA)).map(d => d.pix_chave), ['33333333333'])
    throw new Desfazer()
  }), Desfazer)
})

test('funcionário que ainda não preencheu os dados não ganha linha pela correção do admin', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', contaId: c.contaA }, c.semDadosA, CELULAR, tx)
    assert.deepEqual(r, { ok: false, erro: 'Esse funcionário ainda não preencheu os dados.' })
    assert.deepEqual(await c.dados(c.semDadosA), [])
    throw new Desfazer()
  }), Desfazer)
})

test('chave que não confere com o tipo não é gravada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', contaId: c.contaA }, c.funcA, { tipo: 'email', chave: '(35) 99999-1234' }, tx)
    assert.deepEqual(r, { ok: false, erro: 'Chave PIX não confere com o tipo escolhido.' })
    assert.deepEqual((await c.dados(c.funcA)).map(d => d.pix_chave), ['11111111111'])
    throw new Desfazer()
  }), Desfazer)
})

// Roda `antes` logo antes da query do builder ir ao banco: simula outra requisição no meio.
function antesDeExecutar<T extends object>(builder: T, antes: () => Promise<unknown>): T {
  return new Proxy(builder, {
    get(alvo, prop) {
      const valor = Reflect.get(alvo, prop) as unknown
      if (prop === 'then') {
        const then = valor as PromiseLike<unknown>['then']
        return (ok?: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => antes().then(() => then.call(alvo, ok, falha))
      }
      if (typeof valor !== 'function') return valor
      return (...args: unknown[]) => {
        const r = (valor as (...a: unknown[]) => unknown).apply(alvo, args)
        return r && typeof r === 'object' ? antesDeExecutar(r, antes) : r
      }
    },
  })
}

test('funcionário que muda de Conta entre a leitura e a gravação não tem o PIX trocado pelo sócio da Conta antiga', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const contaB = ((await tx.execute(sql`select conta_id as id from usuarios where id = ${c.funcB}`)) as unknown as { rows: { id: string }[] }).rows[0].id
    const moverParaB = () => tx.execute(sql`update usuarios set conta_id = ${contaB} where id = ${c.funcA}`)
    // A leitura vê o funcionário na Conta A; a gravação já o encontra na Conta B.
    const exec = { select: tx.select.bind(tx), update: ((t: Parameters<Tx['update']>[0]) => antesDeExecutar(tx.update(t), moverParaB)) as Tx['update'] }
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', contaId: c.contaA }, c.funcA, CELULAR, exec)
    assert.deepEqual(r, NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.funcA)).map(d => d.pix_chave), ['11111111111'], 'PIX intacto')
    throw new Desfazer()
  }), Desfazer)
})
