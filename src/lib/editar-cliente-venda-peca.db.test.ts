// Teste de banco: Postgres descartável, como src/lib/editar-venda-peca.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
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
let editarClienteVendaPecaTx: typeof import('@/lib/editar-cliente-venda-peca')['editarClienteVendaPecaTx']
let aplicarEdicaoAprovadaTx: typeof import('@/lib/editar-venda-peca')['aplicarEdicaoAprovadaTx']
let vendaPecaEditavel: typeof import('@/lib/venda-peca-editavel')['vendaPecaEditavel']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ editarClienteVendaPecaTx } = await import('@/lib/editar-cliente-venda-peca'))
  ;({ aplicarEdicaoAprovadaTx } = await import('@/lib/editar-venda-peca'))
  ;({ vendaPecaEditavel } = await import('@/lib/venda-peca-editavel'))
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

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CL397 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'CL397 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja CL397 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-cl397' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [socio] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Socio', ${'socio-cl397' + nome + '@teste.invalid'}, 'admin_socio', null) returning id`)
  const [peca] = await linhas(tx, sql`insert into pecas_catalogo (nome, valor, quantidade_estoque, conta_id) values ('Retrovisor', 50, 8, ${conta.id}) returning id`)
  return {
    grupoId: grupo.id as string, lojaId: loja.id as string, pecaId: peca.id as string,
    aux: { id: aux.id as string, papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
    socio: { id: socio.id as string, papel: 'admin_socio', lojaId: null, gruposAcesso: [grupo.id as string], contaId: conta.id as string },
  }
}

async function semearVenda(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>) {
  const [venda] = await linhas(tx, sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, pagamentos, valor_total, cliente_nome, cliente_documento, cliente_tipo_pessoa)
    values (${c.lojaId}, ${c.aux.id}, 'pix', ${JSON.stringify([{ tipo: 'pix', valor: 100 }])}::jsonb, 100, 'Fulano', '52998224725', 'fisica') returning id, numero`)
  await linhas(tx, sql`insert into vendas_pecas_itens (venda_peca_id, peca_id, descricao, quantidade, valor_unitario)
    values (${venda.id}, ${c.pecaId}, 'Retrovisor', 2, 50)`)
  return { id: venda.id as string, numero: venda.numero as number }
}

const vendaDb = async (tx: Tx, id: string) =>
  (await linhas(tx, sql`select cliente_nome, cliente_documento, cliente_tipo_pessoa, forma_pagamento, valor_total from vendas_pecas where id = ${id}`))[0]
const historico = (tx: Tx, id: string) => linhas(tx, sql`select grupo_id, usuario_id, resumo from vendas_pecas_edicoes where venda_peca_id = ${id}`)

test('troca nome e documento, não mexe em pagamento e o histórico mostra os dois (#397)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039701')
    const venda = await semearVenda(tx, a)
    const r = await editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: ' Ciclano ', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-35' })
    assert.equal(r.numero, venda.numero)
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_nome, 'Ciclano')
    assert.equal(v.cliente_documento?.replace(/\D/g, ''), '11144477735')
    assert.equal(v.forma_pagamento, 'pix')
    assert.equal(v.valor_total, '100.00')
    const [h] = await historico(tx, venda.id)
    assert.equal(h.grupo_id, a.grupoId)
    assert.equal(h.usuario_id, a.aux.id)
    assert.match(h.resumo, /Cliente: Fulano → Ciclano/)
    assert.match(h.resumo, /Documento: 529\.982\.247-25 → 111\.444\.777-35/)
  })
})

test('só o documento mudou: o histórico mostra o documento, não "Fulano → Fulano"', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039702')
    const venda = await semearVenda(tx, a)
    await editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'Fulano', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-35' })
    const [h] = await historico(tx, venda.id)
    assert.doesNotMatch(h.resumo, /Cliente:/)
    assert.match(h.resumo, /^Documento: /)
  })
})

test('sem mudança não grava histórico', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039703')
    const venda = await semearVenda(tx, a)
    await editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'Fulano', clienteTipoPessoa: 'fisica', clienteDocumento: '529.982.247-25' })
    assert.equal((await historico(tx, venda.id)).length, 0)
  })
})

test('CPF com tamanho errado barra a troca e nada é gravado (mesma regra da criação)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039704')
    const venda = await semearVenda(tx, a)
    await assert.rejects(editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'X', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-3' }), /CPF deve ter 11 dígitos/)
    assert.equal((await vendaDb(tx, venda.id)).cliente_nome, 'Fulano')
    assert.equal((await historico(tx, venda.id)).length, 0)
  })
})

test('usuário da Conta B (aux e sócio) não troca o cliente da venda da Conta A, e o erro não revela que ela existe', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039705')
    const b = await semearConta(tx, 'B', '00000000039706')
    const venda = await semearVenda(tx, a)
    for (const usuario of [b.aux, b.socio]) {
      await assert.rejects(
        editarClienteVendaPecaTx(tx, usuario, venda.id, { clienteNome: 'Invasor', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-35' }),
        /^Error: Venda não encontrada$/,
      )
    }
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_nome, 'Fulano')
    assert.equal(v.cliente_documento?.replace(/\D/g, ''), '52998224725')
    assert.equal((await historico(tx, venda.id)).length, 0)
  })
})

test('sócio da própria Conta troca o cliente da venda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039707')
    const venda = await semearVenda(tx, a)
    await editarClienteVendaPecaTx(tx, a.socio, venda.id, { clienteNome: 'Ciclano', clienteTipoPessoa: 'fisica', clienteDocumento: null })
    assert.equal((await vendaDb(tx, venda.id)).cliente_nome, 'Ciclano')
  })
})

test('edição pendente (peca_edicao) aprovada depois da troca não desfaz o cliente novo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039708')
    const venda = await semearVenda(tx, a)
    // O pedido guarda o nome de quando foi feito; a aprovação aplica só itens e pagamentos.
    const pedido = { vendaId: venda.id, numero: venda.numero, itens: [{ pecaId: a.pecaId, quantidade: 1 }], pagamentos: [{ tipo: 'financiamento', valor: 50 }], clienteNome: 'Fulano' }
    await editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'Ciclano', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-35' })
    await aplicarEdicaoAprovadaTx(tx, pedido, a.aux.id)
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_nome, 'Ciclano')
    assert.equal(v.cliente_documento?.replace(/\D/g, ''), '11144477735')
    assert.equal(v.forma_pagamento, 'financiamento')
  })
})

// vendaEditavel (Editar e carregar a edição, em pecas/actions.ts) usa a mesma consulta:
// venda de outra Conta volta vazia e a action responde "Venda não encontrada", como inexistente.
test('Editar: a Conta B não acha a venda da Conta A; a própria Conta acha', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039709')
    const b = await semearConta(tx, 'B', '00000000039710')
    const venda = await semearVenda(tx, a)
    assert.equal(await vendaPecaEditavel(tx, b.aux, venda.id), null)
    assert.equal(await vendaPecaEditavel(tx, b.socio, venda.id), null)
    // Sócio da Conta B com o grupo da Conta A em grupos_acesso: a Conta continua barrando.
    assert.equal(await vendaPecaEditavel(tx, { ...b.socio, gruposAcesso: [a.grupoId] }, venda.id), null)
    assert.equal((await vendaPecaEditavel(tx, a.aux, venda.id))?.id, venda.id)
    assert.equal((await vendaPecaEditavel(tx, a.socio, venda.id))?.grupoId, a.grupoId)
    assert.equal((await vendaPecaEditavel(tx, { ...a.socio, papel: 'admin_geral', contaId: null }, venda.id))?.id, venda.id)
  })
})

test('Editar: vendedor de outra loja da mesma Conta e sócio com grupo inativo não acham a venda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039711')
    const venda = await semearVenda(tx, a)
    const [outra] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Outra CL397', 'C', 'R', ${a.grupoId}) returning id`)
    assert.equal(await vendaPecaEditavel(tx, { ...a.aux, lojaId: outra.id }, venda.id), null)
    await linhas(tx, sql`update grupos set ativo = false where id = ${a.grupoId} returning id`)
    assert.equal(await vendaPecaEditavel(tx, a.socio, venda.id), null)
  })
})

test('CPF com dígito verificador errado barra a troca e nada é gravado (#399, ADR-0015)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039712')
    const venda = await semearVenda(tx, a)
    await assert.rejects(
      editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'X', clienteTipoPessoa: 'fisica', clienteDocumento: '529.982.247-24' }),
      /CPF inválido/,
    )
    assert.equal((await vendaDb(tx, venda.id)).cliente_nome, 'Fulano')
    assert.equal((await historico(tx, venda.id)).length, 0)
  })
})

test('venda antiga com CPF errado: corrigir só o nome não reconfere o documento (#399, ADR-0015)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000039713')
    const venda = await semearVenda(tx, a)
    await linhas(tx, sql`update vendas_pecas set cliente_documento = '52998224724' where id = ${venda.id} returning id`)
    await editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'Ciclano', clienteTipoPessoa: 'fisica', clienteDocumento: '529.982.247-24' })
    const v = await vendaDb(tx, venda.id)
    assert.equal(v.cliente_nome, 'Ciclano')
    assert.equal(v.cliente_documento, '52998224724')
    // Trocar para outro documento errado continua barrado.
    await assert.rejects(
      editarClienteVendaPecaTx(tx, a.aux, venda.id, { clienteNome: 'Ciclano', clienteTipoPessoa: 'fisica', clienteDocumento: '111.444.777-36' }),
      /CPF inválido/,
    )
  })
})
