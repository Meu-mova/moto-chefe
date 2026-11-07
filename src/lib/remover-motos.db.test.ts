// Teste de banco: Postgres descartável, como src/lib/arquivar-motos.db.test.ts.
// Remover moto (#692; ADR-0020 com o adendo de 07/11): apaga a moto que nunca passou pelo comercial nem
// pelo financeiro, com o que depende dela, ou nada; a Conta B não acha nem remove moto da Conta A.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearUsuario } from '@/test/semear-conta'
import { semearContaComMotos } from '@/test/semear-motos'
import { RENAVE_COMPLETO_FATURAMENTO_DIRETO } from '@/test/renave-completo'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Rem = typeof import('@/lib/remover-motos')
let db: Db['db']
let schema: typeof import('@/lib/db/schema')
let removerMotos: Rem['removerMotos']
let motosParaRemover: Rem['motosParaRemover']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  schema = await import('@/lib/db/schema')
  ;({ removerMotos, motosParaRemover } = await import('@/lib/remover-motos'))
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
const idDe = async (tx: Tx, q: ReturnType<typeof sql>) => (await linhas(tx, q))[0].id as string
const recusa = (frase: string | RegExp) => (e: Error) => typeof frase === 'string' ? e.message === frase : frase.test(e.message)

const P = 'RM692'
type Conta = Awaited<ReturnType<typeof semearContaComMotos>>
const semearConta = (tx: Tx, nome: string, cnpj: string, cnpj2: string) => semearContaComMotos(tx, P, nome, cnpj, cnpj2)

const existe = async (tx: Tx, id: string) => (await linhas(tx, sql`select 1 from motos where id = ${id}`)).length === 1
const historico = (tx: Tx, c: Conta, motoId: string) =>
  tx.execute(sql`insert into historico_estoque (moto_id, loja_destino_id, usuario_id, tipo, status_novo) values (${motoId}, ${c.base.lojaId}, ${c.auxId}, 'entrada', 'caixa')`)
const novaOs = (tx: Tx, c: Conta, motoId: string, numero: number) =>
  idDe(tx, sql`insert into ordens_servico (numero, moto_id, loja_id, aberta_por, descricao) values (${numero}, ${motoId}, ${c.base.lojaId}, ${c.auxId}, 'montagem') returning id`)
const novoPedido = (tx: Tx, c: Conta, motoId: string, status = 'pendente') =>
  idDe(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${motoId}, ${c.base.lojaId}, ${c.auxId}, ${status}::pedido_status) returning id`)
const logsDa = (tx: Tx, motoIds: string[]) =>
  linhas(tx, sql`select usuario_id, conta_id, detalhe from log_acoes where tipo = 'moto_removida' and detalhe->>'motoId' in ${motoIds}`)

test('sócio remove moto sem dinheiro com o que depende dela; ficam histórico de veículos e o agendamento; log com a contagem', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069201', '00000000069202')
    const m = await a.novaMoto('1', a.base.lojaId, 'vendida')
    const chassi = `${P}A1`
    await historico(tx, a, m)
    await historico(tx, a, m)
    const osId = await novaOs(tx, a, m, 69201)
    await tx.execute(sql`insert into os_itens (os_id, tipo, descricao) values (${osId}, 'peca', 'pneu'), (${osId}, 'servico', 'montagem')`)
    const agId = await idDe(tx, sql`insert into agendamentos (loja_id, cliente_nome, cliente_fone, tipo_servico, data_hora_inicio, os_id)
      values (${a.base.lojaId}, 'Cliente', '35999990000', 'Montagem', '2026-11-03T13:00:00Z', ${osId}) returning id`)
    await tx.execute(sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por) values (${m}, ${a.base.lojaId}, ${a.outro.lojaId}, ${a.auxId})`)
    await tx.execute(sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim, os_id) values (${m}, ${a.base.lojaId}, 'bateria', '2026-01-01', '2027-01-01', ${osId})`)
    await tx.execute(sql`insert into cupons_revisao (grupo_id, loja_id, codigo, valido_ate, moto_id, os_id) values (${a.base.grupoId}, ${a.base.lojaId}, ${P + 'CUPOM'}, '2027-01-01', ${m}, ${osId})`)
    await tx.execute(sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status)
      values (${m}, ${a.base.lojaId}, ${a.auxId}, 100, 'pix', '2026-12-01', 'cancelada')`)
    await novoPedido(tx, a, m, 'cancelado')
    await tx.execute(sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, status) values (${m}, ${a.base.lojaId}, ${a.auxId}, 100, '{}', 'desconto', 'recusada')`)
    await tx.execute(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, cest, x_prod) values (${m}, 'X', '87116000', null, 'MOTO LITERAL')`)
    const r = RENAVE_COMPLETO_FATURAMENTO_DIRETO
    await tx.insert(schema.motosRenave).values({ ...r, motoId: m, anoModelo: Number(r.anoModelo), anoFabricacao: Number(r.anoFabricacao), lotacao: Number(r.lotacao) })
    await tx.execute(sql`insert into veiculos_historico (chassi, conta_id) values (${chassi}, ${a.base.contaId})`)

    assert.deepEqual(await removerMotos(a.socio, [m], '  NF do grupo errado  ', ' CONFIRMAR ', tx), { removidas: 1 })

    assert.equal(await existe(tx, m), false)
    for (const tabela of ['historico_estoque', 'ordens_servico', 'transferencias', 'garantias', 'cupons_revisao', 'reservas', 'pedidos_venda', 'aprovacoes_venda', 'motos_fiscal', 'motos_renave']) {
      assert.equal((await linhas(tx, sql`select 1 from ${sql.identifier(tabela)} where moto_id = ${m}`)).length, 0, tabela)
    }
    assert.equal((await linhas(tx, sql`select 1 from os_itens where os_id = ${osId}`)).length, 0)
    assert.deepEqual(await linhas(tx, sql`select os_id from agendamentos where id = ${agId}`), [{ os_id: null }])
    assert.equal((await linhas(tx, sql`select 1 from veiculos_historico where chassi = ${chassi}`)).length, 1)

    const logs = await logsDa(tx, [m])
    assert.equal(logs.length, 1)
    assert.equal(logs[0].usuario_id, a.socioId)
    assert.equal(logs[0].conta_id, a.base.contaId)
    assert.deepEqual(logs[0].detalhe, {
      motoId: m, chassi, modelo: `${P} A`, loja: (await linhas(tx, sql`select nome from lojas where id = ${a.base.lojaId}`))[0].nome,
      nfEntrada: 'NFA77', motivo: 'NF do grupo errado',
      saiu: { os: 1, itensDeOs: 2, transferencias: 1, garantias: 1, cupons: 1, reservas: 1, pedidos: 1, aprovacoes: 1, historico: 2 },
    })
  })
})

test('uma recusa por tipo: venda, aprovação, pedido, reserva, PIX no pedido e OS com caixa, cartão ou PIX; nada é apagado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069203', '00000000069204')
    const casos: [string, (m: string) => Promise<unknown>, string][] = [
      ['VEN', async m => {
        const pedido = await novoPedido(tx, a, m, 'efetivado')
        await tx.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
          values (${pedido}, ${m}, ${a.base.lojaId}, ${a.auxId}, ${a.auxId}, 'Cliente sintético', '52998224725', 1000, 'pix')`)
      }, 'Esta moto tem venda. Cancele a venda antes de remover.'],
      ['APR', m => tx.execute(sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo) values (${m}, ${a.base.lojaId}, ${a.auxId}, 100, '{}', 'desconto')`),
        'Esta moto tem venda aguardando aprovação. Aprove ou recuse antes de remover.'],
      ['PED', m => novoPedido(tx, a, m), 'Esta moto tem pedido de venda em aberto. Cancele o pedido antes de remover.'],
      ['RES', m => tx.execute(sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao) values (${m}, ${a.base.lojaId}, ${a.auxId}, 100, 'pix', '2026-12-01')`),
        'Esta moto tem reserva em aberto. Cancele a reserva antes de remover.'],
      ['PXP', async m => {
        const pedido = await novoPedido(tx, a, m, 'cancelado')
        await tx.execute(sql`insert into pix_recebimentos_mcp (grupo_id, conta_id, banco, transacao_id, data, valor, pedido_id) values (${a.base.grupoId}, 'conta-sintetica', 'banco', ${P + 'PXP'}, now(), 10, ${pedido})`)
      }, 'Um PIX recebido está ligado ao pedido desta moto. Remova a correspondência em PIX antes de remover.'],
      ['OSC', async m => {
        const os = await novaOs(tx, a, m, 69211)
        await tx.execute(sql`insert into lancamentos_caixa (loja_id, usuario_id, tipo, categoria, valor, data, os_id) values (${a.base.lojaId}, ${a.auxId}, 'entrada', 'OS', 50, '2026-11-05', ${os})`)
      }, 'A OS nº 69211 tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.'],
      ['OSK', async m => {
        const os = await novaOs(tx, a, m, 69212)
        await tx.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, os_id) values (${a.base.grupoId}, 'stone', '2026-11-05', 50, ${os})`)
      }, 'A OS nº 69212 tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.'],
      ['OSP', async m => {
        const os = await novaOs(tx, a, m, 69213)
        await tx.execute(sql`insert into pix_recebimentos_mcp (grupo_id, conta_id, banco, transacao_id, data, valor, os_id) values (${a.base.grupoId}, 'conta-sintetica', 'banco', ${P + 'OSP'}, now(), 10, ${os})`)
      }, 'A OS nº 69213 tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.'],
    ]
    for (const [sufixo, semear, frase] of casos) {
      const m = await a.novaMoto(sufixo)
      await historico(tx, a, m)
      await semear(m)
      await assert.rejects(removerMotos(a.socio, [m], 'motivo', 'CONFIRMAR', tx), recusa(`${P}A${sufixo}: ${frase}`), sufixo)
      assert.equal(await existe(tx, m), true, sufixo)
      assert.equal((await linhas(tx, sql`select 1 from historico_estoque where moto_id = ${m}`)).length, 1, sufixo)
      assert.deepEqual(await logsDa(tx, [m]), [], sufixo)
    }
    // A busca mostra a mesma frase que o servidor, para a tela apagar a moto.
    const achadas = await motosParaRemover(a.socio, `${P}AVEN`, tx)
    assert.deepEqual(achadas.map(x => x.bloqueio), ['Esta moto tem venda. Cancele a venda antes de remover.'])
  })
})

test('lote com uma moto impedida e uma livre: recusa o lote inteiro', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069205', '00000000069206')
    const livre = await a.novaMoto('LIVRE')
    const presa = await a.novaMoto('PRESA')
    await novoPedido(tx, a, presa)
    await assert.rejects(removerMotos(a.socio, [livre, presa], 'motivo', 'CONFIRMAR', tx), recusa(/^RM692APRESA: /))
    assert.equal(await existe(tx, livre), true)
  })
})

test('sem motivo, sem CONFIRMAR ou sem moto: recusa e nada é apagado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069207', '00000000069208')
    const m = await a.novaMoto('1')
    await assert.rejects(removerMotos(a.socio, [m], '  ', 'CONFIRMAR', tx), recusa('Escreva o motivo da remoção.'))
    await assert.rejects(removerMotos(a.socio, [m], 'motivo', 'confirmar', tx), recusa('Digite CONFIRMAR para remover.'))
    await assert.rejects(removerMotos(a.socio, [], 'motivo', 'CONFIRMAR', tx), recusa('Escolha ao menos uma moto.'))
    assert.equal(await existe(tx, m), true)
  })
})

test('quem opera a loja não remove nem busca', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069209', '00000000069210')
    const m = await a.novaMoto('1')
    await assert.rejects(removerMotos(a.aux, [m], 'motivo', 'CONFIRMAR', tx), recusa('Sem permissão para remover motos.'))
    assert.deepEqual(await motosParaRemover(a.aux, `${P}A`, tx), [])
    assert.equal(await existe(tx, m), true)
  })
})

test('Conta B não acha nem remove moto da Conta A, com a mesma frase de id inexistente; sócio parcial fora do grupo também não', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069221', '00000000069222')
    const b = await semearConta(tx, 'B', '00000000069223', '00000000069224')
    const daA = await a.novaMoto('1')
    const doOutroGrupo = await a.novaMoto('OUT', a.outro.lojaId)
    assert.deepEqual(await motosParaRemover(b.socio, `${P}A`, tx), [])
    assert.deepEqual(await motosParaRemover(b.socio, 'NFA77', tx), [])
    await assert.rejects(removerMotos(b.socio, [daA], 'motivo', 'CONFIRMAR', tx), recusa('Moto não encontrada'))
    await assert.rejects(removerMotos(b.socio, [crypto.randomUUID()], 'motivo', 'CONFIRMAR', tx), recusa('Moto não encontrada'))
    assert.deepEqual((await motosParaRemover(a.socioParcial, `${P}A`, tx)).map(m => m.chassi), [`${P}A1`])
    await assert.rejects(removerMotos(a.socioParcial, [doOutroGrupo], 'motivo', 'CONFIRMAR', tx), recusa('Moto não encontrada'))
    assert.equal(await existe(tx, daA), true)
    assert.equal(await existe(tx, doOutroGrupo), true)
  })
})

test('admin_rede remove só no grupo liberado, com ele ativo', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  await emTransacaoDesfeita(async tx => {
    const dona = await semearConta(tx, 'A', '00000000069231', '00000000069232')
    const casa = await semearConta(tx, 'R', '00000000069233', '00000000069234')
    const redeId = await semearUsuario(tx, casa.base, { papel: 'admin_rede', rotulo: 'rede' })
    const rede = { id: redeId, papel: 'admin_rede', lojaId: casa.base.lojaId, gruposAcesso: [], gruposAprovacao: [], contaId: casa.base.contaId }
    const liberados = [{ grupoId: dona.base.grupoId, contaId: dona.base.contaId }]
    const moto = await dona.novaMoto('LIB')
    await assert.rejects(removerMotos(usuarioDaRede(rede, liberados, casa.base.grupoId), [moto], 'motivo', 'CONFIRMAR', tx), recusa('Moto não encontrada'))
    await assert.rejects(removerMotos(usuarioDaRede(rede, [], dona.base.grupoId), [moto], 'motivo', 'CONFIRMAR', tx), recusa('Moto não encontrada'))
    assert.deepEqual(await removerMotos(usuarioDaRede(rede, liberados, dona.base.grupoId), [moto], 'acordo da rede', 'CONFIRMAR', tx), { removidas: 1 })
  })
})

test('moto arquivada também se remove, e o chassi removido pode entrar de novo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000069241', '00000000069242')
    const m = await a.novaMoto('ARQ')
    await tx.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${a.socioId}, motivo_arquivo = 'golpe' where id = ${m}`)
    assert.deepEqual((await motosParaRemover(a.socio, `${P}AARQ`, tx)).map(x => [x.chassi, x.bloqueio]), [[`${P}AARQ`, null]])
    assert.deepEqual(await removerMotos(a.socio, [m], 'importada errada', 'CONFIRMAR', tx), { removidas: 1 })
    const deNovo = await a.novaMoto('ARQ')
    assert.equal(await existe(tx, deNovo), true)
  })
})
