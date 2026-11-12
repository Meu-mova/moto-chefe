// Teste de banco: Postgres descartável (npm run test:db:local), como src/lib/os-do-usuario.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let dossieDoUsuario: typeof import('@/lib/dossie-do-usuario')['dossieDoUsuario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ dossieDoUsuario } = await import('@/lib/dossie-do-usuario'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

const idDe = async (tx: Tx, q: ReturnType<typeof sql>) =>
  ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id

const PREFIXO = 'DOS840'

async function semearConta(tx: Tx, nome: string) {
  const base = await semearContaBase(tx, { prefixo: PREFIXO, nome, cnpj: randomUUID() })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm', rotulo: 'aux' })
  const modeloId = await idDe(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${`${PREFIXO} ${randomUUID()}`}, 'autopropelido', '1000', 'hub', '32') returning id`)
  return { base, auxId, modeloId }
}

type Conta = Awaited<ReturnType<typeof semearConta>>

// Documento de assinatura de uma venda numa loja do grupo informado.
async function semearDocumento(tx: Tx, c: Conta, alvo: Pick<Base, 'grupoId' | 'lojaId'> = c.base) {
  const motoId = await idDe(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${c.modeloId}, ${alvo.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const pedidoId = await idDe(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${alvo.lojaId}, ${c.auxId}) returning id`)
  const vendaId = await idDe(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedidoId}, ${motoId}, ${alvo.lojaId}, ${c.auxId}, ${c.auxId}, 'Cliente sintético', '52998224725', 1000, 'pix') returning id`)
  return idDe(tx, sql`insert into documentos_assinatura (grupo_id, venda_id, tipo, token, html_snapshot, snapshot_hash, celular_destino, expira_em)
    values (${alvo.grupoId}, ${vendaId}, 'contrato_venda', ${randomUUID()}, '<p>doc</p>', 'h', '35999999999', now()) returning id`)
}

const socio = (c: Conta, grupos: string[] = [c.base.grupoId]) =>
  ({ papel: 'admin_socio', lojaId: null, gruposAcesso: grupos, contaId: c.base.contaId })

test('sócio da própria Conta abre o dossiê', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const docId = await semearDocumento(tx, a)
    assert.equal((await dossieDoUsuario(socio(a), docId, tx))?.doc.id, docId)
  })
})

test('sócio da Conta B não abre o dossiê da Conta A, igual a um id inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const b = await semearConta(tx, 'B')
    const docId = await semearDocumento(tx, a)
    assert.equal(await dossieDoUsuario(socio(b), docId, tx), null)
    assert.equal(await dossieDoUsuario(socio(b), randomUUID(), tx), null)
  })
})

test('aux_adm e vendedor da loja do documento não abrem o dossiê', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const docId = await semearDocumento(tx, a)
    for (const papel of ['aux_adm', 'vendedor']) {
      const usuario = { papel, lojaId: a.base.lojaId, gruposAcesso: null, contaId: a.base.contaId }
      assert.equal(await dossieDoUsuario(usuario, docId, tx), null)
    }
  })
})

test('admin_geral abre o dossiê de qualquer Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const docId = await semearDocumento(tx, a)
    const admin = { papel: 'admin_geral', lojaId: null, gruposAcesso: null, contaId: null }
    assert.equal((await dossieDoUsuario(admin, docId, tx))?.doc.id, docId)
  })
})

test('sócio de Conta com dois grupos abre o dossiê do outro grupo da mesma Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const outro = await semearGrupo(tx, a.base.contaId, { prefixo: PREFIXO, nome: 'A2', cnpj: randomUUID() })
    const docId = await semearDocumento(tx, a, outro)
    assert.equal((await dossieDoUsuario(socio(a, [a.base.grupoId, outro.grupoId]), docId, tx))?.doc.id, docId)
  })
})
