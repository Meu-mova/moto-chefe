// Teste de banco do "Cancelar venda" (#689): o que a action apaga, solta e manda apagar no Storage.
// Roda contra o Postgres descartável do CI (job `banco`); local: `npm run test:db:local`.
// A action grava fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Usuario = { id: string; papel: string; lojaId: string; contaId: string; gruposAcesso: string[] }
type ChamadaStorage = { bucket: string; caminhos: string[] }

let usuario: Usuario
let chamadasStorage: ChamadaStorage[] = []
let respostaStorage: () => Promise<{ error: { message: string } | null }> = async () => ({ error: null })

// Storage é a fronteira de fora: o cliente do Supabase só registra o que pediram para apagar.
const storageMock = mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      storage: {
        from: (bucket: string) => ({
          remove: async (caminhos: string[]) => {
            chamadasStorage = [...chamadasStorage, { bucket, caminhos }]
            return respostaStorage()
          },
        }),
      },
    }),
  },
})
const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

type Db = typeof import('@/lib/db')
let db: Db['db']
let execRows: Db['execRows']
let cancelarVendaCompletaAction: typeof import('@/app/(dashboard)/vendas/actions')['cancelarVendaCompletaAction']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ cancelarVendaCompletaAction } = await import('@/app/(dashboard)/vendas/actions'))
})
afterEach(() => {
  chamadasStorage = []
  respostaStorage = async () => ({ error: null })
})
after(async () => {
  storageMock.restore()
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string

async function semearConta() {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'AV689', nome: sufixo, cnpj: sufixo })
  const id = await semearUsuario(db, base, { papel: 'aux_adm', comConta: true })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'AV689 ' + sufixo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  return { ...base, modeloId, aux: { id, papel: 'aux_adm', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] } }
}

type Conta = Awaited<ReturnType<typeof semearConta>>

async function semearVenda(c: Conta) {
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const pedidoId = await idDe(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${c.lojaId}, ${c.aux.id}) returning id`)
  const [venda] = await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedidoId}, ${motoId}, ${c.lojaId}, ${c.aux.id}, ${c.aux.id}, 'Cliente sintético', '52998224725', 1000, 'pix') returning id, numero`)
  return { id: venda.id as string, numero: venda.numero as number, motoId, pedidoId }
}

type Venda = Awaited<ReturnType<typeof semearVenda>>

async function semearDocumento(c: Conta, v: Venda, status: string, arquivos: { selfie: string; assinatura: string } | null) {
  return idDe(sql`insert into documentos_assinatura (grupo_id, venda_id, tipo, token, status, html_snapshot, snapshot_hash, celular_destino, expira_em, selfie_path, assinatura_path)
    values (${c.grupoId}, ${v.id}, 'contrato_venda', ${randomUUID()}, ${status}, '<p>x</p>', 'h', '35999999999', now() + interval '1 day',
      ${arquivos?.selfie ?? null}, ${arquivos?.assinatura ?? null}) returning id`)
}

/** Venda com tudo o que o Cancelar venda solta ou apaga. */
async function semearVendaCompleta(c: Conta) {
  const v = await semearVenda(c)
  const lancamentoId = await idDe(sql`insert into lancamentos_caixa (loja_id, usuario_id, tipo, categoria, valor, data, venda_id)
    values (${c.lojaId}, ${c.aux.id}, 'entrada', 'Venda', 1000, '2026-11-05', ${v.id}) returning id`)
  const cartaoId = await idDe(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, venda_id, conciliado, conciliado_em)
    values (${c.grupoId}, 'stone', '2026-11-05', 300.50, ${v.id}, true, now()) returning id`)
  const pixId = await idDe(sql`insert into pix_recebimentos_mcp (grupo_id, conta_id, banco, transacao_id, data, valor, venda_id, tipo_correspondencia, lancado_por_id, lancado_em)
    values (${c.grupoId}, 'conta-sintetica', 'banco', ${randomUUID()}, now(), 200.25, ${v.id}, 'venda', ${c.aux.id}, now()) returning id`)
  const demandaId = await idDe(sql`insert into demandas (modelo, cor, loja_id, solicitante_id, venda_id)
    values ('Modelo', 'PRETO', ${c.lojaId}, ${c.aux.id}, ${v.id}) returning id`)
  const arquivos = { selfie: `${c.grupoId}/${v.id}/selfie.jpg`, assinatura: `${c.grupoId}/${v.id}/assinatura.png` }
  const assinadoId = await semearDocumento(c, v, 'assinado', arquivos)
  const pendenteId = await semearDocumento(c, v, 'pendente', null)
  return { ...v, lancamentoId, cartaoId, pixId, demandaId, arquivos, documentoIds: [assinadoId, pendenteId] }
}

const vendaExiste = async (id: string) => (await execRows(sql`select 1 from vendas where id = ${id}`)).length === 1

test('cancelar venda completa: apaga venda, caixa e documentos, solta recebimentos e manda apagar selfie e assinatura', async () => {
  const c = await semearConta()
  const v = await semearVendaCompleta(c)
  usuario = c.aux

  const r = await cancelarVendaCompletaAction(v.id, 'Cliente desistiu')

  assert.deepEqual(r, { ok: true, cartao: 1, pix: 1, demandas: 1, valor: 500.75, documentosAssinados: 1 })
  assert.equal(await vendaExiste(v.id), false)
  assert.deepEqual(await execRows(sql`select id from lancamentos_caixa where id = ${v.lancamentoId}`), [])
  assert.deepEqual(await execRows(sql`select id from documentos_assinatura where venda_id = ${v.id} or id in (${v.documentoIds[0]}, ${v.documentoIds[1]})`), [])
  assert.deepEqual(await execRows(sql`select venda_id, conciliado, conciliado_em from conciliacoes_cartao where id = ${v.cartaoId}`),
    [{ venda_id: null, conciliado: false, conciliado_em: null }])
  assert.deepEqual(await execRows(sql`select venda_id, tipo_correspondencia, lancado_por_id, lancado_em from pix_recebimentos_mcp where id = ${v.pixId}`),
    [{ venda_id: null, tipo_correspondencia: null, lancado_por_id: null, lancado_em: null }])
  assert.deepEqual(await execRows(sql`select venda_id from demandas where id = ${v.demandaId}`), [{ venda_id: null }])
  assert.deepEqual(await execRows(sql`select status, disponibilidade from motos where id = ${v.motoId}`), [{ status: 'montada', disponibilidade: 'disponivel' }])
  assert.deepEqual(await execRows(sql`select status from pedidos_venda where id = ${v.pedidoId}`), [{ status: 'cancelado' }])
  assert.deepEqual(await execRows(sql`select status_anterior, status_novo, observacao from historico_estoque where moto_id = ${v.motoId}`), [{
    status_anterior: 'vendida', status_novo: 'montada',
    observacao: 'Venda cancelada — Cliente: Cliente sintético — Valor: R$ 1000.00 — Recebimentos desvinculados: 1 cartão + 1 PIX (R$ 500.75) — 1 documento(s) ASSINADO(S) removido(s) com a venda — Motivo: Cliente desistiu',
  }])
  assert.deepEqual(chamadasStorage, [{ bucket: 'assinaturas', caminhos: [v.arquivos.selfie, v.arquivos.assinatura] }])
})

test('venda sem documento de assinatura: cancela sem chamar o Storage', async () => {
  const c = await semearConta()
  const v = await semearVenda(c)
  usuario = c.aux

  const r = await cancelarVendaCompletaAction(v.id, 'Teste')

  assert.deepEqual(r, { ok: true, cartao: 0, pix: 0, demandas: 0, valor: 0, documentosAssinados: 0 })
  assert.equal(await vendaExiste(v.id), false)
  assert.deepEqual(chamadasStorage, [])
})

test('Storage com erro ou fora do ar não desfaz o cancelamento', async (t) => {
  const erros = mock.method(console, 'error', () => {})
  t.after(() => erros.mock.restore())
  const falhas = [async () => ({ error: { message: 'bucket indisponível' } }), async () => { throw new Error('rede caiu') }]
  for (const falha of falhas) {
    const c = await semearConta()
    const v = await semearVendaCompleta(c)
    usuario = c.aux
    respostaStorage = falha
    const r = await cancelarVendaCompletaAction(v.id, 'Teste')

    assert.equal(r.ok, true)
    assert.equal(await vendaExiste(v.id), false)
    assert.equal(chamadasStorage.length, 1)
    assert.equal(erros.mock.callCount(), 1)
    chamadasStorage = []
    erros.mock.resetCalls()
  }
})

test('Conta B não cancela venda da Conta A: mesma frase de id inexistente, nada apagado nem enviado ao Storage', async () => {
  const a = await semearConta()
  const b = await semearConta()
  const v = await semearVendaCompleta(a)
  usuario = b.aux

  const daOutraConta = await cancelarVendaCompletaAction(v.id, 'Teste')
  const inexistente = await cancelarVendaCompletaAction(randomUUID(), 'Teste')

  assert.deepEqual(daOutraConta, { ok: false, error: 'Venda não encontrada' })
  assert.deepEqual(inexistente, daOutraConta)
  assert.equal(await vendaExiste(v.id), true)
  assert.equal((await execRows(sql`select id from documentos_assinatura where venda_id = ${v.id}`)).length, 2)
  assert.deepEqual(await execRows(sql`select venda_id from conciliacoes_cartao where id = ${v.cartaoId}`), [{ venda_id: v.id }])
  assert.deepEqual(chamadasStorage, [])
})

test('venda com NF de saída em emissão na produção: recusa travada, nada apagado nem enviado ao Storage', async () => {
  const c = await semearConta()
  const v = await semearVendaCompleta(c)
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, payload)
    values (${v.id}, ${v.numero}, ${c.grupoId}, ${randomUUID()}, 'Producao', 'Processando', '{}'::jsonb) returning id`)
  usuario = c.aux

  const r = await cancelarVendaCompletaAction(v.id, 'Teste')

  assert.equal(r.ok, false)
  assert.equal('travada' in r && r.travada, true)
  assert.equal(await vendaExiste(v.id), true)
  assert.equal((await execRows(sql`select id from documentos_assinatura where venda_id = ${v.id}`)).length, 2)
  assert.deepEqual(chamadasStorage, [])
})

test('caminho receitado no ADR-0020 (#692): moto vendida recusa o Remover; depois do Cancelar venda, ela sai com o pedido cancelado', async () => {
  const { removerMotos } = await import('@/lib/remover-motos')
  const c = await semearConta()
  const v = await semearVenda(c)
  const socioId = await semearUsuario(db, c, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const socio = { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [c.grupoId], contaId: c.contaId }

  await assert.rejects(removerMotos(socio, [v.motoId], 'moto importada errada', 'CONFIRMAR'), /Esta moto tem venda\. Cancele a venda antes de remover\./)
  usuario = c.aux
  assert.equal((await cancelarVendaCompletaAction(v.id, 'moto importada errada')).ok, true)

  assert.deepEqual(await removerMotos(socio, [v.motoId], 'moto importada errada', 'CONFIRMAR'), { removidas: 1 })
  assert.deepEqual(await execRows(sql`select id from motos where id = ${v.motoId}`), [])
  assert.deepEqual(await execRows(sql`select id from pedidos_venda where id = ${v.pedidoId}`), [])
})

test('venda que veio de reserva (#692): depois do Cancelar venda, a reserva convertida, com o sinal, segura a moto', async () => {
  const { removerMotos } = await import('@/lib/remover-motos')
  const c = await semearConta()
  const v = await semearVenda(c)
  const reservaId = (await execRows(sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status)
    values (${v.motoId}, ${c.lojaId}, ${c.aux.id}, 500, 'pix', '2026-12-01', 'convertida') returning id`))[0].id as string
  await execRows(sql`update vendas set reserva_id = ${reservaId} where id = ${v.id}`)
  const socioId = await semearUsuario(db, c, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const socio = { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [c.grupoId], contaId: c.contaId }
  usuario = c.aux
  assert.equal((await cancelarVendaCompletaAction(v.id, 'moto importada errada')).ok, true)

  await assert.rejects(removerMotos(socio, [v.motoId], 'moto importada errada', 'CONFIRMAR'), /Esta moto tem reserva, com sinal pago pelo cliente\. Use Arquivar moto\./)
  assert.equal((await execRows(sql`select id from reservas where id = ${reservaId}`)).length, 1)
  assert.equal((await execRows(sql`select id from motos where id = ${v.motoId}`)).length, 1)
})
