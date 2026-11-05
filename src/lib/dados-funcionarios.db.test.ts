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

// A lista é do grupo ativo: nem o sócio nem o admin_geral veem os outros grupos por aqui.
test('lista só o grupo ativo: outro grupo da mesma Conta e outra Conta ficam de fora', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const nomes = async (grupoId: string) => (await listarDadosFuncionarios(grupoId, tx)).map(l => l.nome)
    assert.deepEqual(await nomes(c.grupoA), ['Func A PIX', 'Rede A PIX', 'Sem Dados A PIX'])
    assert.deepEqual(await nomes(c.grupoA2), ['Func A2 PIX'])
    assert.deepEqual(await nomes(c.grupoB), ['Func B PIX'])
    throw new Desfazer()
  }), Desfazer)
})

test('quem tem acesso marcado a um grupo aparece nele; marcação de grupo de outra Conta não vale', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    await tx.execute(sql`update usuarios set grupos_acesso = array[${c.grupoA2}]::uuid[] where id = ${c.funcA}`)
    await tx.execute(sql`update usuarios set grupos_acesso = array[${c.grupoA}]::uuid[] where id = ${c.funcB}`)
    const nomes = async (grupoId: string) => (await listarDadosFuncionarios(grupoId, tx)).map(l => l.nome)
    assert.ok((await nomes(c.grupoA2)).includes('Func A PIX'))
    assert.ok(!(await nomes(c.grupoA)).includes('Func B PIX'), 'grupo da Conta A não lista funcionário da Conta B')
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
  const grupoLoja = async (nome: string, cnpj: string, conta: string) => {
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${conta}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values (${'Loja ' + nome}, 'R', 'C', ${grupo.id}) returning id`)
    return { grupo: grupo.id, loja: loja.id }
  }
  const a1 = await grupoLoja('A1 PIX', '00000000068001', contaA.id)
  const a2 = await grupoLoja('A2 PIX', '00000000068002', contaA.id)
  const b1 = await grupoLoja('B1 PIX', '00000000068003', contaB.id)
  const usuario = (nome: string, papel: string, conta: string, loja: string) => linha(
    sql`insert into usuarios (id, nome, email, papel, conta_id, loja_id) values (gen_random_uuid(), ${nome}, ${nome.replace(/ /g, '') + '@pix.invalid'}, ${papel}, ${conta}, ${loja}) returning id`)
  const funcA = await usuario('Func A PIX', 'vendedor', contaA.id, a1.loja)
  const funcA2 = await usuario('Func A2 PIX', 'vendedor', contaA.id, a2.loja)
  const funcB = await usuario('Func B PIX', 'vendedor', contaB.id, b1.loja)
  const redeA = await usuario('Rede A PIX', 'admin_rede', contaA.id, a1.loja)
  const semDadosA = await usuario('Sem Dados A PIX', 'vendedor', contaA.id, a1.loja)
  await tx.execute(sql`insert into usuarios_dados (usuario_id, cpf, pix_tipo, pix_chave, data_nascimento) values
    (${funcA.id}, '11111111111', 'cpf', '11111111111', '1990-01-01'),
    (${funcA2.id}, '44444444444', 'cpf', '44444444444', '1993-01-01'),
    (${funcB.id}, '22222222222', 'cpf', '22222222222', '1991-01-01'),
    (${redeA.id}, '33333333333', 'cpf', '33333333333', '1992-01-01')`)
  const dados = async (id: string) => ((await tx.execute(
    sql`select cpf, pix_tipo, pix_chave, data_nascimento::text from usuarios_dados where usuario_id = ${id}`,
  )) as unknown as { rows: DadosGravados[] }).rows
  return {
    grupoA: a1.grupo, grupoA2: a2.grupo, grupoB: b1.grupo, lojaA2: a2.loja,
    funcA: funcA.id, funcA2: funcA2.id, funcB: funcB.id, redeA: redeA.id, semDadosA: semDadosA.id, dados,
  }
}

const CELULAR = { tipo: 'celular', chave: '(35) 99999-1234' }
const NAO_ENCONTRADO = { ok: false, erro: 'Funcionário não encontrado.' }

test('sócio corrige o PIX de funcionário do grupo ativo, com a chave normalizada, sem mexer em CPF e nascimento', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', grupoId: c.grupoA }, c.funcA, CELULAR, tx)
    assert.deepEqual(r, { ok: true })
    assert.deepEqual(await c.dados(c.funcA), [{ cpf: '11111111111', pix_tipo: 'celular', pix_chave: '+5535999991234', data_nascimento: '1990-01-01' }])
    throw new Desfazer()
  }), Desfazer)
})

test('sócio não corrige o PIX de outro grupo nem de outra Conta, e recebe a frase do id inexistente', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const socioA = { papel: 'admin_socio', grupoId: c.grupoA }
    assert.deepEqual(await corrigirPixDoFuncionario(socioA, c.funcA2, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual(await corrigirPixDoFuncionario(socioA, c.funcB, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual(await corrigirPixDoFuncionario(socioA, '00000000-0000-4000-8000-000000000000', CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.funcA2)).map(d => d.pix_chave), ['44444444444'], 'linha do outro grupo intacta')
    assert.deepEqual((await c.dados(c.funcB)).map(d => d.pix_chave), ['22222222222'], 'linha da Conta B intacta')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral corrige o PIX no grupo ativo, inclusive de admin_rede, e não em outro grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const geral = { papel: 'admin_geral', grupoId: c.grupoA }
    assert.deepEqual(await corrigirPixDoFuncionario(geral, c.funcA, CELULAR, tx), { ok: true })
    assert.deepEqual(await corrigirPixDoFuncionario(geral, c.redeA, CELULAR, tx), { ok: true })
    assert.deepEqual((await c.dados(c.redeA)).map(d => d.pix_chave), ['+5535999991234'])
    assert.deepEqual(await corrigirPixDoFuncionario(geral, c.funcB, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.funcB)).map(d => d.pix_chave), ['22222222222'])
    throw new Desfazer()
  }), Desfazer)
})

test('sócio não corrige o PIX de admin_rede da própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    assert.deepEqual(await corrigirPixDoFuncionario({ papel: 'admin_socio', grupoId: c.grupoA }, c.redeA, CELULAR, tx), NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.redeA)).map(d => d.pix_chave), ['33333333333'])
    throw new Desfazer()
  }), Desfazer)
})

test('funcionário que ainda não preencheu os dados não ganha linha pela correção do admin', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', grupoId: c.grupoA }, c.semDadosA, CELULAR, tx)
    assert.deepEqual(r, { ok: false, erro: 'Esse funcionário ainda não preencheu os dados.' })
    assert.deepEqual(await c.dados(c.semDadosA), [])
    throw new Desfazer()
  }), Desfazer)
})

test('chave que não confere com o tipo não é gravada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', grupoId: c.grupoA }, c.funcA, { tipo: 'email', chave: '(35) 99999-1234' }, tx)
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

test('funcionário que muda de grupo entre a leitura e a gravação não tem o PIX trocado pelo sócio do grupo antigo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenarioDuasContas(tx)
    const mover = () => tx.execute(sql`update usuarios set loja_id = ${c.lojaA2} where id = ${c.funcA}`)
    // A leitura vê o funcionário no grupo A; a gravação já o encontra no outro.
    const exec = { select: tx.select.bind(tx), update: ((t: Parameters<Tx['update']>[0]) => antesDeExecutar(tx.update(t), mover)) as Tx['update'] }
    const r = await corrigirPixDoFuncionario({ papel: 'admin_socio', grupoId: c.grupoA }, c.funcA, CELULAR, exec)
    assert.deepEqual(r, NAO_ENCONTRADO)
    assert.deepEqual((await c.dados(c.funcA)).map(d => d.pix_chave), ['11111111111'], 'PIX intacto')
    throw new Desfazer()
  }), Desfazer)
})
