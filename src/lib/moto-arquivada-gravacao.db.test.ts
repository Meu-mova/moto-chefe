// Teste de banco: Postgres descartável, como src/lib/pedido-moto-do-usuario.db.test.ts.
// Moto arquivada (#688, decisão do Luis): motoDoUsuario, criarPedidoTx e lojaDaMotoParaGravar,
// por onde passam vender, reservar, pedir, transferir e abrir garantia, recusam a arquivada com a
// frase que manda desarquivar; a não arquivada segue. As actions de transferir e garantia estão
// em moto-arquivada-actions.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let mdu: typeof import('@/lib/moto-do-usuario')
let criarPedidoTx: typeof import('@/lib/pedido-venda')['criarPedidoTx']
let MOTO_ARQUIVADA: string

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mdu = await import('@/lib/moto-do-usuario')
  ;({ criarPedidoTx } = await import('@/lib/pedido-venda'))
  ;({ MOTO_ARQUIVADA } = await import('@/lib/arquivar-moto-regras'))
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
const recusaArquivada = (e: Error) => e.message === MOTO_ARQUIVADA

async function semear(tx: Tx, cnpj: string) {
  const base = await semearContaBase(tx, { prefixo: 'MAG688', nome: 'A', cnpj })
  const vendedorId = await semearUsuario(tx, base, { papel: 'vendedor', rotulo: 'vend' })
  const socioId = await semearUsuario(tx, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'MAG688', 'autopropelido', '1000', 'hub', '32') returning id`)
  const moto = async (chassi: string, arquivada: boolean) => {
    const [m] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${chassi}, ${modelo.id}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
    if (arquivada) await tx.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${socioId}, motivo_arquivo = 'golpe' where id = ${m.id}`)
    return m.id as string
  }
  return {
    base, vendedorId,
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId },
    arquivada: await moto('MAG688ARQ', true),
    viva: await moto('MAG688VIVA', false),
  }
}

test('vender, reservar e pedir (motoDoUsuario): arquivada recusa com a frase; a viva segue', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx, '00000000068840')
    await assert.rejects(mdu.motoDoUsuario(s.socio, s.arquivada, tx), recusaArquivada)
    assert.equal((await mdu.motoDoUsuario(s.socio, s.viva, tx))?.id, s.viva)
  })
})

test('criar pedido de venda: arquivada recusa sem reservar a moto; a viva vira pedido', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx, '00000000068841')
    await assert.rejects(criarPedidoTx(tx, { motoId: s.arquivada, vendedorId: s.vendedorId, observacao: null }), recusaArquivada)
    assert.equal((await linhas(tx, sql`select disponibilidade from motos where id = ${s.arquivada}`))[0].disponibilidade, 'disponivel')
    assert.equal((await linhas(tx, sql`select count(*)::int as n from pedidos_venda where moto_id = ${s.arquivada}`))[0].n, 0)
    const { pedidoId } = await criarPedidoTx(tx, { motoId: s.viva, vendedorId: s.vendedorId, observacao: null })
    assert.equal((await linhas(tx, sql`select moto_id from pedidos_venda where id = ${pedidoId}`))[0].moto_id, s.viva)
  })
})

test('transferir e abrir garantia (lojaDaMotoParaGravar): arquivada recusa com a frase; a viva devolve a loja', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx, '00000000068842')
    await assert.rejects(mdu.lojaDaMotoParaGravar(s.socio, s.arquivada, tx), recusaArquivada)
    assert.deepEqual(await mdu.lojaDaMotoParaGravar(s.socio, s.viva, tx), { lojaId: s.base.lojaId, status: 'montada' })
    assert.equal(await mdu.lojaDaMotoParaGravar(s.socio, '0f8fad5b-d9cb-469f-a165-70867728950e', tx), null)
  })
})

test('Conta B recebe "não encontrada" (null) para a moto arquivada da Conta A, como para id inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, '00000000068843')
    const b = await semearContaBase(tx, { prefixo: 'MAG688', nome: 'B', cnpj: '00000000068844' })
    const socioB = { papel: 'admin_socio', lojaId: null, gruposAcesso: [b.grupoId], contaId: b.contaId }
    assert.equal(await mdu.lojaDaMotoParaGravar(socioB, a.arquivada, tx), null)
    assert.equal(await mdu.motoDoUsuario(socioB, a.arquivada, tx), null)
  })
})
