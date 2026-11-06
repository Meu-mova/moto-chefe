// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Moto arquivada (0174): some do estoque, do quadro "vendida sem venda", das
// transferências e da busca de Garantias/OS; só o RADAR a acha, e só na própria Conta.
// As consultas usam o db global, então os dados são gravados e apagados no after.
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
let db: Db['db']
let motosQ: typeof import('@/lib/queries/motos')
let semVenda: typeof import('@/lib/motos-vendidas-sem-venda')
let transf: typeof import('@/lib/queries/transferencias')
let busca: typeof import('@/lib/busca-chassi')

const contas: string[] = []
const lojas: string[] = []
const motoId: Record<string, string> = {}
let usuarioId = ''

const linha = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]

before(async () => {
  ;({ db } = await import('@/lib/db'))
  motosQ = await import('@/lib/queries/motos')
  semVenda = await import('@/lib/motos-vendidas-sem-venda')
  transf = await import('@/lib/queries/transferencias')
  busca = await import('@/lib/busca-chassi')

  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'ARQ172', 'autopropelido', '1000', 'hub', '32') returning id`)
  for (const [nome, cnpj] of [['A', '00000000017201'], ['B', '00000000017202']]) {
    const conta = await linha(sql`insert into contas (nome) values (${'Arquivo 172 ' + nome}) returning id`)
    contas.push(conta.id)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Arquivo 172 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja Arquivo 172 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
    lojas.push(loja.id)
  }
  const u = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'ARQ172', ${'arq172-' + Math.random() + '@teste.local'}, 'admin_geral', null) returning id`)
  usuarioId = u.id

  // Na Conta A: uma disponível viva, uma disponível arquivada, uma vendida sem venda viva e
  // uma vendida sem venda arquivada (o caso do golpe).
  const motosA: [string, string, string | null, boolean][] = [
    ['ARQ172VIVA', 'montada', 'disponivel', false],
    ['ARQ172ARQ', 'montada', 'disponivel', true],
    ['ARQ172VEND', 'montada', 'vendida', false],
    ['ARQ172GOLPE', 'em_garantia', 'vendida', true],
  ]
  for (const [chassi, status, disp, arquivada] of motosA) {
    const m = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${chassi}, ${modelo.id}, ${lojas[0]}, 'CINZA', '1', ${status}::moto_status, ${disp}::disponibilidade_moto) returning id`)
    motoId[chassi] = m.id
    if (arquivada) {
      await db.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${usuarioId}, motivo_arquivo = 'teste' where id = ${m.id}`)
    }
  }
})

after(async () => {
  await db.execute(sql`delete from historico_estoque where moto_id in (select id from motos where chassi like 'ARQ172%')`)
  await db.execute(sql`delete from motos where chassi like 'ARQ172%'`)
  await db.execute(sql`delete from modelos where modelo = 'ARQ172'`)
  await db.execute(sql`delete from usuarios where nome = 'ARQ172'`)
  await db.execute(sql`delete from lojas where nome like 'Loja Arquivo 172%'`)
  await db.execute(sql`delete from grupos where nome like 'Arquivo 172%'`)
  await db.execute(sql`delete from contas where nome like 'Arquivo 172%'`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('estoque: arquivada some, mesmo disponível', async () => {
  const lista = await motosQ.listarMotos({ excluirVendidas: true, lojaId: [lojas[0]] })
  assert.deepEqual(lista.map(m => m.chassi), ['ARQ172VIVA'])
  const porChassi = await motosQ.listarMotos({ chassiBusca: 'ARQ172', contaId: contas[0] })
  assert.ok(!porChassi.some(m => m.chassi === 'ARQ172ARQ' || m.chassi === 'ARQ172GOLPE'), 'sem incluirArquivadas, nenhuma busca acha')
})

test('RADAR: acha a arquivada com a marca, e só na própria Conta', async () => {
  const daA = await motosQ.listarMotos({ chassiBusca: 'ARQ172', contaId: contas[0], incluirArquivadas: true })
  assert.deepEqual(daA.map(m => m.chassi).sort(), ['ARQ172ARQ', 'ARQ172GOLPE', 'ARQ172VEND', 'ARQ172VIVA'])
  assert.ok(daA.find(m => m.chassi === 'ARQ172GOLPE')?.arquivadaEm, 'vem com arquivadaEm')
  assert.equal(daA.find(m => m.chassi === 'ARQ172VIVA')?.arquivadaEm, null)

  const daB = await motosQ.listarMotos({ chassiBusca: 'ARQ172', contaId: contas[1], incluirArquivadas: true })
  assert.deepEqual(daB, [], 'Conta B não acha moto arquivada da A')
})

test('quadro "vendida sem venda": arquivada some e não volta ao estoque por ele', async () => {
  const quadro = await semVenda.listarMotosVendidasSemVenda(contas[0], [lojas[0]])
  assert.deepEqual(quadro.map(m => m.chassi), ['ARQ172VEND'])
  assert.equal(await semVenda.motoVendidaSemVendaPorChassi(contas[0], [lojas[0]], 'ARQ172GOLPE'), null)
  assert.equal(await semVenda.voltarMotoAoEstoque(contas[0], motoId.ARQ172GOLPE, usuarioId), false)
  const [m] = ((await db.execute(sql`select disponibilidade, status from motos where id = ${motoId.ARQ172GOLPE}`)) as unknown as { rows: { disponibilidade: string; status: string }[] }).rows
  assert.deepEqual(m, { disponibilidade: 'vendida', status: 'em_garantia' })
})

test('transferência e busca de Garantias/OS: arquivada não aparece', async () => {
  const transferiveis = await transf.listarMotosTransferiveis([lojas[0]])
  assert.ok(!transferiveis.some(m => m.chassi === 'ARQ172ARQ' || m.chassi === 'ARQ172GOLPE'))
  assert.ok(transferiveis.some(m => m.chassi === 'ARQ172VIVA'))

  const achadas = await busca.buscarMotosPorChassi('ARQ172', { contaDasMotos: contas[0], contaDoComprador: contas[0], limite: 20 })
  assert.deepEqual(achadas.map(m => m.chassi).sort(), ['ARQ172VEND', 'ARQ172VIVA'])
  assert.equal(await busca.motoDaContaPorChassi('ARQ172GOLPE', contas[0], null), null)
})

test('arquivar exige quem e por quê', async () => {
  await assert.rejects(db.execute(sql`update motos set arquivada_em = now() where id = ${motoId.ARQ172VIVA}`), /motos_arquivo_completo/)
  await assert.rejects(db.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${usuarioId}, motivo_arquivo = '  ' where id = ${motoId.ARQ172VIVA}`), /motos_arquivo_completo/)
})
