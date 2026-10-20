// Teste de banco: Postgres descartável, como src/lib/efetivar-pedido.db.test.ts
// (roteiro para rodar local no topo daquele arquivo).
import { after, before, describe, test } from 'node:test'
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
let db: Db['db']
let editarVendaPecaTx: typeof import('@/lib/editar-venda-peca')['editarVendaPecaTx']
let aplicarEdicaoAprovadaTx: typeof import('@/lib/editar-venda-peca')['aplicarEdicaoAprovadaTx']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ editarVendaPecaTx, aplicarEdicaoAprovadaTx } = await import('@/lib/editar-venda-peca'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

// Venda #1 com 2 retrovisores (preço ajustado 40,00) e 1 pneu; estoque já baixado.
async function semear(tx: Tx) {
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj) values ('Grupo Teste', '00000000000191') returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja Teste', 'Cidade', 'Rua', ${grupo.id}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Vend', 'vend@teste.invalid', 'vendedor', ${loja.id}) returning id`)
  const [retro] = await linhas(tx, sql`insert into pecas_catalogo (nome, valor, quantidade_estoque) values ('Retrovisor', 50, 8) returning id`)
  const [pneu] = await linhas(tx, sql`insert into pecas_catalogo (nome, valor, quantidade_estoque) values ('Pneu', 100, 4) returning id`)
  const [capa] = await linhas(tx, sql`insert into pecas_catalogo (nome, valor, quantidade_estoque) values ('Capacete', 150, 3) returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, pagamentos, valor_total)
    values (${loja.id}, ${vend.id}, 'pix', ${JSON.stringify([{ tipo: 'pix', valor: 180 }])}::jsonb, 180) returning id, numero`)
  await linhas(tx, sql`insert into vendas_pecas_itens (venda_peca_id, peca_id, descricao, quantidade, valor_unitario) values
    (${venda.id}, ${retro.id}, 'Retrovisor', 2, 40), (${venda.id}, ${pneu.id}, 'Pneu', 1, 100)`)
  return { grupoId: grupo.id as string, vendId: vend.id as string, vendaId: venda.id as string, numero: venda.numero as number, retro: retro.id as string, pneu: pneu.id as string, capa: capa.id as string }
}

const estoque = async (tx: Tx, id: string) => (await linhas(tx, sql`select quantidade_estoque as q from pecas_catalogo where id = ${id}`))[0].q

describe('editarVendaPecaTx (#242)', () => {
  test('troca itens e pagamento no lugar, acerta estoque pela diferença e grava o histórico', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      // Tira o pneu, retrovisor 2 → 3, entra 1 capacete; paga parte no cartão.
      const r = await editarVendaPecaTx(tx, {
        vendaId: s.vendaId, grupoId: s.grupoId, usuarioId: s.vendId,
        itens: [{ pecaId: s.retro, quantidade: 3 }, { pecaId: s.capa, quantidade: 1 }],
        pagamentos: [{ tipo: 'pix', valor: 120 }, { tipo: 'cartao_credito', valor: 150 }],
      })
      assert.equal(r.numero, s.numero)
      assert.equal(await estoque(tx, s.retro), 7)
      assert.equal(await estoque(tx, s.pneu), 5)
      assert.equal(await estoque(tx, s.capa), 2)

      const [v] = await linhas(tx, sql`select forma_pagamento, valor_total from vendas_pecas where id = ${s.vendaId}`)
      assert.equal(v.forma_pagamento, 'multiplo')
      assert.equal(v.valor_total, '270.00')

      const itens = await linhas(tx, sql`select descricao, quantidade, valor_unitario from vendas_pecas_itens where venda_peca_id = ${s.vendaId} order by descricao`)
      assert.deepEqual(itens.map(i => [i.descricao, i.quantidade, i.valor_unitario]), [
        ['Capacete', '1.00', '150.00'],
        // Sem preço mandado, a peça que já estava na venda mantém o preço ajustado.
        ['Retrovisor', '3.00', '40.00'],
      ])

      const [h] = await linhas(tx, sql`select grupo_id, usuario_id, resumo from vendas_pecas_edicoes where venda_peca_id = ${s.vendaId}`)
      assert.equal(h.grupo_id, s.grupoId)
      assert.equal(h.usuario_id, s.vendId)
      assert.match(h.resumo, /- Pneu/)
      assert.match(h.resumo, /\+ Capacete/)
    })
  })

  test('peça inexistente desfaz tudo', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      await assert.rejects(
        tx.transaction(t2 => editarVendaPecaTx(t2, {
          vendaId: s.vendaId, grupoId: s.grupoId, usuarioId: s.vendId,
          itens: [{ pecaId: '00000000-0000-0000-0000-000000000000', quantidade: 1 }],
          pagamentos: [{ tipo: 'pix', valor: 10 }],
        })),
        /Peça não encontrada/,
      )
      assert.equal(await estoque(tx, s.pneu), 4)
    })
  })

  test('edição aprovada (financiamento) aplica o que ficou guardado no pedido, com o grupo da loja da venda', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      const r = await aplicarEdicaoAprovadaTx(tx, {
        vendaId: s.vendaId, numero: s.numero,
        itens: [{ pecaId: s.retro, quantidade: 1 }],
        pagamentos: [{ tipo: 'financiamento', valor: 40 }],
      }, s.vendId)
      assert.equal(r.numero, s.numero)
      assert.equal(await estoque(tx, s.retro), 9)
      assert.equal(await estoque(tx, s.pneu), 5)
      const [v] = await linhas(tx, sql`select forma_pagamento, valor_total from vendas_pecas where id = ${s.vendaId}`)
      assert.equal(v.forma_pagamento, 'financiamento')
      assert.equal(v.valor_total, '40.00')
      const [h] = await linhas(tx, sql`select grupo_id, usuario_id from vendas_pecas_edicoes where venda_peca_id = ${s.vendaId}`)
      assert.equal(h.grupo_id, s.grupoId)
      assert.equal(h.usuario_id, s.vendId)
    })
  })

  test('edição aprovada de venda que foi excluída falha sem mexer no estoque', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      await linhas(tx, sql`delete from vendas_pecas where id = ${s.vendaId} returning id`)
      await assert.rejects(
        tx.transaction(t2 => aplicarEdicaoAprovadaTx(t2, {
          vendaId: s.vendaId, numero: s.numero,
          itens: [{ pecaId: s.retro, quantidade: 5 }],
          pagamentos: [{ tipo: 'financiamento', valor: 200 }],
        }, s.vendId)),
        /Venda não encontrada/,
      )
      assert.equal(await estoque(tx, s.retro), 8)
    })
  })
})
