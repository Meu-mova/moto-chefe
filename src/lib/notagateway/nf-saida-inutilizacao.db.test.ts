// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
// Chave descartável só para o cifrar() do teste da configuração.
process.env.CERT_MASTER_KEY ??= 'a'.repeat(64)

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Mod = typeof import('@/lib/notagateway/inutilizar')
type Deps = import('@/lib/notagateway/inutilizar').DependenciasInutilizacao
type DepsFaixa = import('@/lib/notagateway/inutilizar-faixa').DependenciasFaixa
let db: Db['db']
let m: Mod
let mf: typeof import('@/lib/notagateway/inutilizar-faixa')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/notagateway/inutilizar')
  mf = await import('@/lib/notagateway/inutilizar-faixa')
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

const JUSTIFICATIVA = 'Venda cancelada após a rejeição da nota'

/** Credencial da NG do grupo; o token só é decifrado onde o teste cifra um de verdade. */
const configurarNg = (tx: Tx, grupoId: string, ambiente: string, empresaId: string | null = 'empresa-de-teste') =>
  tx.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id, ambiente) values (${grupoId}, 'token-de-teste', ${empresaId}, ${ambiente})`)

async function semearConta(tx: Tx, nome: string, cnpj: string, ambienteDaNg: string | null = 'Homologacao') {
  const base = await semearContaBase(tx, { prefixo: 'IN504', nome, cnpj })
  if (ambienteDaNg) await configurarNg(tx, base.grupoId, ambienteDaNg)
  const usuario = async (papel: string) =>
    ({ id: await semearUsuario(tx, base, { papel }), papel, lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId })
  return { grupoId: base.grupoId, socio: await usuario('admin_socio'), aux: await usuario('aux_adm') }
}

const inutilizacoes = (tx: Tx, notaId: string) => linhas(tx, sql`select * from notas_fiscais_saida_inutilizacoes where nota_id = ${notaId}`)

type Semente = { status?: string; numero?: string; serie?: string; motivo?: string | null; ambiente?: string }

/** Nota de venda cancelada com qualquer status: ocupa o número ou não (#597). */
async function semearNota(tx: Tx, grupoId: string, vendaNumero: number, { status = 'Autorizada', numero = '974', serie = '1', motivo = null, ambiente = 'Homologacao' }: Semente = {}) {
  const [nota] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, serie, payload)
    values (null, ${vendaNumero}, ${grupoId}, ${`in597-${vendaNumero}`}, ${ambiente}, ${status}, ${motivo}, ${numero}, ${serie}, '{}'::jsonb) returning id`)
  return nota.id as string
}

const logDe = (tx: Tx, inutilizacaoId: string) => linhas(tx, sql`select usuario_id, detalhe from log_acoes where detalhe->>'inutilizacaoId' = ${inutilizacaoId} order by criado_em`)

const semearNotaNegada = (tx: Tx, grupoId: string, vendaNumero: number, numero = '974') =>
  semearNota(tx, grupoId, vendaNumero, { status: 'Negada', motivo: '225 - Falha no schema', numero })

const notasDaDecisao = (tx: Tx, ids: string[]) => linhas(tx, sql`select id, numero, serie, status, motivo_status as "motivoStatus", venda_id as "vendaId"
  from notas_fiscais_saida where id = any(${sql.param(ids)}::uuid[])`)

test('a Conta B não pede inutilização da nota da Conta A, e recebe a mesma frase do id inexistente (#504)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950401)

    const deB = await m.prepararInutilizacao(tx, b.socio, notaA, JUSTIFICATIVA)
    const inexistente = await m.prepararInutilizacao(tx, b.socio, '00000000-0000-0000-0000-000000000000', JUSTIFICATIVA)
    assert.deepEqual(deB, { ok: false, erro: 'NF não encontrada' })
    assert.deepEqual(inexistente, deB)
    assert.equal((await inutilizacoes(tx, notaA)).length, 0)
  })
})

test('a Conta B não vê nem sobrescreve a inutilização da Conta A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950402)
    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(r.ok)
    const id = r.pedido.inutilizacaoId

    assert.equal(await m.inutilizacaoDoUsuario(tx, b.socio, id), null)
    assert.equal((await m.inutilizacaoDoUsuario(tx, a.socio, id))?.id, id)
    // Gravação com o grupo da B no where não acha a linha da A.
    await m.gravarResultadoDaInutilizacao(tx, { id, grupoId: b.grupoId }, { status: 'InutilizacaoAutorizada', motivoStatus: null, protocolo: 'P-B' })
    const [linha] = await inutilizacoes(tx, notaA)
    assert.equal(linha.situacao, 'pendente')
    assert.equal(linha.protocolo, null)
  })
})

test('o sócio da Conta pede: grava a faixa da própria nota, no grupo da nota, com a justificativa sem acento', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950403)
    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(r.ok)
    const [linha] = await inutilizacoes(tx, notaA)
    assert.equal(linha.grupo_id, a.grupoId)
    assert.deepEqual([linha.serie, linha.numero_inicial, linha.numero_final], ['1', 974, 974])
    assert.equal(linha.justificativa, 'Venda cancelada apos a rejeicao da nota')
    assert.equal(linha.situacao, 'pendente')
  })
})

test('o aux_adm não inutiliza, nem na própria Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950404)
    assert.deepEqual(await m.prepararInutilizacao(tx, a.aux, notaA, JUSTIFICATIVA), { ok: false, erro: 'NF não encontrada' })
  })
})

test('o mesmo número não se pede duas vezes; negada libera um novo pedido', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950405)
    const primeiro = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(primeiro.ok)
    assert.equal((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok, false)

    await m.gravarResultadoDaInutilizacao(tx, { id: primeiro.pedido.inutilizacaoId, grupoId: a.grupoId },
      { status: 'InutilizacaoNegada', motivoStatus: 'Faixa já utilizada', protocolo: null })
    const segundo = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(segundo.ok)
    assert.notEqual(segundo.pedido.idExterno, primeiro.pedido.idExterno)
    assert.equal((await inutilizacoes(tx, notaA)).length, 2)
  })
})

test('pedido que não chegou à NG (marcado não enviado) libera o número para outro pedido', async () => {
  const { STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO } = await import('@/lib/notagateway/inutilizacao')
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950406)
    for (const status of [STATUS_SEM_CONFIGURACAO, STATUS_NAO_ENVIADA]) {
      const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
      assert.ok(r.ok, status)
      await m.gravarResultadoDaInutilizacao(tx, { id: r.pedido.inutilizacaoId, grupoId: a.grupoId }, { status, motivoStatus: 'x', protocolo: null })
    }
    assert.equal((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok, true)
    const status = (await inutilizacoes(tx, notaA)).map(l => `${l.status}:${l.situacao}`).sort()
    assert.deepEqual(status, ['Enviando:pendente', 'NaoEnviada:negada', 'SemConfiguracao:negada'])
  })
})

test('número em nota que o ocupa no mesmo grupo e série recusa antes do envio; em outra Conta ou em grupo irmão, não (C4)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950410, '0976')
    const notaB = await semearNotaNegada(tx, b.grupoId, 950411, '976')
    await semearNota(tx, a.grupoId, 950412, { status: 'Autorizada', numero: '976' })

    assert.deepEqual(await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA),
      { ok: false, erro: 'O número 976 está em outra nota deste grupo (autorizada, cancelada, denegada ou em andamento). Não há o que inutilizar.' })
    assert.equal((await inutilizacoes(tx, notaA)).length, 0, 'nada gravado')
    assert.ok((await m.prepararInutilizacao(tx, b.socio, notaB, JUSTIFICATIVA)).ok, 'a autorizada da A não trava o número da B')

    // Em andamento também ocupa o número.
    const notaA2 = await semearNotaNegada(tx, a.grupoId, 950413, '977')
    await semearNota(tx, a.grupoId, 950414, { status: 'Processando', numero: '977' })
    assert.equal((await m.prepararInutilizacao(tx, a.socio, notaA2, JUSTIFICATIVA)).ok, false, 'Processando ocupa')

    // Grupo irmão da mesma Conta: o recorte é por grupo, não por Conta.
    const [irmao] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('IN504 A2', '00000000050403', ${a.socio.contaId}) returning id`)
    await configurarNg(tx, irmao.id, 'Homologacao')
    const notaIrmao = await semearNotaNegada(tx, irmao.id, 950415, '976')
    assert.ok((await m.prepararInutilizacao(tx, { ...a.socio, gruposAcesso: [irmao.id] }, notaIrmao, JUSTIFICATIVA)).ok, 'a autorizada do grupo A não trava o grupo irmão')
  })
})

test('série "001" e "1" são a mesma série: recusa o número ocupado e grava o pedido com a série sem zeros (C4)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const ocupada = await semearNotaNegada(tx, a.grupoId, 950420, '976')
    await semearNota(tx, a.grupoId, 950421, { status: 'Autorizada', numero: '0976', serie: '001' })
    assert.equal((await m.prepararInutilizacao(tx, a.socio, ocupada, JUSTIFICATIVA)).ok, false)

    const livre = await semearNota(tx, a.grupoId, 950422, { status: 'Negada', motivo: '225 - Falha no schema', numero: '0978', serie: '001' })
    const r = await m.prepararInutilizacao(tx, a.socio, livre, JUSTIFICATIVA)
    assert.ok(r.ok)
    const [linha] = await inutilizacoes(tx, livre)
    assert.deepEqual([linha.serie, linha.numero_inicial], ['1', 978])
  })
})

test('duas recusadas com o mesmo número: o pedido numa esconde o botão da outra, e o preparo da outra recusa (C5)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const n1 = await semearNotaNegada(tx, a.grupoId, 950430, '978')
    const n2 = await semearNotaNegada(tx, a.grupoId, 950431, '978')
    assert.ok((await m.prepararInutilizacao(tx, a.socio, n1, JUSTIFICATIVA)).ok)
    assert.deepEqual(await m.prepararInutilizacao(tx, a.socio, n2, JUSTIFICATIVA), { ok: false, erro: 'Este número já tem um pedido de inutilização.' })

    const { decidirInutilizacao } = await import('@/lib/notagateway/inutilizacao')
    const notas = await notasDaDecisao(tx, [n1, n2])
    const daA = await m.contextoDeInutilizacao(tx, { grupoId: a.grupoId, ambiente: 'Homologacao' }, notas)
    assert.deepEqual(notas.map(n => decidirInutilizacao(daA.get(n.id)!).tipo), ['pendente', 'pendente'])

    // O mesmo loader com o grupo da B não enxerga o pedido nem as notas da A.
    const daB = await m.contextoDeInutilizacao(tx, { grupoId: b.grupoId, ambiente: 'Homologacao' }, notas)
    assert.deepEqual([daB.get(n1)!.pedidos, daB.get(n1)!.outrasNotas], [[], []])
  })
})

test('envio: todo pedido vai ao log com o resultado; 4xx nega, 5xx ou rede deixa pendente com aviso, e o console só vê o status (C6, C7)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { InutilizacaoRecusada, NotaGatewayIndisponivel } = await import('@/lib/notagateway/client')
    const a = await semearConta(tx, 'A', '00000000050401')
    const cfg = { token: 'token-de-teste', empresaId: 'empresa-de-teste', ambiente: 'Homologacao' as const }
    const deps = (enviar: Deps['enviar']): Deps => ({ exec: tx, config: async () => ({ cfg }), enviar, vercelEnv: undefined })
    const erroDoConsole = mock.method(console, 'error', () => {})
    try {
      const recusada = await semearNotaNegada(tx, a.grupoId, 950440, '980')
      const r1 = await m.inutilizarNumeroDaNota(a.socio, recusada, JUSTIFICATIVA, deps(async () => { throw new InutilizacaoRecusada('serie invalida') }))
      assert.deepEqual(r1, { ok: false, erro: 'A Nota Gateway recusou o pedido: serie invalida' })
      const [l1] = await inutilizacoes(tx, recusada)
      assert.equal(l1.situacao, 'negada')
      const [log1] = await logDe(tx, l1.id)
      assert.equal(log1.usuario_id, a.socio.id)
      assert.deepEqual(
        [log1.detalhe.resultado, log1.detalhe.notaId, log1.detalhe.numero, log1.detalhe.serie, log1.detalhe.ambiente, log1.detalhe.numeroVenda],
        ['recusado', recusada, 980, '1', 'Homologacao', 950440],
      )
      assert.match(log1.detalhe.motivo, /serie invalida/)

      const semResposta = await semearNotaNegada(tx, a.grupoId, 950441, '981')
      const r2 = await m.inutilizarNumeroDaNota(a.socio, semResposta, JUSTIFICATIVA, deps(async () => { throw new NotaGatewayIndisponivel(503) }))
      assert.ok(r2.ok)
      assert.equal(r2.aviso, m.AVISO_SEM_RESPOSTA)
      const [l2] = await inutilizacoes(tx, semResposta)
      assert.equal(l2.situacao, 'pendente')
      assert.deepEqual((await logDe(tx, l2.id)).map(l => l.detalhe.resultado), ['sem_resposta'])

      const rede = await semearNotaNegada(tx, a.grupoId, 950442, '982')
      const r3 = await m.inutilizarNumeroDaNota(a.socio, rede, JUSTIFICATIVA, deps(async () => { throw new Error('fetch failed: corpo-cru-da-ng') }))
      assert.ok(r3.ok && r3.aviso === m.AVISO_SEM_RESPOSTA)
      assert.equal((await inutilizacoes(tx, rede))[0].situacao, 'pendente')

      // O console vê só o status HTTP ou o nome do erro: nunca a mensagem crua, o token ou o empresaId (C7).
      const textos = erroDoConsole.mock.calls.map(c => c.arguments.join(' '))
      assert.equal(textos.length, 2)
      assert.match(textos[0], /HTTP 503/)
      assert.match(textos[1], /\(Error\)/)
      for (const proibido of ['corpo-cru-da-ng', 'token-de-teste', 'empresa-de-teste', 'serie invalida']) {
        assert.ok(textos.every(t => !t.includes(proibido)), proibido)
      }

      const enviada = await semearNotaNegada(tx, a.grupoId, 950443, '983')
      const r4 = await m.inutilizarNumeroDaNota(a.socio, enviada, JUSTIFICATIVA, deps(async () => {}))
      assert.deepEqual(r4, { ok: true, inutilizacaoId: (await inutilizacoes(tx, enviada))[0].id, aviso: null })
      assert.deepEqual((await logDe(tx, r4.ok ? r4.inutilizacaoId : '')).map(l => l.detalhe.resultado), ['enviado'])
    } finally {
      erroDoConsole.mock.restore()
    }
  })
})

test('produção fora do deploy de produção, ou grupo sem configuração: recusa antes do envio, número livre, log recusado (C6)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401', 'Producao')
    const nuncaEnvia: Deps['enviar'] = async () => { throw new Error('o teste não devia chegar ao envio') }
    const producao = await semearNota(tx, a.grupoId, 950450, { status: 'Negada', motivo: '225 - Falha no schema', numero: '984', ambiente: 'Producao' })
    const cfgProducao = { cfg: { token: 't', empresaId: 'e', ambiente: 'Producao' as const } }
    const r1 = await m.inutilizarNumeroDaNota(a.socio, producao, JUSTIFICATIVA, { exec: tx, config: async () => cfgProducao, enviar: nuncaEnvia, vercelEnv: 'preview' })
    assert.equal(r1.ok, false)
    assert.match((r1 as { erro: string }).erro, /só roda em homologação/)
    const [l1] = await inutilizacoes(tx, producao)
    assert.equal(l1.situacao, 'negada')
    assert.deepEqual((await logDe(tx, l1.id)).map(l => l.detalhe.resultado), ['recusado'])
    assert.ok((await m.prepararInutilizacao(tx, a.socio, producao, JUSTIFICATIVA)).ok, 'o número ficou livre para outro pedido')

    // Grupo sem credencial da NG: a decisão recusa antes de gravar, sem chegar à configuração.
    const c = await semearConta(tx, 'C', '00000000050404', null)
    const semConfig = await semearNotaNegada(tx, c.grupoId, 950451, '985')
    const r2 = await m.inutilizarNumeroDaNota(c.socio, semConfig, JUSTIFICATIVA, { exec: tx, config: async () => { throw new Error('não devia ler a configuração') }, enviar: nuncaEnvia, vercelEnv: undefined })
    assert.deepEqual(r2, { ok: false, erro: 'Nota Gateway não configurada para esta empresa.' })
    assert.equal((await inutilizacoes(tx, semConfig)).length, 0, 'nada gravado')
  })
})

test('Notas emitidas: a situação da inutilização na lista segue a decisão do pedido, e a Conta B não vê a da A (C1, C5, C9)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { anexarSituacaoDeInutilizacao, listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas')
    const { hojeBrt } = await import('@/lib/data-venda')
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950460, '990')
    await semearNota(tx, a.grupoId, 950461, { status: 'Autorizada', numero: '991' })
    const situacoes = async (grupoId: string, contaId: string) => {
      const notas = await listarNotasEmitidas({ grupoId, contaId, ambiente: 'Homologacao', de: '2000-01-01', ate: hojeBrt() }, tx)
      return anexarSituacaoDeInutilizacao(notas, { grupoId, contaId, ambiente: 'Homologacao', de: '2000-01-01', ate: hojeBrt() }, tx)
    }
    const listaDaA = () => situacoes(a.grupoId, a.socio.contaId)
    const daA = async () => (await listaDaA()).find(n => n.id === notaA)!

    assert.deepEqual((await daA()).inutilizacao, { tipo: 'pode', serie: '1', numero: 990, ultimaNegada: null })
    assert.equal((await daA()).ambiente, 'Homologacao', 'o ambiente da nota vai para a tela (C2)')
    assert.equal((await listaDaA()).find(n => n.numero === '991')!.inutilizacao.tipo, 'nenhuma', 'autorizada não mostra nada')

    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(r.ok)
    assert.equal((await daA()).inutilizacao.tipo, 'pendente')

    await m.gravarResultadoDaInutilizacao(tx, { id: r.pedido.inutilizacaoId, grupoId: a.grupoId }, { status: 'InutilizacaoNegada', motivoStatus: 'Faixa ja utilizada', protocolo: null })
    assert.deepEqual((await daA()).inutilizacao, { tipo: 'pode', serie: '1', numero: 990, ultimaNegada: 'Faixa ja utilizada' })

    // A Conta B pedindo o grupo da A: a lista vem vazia e não há o que anexar.
    assert.deepEqual(await situacoes(a.grupoId, b.socio.contaId), [])
  })
})

test('configuração que falha ao ser lida (banco ou chave): recusa, número livre, log recusado, nada pendente (C6)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const nota = await semearNotaNegada(tx, a.grupoId, 950452, '986')
    const erroDoConsole = mock.method(console, 'error', () => {})
    try {
      const r = await m.inutilizarNumeroDaNota(a.socio, nota, JUSTIFICATIVA, {
        exec: tx, config: async () => { throw new Error('chave de cifra ausente') }, enviar: async () => { throw new Error('não devia enviar') }, vercelEnv: undefined,
      })
      assert.deepEqual(r, { ok: false, erro: 'Não deu para ler a configuração da Nota Gateway desta empresa. Tente de novo.' })
      const [linha] = await inutilizacoes(tx, nota)
      assert.equal(linha.situacao, 'negada')
      assert.deepEqual((await logDe(tx, linha.id)).map(l => l.detalhe.resultado), ['recusado'])
      assert.ok((await m.prepararInutilizacao(tx, a.socio, nota, JUSTIFICATIVA)).ok, 'o número ficou livre')
      assert.match(erroDoConsole.mock.calls.map(c => c.arguments.join(' ')).join('\n'), /configuração/)
    } finally {
      erroDoConsole.mock.restore()
    }
  })
})

test('configDoAmbiente lê a credencial do grupo: sem configuração, ambiente diferente e ambiente igual (C6)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { cifrar } = await import('@/lib/cripto')
    const a = await semearConta(tx, 'A', '00000000050401')
    const c = await semearConta(tx, 'C', '00000000050404', null)
    assert.deepEqual(await m.configDoAmbiente(c.grupoId, 'Homologacao', tx), { erro: 'Nota Gateway não configurada para esta empresa.' })

    await tx.execute(sql`update notagateway_config set token = ${cifrar('tok-cifrado')}, empresa_id = 'emp-1', ambiente = 'Producao' where grupo_id = ${a.grupoId}`)
    assert.deepEqual(await m.configDoAmbiente(a.grupoId, 'Homologacao', tx), { erro: 'Esta nota é de homologação e o grupo está em produção. Volte o ambiente em Admin, Notas fiscais, para inutilizar o número' })
    assert.deepEqual(await m.configDoAmbiente(a.grupoId, 'Producao', tx), { cfg: { token: 'tok-cifrado', empresaId: 'emp-1', ambiente: 'Producao' } })
  })
})

test('grupo em outro ambiente da NG: a lista não mostra o botão e o pedido recusa, pela mesma regra (C1)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { anexarSituacaoDeInutilizacao, listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas')
    const { hojeBrt } = await import('@/lib/data-venda')
    const a = await semearConta(tx, 'A', '00000000050401', 'Producao')
    const homolog = await semearNotaNegada(tx, a.grupoId, 950470, '992')
    const orientacao = 'Esta nota é de homologação e o grupo está em produção. Volte o ambiente em Admin, Notas fiscais, para inutilizar o número'
    assert.deepEqual(await m.prepararInutilizacao(tx, a.socio, homolog, JUSTIFICATIVA), { ok: false, erro: orientacao })
    assert.equal((await inutilizacoes(tx, homolog)).length, 0)
    const lista = await listarNotasEmitidas({ grupoId: a.grupoId, contaId: a.socio.contaId, ambiente: 'Homologacao', de: '2000-01-01', ate: hojeBrt() }, tx)
    const [situacao] = await anexarSituacaoDeInutilizacao(lista, { grupoId: a.grupoId, contaId: a.socio.contaId, ambiente: 'Homologacao', de: '2000-01-01', ate: hojeBrt() }, tx)
    assert.deepEqual(situacao.inutilizacao, { tipo: 'ambiente_divergente', erro: orientacao })
    // A recusada de produção do mesmo grupo segue elegível.
    const producao = await semearNota(tx, a.grupoId, 950471, { status: 'Negada', motivo: '225 - Falha no schema', numero: '993', ambiente: 'Producao' })
    assert.ok((await m.prepararInutilizacao(tx, a.socio, producao, JUSTIFICATIVA)).ok)
  })
})

test('a situação na lista fica presa ao filtro da lista: nota de outro grupo ou ambiente não vai ao loader (C9)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { anexarSituacaoDeInutilizacao, listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas')
    const { hojeBrt } = await import('@/lib/data-venda')
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950490, '996')
    assert.ok((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok)
    const filtroA = { grupoId: a.grupoId, contaId: a.socio.contaId, ambiente: 'Homologacao' as const, de: '2000-01-01', ate: hojeBrt() }
    const listaA = await listarNotasEmitidas(filtroA, tx)
    assert.equal(listaA.length, 1)

    const foraDoEscopo = { tipo: 'nenhuma', erro: 'Nota de outro grupo ou ambiente.' }
    // Chamador errado: as notas da A com o filtro da B. Nada da A é lido nem mostrado.
    assert.deepEqual((await anexarSituacaoDeInutilizacao(listaA, { ...filtroA, grupoId: b.grupoId, contaId: b.socio.contaId }, tx)).map(n => n.inutilizacao), [foraDoEscopo])
    // Mesmo grupo, filtro em outro ambiente: idem.
    assert.deepEqual((await anexarSituacaoDeInutilizacao(listaA, { ...filtroA, ambiente: 'Producao' }, tx)).map(n => n.inutilizacao), [foraDoEscopo])
    // Com o próprio filtro: a situação de verdade.
    assert.equal((await anexarSituacaoDeInutilizacao(listaA, filtroA, tx))[0].inutilizacao.tipo, 'pendente')
  })
})

test('admin_rede na persona do grupo liberado pede a inutilização; em grupo da Conta dona não liberado, não (decisão do Luis)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { gruposLiberadosVivos, usuarioDaRede } = await import('@/lib/grupos-liberados')
    const dona = await semearConta(tx, 'Dona', '00000000050405')
    const [irmao] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('IN504 Dona 2', '00000000050406', ${dona.socio.contaId}) returning id`)
    await configurarNg(tx, irmao.id, 'Homologacao')
    const casa = await semearConta(tx, 'Rede', '00000000050407')
    const [geral] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel) values (gen_random_uuid(), 'Geral', 'geral-in597@teste.invalid', 'admin_geral') returning id`)
    const [rede] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
      values (gen_random_uuid(), 'Rede', 'rede-in597@teste.invalid', 'admin_rede', ${casa.socio.lojaId}, ${casa.socio.contaId}) returning id`)
    await tx.execute(sql`insert into grupos_liberados (usuario_id, grupo_id, liberado_por) values (${rede.id}, ${dona.grupoId}, ${geral.id})`)
    const cadastro = { id: rede.id as string, papel: 'admin_rede' as const, lojaId: casa.socio.lojaId, contaId: casa.socio.contaId, gruposAcesso: [] as string[], gruposAprovacao: [] as string[] }
    const vivos = await gruposLiberadosVivos(rede.id, new Date(), tx)

    // A sessão traduz: admin_socio da Conta dona, sem loja, só com o grupo liberado.
    const persona = usuarioDaRede(cadastro, vivos, dona.grupoId)
    assert.deepEqual([persona.papel, persona.lojaId, persona.contaId, persona.gruposAcesso], ['admin_socio', null, dona.socio.contaId, [dona.grupoId]])
    const noLiberado = await semearNotaNegada(tx, dona.grupoId, 950480, '994')
    const noIrmao = await semearNotaNegada(tx, irmao.id, 950481, '995')
    assert.ok((await m.prepararInutilizacao(tx, persona, noLiberado, JUSTIFICATIVA)).ok, 'pede no grupo liberado')
    assert.deepEqual(await m.prepararInutilizacao(tx, persona, noIrmao, JUSTIFICATIVA), { ok: false, erro: 'NF não encontrada' })

    // Na própria Conta, sem persona, não alcança a nota do grupo liberado.
    const emCasa = usuarioDaRede(cadastro, vivos, casa.grupoId)
    assert.deepEqual(await m.prepararInutilizacao(tx, emCasa, noLiberado, JUSTIFICATIVA), { ok: false, erro: 'NF não encontrada' })
  })
})

test('credencial com token e sem empresa: a lista diz sem configuração e o preparo recusa antes de gravar (C1)', async () => {
  await emTransacaoDesfeita(async tx => {
    const { anexarSituacaoDeInutilizacao, listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas')
    const { hojeBrt } = await import('@/lib/data-venda')
    const a = await semearConta(tx, 'A', '00000000050401', null)
    await configurarNg(tx, a.grupoId, 'Homologacao', null)
    const nota = await semearNotaNegada(tx, a.grupoId, 950500, '997')
    assert.deepEqual(await m.prepararInutilizacao(tx, a.socio, nota, JUSTIFICATIVA), { ok: false, erro: 'Nota Gateway não configurada para esta empresa.' })
    assert.equal((await inutilizacoes(tx, nota)).length, 0, 'nada gravado')
    const filtro = { grupoId: a.grupoId, contaId: a.socio.contaId, ambiente: 'Homologacao' as const, de: '2000-01-01', ate: hojeBrt() }
    const [situacao] = await anexarSituacaoDeInutilizacao(await listarNotasEmitidas(filtro, tx), filtro, tx)
    assert.deepEqual(situacao.inutilizacao, { tipo: 'sem_configuracao', erro: 'Nota Gateway não configurada para esta empresa.' })
  })
})

test('produção no deploy de produção: o pedido sai para a NG e fica pendente com log enviado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401', 'Producao')
    const nota = await semearNota(tx, a.grupoId, 950510, { status: 'Negada', motivo: '225 - Falha no schema', numero: '998', ambiente: 'Producao' })
    const enviados: string[] = []
    const r = await m.inutilizarNumeroDaNota(a.socio, nota, JUSTIFICATIVA, {
      exec: tx, config: async () => ({ cfg: { token: 't', empresaId: 'e', ambiente: 'Producao' as const } }),
      enviar: async (_cfg, p) => { enviados.push(p.idExterno) }, vercelEnv: 'production',
    })
    assert.ok(r.ok && r.aviso === null)
    assert.deepEqual(enviados, [`${(await inutilizacoes(tx, nota))[0].id_externo}`])
    assert.equal((await inutilizacoes(tx, nota))[0].situacao, 'pendente')
    assert.deepEqual((await logDe(tx, r.inutilizacaoId)).map(l => l.detalhe.resultado), ['enviado'])
  })
})

// Faixa (#655): pedido sem NF de origem. Mock só na fronteira de fora (NG); o banco é o real.
const faixasDoGrupo = (tx: Tx, grupoId: string) => linhas(tx, sql`select * from notas_fiscais_saida_inutilizacoes where grupo_id = ${grupoId} and nota_id is null order by numero_inicial`)
const CHAVE_1 = '11111111-1111-4111-8111-111111111111'
const CHAVE_2 = '22222222-2222-4222-8222-222222222222'
const faixa = (extra = {}) => ({ chave: CHAVE_1, ambiente: 'Homologacao', numeroInicial: '16', numeroFinal: '24', justificativa: 'Quebra na sequência da numeração', ...extra })

/** Conta com a credencial da NG cifrada de verdade, para a faixa ler a configuração pelo caminho real. */
async function semearContaFaixa(tx: Tx, nome: string, cnpj: string, ambiente = 'Homologacao') {
  const { cifrar } = await import('@/lib/cripto')
  const conta = await semearConta(tx, nome, cnpj, ambiente)
  await tx.execute(sql`update notagateway_config set token = ${cifrar('tok-cifrado')}, empresa_id = 'emp-1' where grupo_id = ${conta.grupoId}`)
  return conta
}

function depsDaFaixa(tx: Tx, _grupoId: string, enviar: DepsFaixa['enviar'] = async () => {}, uf = 'MG'): DepsFaixa {
  return { exec: tx, enviar, vercelEnv: undefined, config: m.configDoAmbiente, empresa: async () => ({ serie: '1', uf }) }
}

test('faixa: o sócio pede; grava sem nota, no grupo, com a série da NG, e envia uma vez com a faixa inteira', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const enviados: Parameters<Deps['enviar']>[1][] = []
    const r = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId, async (_cfg, p) => { enviados.push(p) }))
    assert.ok(r.ok && r.aviso === null)
    const [linha] = await faixasDoGrupo(tx, a.grupoId)
    assert.deepEqual([linha.serie, linha.numero_inicial, linha.numero_final, linha.ambiente, linha.situacao, linha.pedida_por],
      ['1', 16, 24, 'Homologacao', 'pendente', a.socio.id])
    assert.equal(linha.justificativa, 'Quebra na sequencia da numeracao')
    assert.equal(enviados.length, 1)
    assert.deepEqual([enviados[0].serie, enviados[0].numeroInicial, enviados[0].numeroFinal, enviados[0].idExterno], ['1', 16, 24, linha.id_externo])
    const [log] = await logDe(tx, linha.id)
    assert.deepEqual([log.detalhe.resultado, log.detalhe.numeroInicial, log.detalhe.numeroFinal], ['enviado', 16, 24])
  })
})

test('faixa: a mesma tentativa repetida (duplo clique) não grava nem envia de novo; a chave reusada com outra faixa recusa', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    let envios = 0
    const deps = depsDaFaixa(tx, a.grupoId, async () => { envios++ })
    const primeiro = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), deps)
    const repetido = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), deps)
    assert.ok(primeiro.ok && repetido.ok)
    assert.equal(repetido.inutilizacaoId, primeiro.inutilizacaoId)
    assert.equal(envios, 1)
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 1)
    const outraFaixa = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ numeroFinal: '30' }), deps)
    assert.equal(outraFaixa.ok, false)
    assert.equal(envios, 1)
  })
})

test('faixa: faixa igual ou sobreposta com outra chave é pedido novo, não bloqueio (só aviso, na tela)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const deps = depsDaFaixa(tx, a.grupoId)
    assert.ok((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), deps)).ok)
    assert.ok((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ chave: CHAVE_2 }), deps)).ok)
    assert.ok((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ chave: '33333333-3333-4333-8333-333333333333', numeroInicial: '20', numeroFinal: '40' }), deps)).ok)
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 3)
  })
})

test('faixa: AC, BA e SP recusam antes de gravar e de enviar; outra UF segue', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const nuncaEnvia: DepsFaixa['enviar'] = async () => { throw new Error('não devia enviar') }
    for (const uf of ['AC', 'BA', 'SP']) {
      const r = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId, nuncaEnvia, uf))
      assert.deepEqual(r, { ok: false, erro: 'A inutilização não está disponível para empresas do Acre, Bahia ou São Paulo.' }, uf)
    }
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 0)
  })
})

test('faixa: ambiente da página diferente do configurado, faixa inválida e série não configurada recusam sem gravar', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const nuncaEnvia: DepsFaixa['enviar'] = async () => { throw new Error('não devia enviar') }
    const deps = depsDaFaixa(tx, a.grupoId, nuncaEnvia)
    assert.equal((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ ambiente: 'Producao' }), deps)).ok, false)
    assert.equal((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ numeroInicial: '30', numeroFinal: '20' }), deps)).ok, false)
    assert.equal((await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ chave: 'nao-e-uuid' }), deps)).ok, false)
    const semSerie = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), { ...deps, empresa: async () => { throw new Error('sem série') } })
    assert.equal(semSerie.ok, false)
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 0)
  })
})

test('faixa: a Conta B não pede no grupo da A, e a frase é a do grupo inexistente; aux_adm não pede', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const b = await semearContaFaixa(tx, 'B', '00000000065502')
    const nuncaEnvia: DepsFaixa['enviar'] = async () => { throw new Error('não devia enviar') }
    const deB = await mf.inutilizarFaixa(b.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId, nuncaEnvia))
    const inexistente = await mf.inutilizarFaixa(b.socio, '00000000-0000-0000-0000-000000000000', faixa(), depsDaFaixa(tx, a.grupoId, nuncaEnvia))
    assert.deepEqual(deB, { ok: false, erro: 'Grupo não encontrado' })
    assert.deepEqual(inexistente, deB)
    assert.deepEqual(await mf.inutilizarFaixa(a.aux, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId, nuncaEnvia)), deB)
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 0)
  })
})

test('faixa: a mesma chave em outra Conta é outro pedido; a Conta B não vê nem sobrescreve o da A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const b = await semearContaFaixa(tx, 'B', '00000000065502')
    const deA = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId))
    const deB = await mf.inutilizarFaixa(b.socio, b.grupoId, faixa(), depsDaFaixa(tx, b.grupoId))
    assert.ok(deA.ok && deB.ok)
    assert.notEqual(deA.inutilizacaoId, deB.inutilizacaoId)
    assert.equal(await m.inutilizacaoDoUsuario(tx, b.socio, deA.inutilizacaoId), null)
    await m.gravarResultadoDaInutilizacao(tx, { id: deA.inutilizacaoId, grupoId: b.grupoId }, { status: 'InutilizacaoAutorizada', motivoStatus: null, protocolo: 'P-B' })
    assert.equal((await faixasDoGrupo(tx, a.grupoId))[0].situacao, 'pendente')
  })
})

test('faixa: 4xx da NG nega e deixa a faixa livre para novo pedido; sem resposta fica pendente com aviso e sem reenvio', async () => {
  await emTransacaoDesfeita(async tx => {
    const { InutilizacaoRecusada, NotaGatewayIndisponivel } = await import('@/lib/notagateway/client')
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const erroDoConsole = mock.method(console, 'error', () => {})
    try {
      const negada = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId, async () => { throw new InutilizacaoRecusada('faixa invalida') }))
      assert.deepEqual(negada, { ok: false, erro: 'A Nota Gateway recusou o pedido: faixa invalida' })
      let envios = 0
      const semResposta = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ chave: CHAVE_2 }), depsDaFaixa(tx, a.grupoId, async () => { envios++; throw new NotaGatewayIndisponivel(503) }))
      assert.ok(semResposta.ok && semResposta.aviso === m.AVISO_SEM_RESPOSTA)
      const [l1, l2] = await faixasDoGrupo(tx, a.grupoId)
      assert.deepEqual([l1.situacao, l2.situacao], ['negada', 'pendente'])
      // Repetir a tentativa sem resposta não reenvia.
      await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ chave: CHAVE_2 }), depsDaFaixa(tx, a.grupoId, async () => { envios++ }))
      assert.equal(envios, 1)
    } finally {
      erroDoConsole.mock.restore()
    }
  })
})

test('faixa autorizada que cobre o número esconde o botão da nota negada; a consulta existente lê o resultado da faixa, só da própria Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const b = await semearContaFaixa(tx, 'B', '00000000065502')
    const nota = await semearNotaNegada(tx, a.grupoId, 955001, '20')
    const r = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId))
    assert.ok(r.ok)
    const contexto = async () => (await m.contextoDeInutilizacao(tx, { grupoId: a.grupoId, ambiente: 'Homologacao' }, await notasDaDecisao(tx, [nota]))).get(nota)!
    const { decidirInutilizacao } = await import('@/lib/notagateway/inutilizacao')
    assert.equal(decidirInutilizacao(await contexto()).tipo, 'pendente')
    await m.gravarResultadoDaInutilizacao(tx, { id: r.inutilizacaoId, grupoId: a.grupoId }, { status: 'InutilizacaoAutorizada', motivoStatus: null, protocolo: 'P-A' })
    assert.equal(decidirInutilizacao(await contexto()).tipo, 'autorizada')
    assert.equal(await m.inutilizacaoDoUsuario(tx, b.socio, r.inutilizacaoId), null)
  })
})

test('faixa: grupo sem configuração, ambiente da página diferente do configurado e configuração que não lê recusam sem gravar', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const c = await semearConta(tx, 'C', '00000000065503', null)
    const nuncaEnvia: DepsFaixa['enviar'] = async () => { throw new Error('não devia enviar') }
    assert.deepEqual(await mf.inutilizarFaixa(c.socio, c.grupoId, faixa(), depsDaFaixa(tx, c.grupoId, nuncaEnvia)), { ok: false, erro: 'Nota Gateway não configurada para esta empresa.' })
    const divergente = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa({ ambiente: 'Producao' }), depsDaFaixa(tx, a.grupoId, nuncaEnvia))
    assert.equal(divergente.ok, false)
    assert.match((divergente as { erro: string }).erro, /grupo está em homologação/)

    const erroDoConsole = mock.method(console, 'error', () => {})
    try {
      const quebrada = await mf.inutilizarFaixa(a.socio, a.grupoId, faixa(), { ...depsDaFaixa(tx, a.grupoId, nuncaEnvia), config: async () => { throw new Error('chave de cifra ausente') } })
      assert.deepEqual(quebrada, { ok: false, erro: 'Não deu para ler a configuração da Nota Gateway desta empresa. Tente de novo.' })
      assert.ok(erroDoConsole.mock.calls.every(c => !c.arguments.join(' ').includes('tok-cifrado')))
    } finally {
      erroDoConsole.mock.restore()
    }
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length + (await faixasDoGrupo(tx, c.grupoId)).length, 0)
  })
})

test('faixa: produção fora do deploy de produção recusa antes de gravar; no deploy de produção envia', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501', 'Producao')
    const entrada = faixa({ ambiente: 'Producao' })
    const nuncaEnvia: DepsFaixa['enviar'] = async () => { throw new Error('não devia enviar') }
    const r1 = await mf.inutilizarFaixa(a.socio, a.grupoId, entrada, { ...depsDaFaixa(tx, a.grupoId, nuncaEnvia), vercelEnv: 'preview' })
    assert.equal(r1.ok, false)
    assert.match((r1 as { erro: string }).erro, /só roda em homologação/)
    assert.equal((await faixasDoGrupo(tx, a.grupoId)).length, 0)

    let envios = 0
    const r2 = await mf.inutilizarFaixa(a.socio, a.grupoId, entrada, { ...depsDaFaixa(tx, a.grupoId, async () => { envios++ }), vercelEnv: 'production' })
    assert.ok(r2.ok)
    assert.equal(envios, 1)
  })
})

test('faixa: o admin_geral pede em qualquer grupo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const [geral] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel) values (gen_random_uuid(), 'Geral', 'geral-in655@teste.invalid', 'admin_geral') returning id`)
    const r = await mf.inutilizarFaixa({ id: geral.id, papel: 'admin_geral', lojaId: null, gruposAcesso: null, contaId: null }, a.grupoId, faixa(), depsDaFaixa(tx, a.grupoId))
    assert.ok(r.ok)
    assert.equal((await faixasDoGrupo(tx, a.grupoId))[0].pedida_por, geral.id)
  })
})

test('banco: faixa de 10.000 números entra e de 10.001 não (MOC NF-e, regra I04)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearContaFaixa(tx, 'A', '00000000065501')
    const inserir = (t: Tx, id: string, final: number) => t.execute(sql`insert into notas_fiscais_saida_inutilizacoes (grupo_id, id_externo, ambiente, serie, numero_inicial, numero_final, justificativa)
      values (${a.grupoId}, ${id}, 'Homologacao', '1', 1, ${final}, 'Justificativa de teste da faixa')`)
    await inserir(tx, 'limite-10000', 10000)
    await assert.rejects(tx.transaction(t => inserir(t, 'limite-10001', 10001)),
      (e: { cause?: { message?: string } }) => /notas_fiscais_saida_inutilizacoes_faixa_check/.test(e.cause?.message ?? ''))
  })
})
