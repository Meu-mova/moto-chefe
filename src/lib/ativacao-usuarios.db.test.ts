// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Mod = typeof import('@/lib/ativacao-usuarios')
let db: Db['db']
let criarUsuariosDaAdesao: Mod['criarUsuariosDaAdesao']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ criarUsuariosDaAdesao } = await import('@/lib/ativacao-usuarios'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const rows = async <T>(tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: T[] }).rows

const LISTA = [
  { nome: 'Sócia', email: 'Socia@Cliente.test', papel: 'admin_socio' },
  { nome: 'Aux', email: 'aux@cliente.test', papel: 'aux_adm' },
  { nome: 'Já Tem', email: 'jatem@cliente.test', papel: 'vendedor' },
]

test('cria os acessos da lista na loja e na Conta do grupo; e-mail que falha devolve a senha', async () => {
  await assert.rejects(db.transaction(async tx => {
    const [conta] = await rows<{ id: string }>(tx, sql`insert into contas (nome) values ('Cliente') returning id`)
    const [grupo] = await rows<{ id: string }>(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Cliente', '12345678000195', ${conta.id}) returning id`)
    const [loja] = await rows<{ id: string }>(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Centro', 'r', 'c', ${grupo.id}) returning id`)
    await tx.execute(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Já Tem', 'jatem@cliente.test', 'vendedor', ${loja.id})`)
    const [adesao] = await rows<{ id: string }>(tx, sql`
      insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, grupo_id)
      values ('Cliente', 'Resp', '65999990000', 'x.pdf', 'loja@cliente.test', ${JSON.stringify(LISTA)}::jsonb, ${grupo.id}) returning id`)

    const criados: { email: string; senha: string }[] = []
    const enviados: string[] = []
    const deps = {
      criarNoAuth: async (email: string, senha: string) => { criados.push({ email, senha }); return randomUUID() },
      apagarDoAuth: async () => {},
      // O e-mail da Aux falha: a senha dela volta para o admin.
      enviar: async (e: { para: string; texto: string }) => { enviados.push(e.texto); return { status: e.para.startsWith('aux') ? 'erro' : 'enviado' } },
      urlLogin: 'https://mova.test/login',
    }
    const r = await criarUsuariosDaAdesao({ adesaoId: adesao.id, lojaId: loja.id, adminId: randomUUID() }, deps, tx)
    assert.ok(r.ok)
    assert.deepEqual(r.resultados.map(x => [x.email, x.situacao]), [
      ['socia@cliente.test', 'criado'], ['aux@cliente.test', 'criado'], ['jatem@cliente.test', 'ja_tinha'],
    ])
    const aux = r.resultados[1]
    assert.ok(aux.situacao === 'criado' && !aux.emailEnviado && aux.senhaProvisoria === criados[1].senha)
    assert.ok(r.resultados[0].situacao === 'criado' && r.resultados[0].emailEnviado && !('senhaProvisoria' in r.resultados[0]), 'e-mail enviado: a senha não volta para a tela')
    assert.ok(enviados[0].includes(criados[0].senha) && enviados[0].includes('https://mova.test/login'))

    const gravados = await rows<{ email: string; papel: string; loja: string; conta: string }>(tx,
      sql`select email, papel, loja_id loja, conta_id conta from usuarios where email in ('socia@cliente.test', 'aux@cliente.test') order by email`)
    assert.deepEqual(gravados, [
      { email: 'aux@cliente.test', papel: 'aux_adm', loja: loja.id, conta: conta.id },
      { email: 'socia@cliente.test', papel: 'admin_socio', loja: loja.id, conta: conta.id },
    ])
    const [log] = await rows<{ n: number }>(tx, sql`select count(*)::int n from log_acoes where tipo = 'permissao_alterada' and grupo_id = ${grupo.id}`)
    assert.equal(log.n, 2)

    const deNovo = await criarUsuariosDaAdesao({ adesaoId: adesao.id, lojaId: loja.id, adminId: randomUUID() }, deps, tx)
    assert.ok(deNovo.ok && deNovo.resultados.every(x => x.situacao === 'ja_tinha'), 'rodar de novo não duplica')
    throw new Desfazer()
  }), Desfazer)
})

test('papel fora da adesão é recusado; falha no log não impede o acesso nem o e-mail', async () => {
  await assert.rejects(db.transaction(async tx => {
    const [conta] = await rows<{ id: string }>(tx, sql`insert into contas (nome) values ('Cliente') returning id`)
    const [grupo] = await rows<{ id: string }>(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Cliente', '12345678000195', ${conta.id}) returning id`)
    const [loja] = await rows<{ id: string }>(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Centro', 'r', 'c', ${grupo.id}) returning id`)
    const lista = [
      { nome: 'Intruso', email: 'intruso@cliente.test', papel: 'admin_geral' },
      { nome: 'Aux', email: 'aux2@cliente.test', papel: 'aux_adm' },
      { nome: 'Vend', email: 'vend2@cliente.test', papel: 'vendedor' },
    ]
    const [adesao] = await rows<{ id: string }>(tx, sql`
      insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, grupo_id)
      values ('Cliente', 'Resp', '65999990000', 'x.pdf', 'loja@cliente.test', ${JSON.stringify(lista)}::jsonb, ${grupo.id}) returning id`)
    // Log fora do ar só nesta transação de teste.
    await tx.execute(sql`create function falha_log() returns trigger language plpgsql as $$ begin raise exception 'log fora do ar'; end $$`)
    await tx.execute(sql`create trigger falha_log before insert on log_acoes for each row execute function falha_log()`)

    const enviados: string[] = []
    const r = await criarUsuariosDaAdesao({ adesaoId: adesao.id, lojaId: loja.id, adminId: randomUUID() }, {
      criarNoAuth: async () => randomUUID(),
      apagarDoAuth: async () => {},
      enviar: async (e: { para: string }) => { enviados.push(e.para); return { status: 'enviado' } },
      urlLogin: 'https://mova.test/login',
    }, tx)
    assert.ok(r.ok)
    assert.deepEqual(r.resultados.map(x => [x.email, x.situacao]), [
      ['intruso@cliente.test', 'erro'], ['aux2@cliente.test', 'criado'], ['vend2@cliente.test', 'criado'],
    ])
    assert.deepEqual(enviados, ['aux2@cliente.test', 'vend2@cliente.test'], 'os dois receberam o e-mail mesmo com o log fora')
    const [n] = await rows<{ n: number }>(tx, sql`select count(*)::int n from usuarios where email in ('aux2@cliente.test', 'vend2@cliente.test', 'intruso@cliente.test')`)
    assert.equal(n.n, 2, 'admin_geral não foi criado')
    throw new Desfazer()
  }), Desfazer)
})
