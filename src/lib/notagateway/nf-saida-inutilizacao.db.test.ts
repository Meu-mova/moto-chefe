// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, mock, test } from 'node:test'
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
type Mod = typeof import('@/lib/notagateway/inutilizar')
type Deps = import('@/lib/notagateway/inutilizar').DependenciasInutilizacao
let db: Db['db']
let m: Mod

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/notagateway/inutilizar')
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

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'IN504 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'IN504 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja IN504 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const usuario = async (papel: string) => {
    const [u] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
      values (gen_random_uuid(), ${papel}, ${`${papel}-in504${nome}@teste.invalid`}, ${papel}, ${loja.id}) returning id`)
    return { id: u.id as string, papel, lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  }
  return { grupoId: grupo.id as string, socio: await usuario('admin_socio'), aux: await usuario('aux_adm') }
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

      // O console vê só o status HTTP ou "rede": nunca a mensagem crua, o token ou o empresaId (C7).
      const textos = erroDoConsole.mock.calls.map(c => c.arguments.join(' '))
      assert.equal(textos.length, 2)
      assert.match(textos[0], /HTTP 503/)
      assert.match(textos[1], /rede/)
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
    const a = await semearConta(tx, 'A', '00000000050401')
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

    const semConfig = await semearNotaNegada(tx, a.grupoId, 950451, '985')
    const r2 = await m.inutilizarNumeroDaNota(a.socio, semConfig, JUSTIFICATIVA, { exec: tx, config: async () => ({ erro: 'Nota Gateway não configurada para esta empresa.' }), enviar: nuncaEnvia, vercelEnv: undefined })
    assert.deepEqual(r2, { ok: false, erro: 'Nota Gateway não configurada para esta empresa.' })
    assert.equal((await inutilizacoes(tx, semConfig))[0].situacao, 'negada')
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
      return anexarSituacaoDeInutilizacao(notas, { grupoId, ambiente: 'Homologacao' }, tx)
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
