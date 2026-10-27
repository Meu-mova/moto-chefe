// Teste de banco: Postgres descartável, como src/lib/pecas-da-conta.db.test.ts.
// Maquininhas por grupo (#460): a loja da Conta B não lista nem grava maquininha da Conta A.
import { after, before, test } from 'node:test'
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
let mod: typeof import('@/lib/maquininhas')
let aplicarVendaPeca: typeof import('@/lib/venda-peca')['aplicarVendaPeca']
let editarVendaPecaTx: typeof import('@/lib/editar-venda-peca')['editarVendaPecaTx']
let conferirMaquininhasDaOS: typeof import('@/lib/pagamento-os')['conferirMaquininhasDaOS']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/maquininhas')
  ;({ aplicarVendaPeca } = await import('@/lib/venda-peca'))
  ;({ editarVendaPecaTx } = await import('@/lib/editar-venda-peca'))
  ;({ conferirMaquininhasDaOS } = await import('@/lib/pagamento-os'))
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

async function semearConta(tx: Tx, nome: string, cnpj: string, operadora: string | null) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'MQ460 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'MQ460 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja MQ460 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vend', ${'vend-mq460' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const [peca] = await linhas(tx, sql`insert into pecas_catalogo (nome, valor, conta_id) values (${'Retrovisor ' + nome}, 50, ${conta.id}) returning id`)
  if (operadora) {
    await linhas(tx, sql`insert into maquininhas (grupo_id, nome, operadora) values (${grupo.id}, 'Maq', ${operadora})`)
  }
  return { grupoId: grupo.id as string, lojaId: loja.id as string, vendId: vend.id as string, pecaId: peca.id as string }
}

const vendaCartao = (lojaId: string, pecaId: string, operadora?: string) => ({
  lojaId, itens: [{ pecaId, quantidade: 1 }],
  pagamentos: [{ tipo: 'cartao_credito', valor: 50, parcelas: 1, ...(operadora ? { operadora } : {}) }],
})

test('loja lista só as maquininhas ativas do próprio grupo (#460)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'pagueveloz')
    await linhas(tx, sql`insert into maquininhas (grupo_id, nome, operadora, ativo) values (${b.grupoId}, 'Velha', 'infinitypay', false)`)

    assert.deepEqual((await mod.maquininhasDaLoja(tx, a.lojaId)).map(m => m.operadora), ['stone'])
    assert.deepEqual((await mod.maquininhasDaLoja(tx, b.lojaId)).map(m => m.operadora), ['pagueveloz'])
    const c = await semearConta(tx, 'C', '33333333000191', null)
    assert.deepEqual(await mod.maquininhasDaLoja(tx, c.lojaId), [])
  })
})

test('venda de peça na Conta B recusa maquininha só da Conta A, com a mesma frase de inexistente (#460)', async () => {
  await emTransacaoDesfeita(async tx => {
    await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'pagueveloz')
    for (const op of ['stone', 'nao-existe']) {
      await assert.rejects(aplicarVendaPeca(tx, b.vendId, vendaCartao(b.lojaId, b.pecaId, op)), /Maquininha não encontrada/)
    }
    const [{ n }] = await linhas(tx, sql`select count(*)::int n from vendas_pecas where loja_id = ${b.lojaId}`)
    assert.equal(n, 0)

    await aplicarVendaPeca(tx, b.vendId, vendaCartao(b.lojaId, b.pecaId, 'pagueveloz'))
    await aplicarVendaPeca(tx, b.vendId, vendaCartao(b.lojaId, b.pecaId))
  })
})

test('edição de venda de peça mantém a operadora antiga, mas não troca para maquininha de outra Conta (#460)', async () => {
  await emTransacaoDesfeita(async tx => {
    await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'pagueveloz')
    const { id: vendaId } = await aplicarVendaPeca(tx, b.vendId, vendaCartao(b.lojaId, b.pecaId, 'pagueveloz'))
    // Venda antiga com operadora que o grupo não tem mais.
    await linhas(tx, sql`update vendas_pecas set pagamentos = '[{"tipo":"cartao_credito","valor":50,"operadora":"infinitypay","parcelas":1}]'::jsonb where id = ${vendaId}`)
    const [{ grupo_id: grupoId }] = await linhas(tx, sql`select grupo_id from lojas where id = ${b.lojaId}`)
    const editar = (operadora: string) => editarVendaPecaTx(tx, {
      vendaId, grupoId, usuarioId: b.vendId,
      itens: [{ pecaId: b.pecaId, quantidade: 1 }],
      pagamentos: [{ tipo: 'cartao_credito', valor: 50, parcelas: 1, operadora }],
    })

    await editar('infinitypay')
    await assert.rejects(editar('stone'), /Maquininha não encontrada/)
  })
})

test('conferirMaquininhas: Conta B recusa a da A; cartão sem operadora passa (#460)', async () => {
  await emTransacaoDesfeita(async tx => {
    await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'pagueveloz')
    await assert.rejects(mod.conferirMaquininhas(tx, b.lojaId, [{ operadora: 'stone' }]), /Maquininha não encontrada/)
    await mod.conferirMaquininhas(tx, b.lojaId, [{ operadora: 'pagueveloz' }, { operadora: '' }, {}])
    await mod.conferirMaquininhas(tx, b.lojaId, [{ operadora: 'stone' }], ['stone'])
  })
})

test('pagamento de OS (fechamento ou aprovação) na Conta B recusa maquininha só da Conta A (#460)', async () => {
  await emTransacaoDesfeita(async tx => {
    await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'pagueveloz')
    const [os] = await linhas(tx, sql`insert into ordens_servico (loja_id, aberta_por, descricao, pagamentos)
      values (${b.lojaId}, ${b.vendId}, 'OS MQ460', '[{"tipo":"cartao_credito","valor":50,"operadora":"infinitypay"}]'::jsonb) returning id`)
    const cartao = (operadora: string) => [{ tipo: 'cartao_credito', valor: 50, operadora }]

    await assert.rejects(conferirMaquininhasDaOS(tx, os.id, cartao('stone')), /Maquininha não encontrada/)
    await assert.rejects(conferirMaquininhasDaOS(tx, '00000000-0000-0000-0000-000000000000', cartao('pagueveloz')), /OS não encontrada/)
    await conferirMaquininhasDaOS(tx, os.id, cartao('pagueveloz'))
    await conferirMaquininhasDaOS(tx, os.id, cartao('infinitypay'))
  })
})

test('trava de grupo errado só enxerga terminal da própria Conta (#460)', async () => {
  const { gruposDoTerminalNaConta } = await import('@/lib/terminal-da-conta')
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191', 'stone')
    const b = await semearConta(tx, 'B', '22222222000191', 'stone')
    const [{ conta_id: contaB }] = await linhas(tx, sql`select conta_id from grupos where id = ${b.grupoId}`)
    const [outroB] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('MQ460 B2', '33333333000191', ${contaB}) returning id`)
    const conc = (grupoId: string, serial: string) => linhas(tx, sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, raw_data)
      values (${grupoId}, 'stone', '2026-10-01', 10, ${JSON.stringify({ serial })}::jsonb)`)
    await conc(a.grupoId, 'SERIAL-A')
    await conc(outroB.id, 'SERIAL-B2')

    assert.deepEqual(await gruposDoTerminalNaConta(tx, contaB, 'SERIAL-A'), [])
    assert.deepEqual(await gruposDoTerminalNaConta(tx, contaB, 'SERIAL-B2'), [outroB.id])
  })
})
