// Teste de banco: Postgres descartável, como src/lib/pedido-moto-do-usuario.db.test.ts.
// Arquivar moto (#688): grava o lote inteiro ou nada, com log por moto; a busca e a gravação
// alcançam só os grupos que a pessoa vê, e a Conta B não acha nem arquiva moto da Conta A.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearUsuario } from '@/test/semear-conta'
import { semearContaComMotos } from '@/test/semear-motos'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Arq = typeof import('@/lib/arquivar-motos')
let db: Db['db']
let arquivarMotos: Arq['arquivarMotos']
let motosParaArquivar: Arq['motosParaArquivar']
let desarquivarMotos: Arq['desarquivarMotos']
let idsQuePodeDesarquivar: Arq['idsQuePodeDesarquivar']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ arquivarMotos, motosParaArquivar, desarquivarMotos, idsQuePodeDesarquivar } = await import('@/lib/arquivar-motos'))
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
const recusa = (frase: string | RegExp) => (e: Error) => typeof frase === 'string' ? e.message === frase : frase.test(e.message)

const P = 'AR688'

const semearConta = (tx: Tx, nome: string, cnpj: string, cnpj2: string) => semearContaComMotos(tx, P, nome, cnpj, cnpj2)

const arquivada = async (tx: Tx, id: string) =>
  (await linhas(tx, sql`select arquivada_em is not null as sim, arquivada_por, motivo_arquivo from motos where id = ${id}`))[0]
const logsDa = (tx: Tx, motoIds: string[], tipo = 'moto_arquivada') =>
  linhas(tx, sql`select usuario_id, conta_id, grupo_id, detalhe from log_acoes where tipo = ${tipo} and detalhe->>'motoId' in ${motoIds}`)
const desarquivadasNoLog = (tx: Tx, motoIds: string[]) => logsDa(tx, motoIds, 'moto_desarquivada')

test('sócio arquiva duas motos: grava quem e por quê, e uma linha no log por moto', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068801', '00000000068802')
    const m1 = await a.novaMoto('1')
    // Marcada vendida sem venda (golpe do link): arquivável.
    const golpe = await a.novaMoto('GOLPE', a.base.lojaId, 'vendida')
    assert.deepEqual(await arquivarMotos(a.socio, [m1, golpe], '  golpe do link  ', tx), { arquivadas: 2 })
    for (const id of [m1, golpe]) {
      assert.deepEqual(await arquivada(tx, id), { sim: true, arquivada_por: a.socioId, motivo_arquivo: 'golpe do link' })
    }
    const logs = await logsDa(tx, [m1, golpe])
    assert.equal(logs.length, 2)
    const doM1 = logs.find(l => l.detalhe.motoId === m1)
    assert.deepEqual(
      { ...doM1, detalhe: { ...doM1.detalhe } },
      { usuario_id: a.socioId, conta_id: a.base.contaId, grupo_id: a.base.grupoId,
        detalhe: { motoId: m1, chassi: `${P}A1`, modelo: `${P} A`, loja: `Loja ${P} A`, nfEntrada: 'NFA77', motivo: 'golpe do link' } },
    )
  })
})

test('cada pendência recusa com a sua frase e não grava nada', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068803', '00000000068804')
    const { base, auxId } = a
    const casos: [string, (id: string) => ReturnType<typeof sql>, RegExp][] = [
      ['RES', id => sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao) values (${id}, ${base.lojaId}, ${auxId}, 100, 'pix', '2026-12-01')`, /reserva em aberto/],
      ['PED', id => sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${id}, ${base.lojaId}, ${auxId})`, /pedido de venda em aberto/],
      ['APR', id => sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo) values (${id}, ${base.lojaId}, ${auxId}, 100, '{}', 'desconto')`, /aguardando aprovação/],
      ['TRF', id => sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por) values (${id}, ${base.lojaId}, ${a.outro.lojaId}, ${auxId})`, /transferência em aberto/],
      ['OS', id => sql`insert into ordens_servico (numero, moto_id, loja_id, aberta_por, descricao) values (68801, ${id}, ${base.lojaId}, ${auxId}, 'revisão')`, /Feche a OS nº 68801 antes de arquivar/],
      ['GAR', id => sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim) values (${id}, ${base.lojaId}, 'bateria', '2026-01-01', '2027-01-01')`, /garantia ativa/],
    ]
    for (const [sufixo, pendencia, frase] of casos) {
      const id = await a.novaMoto(sufixo)
      await tx.execute(pendencia(id))
      await assert.rejects(arquivarMotos(a.socio, [id], 'motivo', tx), recusa(new RegExp(`^${P}A${sufixo}: .*${frase.source}`)), sufixo)
      assert.equal((await arquivada(tx, id)).sim, false, sufixo)
      assert.equal((await logsDa(tx, [id])).length, 0, sufixo)
    }
  })
})

test('venda registrada recusa e orienta cancelar a venda antes', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068805', '00000000068806')
    const id = await a.novaMoto('VEN', a.base.lojaId, 'vendida')
    const [ped] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${id}, ${a.base.lojaId}, ${a.auxId}, 'efetivado') returning id`)
    await tx.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
      values (${ped.id}, ${id}, ${a.base.lojaId}, ${a.auxId}, ${a.auxId}, 'Cliente', '52998224725', 1000, 'pix')`)
    await assert.rejects(arquivarMotos(a.socio, [id], 'motivo', tx), recusa(`${P}AVEN: Tem venda registrada. Cancele a venda antes de arquivar.`))
  })
})

test('pendência já fechada, em qualquer status final, não trava', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068807', '00000000068808')
    const { base, auxId } = a
    const fechadas: [string, (id: string) => ReturnType<typeof sql>][] = [
      ['RCAN', id => sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status) values (${id}, ${base.lojaId}, ${auxId}, 100, 'pix', '2026-12-01', 'cancelada')`],
      ['RCON', id => sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status) values (${id}, ${base.lojaId}, ${auxId}, 100, 'pix', '2026-12-01', 'convertida')`],
      ['PCAN', id => sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${id}, ${base.lojaId}, ${auxId}, 'cancelado')`],
      ['PEFE', id => sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${id}, ${base.lojaId}, ${auxId}, 'efetivado')`],
      ['AAPR', id => sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, status) values (${id}, ${base.lojaId}, ${auxId}, 100, '{}', 'desconto', 'aprovada')`],
      ['AREC', id => sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, status) values (${id}, ${base.lojaId}, ${auxId}, 100, '{}', 'desconto', 'recusada')`],
      ['TACE', id => sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por, status) values (${id}, ${base.lojaId}, ${a.outro.lojaId}, ${auxId}, 'aceita')`],
      ['TREC', id => sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por, status) values (${id}, ${base.lojaId}, ${a.outro.lojaId}, ${auxId}, 'recusada')`],
      ['OCON', id => sql`insert into ordens_servico (moto_id, loja_id, aberta_por, descricao, status) values (${id}, ${base.lojaId}, ${auxId}, 'revisão', 'concluida')`],
      ['OCAN', id => sql`insert into ordens_servico (moto_id, loja_id, aberta_por, descricao, status) values (${id}, ${base.lojaId}, ${auxId}, 'revisão', 'cancelada')`],
      ['GENC', id => sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim, status) values (${id}, ${base.lojaId}, 'bateria', '2026-01-01', '2027-01-01', 'encerrada')`],
    ]
    for (const [sufixo, fechada] of fechadas) {
      const id = await a.novaMoto(sufixo)
      await tx.execute(fechada(id))
      assert.deepEqual(await arquivarMotos(a.socio, [id], 'fora de linha', tx), { arquivadas: 1 }, sufixo)
    }
  })
})

test('moto do golpe como ficou de verdade (pedido cancelado, reserva convertida, sem venda, marcada vendida) arquiva', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068829', '00000000068830')
    const id = await a.novaMoto('GOLPE', a.base.lojaId, 'vendida')
    await tx.execute(sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status) values (${id}, ${a.base.lojaId}, ${a.auxId}, 100, 'link_pagamento', '2026-10-20', 'convertida')`)
    await tx.execute(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${id}, ${a.base.lojaId}, ${a.auxId}, 'cancelado')`)
    assert.deepEqual((await motosParaArquivar(a.socio, `${P}AGOLPE`, tx)).map(m => m.bloqueio), [null])
    assert.deepEqual(await arquivarMotos(a.socio, [id], 'golpe do link de pagamento', tx), { arquivadas: 1 })
  })
})

test('lote com uma moto travada não arquiva nenhuma', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068809', '00000000068810')
    const livre = await a.novaMoto('LIVRE')
    const presa = await a.novaMoto('PRESA')
    await tx.execute(sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por) values (${presa}, ${a.base.lojaId}, ${a.outro.lojaId}, ${a.auxId})`)
    await assert.rejects(arquivarMotos(a.socio, [livre, presa], 'motivo', tx), recusa(/^AR688APRESA: /))
    assert.equal((await arquivada(tx, livre)).sim, false)
    assert.equal((await logsDa(tx, [livre, presa])).length, 0)
  })
})

test('motivo em branco e lote vazio recusam sem gravar', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068811', '00000000068812')
    const id = await a.novaMoto('1')
    await assert.rejects(arquivarMotos(a.socio, [id], '   ', tx), recusa('Escreva o motivo do arquivamento.'))
    await assert.rejects(arquivarMotos(a.socio, [], 'motivo', tx), recusa('Escolha ao menos uma moto.'))
    assert.equal((await arquivada(tx, id)).sim, false)
  })
})

test('moto já arquivada responde como não encontrada e não muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068813', '00000000068814')
    const id = await a.novaMoto('1')
    await arquivarMotos(a.socio, [id], 'primeira vez', tx)
    await assert.rejects(arquivarMotos(a.socio, [id], 'segunda vez', tx), recusa('Moto não encontrada'))
    assert.equal((await arquivada(tx, id)).motivo_arquivo, 'primeira vez')
    assert.deepEqual(await motosParaArquivar(a.socio, `${P}A1`, tx), [])
  })
})

test('aux_adm é recusado no servidor e não vê a lista', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068815', '00000000068816')
    const id = await a.novaMoto('1')
    await assert.rejects(arquivarMotos(a.aux, [id], 'motivo', tx), recusa('Sem permissão para arquivar motos.'))
    assert.deepEqual(await motosParaArquivar(a.aux, `${P}A`, tx), [])
    assert.equal((await arquivada(tx, id)).sim, false)
  })
})

test('sócio sem o grupo marcado não alcança a moto desse grupo; com os dois marcados, alcança', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068817', '00000000068818')
    const doOutroGrupo = await a.novaMoto('OUT', a.outro.lojaId)
    await a.novaMoto('BASE')
    assert.deepEqual((await motosParaArquivar(a.socioParcial, `${P}A`, tx)).map(m => m.chassi), [`${P}ABASE`])
    await assert.rejects(arquivarMotos(a.socioParcial, [doOutroGrupo], 'motivo', tx), recusa('Moto não encontrada'))
    assert.equal((await arquivada(tx, doOutroGrupo)).sim, false)
    assert.deepEqual((await motosParaArquivar(a.socio, `${P}AOUT`, tx)).map(m => m.chassi), [`${P}AOUT`])
  })
})

test('admin_rede arquiva só no grupo liberado, com ele ativo; nem em casa nem sem liberação alcança a Conta dona', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  await emTransacaoDesfeita(async tx => {
    const dona = await semearConta(tx, 'A', '00000000068831', '00000000068832')
    const casa = await semearConta(tx, 'R', '00000000068833', '00000000068834')
    const redeId = await semearUsuario(tx, casa.base, { papel: 'admin_rede', rotulo: 'rede' })
    const rede = { id: redeId, papel: 'admin_rede', lojaId: casa.base.lojaId, gruposAcesso: [], gruposAprovacao: [], contaId: casa.base.contaId }
    const liberados = [{ grupoId: dona.base.grupoId, contaId: dona.base.contaId }]
    const noLiberado = usuarioDaRede(rede, liberados, dona.base.grupoId)
    const emCasa = usuarioDaRede(rede, liberados, casa.base.grupoId)
    const semLiberacao = usuarioDaRede(rede, [], dona.base.grupoId)
    const liberada = await dona.novaMoto('LIB')
    const naoLiberada = await dona.novaMoto('NLIB', dona.outro.lojaId)

    assert.deepEqual((await motosParaArquivar(noLiberado, `${P}A`, tx)).map(m => m.chassi), [`${P}ALIB`])
    await assert.rejects(arquivarMotos(noLiberado, [naoLiberada], 'motivo', tx), recusa('Moto não encontrada'))
    for (const [rotulo, usuario] of [['em casa', emCasa], ['sem liberação', semLiberacao]] as const) {
      assert.deepEqual(await motosParaArquivar(usuario, `${P}A`, tx), [], rotulo)
      await assert.rejects(arquivarMotos(usuario, [liberada], 'motivo', tx), recusa('Moto não encontrada'), rotulo)
    }
    assert.equal((await arquivada(tx, naoLiberada)).sim, false)
    assert.deepEqual(await arquivarMotos(noLiberado, [liberada], 'acordo da rede', tx), { arquivadas: 1 })
    assert.deepEqual(await arquivada(tx, liberada), { sim: true, arquivada_por: redeId, motivo_arquivo: 'acordo da rede' })
  })
})

test('Conta B não lista nem arquiva moto da Conta A, com a mesma frase de id inexistente; e o inverso', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068819', '00000000068820')
    const b = await semearConta(tx, 'B', '00000000068821', '00000000068822')
    const motoA = await a.novaMoto('1')
    const motoB = await b.novaMoto('1')
    const inexistente = '0f8fad5b-d9cb-469f-a165-70867728950e'
    for (const [quem, alheia, chassiAlheio] of [[b.socio, motoA, `${P}A1`], [a.socio, motoB, `${P}B1`]] as const) {
      assert.deepEqual(await motosParaArquivar(quem, chassiAlheio, tx), [])
      await assert.rejects(arquivarMotos(quem, [alheia], 'motivo', tx), recusa('Moto não encontrada'))
      await assert.rejects(arquivarMotos(quem, [inexistente], 'motivo', tx), recusa('Moto não encontrada'))
      await assert.rejects(arquivarMotos(quem, ['nem-uuid'], 'motivo', tx), recusa('Moto não encontrada'))
    }
    assert.equal((await arquivada(tx, motoA)).sim, false)
    assert.equal((await arquivada(tx, motoB)).sim, false)
  })
})

test('admin_geral alcança motos das duas Contas', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068823', '00000000068824')
    const b = await semearConta(tx, 'B', '00000000068825', '00000000068826')
    const motoA = await a.novaMoto('1')
    const motoB = await b.novaMoto('1')
    const geral = { id: a.socioId, papel: 'admin_geral', lojaId: null, gruposAcesso: [], contaId: null }
    assert.deepEqual((await motosParaArquivar(geral, `${P}`, tx)).map(m => m.chassi).filter(c => c === `${P}A1` || c === `${P}B1`), [`${P}A1`, `${P}B1`])
    assert.deepEqual(await arquivarMotos(geral, [motoA, motoB], 'motivo', tx), { arquivadas: 2 })
  })
})

test('busca acha por trecho do chassi e pela NF de entrada, e traz o motivo de não poder', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000068827', '00000000068828')
    const livre = await a.novaMoto('X1')
    const presa = await a.novaMoto('X2')
    await tx.execute(sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim) values (${presa}, ${a.base.lojaId}, 'bateria', '2026-01-01', '2027-01-01')`)
    const esperado = [
      { id: livre, chassi: `${P}AX1`, modelo: `${P} A`, loja: `Loja ${P} A`, nfEntrada: 'NFA77', bloqueio: null },
      { id: presa, chassi: `${P}AX2`, modelo: `${P} A`, loja: `Loja ${P} A`, nfEntrada: 'NFA77', bloqueio: 'Tem garantia ativa. Encerre a garantia antes de arquivar.' },
    ]
    assert.deepEqual(await motosParaArquivar(a.socio, 'ax', tx), esperado)
    assert.deepEqual(await motosParaArquivar(a.socio, 'nfa77', tx), esperado)
    assert.deepEqual(await motosParaArquivar(a.socio, '   ', tx), [])
  })
})

test('reserva gravada por quem segurava a moto aparece para quem arquiva logo depois', async () => {
  // Fora de transação desfeita: são duas conexões e a semente precisa estar gravada para as duas.
  type Pool = { connect(): Promise<{ query(q: string, p?: unknown[]): Promise<{ rows: { n: number }[] }>; release(): void }> }
  type Conexao = Awaited<ReturnType<Pool['connect']>>
  const pool = (globalThis as unknown as { __pgPool: Pool }).__pgPool
  let contaIds: string[] = []
  const desfazerSemente = async () => {
    await db.execute(sql`delete from reservas where moto_id in (select id from motos where chassi like ${P + 'CORRIDA%'})`)
    await db.execute(sql`delete from motos where chassi like ${P + 'CORRIDA%'}`)
    await db.execute(sql`delete from modelos where modelo = ${P + ' CORRIDA'}`)
    await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-corrida@teste.invalid'}`)
    for (const id of contaIds) {
      await db.execute(sql`delete from log_acoes where conta_id = ${id}`)
      await db.execute(sql`delete from lojas where grupo_id in (select id from grupos where conta_id = ${id})`)
      await db.execute(sql`delete from grupos where conta_id = ${id}`)
      await db.execute(sql`delete from contas where id = ${id}`)
    }
  }
  const esperarAlguemBloqueadoPor = async (c: Conexao) => {
    for (let i = 0; i < 500; i++) {
      const { rows } = await c.query(`select count(*)::int as n from pg_stat_activity where pg_backend_pid() = any(pg_blocking_pids(pid))`)
      if (rows[0].n > 0) return true
      await new Promise(r => setTimeout(r, 10))
    }
    return false
  }
  const segura = await pool.connect()
  try {
    const a = await db.transaction(async tx => {
      const s = await semearConta(tx, 'CORRIDA', '00000000068835', '00000000068836')
      return { ...s, motoId: await s.novaMoto('1') }
    })
    contaIds = [a.base.contaId]

    // Quem reserva trava a moto, grava a reserva e só confirma depois de o arquivar estar esperando.
    await segura.query('begin')
    await segura.query('select id from motos where id = $1 for update', [a.motoId])
    await segura.query(`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao) values ($1, $2, $3, 100, 'pix', '2026-12-01')`, [a.motoId, a.base.lojaId, a.auxId])
    const arquivando = arquivarMotos(a.socio, [a.motoId], 'motivo').then(() => 'arquivou', (e: Error) => e.message)
    // Só confirma quando uma sessão está bloqueada por esta conexão (outros testes rodam em paralelo).
    assert.equal(await esperarAlguemBloqueadoPor(segura), true, 'o arquivar não chegou a esperar a trava')
    await segura.query('commit')

    assert.equal(await arquivando, `${P}CORRIDA1: Tem reserva em aberto. Cancele ou finalize a reserva antes de arquivar.`)
    assert.equal((await linhas(db as unknown as Tx, sql`select arquivada_em is not null as sim from motos where id = ${a.motoId}`))[0].sim, false)
  } finally {
    await segura.query('rollback').catch(() => {})
    segura.release()
    await desfazerSemente()
  }
})

// Desarquivar (#691): mesmo alcance e mesmos papéis do arquivar.

test('sócio desarquiva: limpa quem, quando e motivo, a moto volta às listas e o log guarda o motivo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069101', '00000000069102')
    const id = await a.novaMoto('D1')
    await arquivarMotos(a.socio, [id], 'golpe', tx)
    assert.deepEqual(await desarquivarMotos(a.socio, [id], '  achamos o dono  ', tx), { desarquivadas: 1 })
    assert.deepEqual(await arquivada(tx, id), { sim: false, arquivada_por: null, motivo_arquivo: null })
    assert.deepEqual((await motosParaArquivar(a.socio, `${P}AD1`, tx)).map(m => m.id), [id])
    const logs = await desarquivadasNoLog(tx, [id])
    assert.deepEqual(
      logs.map(l => ({ ...l, detalhe: { ...l.detalhe } })),
      [{ usuario_id: a.socioId, conta_id: a.base.contaId, grupo_id: a.base.grupoId,
        detalhe: { motoId: id, chassi: `${P}AD1`, modelo: `${P} A`, loja: `Loja ${P} A`, nfEntrada: 'NFA77', motivo: 'achamos o dono' } }],
    )
  })
})

test('desarquivar sem motivo, moto não arquivada e segunda vez recusam sem gravar', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069103', '00000000069104')
    const arq = await a.novaMoto('D2')
    const viva = await a.novaMoto('D3')
    await arquivarMotos(a.socio, [arq], 'golpe', tx)
    await assert.rejects(desarquivarMotos(a.socio, [arq], '   ', tx), recusa('Escreva o motivo do desarquivamento.'))
    assert.equal((await arquivada(tx, arq)).motivo_arquivo, 'golpe')
    await assert.rejects(desarquivarMotos(a.socio, [viva], 'motivo', tx), recusa('Moto não encontrada'))
    await assert.rejects(desarquivarMotos(a.socio, [], 'motivo', tx), recusa('Moto não encontrada'))
    await desarquivarMotos(a.socio, [arq], 'primeira', tx)
    await assert.rejects(desarquivarMotos(a.socio, [arq], 'segunda', tx), recusa('Moto não encontrada'))
    assert.equal((await desarquivadasNoLog(tx, [arq, viva])).length, 1)
  })
})

test('aux_adm não desarquiva nem ganha o botão; sócio sem o grupo marcado também não', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069105', '00000000069106')
    const daBase = await a.novaMoto('D4')
    const doOutro = await a.novaMoto('D5', a.outro.lojaId)
    await arquivarMotos(a.socio, [daBase, doOutro], 'golpe', tx)
    await assert.rejects(desarquivarMotos(a.aux, [daBase], 'motivo', tx), recusa('Sem permissão para desarquivar motos.'))
    assert.deepEqual(await idsQuePodeDesarquivar(a.aux, [daBase], tx), [])
    await assert.rejects(desarquivarMotos(a.socioParcial, [doOutro], 'motivo', tx), recusa('Moto não encontrada'))
    assert.deepEqual(await idsQuePodeDesarquivar(a.socioParcial, [daBase, doOutro], tx), [daBase])
    assert.equal((await arquivada(tx, doOutro)).sim, true)
    assert.equal((await desarquivadasNoLog(tx, [daBase, doOutro])).length, 0)
  })
})

test('botão do RADAR: só as arquivadas do alcance, nunca a viva, a de outra Conta ou um texto qualquer', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069107', '00000000069108')
    const b = await semearConta(tx, 'B', '00000000069109', '00000000069110')
    const arqA = await a.novaMoto('D6')
    const vivaA = await a.novaMoto('D7')
    const arqB = await b.novaMoto('D6')
    await arquivarMotos(a.socio, [arqA], 'golpe', tx)
    await arquivarMotos(b.socio, [arqB], 'golpe', tx)
    assert.deepEqual(await idsQuePodeDesarquivar(a.socio, [arqA, vivaA, arqB, 'nem-uuid'], tx), [arqA])
    assert.deepEqual(await idsQuePodeDesarquivar(b.socio, [arqA, arqB], tx), [arqB])
  })
})

test('admin_rede desarquiva só no grupo liberado, com ele ativo', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  await emTransacaoDesfeita(async tx => {
    const dona = await semearConta(tx, 'A', '00000000069111', '00000000069112')
    const casa = await semearConta(tx, 'R', '00000000069113', '00000000069114')
    const redeId = await semearUsuario(tx, casa.base, { papel: 'admin_rede', rotulo: 'rede' })
    const rede = { id: redeId, papel: 'admin_rede', lojaId: casa.base.lojaId, gruposAcesso: [], gruposAprovacao: [], contaId: casa.base.contaId }
    const liberados = [{ grupoId: dona.base.grupoId, contaId: dona.base.contaId }]
    const noLiberado = usuarioDaRede(rede, liberados, dona.base.grupoId)
    const emCasa = usuarioDaRede(rede, liberados, casa.base.grupoId)
    const liberada = await dona.novaMoto('DLIB')
    const naoLiberada = await dona.novaMoto('DNLIB', dona.outro.lojaId)
    await arquivarMotos(dona.socio, [liberada, naoLiberada], 'golpe', tx)

    await assert.rejects(desarquivarMotos(noLiberado, [naoLiberada], 'motivo', tx), recusa('Moto não encontrada'))
    await assert.rejects(desarquivarMotos(emCasa, [liberada], 'motivo', tx), recusa('Moto não encontrada'))
    assert.deepEqual(await idsQuePodeDesarquivar(emCasa, [liberada], tx), [])
    assert.deepEqual(await desarquivarMotos(noLiberado, [liberada], 'acordo da rede', tx), { desarquivadas: 1 })
    assert.equal((await arquivada(tx, naoLiberada)).sim, true)
  })
})

test('Conta B não desarquiva moto da Conta A, com a mesma frase de id inexistente; e o inverso', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069115', '00000000069116')
    const b = await semearConta(tx, 'B', '00000000069117', '00000000069118')
    const motoA = await a.novaMoto('D8')
    const motoB = await b.novaMoto('D8')
    await arquivarMotos(a.socio, [motoA], 'golpe', tx)
    await arquivarMotos(b.socio, [motoB], 'golpe', tx)
    const inexistente = '0f8fad5b-d9cb-469f-a165-70867728950e'
    for (const [quem, alheia] of [[b.socio, motoA], [a.socio, motoB]] as const) {
      for (const id of [alheia, inexistente, 'nem-uuid']) {
        await assert.rejects(desarquivarMotos(quem, [id], 'motivo', tx), recusa('Moto não encontrada'), id)
      }
    }
    assert.equal((await arquivada(tx, motoA)).sim, true)
    assert.equal((await arquivada(tx, motoB)).sim, true)
    assert.equal((await desarquivadasNoLog(tx, [motoA, motoB])).length, 0)
  })
})

test('admin_geral desarquiva motos das duas Contas', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069119', '00000000069120')
    const b = await semearConta(tx, 'B', '00000000069121', '00000000069122')
    const motoA = await a.novaMoto('D9')
    const motoB = await b.novaMoto('D9')
    const geral = { id: a.socioId, papel: 'admin_geral', lojaId: null, gruposAcesso: [], contaId: null }
    await arquivarMotos(geral, [motoA, motoB], 'golpe', tx)
    assert.deepEqual((await idsQuePodeDesarquivar(geral, [motoA, motoB], tx)).sort(), [motoA, motoB].sort())
    assert.deepEqual(await desarquivarMotos(geral, [motoA, motoB], 'motivo', tx), { desarquivadas: 2 })
  })
})
