// Teste de banco: Postgres descartável. Corrida do lado de quem grava (#688, item 7 da R2).
// Cenário da demo 2: o arquivar termina DEPOIS que o gravador conferiu a moto e ANTES de ele
// gravar. Uma sessão segura a linha da moto; o arquivar entra na fila primeiro e o gravador
// depois (a fila da linha é por ordem de chegada). Ao soltar, o arquivar grava e o gravador
// tem de recusar com a frase da arquivada, sem deixar pendência na moto arquivada.
// Fronteira de fora mockada: sessão, Supabase (repassa a função SQL ao banco), next/cache,
// Kommo e WhatsApp.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

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
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  // O cliente do Supabase é a fronteira; a função SQL roda de verdade no banco do teste.
  mock.module('@/lib/supabase/server', {
    namedExports: {
      createClient: async () => ({
        rpc: async (nome: string, args: Record<string, unknown>) => {
          const nomeados = sql.join(Object.entries(args).map(([k, v]) => sql`${sql.raw(k)} => ${v}`), sql`, `)
          try { await db.execute(sql`select ${sql.raw(nome)}(${nomeados})`) } catch (e) {
            return { error: { message: String((e as { cause?: Error }).cause?.message ?? e) } }
          }
          return { error: null }
        },
      }),
    },
  }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
  mock.module('@/lib/kommo', { namedExports: { virarLeadKommo: async () => ({ resultado: 'sem_lead' }) } }),
  mock.module('@/lib/whatsapp/venda', { namedExports: { notificarVendaWhatsapp: async () => ({ resultado: 'desligado' }) } }),
]

type Acoes = {
  reservar: typeof import('@/app/(dashboard)/vendas/actions')['registrarReservaAction']
  vender: typeof import('@/app/(dashboard)/vendas/actions')['registrarVendaCompletaAction']
  pedirAprovacao: typeof import('@/app/(dashboard)/vendas/actions')['solicitarAprovacaoVendaAction']
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
    pedirAprovacao: vendas.solicitarAprovacaoVendaAction, transferir: transf.solicitarTransferenciaAction,
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
  for (const m of mocks) m.restore()
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
