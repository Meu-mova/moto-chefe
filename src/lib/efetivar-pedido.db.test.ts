// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml)
// ou um local montado igual. Os casos que gravam rodam numa transação desfeita no
// fim; os de rpc só leem. A trava de loopback pega erro de configuração, não um
// túnel para outro banco em localhost. Para rodar local:
//   initdb -U postgres -A trust /tmp/mova-pg-teste
//   pg_ctl -D /tmp/mova-pg-teste -o "-p 55432 -k /tmp" -l /tmp/mova-pg-teste/log start
//   U=postgresql://postgres@localhost:55432/postgres
//   psql "$U" -X -q -v ON_ERROR_STOP=1 -f supabase/ci-stubs.sql
//   psql "$U" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/schema-baseline.sql
//   CI=true DATABASE_URL=$U node --import tsx scripts/migrate.ts --baseline-ate 110
//   CI=true DATABASE_URL=$U node --import tsx scripts/migrate.ts --aplicar
//   TEST_DATABASE_URL=$U npm run test:db
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
let db: Db['db']
let execRows: Db['execRows']
let efetivarPedidoTx: typeof import('@/lib/efetivar-pedido')['efetivarPedidoTx']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ efetivarPedidoTx } = await import('@/lib/efetivar-pedido'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

// Roda `fn` numa transação e a desfaz no fim, mesmo quando passa.
async function emTransacaoDesfeita(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  await assert.rejects(
    db.transaction(async tx => {
      await fn(tx)
      throw new Desfazer()
    }),
    Desfazer,
  )
}

async function semear(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], opts: { comReserva?: boolean } = {}) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows[0]
  const grupo = await linha(sql`insert into grupos (nome, cnpj) values ('Grupo Teste', '00000000000191') returning id`)
  const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja Teste', 'Cidade', 'Rua', ${grupo.id}) returning id`)
  const aux = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Aux', 'aux@teste.invalid', 'aux_adm', ${loja.id}) returning id`)
  const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Vend', 'vend@teste.invalid', 'vendedor', ${loja.id}) returning id`)
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'X', 'autopropelido', '1000', 'hub', '32') returning id`)
  const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values ('TESTE181', ${modelo.id}, ${loja.id}, 'CINZA', '1', 'montada', ${opts.comReserva ? 'reservada' : 'disponivel'}) returning id`)
  const origem = await linha(sql`insert into origens_venda (grupo_id, nome) values (${grupo.id}, 'Passou na porta') returning id`)
  const cliente = await linha(sql`insert into clientes (nome, cpf_cnpj) values ('Cliente Teste', '52998224725') returning id`)
  const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${loja.id}, ${vendedor.id}) returning id`)
  const reserva = opts.comReserva
    ? await linha(sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao) values (${moto.id}, ${loja.id}, ${vendedor.id}, 500, 'pix', current_date) returning id`)
    : null
  return { lojaId: loja.id as string, auxId: aux.id as string, motoId: moto.id as string, origemId: origem.id as string, clienteId: cliente.id as string, pedidoId: pedido.id as string, reservaId: reserva?.id as string | undefined }
}

describe('efetivarPedidoTx (#181)', () => {
  test('aux_adm efetiva pedido pendente: venda com cliente vinculado e nome/CPF em texto puro', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      const { vendaId } = await efetivarPedidoTx(tx, {
        pedidoId: s.pedidoId, lojaId: s.lojaId, efetivadoPor: s.auxId, clienteId: s.clienteId,
        clienteNome: 'Cliente Teste', clienteCpf: '529.982.247-25', valor: 15000, formaPagamento: 'pix',
        origem: { origemId: s.origemId, origemDetalhe: null },
      })
      const [r] = ((await tx.execute(sql`
        select v.cliente_id, v.cliente_nome, v.cliente_cpf, v.valor, p.status as pedido, m.status as moto, m.disponibilidade,
               (select count(*)::int from historico_estoque h where h.referencia_id = p.id) as historico
        from vendas v join pedidos_venda p on p.id = v.pedido_venda_id join motos m on m.id = v.moto_id
        where v.id = ${vendaId}`)) as unknown as { rows: any[] }).rows
      assert.equal(r.cliente_id, s.clienteId)
      assert.equal(r.cliente_nome, 'Cliente Teste')
      assert.equal(r.cliente_cpf, '529.982.247-25')
      assert.equal(r.valor, '15000.00')
      assert.equal(r.pedido, 'efetivado')
      assert.equal(r.moto, 'vendida')
      assert.equal(r.disponibilidade, null)
      assert.equal(r.historico, 1)
    })
  })

  test('com reserva ativa: venda ligada à reserva, que vira convertida; dinheiro entra no caixa', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx, { comReserva: true })
      const { vendaId } = await efetivarPedidoTx(tx, {
        pedidoId: s.pedidoId, lojaId: s.lojaId, efetivadoPor: s.auxId, clienteId: null,
        clienteNome: 'Sem Cadastro', clienteCpf: '529.982.247-25', valor: 9000, formaPagamento: 'dinheiro',
        origem: { origemId: s.origemId, origemDetalhe: null },
      })
      const [r] = ((await tx.execute(sql`
        select v.reserva_id, v.cliente_id, rs.status as reserva,
               (select count(*)::int from lancamentos_caixa c where c.venda_id = v.id) as caixa
        from vendas v join reservas rs on rs.id = ${s.reservaId} where v.id = ${vendaId}`)) as unknown as { rows: any[] }).rows
      assert.equal(r.reserva_id, s.reservaId)
      assert.equal(r.reserva, 'convertida')
      assert.equal(r.cliente_id, null)
      assert.equal(r.caixa, 1)
    })
  })

  test('pedido já efetivado é recusado', async () => {
    await emTransacaoDesfeita(async tx => {
      const s = await semear(tx)
      const dados = {
        pedidoId: s.pedidoId, lojaId: s.lojaId, efetivadoPor: s.auxId, clienteId: null,
        clienteNome: 'X', clienteCpf: '529.982.247-25', valor: 1, formaPagamento: 'pix',
        origem: { origemId: s.origemId, origemDetalhe: null },
      }
      await efetivarPedidoTx(tx, dados)
      await assert.rejects(efetivarPedidoTx(tx, dados), /não está pendente/)
    })
  })
})

// O que derrubou a efetivação (#181): a rpc efetivar_venda lia app.encryption_key,
// configuração que não existe em nenhum banco. A guarda vê só rpc chamada com o
// nome literal entre aspas simples, e current_setting de app.* no corpo da própria função.
describe('funções chamadas por supabase.rpc', () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []
    })
  }
  const chamadas = [...new Set(
    arquivos('src').flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*'([a-z_0-9]+)'/g)].map(m => m[1])),
  )].sort()

  test('a lista de rpcs chamadas não está vazia (a varredura funciona)', () => {
    assert.ok(chamadas.length > 0)
  })

  test('toda rpc chamada no código existe no banco', async () => {
    const existentes = new Set((await execRows(sql`select proname from pg_proc where pronamespace = 'public'::regnamespace`)).map(r => r.proname))
    assert.deepEqual(chamadas.filter(n => !existentes.has(n)), [])
  })

  test('nenhuma rpc chamada depende de configuração app.* (current_setting)', async () => {
    const dependentes = (await execRows(sql`
      select proname from pg_proc
      where pronamespace = 'public'::regnamespace and prosrc ilike '%current_setting(''app.%'
    `)).map(r => r.proname)
    assert.deepEqual(chamadas.filter(n => dependentes.includes(n)), [])
  })
})
