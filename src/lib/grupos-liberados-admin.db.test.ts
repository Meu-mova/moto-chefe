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
type Admin = typeof import('@/lib/grupos-liberados-admin')
let db: Db['db']
let sincronizarGruposLiberados: Admin['sincronizarGruposLiberados']
let gruposLiberadosDoUsuario: Admin['gruposLiberadosDoUsuario']
let acessosDeFora: Admin['acessosDeFora']
let listarUsuariosGerenciaveis: typeof import('@/lib/usuarios-gerenciaveis')['listarUsuariosGerenciaveis']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ sincronizarGruposLiberados, gruposLiberadosDoUsuario, acessosDeFora } = await import('@/lib/grupos-liberados-admin'))
  ;({ listarUsuariosGerenciaveis } = await import('@/lib/usuarios-gerenciaveis'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]

async function cenario(tx: Tx) {
  const dona = await linha(tx, sql`insert into contas (nome) values ('Conta dona') returning id`)
  const rede = await linha(tx, sql`insert into contas (nome) values ('Conta da rede') returning id`)
  const terceira = await linha(tx, sql`insert into contas (nome) values ('Terceira') returning id`)
  const liberado = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Liberado', '00000000000191', ${dona.id}) returning id`)
  const casa = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Casa', '00000000000272', ${rede.id}) returning id`)
  const deFora = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('De fora', '00000000000353', ${terceira.id}) returning id`)
  const novo = (papel: string, conta: string | null, email: string) =>
    linha(tx, sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), ${email}, ${email + '@teste.invalid'}, ${papel}, ${conta}) returning id`)
  return {
    dona: dona.id, terceira: terceira.id, liberado: liberado.id, casa: casa.id, deFora: deFora.id,
    geral: { id: (await novo('admin_geral', null, 'geral-517b')).id, papel: 'admin_geral' },
    socio: { id: (await novo('admin_socio', dona.id, 'socio-517b')).id, papel: 'admin_socio' },
    rede: (await novo('admin_rede', rede.id, 'rede-517b')).id,
    socioRede: (await novo('admin_socio', rede.id, 'socio-rede-517b')).id,
  }
}

test('só o admin_geral libera, só para admin_rede e só grupo de outra Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await sincronizarGruposLiberados(tx, c.socio, c.rede, [c.liberado]), { ok: false, erro: 'Só o Admin Geral libera grupos de outras Contas' })
    assert.equal((await sincronizarGruposLiberados(tx, c.geral, c.socioRede, [c.liberado])).ok, false, 'admin_socio comum não recebe')
    assert.equal((await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.casa])).ok, false, 'grupo da própria Conta')
    assert.deepEqual(await gruposLiberadosDoUsuario(c.rede, tx), [])

    assert.deepEqual(await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.liberado, c.deFora]), { ok: true, liberados: [c.liberado, c.deFora], revogados: [] })
    assert.deepEqual(await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.deFora]), { ok: true, liberados: [], revogados: [c.liberado] })
    assert.deepEqual(await gruposLiberadosDoUsuario(c.rede, tx), [c.deFora])
    // Revogar não apaga: a linha antiga fica com revogado_em.
    const { rows } = (await tx.execute(sql`select count(*)::int n from grupos_liberados where usuario_id = ${c.rede} and revogado_em is not null`)) as unknown as { rows: { n: number }[] }
    assert.equal(rows[0].n, 1)
    // Liberar de novo depois de revogar cria outra liberação viva.
    assert.equal((await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.deFora, c.liberado])).ok, true)
    assert.deepEqual((await gruposLiberadosDoUsuario(c.rede, tx)).sort(), [c.deFora, c.liberado].sort())
    throw new Desfazer()
  }), Desfazer)
})

test('acesso de fora: a Conta dona vê só as liberações vivas dos grupos dela', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.liberado, c.deFora])
    const daDona = await acessosDeFora(c.dona, tx)
    assert.deepEqual(daDona.map(a => [a.usuarioNome, a.contaOrigem, a.grupoNome]), [['rede-517b', 'Conta da rede', 'Liberado']])
    assert.deepEqual((await acessosDeFora(c.terceira, tx)).map(a => a.grupoNome), ['De fora'], 'outra Conta não vê o grupo da dona')
    await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.deFora])
    assert.deepEqual(await acessosDeFora(c.dona, tx), [], 'revogado some da lista')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_rede em casa não lista nem gerencia usuário do grupo liberado nem de outro grupo da Conta dona', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const irmao = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Irmão', '00000000000434', ${c.dona}) returning id`)
    const loja = async (g: string, nome: string) => (await linha(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${nome}, 'C', 'R', ${g}) returning id`)).id
    const [lojaCasa, lojaLiberado, lojaIrmao] = [await loja(c.casa, 'L casa'), await loja(c.liberado, 'L liberado'), await loja(irmao.id, 'L irmão')]
    const vendedor = (lojaId: string, email: string) =>
      linha(tx, sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), ${email}, ${email + '@teste.invalid'}, 'vendedor', ${lojaId}) returning id`)
    const daCasa = (await vendedor(lojaCasa, 'v-casa-517')).id
    const doLiberado = (await vendedor(lojaLiberado, 'v-liberado-517')).id
    const doIrmao = (await vendedor(lojaIrmao, 'v-irmao-517')).id
    await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.liberado])

    // O gestor de /admin/usuarios vê os grupos da própria Conta, sem os liberados (gestorDaSessao).
    const { gruposVisiveis } = await import('@/lib/acesso-grupo')
    const { usuarioDaRede } = await import('@/lib/grupos-liberados')
    const emCasa = usuarioDaRede({ papel: 'admin_rede', lojaId: lojaCasa, contaId: (await tx.execute(sql`select conta_id id from usuarios where id = ${c.rede}`) as unknown as { rows: { id: string }[] }).rows[0].id, gruposAcesso: [], gruposAprovacao: [] },
      [{ grupoId: c.liberado, contaId: c.dona }], null)
    const todos = [{ id: c.casa, contaId: emCasa.contaId! }, { id: c.liberado, contaId: c.dona }, { id: irmao.id, contaId: c.dona }]
    const visiveis = gruposVisiveis({ ...emCasa, gruposLiberados: [] }, c.casa, todos)
    assert.deepEqual(visiveis, [c.casa])
    const lista = (await listarUsuariosGerenciaveis({ papel: emCasa.papel, gruposVisiveis: visiveis }, tx)).map(u => u.id)
    assert.ok(lista.includes(daCasa))
    assert.ok(!lista.includes(doLiberado), 'usuário do grupo liberado')
    assert.ok(!lista.includes(doIrmao), 'usuário de outro grupo da Conta dona')
    throw new Desfazer()
  }), Desfazer)
})

test('aprovação do admin_rede: vale no grupo liberado, não em grupo de outra Conta não liberado; revogar tira a aprovação', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const { aprovacoesForaDoAlcance } = await import('@/lib/grupos-liberados-admin')
    await sincronizarGruposLiberados(tx, c.geral, c.rede, [c.liberado])
    const contaRede = (await tx.execute(sql`select conta_id from usuarios where id = ${c.rede}`) as unknown as { rows: { conta_id: string }[] }).rows[0].conta_id
    const alvo = { id: c.rede, papel: 'admin_rede', contaId: contaRede }
    assert.deepEqual(await aprovacoesForaDoAlcance(tx, alvo, [c.casa, c.liberado]), [], 'casa e liberado valem')
    assert.deepEqual(await aprovacoesForaDoAlcance(tx, alvo, [c.deFora]), [c.deFora], 'outra Conta, não liberado')
    assert.deepEqual(await aprovacoesForaDoAlcance(tx, { ...alvo, papel: 'admin_socio' }, [c.liberado]), [c.liberado], 'sócio não aprova fora da Conta')

    // Grupo liberado bloqueado (aqui, inativo): ainda pode gravar; o bloqueio vale no uso.
    await tx.execute(sql`update grupos set ativo = false where id = ${c.liberado}`)
    assert.deepEqual(await aprovacoesForaDoAlcance(tx, alvo, [c.liberado]), [], 'liberado mas bloqueado continua gravável')
    await tx.execute(sql`update grupos set ativo = true where id = ${c.liberado}`)

    await tx.execute(sql`update usuarios set grupos_aprovacao = ${sql.param([c.casa, c.liberado])}::uuid[] where id = ${c.rede}`)
    await sincronizarGruposLiberados(tx, c.geral, c.rede, [])
    const aprov = (await tx.execute(sql`select grupos_aprovacao from usuarios where id = ${c.rede}`) as unknown as { rows: { grupos_aprovacao: string[] }[] }).rows[0].grupos_aprovacao
    assert.deepEqual(aprov, [c.casa], 'revogar tira a aprovação no grupo de fora e mantém a da casa')
    assert.deepEqual(await aprovacoesForaDoAlcance(tx, alvo, [c.liberado]), [c.liberado], 'e não dá mais para marcar')
    throw new Desfazer()
  }), Desfazer)
})
