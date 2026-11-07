// Teste de banco: Postgres descartável. Corrida do lado de quem grava (#688, item 7 da R2).
// Cenário da demo 2: o arquivar termina DEPOIS que o gravador conferiu a moto e ANTES de ele
// gravar. Uma sessão segura a linha da moto; o arquivar entra na fila primeiro e o gravador
// depois (a fila da linha é por ordem de chegada). Ao soltar, o arquivar grava e o gravador
// tem de recusar com a frase da arquivada, sem deixar pendência na moto arquivada. No fim, a
// moto viva: com a trava nova, reserva, venda direta, pedido de aprovação e aprovar venda gravam.
// Fronteira de fora mockada: sessão, Supabase (nenhum gravador o chama mais; o módulo das
// actions só o importa), next/cache, Kommo e WhatsApp.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { mockarFronteiraDasVendas } from '@/test/fronteira-vendas'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'MAC688'
const CPF = '52998224725'
let usuarioDaSessao: Record<string, unknown> = {}

type Db = typeof import('@/lib/db')
let db: Db['db']
const restaurarMocks = mockarFronteiraDasVendas(() => usuarioDaSessao)

type Acoes = {
  reservar: typeof import('@/app/(dashboard)/vendas/actions')['registrarReservaAction']
  vender: typeof import('@/app/(dashboard)/vendas/actions')['registrarVendaCompletaAction']
  pedirAprovacao: typeof import('@/app/(dashboard)/vendas/actions')['solicitarAprovacaoVendaAction']
  aprovar: typeof import('@/app/(dashboard)/vendas/actions')['aprovarVendaAction']
  transferir: typeof import('@/app/(dashboard)/transferencias/actions')['solicitarTransferenciaAction']
  abrirGarantia: typeof import('@/app/(dashboard)/garantias/actions')['abrirGarantiaAction']
}
let acoes: Acoes
let arquivarMotos: typeof import('@/lib/arquivar-motos')['arquivarMotos']
let MOTO_ARQUIVADA: string
const semente = { contaId: '', grupoId: '', lojaId: '', destinoId: '', modeloId: '', origemId: '', socioId: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

before(async () => {
  ;({ db } = await import('@/lib/db'))
  const vendas = await import('@/app/(dashboard)/vendas/actions')
  const transf = await import('@/app/(dashboard)/transferencias/actions')
  const garant = await import('@/app/(dashboard)/garantias/actions')
  acoes = {
    reservar: vendas.registrarReservaAction, vender: vendas.registrarVendaCompletaAction,
    pedirAprovacao: vendas.solicitarAprovacaoVendaAction, aprovar: vendas.aprovarVendaAction, transferir: transf.solicitarTransferenciaAction,
    abrirGarantia: garant.abrirGarantiaAction,
  }
  ;({ arquivarMotos } = await import('@/lib/arquivar-motos'))
  ;({ MOTO_ARQUIVADA } = await import('@/lib/arquivar-moto-regras'))
  // As actions usam o db global: a semente é gravada e apagada no after.
  const base = await semearContaBase(db, { prefixo: P, nome: 'A', cnpj: '00000000068860' })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const [destino] = await linhas(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Destino ' + P}, 'C', 'R', ${base.grupoId}) returning id`)
  const [modelo] = await linhas(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [origem] = await linhas(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, ${'Loja ' + P}) returning id`)
  Object.assign(semente, { contaId: base.contaId, grupoId: base.grupoId, lojaId: base.lojaId, destinoId: destino.id, modeloId: modelo.id, origemId: origem.id, socioId })
  usuarioDaSessao = { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null }
})

after(async () => {
  const daSemente = sql`(select id from motos where chassi like ${P + '%'})`
  await db.execute(sql`delete from lancamentos_caixa where venda_id in (select id from vendas where moto_id in ${daSemente})`)
  for (const t of ['vendas', 'reservas', 'pedidos_venda', 'aprovacoes_venda', 'transferencias', 'garantias', 'historico_estoque']) {
    await db.execute(sql`delete from ${sql.raw(t)} where moto_id in ${daSemente}`)
  }
  await db.execute(sql`delete from log_acoes where usuario_id = ${semente.socioId}`)
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from clientes where conta_id = ${semente.contaId}`)
  await db.execute(sql`delete from origens_venda where grupo_id = ${semente.grupoId}`)
  await db.execute(sql`delete from modelos where modelo = ${P}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  await db.execute(sql`delete from lojas where grupo_id = ${semente.grupoId}`)
  await db.execute(sql`delete from grupos where id = ${semente.grupoId}`)
  await db.execute(sql`delete from contas where id = ${semente.contaId}`)
  restaurarMocks()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function novaMoto(rotulo: string) {
  const [m] = await linhas(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${P + rotulo}, ${semente.modeloId}, ${semente.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  return m.id as string
}

const cliente = { clienteNome: 'Cliente ' + P, clienteCpf: CPF, clienteCelular: '35999990688', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: '' }
const venda = (motoId: string, tipo = 'pix') => ({ motoId, ...cliente, valorTotal: '1000', pagamentos: [{ tipo, valor: 1000 }], origemId: semente.origemId })

// Sessões esperando lock por causa de uma das sessões dadas.
const esperandoPor = async (pids: number[]) => (await linhas(sql`select pid from pg_stat_activity
  where pg_blocking_pids(pid) && ${sql.param(pids)}::int[]`)).map(r => Number(r.pid))

async function ate(condicao: () => Promise<boolean>, oQue: string) {
  for (let i = 0; i < 400; i++) { if (await condicao()) return; await new Promise(r => setImmediate(r)) }
  throw new Error('não chegou: ' + oQue)
}

/** Roda a corrida e devolve o que o gravador respondeu, se o arquivar passou e as pendências que sobraram. */
async function corrida(motoId: string, gravar: () => Promise<unknown>, pendencia: ReturnType<typeof sql>) {
  const segura = new pg.Client({ connectionString: url })
  await segura.connect()
  try {
    await segura.query('begin')
    await segura.query('select id from motos where id = $1 for update', [motoId])
    const seguraPid = (await segura.query('select pg_backend_pid() p')).rows[0].p as number

    const arquivou = arquivarMotos(usuarioDaSessao as Parameters<typeof arquivarMotos>[0], [motoId], 'golpe')
      .then(() => true, (e: Error) => e.message)
    await ate(async () => (await esperandoPor([seguraPid])).length === 1, 'o arquivar esperando a linha')
    const [arquivarPid] = await esperandoPor([seguraPid])

    const gravou = gravar()
    await ate(async () => (await esperandoPor([seguraPid, arquivarPid])).some(p => p !== arquivarPid), 'o gravador na fila, atrás do arquivar')

    await segura.query('commit')
    const [resposta, arquivar] = await Promise.all([gravou, arquivou])
    const [{ arquivada, pendencias }] = await linhas(sql`select arquivada_em is not null as arquivada, (${pendencia})::int as pendencias from motos where id = ${motoId}`)
    return { resposta, arquivar, arquivada, pendencias }
  } finally {
    await segura.end()
  }
}

const recusou = { ok: false, erro: '' }

test('reserva: o arquivar que termina entre a checagem e a gravação faz a reserva recusar; nada fica reservado', async () => {
  const moto = await novaMoto('RES')
  const r = await corrida(moto, () => acoes.reservar({ motoId: moto, ...cliente, valorReserva: '300', valorTotalVenda: '1000',
    pagamentos: [{ tipo: 'pix', valor: 300 }], dataPrevistaFinalizacao: '2026-11-30' }),
  sql`select count(*) from reservas where moto_id = ${moto} and status = 'ativa'`)
  assert.deepEqual(r, { resposta: { ...recusou, erro: MOTO_ARQUIVADA }, arquivar: true, arquivada: true, pendencias: 0 })
})

test('venda: o arquivar que termina entre a checagem e a gravação faz a venda recusar; nenhuma venda fica', async () => {
  const moto = await novaMoto('VEN')
  const r = await corrida(moto, () => acoes.vender(venda(moto)), sql`select count(*) from vendas where moto_id = ${moto}`)
  assert.deepEqual(r, { resposta: { ...recusou, erro: MOTO_ARQUIVADA }, arquivar: true, arquivada: true, pendencias: 0 })
})

test('pedido de aprovação: o arquivar que termina no meio faz o pedido recusar; nada fica aguardando', async () => {
  const moto = await novaMoto('APR')
  const r = await corrida(moto, () => acoes.pedirAprovacao(venda(moto, 'transferencia'), '', 'pagamento_sensivel'),
    sql`select count(*) from aprovacoes_venda where moto_id = ${moto} and status = 'pendente'`)
  assert.deepEqual(r, { resposta: { ...recusou, erro: MOTO_ARQUIVADA }, arquivar: true, arquivada: true, pendencias: 0 })
})

test('transferência: o arquivar que termina no meio faz a transferência recusar; nada fica pendente', async () => {
  const moto = await novaMoto('TRF')
  const r = await corrida(moto, () => acoes.transferir(moto, semente.destinoId),
    sql`select count(*) from transferencias where moto_id = ${moto} and status = 'pendente'`)
  assert.deepEqual(r, { resposta: { ...recusou, erro: MOTO_ARQUIVADA }, arquivar: true, arquivada: true, pendencias: 0 })
})

test('garantia: o arquivar que termina no meio faz a garantia recusar; nenhuma garantia fica ativa', async () => {
  const moto = await novaMoto('GAR')
  const r = await corrida(moto, () => acoes.abrirGarantia({ motoId: moto, descricao: 'bateria', dataInicio: '2026-11-05' }),
    sql`select count(*) from garantias where moto_id = ${moto} and status = 'ativa'`)
  assert.deepEqual(r, { resposta: { ...recusou, erro: MOTO_ARQUIVADA }, arquivar: true, arquivada: true, pendencias: 0 })
})

const reserva = (motoId: string) => ({ motoId, ...cliente, valorReserva: '300', valorTotalVenda: '1000',
  pagamentos: [{ tipo: 'pix', valor: 300 }], dataPrevistaFinalizacao: '2026-11-30' })
const estadoDa = async (motoId: string) => (await linhas(sql`select m.status, m.disponibilidade,
  (select count(*)::int from reservas r where r.moto_id = m.id and r.status = 'ativa') as reservas,
  (select count(*)::int from vendas v where v.moto_id = m.id) as vendas,
  (select count(*)::int from aprovacoes_venda a where a.moto_id = m.id and a.status = 'pendente') as aprovacoes
  from motos m where m.id = ${motoId}`))[0]

test('moto viva: a reserva grava e a moto fica reservada', async () => {
  const moto = await novaMoto('VIVARES')
  assert.equal((await acoes.reservar(reserva(moto))).ok, true)
  assert.deepEqual(await estadoDa(moto), { status: 'montada', disponibilidade: 'reservada', reservas: 1, vendas: 0, aprovacoes: 0 })
})

test('moto viva: a venda direta grava e a moto fica vendida', async () => {
  const moto = await novaMoto('VIVAVEN')
  assert.equal((await acoes.vender(venda(moto))).ok, true)
  // Vendida fica sem disponibilidade até a NF de saída (criarVendaTx).
  assert.deepEqual(await estadoDa(moto), { status: 'vendida', disponibilidade: null, reservas: 0, vendas: 1, aprovacoes: 0 })
})

test('moto viva: o pedido de aprovação grava e a moto fica aguardando', async () => {
  const moto = await novaMoto('VIVAAPR')
  assert.deepEqual(await acoes.pedirAprovacao(venda(moto, 'transferencia'), '', 'pagamento_sensivel'), { ok: true, dados: undefined })
  assert.deepEqual(await estadoDa(moto), { status: 'montada', disponibilidade: 'aguardando_aprovacao', reservas: 0, vendas: 0, aprovacoes: 1 })
})

test('moto viva: aprovar a venda grava a venda pela trava nova', async () => {
  const moto = await novaMoto('VIVAOK')
  await acoes.pedirAprovacao(venda(moto, 'transferencia'), '', 'pagamento_sensivel')
  const [{ id }] = await linhas(sql`select id from aprovacoes_venda where moto_id = ${moto} and status = 'pendente'`)
  // Quem aprova transferência bancária tem a permissão ligada no cadastro, para o grupo da loja.
  const sessao = usuarioDaSessao
  usuarioDaSessao = { ...sessao, aprovaPagamentoSensivel: true, gruposAprovacao: [semente.grupoId] }
  try {
    assert.deepEqual(await acoes.aprovar(id), { ok: true, dados: undefined })
  } finally {
    usuarioDaSessao = sessao
  }
  assert.deepEqual(await estadoDa(moto), { status: 'vendida', disponibilidade: null, reservas: 0, vendas: 1, aprovacoes: 0 })
})
