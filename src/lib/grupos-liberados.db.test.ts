// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/efetivar-pedido.db.test.ts.
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
type Liberados = typeof import('@/lib/grupos-liberados')
type Conta = typeof import('@/lib/conta')
type Agendamento = typeof import('@/lib/agendamento-do-usuario')
let db: Db['db']
let gruposLiberadosVivos: Liberados['gruposLiberadosVivos']
let usuarioDaRede: Liberados['usuarioDaRede']
let lojasDoEscopo: Conta['lojasDoEscopo']
let grupoNoEscopo: Conta['grupoNoEscopo']
let clientesDoEscopo: Conta['clientesDoEscopo']
let agendamentoDoUsuario: Agendamento['agendamentoDoUsuario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ gruposLiberadosVivos, usuarioDaRede } = await import('@/lib/grupos-liberados'))
  ;({ lojasDoEscopo, grupoNoEscopo, clientesDoEscopo } = await import('@/lib/conta'))
  ;({ agendamentoDoUsuario } = await import('@/lib/agendamento-do-usuario'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]

// Conta dona com o grupo liberado e outro grupo; Conta do admin_rede; terceira Conta.
async function cenario(tx: Tx) {
  const grupoComLoja = async (conta: string, nome: string, cnpj: string) => {
    const g = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${conta}) returning id`)
    const l = await linha(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja ' + nome}, 'C', 'R', ${g.id}) returning id`)
    const ag = await linha(tx, sql`insert into agendamentos (loja_id, cliente_nome, cliente_fone, tipo_servico, data_hora_inicio)
      values (${l.id}, 'Cliente', '35999990000', 'Freios', '2026-11-03T13:00:00Z') returning id`)
    return { grupo: g.id, loja: l.id, ag: ag.id }
  }
  const dona = await linha(tx, sql`insert into contas (nome) values ('Conta dona') returning id`)
  const rede = await linha(tx, sql`insert into contas (nome) values ('Conta da rede') returning id`)
  const terceira = await linha(tx, sql`insert into contas (nome) values ('Terceira') returning id`)
  const liberado = await grupoComLoja(dona.id, 'Liberado', '00000000000191')
  const irmao = await grupoComLoja(dona.id, 'Irmão', '00000000000272')
  const casa = await grupoComLoja(rede.id, 'Casa', '00000000000353')
  const deFora = await grupoComLoja(terceira.id, 'De fora', '00000000000434')
  const geral = await linha(tx, sql`insert into usuarios (id, nome, email, papel) values (gen_random_uuid(), 'Geral', 'geral-517@teste.invalid', 'admin_geral') returning id`)
  const redeUsuario = await linha(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
    values (gen_random_uuid(), 'Rede', 'rede-517@teste.invalid', 'admin_rede', ${casa.loja}, ${rede.id}) returning id`)
  await tx.execute(sql`insert into grupos_liberados (usuario_id, grupo_id, liberado_por) values (${redeUsuario.id}, ${liberado.grupo}, ${geral.id})`)
  const cadastro = { papel: 'admin_rede' as const, lojaId: casa.loja, contaId: rede.id, gruposAcesso: [] as string[], gruposAprovacao: [] as string[] }
  return { dona: dona.id, rede: rede.id, liberado, irmao, casa, deFora, usuarioId: redeUsuario.id, cadastro }
}

test('admin_rede no grupo liberado vê só ele: nem o outro grupo da Conta dona, nem outra Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const vivos = await gruposLiberadosVivos(c.usuarioId, new Date('2026-10-29T12:00:00Z'), tx)
    assert.deepEqual(vivos, [{ grupoId: c.liberado.grupo, contaId: c.dona }])

    const persona = usuarioDaRede(c.cadastro, vivos, c.liberado.grupo)
    assert.equal(persona.contaId, c.dona, 'dados da Conta dona')

    const lojas = (await tx.select().from(lojasDoEscopo(persona).as('l'))).map(l => l.id)
    assert.deepEqual(lojas, [c.liberado.loja], 'só a loja do grupo liberado')

    assert.equal(await grupoNoEscopo(c.liberado.grupo, persona, tx), true)
    assert.equal(await grupoNoEscopo(c.irmao.grupo, persona, tx), false, 'outro grupo da Conta dona')
    assert.equal(await grupoNoEscopo(c.deFora.grupo, persona, tx), false, 'outra Conta')
    assert.equal(await grupoNoEscopo(c.casa.grupo, persona, tx), false, 'a própria Conta fica fora da persona')

    assert.ok(await agendamentoDoUsuario(persona, c.liberado.ag, tx), 'registro do grupo liberado')
    assert.equal(await agendamentoDoUsuario(persona, c.irmao.ag, tx), null, 'registro do outro grupo da Conta dona')
    assert.equal(await agendamentoDoUsuario(persona, c.deFora.ag, tx), null, 'registro de outra Conta')
    assert.equal(await agendamentoDoUsuario(persona, c.casa.ag, tx), null, 'registro da própria Conta, na persona')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_rede na própria Conta não lê registro do grupo liberado nem da Conta dona', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const vivos = await gruposLiberadosVivos(c.usuarioId, new Date('2026-10-29T12:00:00Z'), tx)
    const emCasa = usuarioDaRede(c.cadastro, vivos, c.casa.grupo)
    assert.equal(emCasa.contaId, c.rede)
    assert.ok(await agendamentoDoUsuario(emCasa, c.casa.ag, tx))
    assert.equal(await agendamentoDoUsuario(emCasa, c.liberado.ag, tx), null)
    assert.equal(await agendamentoDoUsuario(emCasa, c.irmao.ag, tx), null)
    throw new Desfazer()
  }), Desfazer)
})

test('revogar corta na hora; grupo bloqueado por mensalidade também', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const agora = new Date('2026-10-29T12:00:00Z')
    await tx.execute(sql`insert into mensalidades (grupo_id, competencia, valor, vencimento) values (${c.liberado.grupo}, '2026-01', 499, '2026-01-10')`)
    assert.deepEqual(await gruposLiberadosVivos(c.usuarioId, agora, tx), [], 'bloqueado')
    await tx.execute(sql`delete from mensalidades where grupo_id = ${c.liberado.grupo}`)
    assert.equal((await gruposLiberadosVivos(c.usuarioId, agora, tx)).length, 1)

    await tx.execute(sql`update grupos_liberados set revogado_em = now() where usuario_id = ${c.usuarioId}`)
    const vivos = await gruposLiberadosVivos(c.usuarioId, agora, tx)
    assert.deepEqual(vivos, [], 'revogado')
    const semPersona = usuarioDaRede(c.cadastro, vivos, c.liberado.grupo)
    assert.equal(semPersona.contaId, c.rede)
    assert.equal(await agendamentoDoUsuario(semPersona, c.liberado.ag, tx), null)
    throw new Desfazer()
  }), Desfazer)
})

test('clientes na persona: só os que movimentaram no grupo liberado (provisório, decisão do Luis)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const doLiberado = await linha(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Do liberado', '52998224725', ${c.dona}) returning id`)
    const doIrmao = await linha(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Do irmão', '11144477735', ${c.dona}) returning id`)
    await tx.execute(sql`update agendamentos set cliente_id = ${doLiberado.id} where id = ${c.liberado.ag}`)
    await tx.execute(sql`update agendamentos set cliente_id = ${doIrmao.id} where id = ${c.irmao.ag}`)
    const vivos = await gruposLiberadosVivos(c.usuarioId, new Date('2026-10-29T12:00:00Z'), tx)
    const persona = usuarioDaRede(c.cadastro, vivos, c.liberado.grupo)
    const { clientes } = await import('@/lib/db/schema')
    const vistos = (await tx.select({ id: clientes.id }).from(clientes).where(clientesDoEscopo(persona.contaId!, persona))).map(r => r.id)
    assert.deepEqual(vistos, [doLiberado.id])
    throw new Desfazer()
  }), Desfazer)
})
