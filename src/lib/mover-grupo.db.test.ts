// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/efetivar-pedido.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

let db: typeof import('@/lib/db')['db']
let moverGrupo: typeof import('@/lib/mover-grupo')['moverGrupo']
let previaMoverGrupo: typeof import('@/lib/mover-grupo')['previaMoverGrupo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ moverGrupo, previaMoverGrupo } = await import('@/lib/mover-grupo'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Linha = Record<string, string>
const rows = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: Linha[] }).rows
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => (await rows(tx, q))[0]

// Conta de origem (um grupo só, com tudo o que é da Conta), Conta de destino e uma terceira.
async function cenario(tx: Tx) {
  const conta = (nome: string) => linha(tx, sql`insert into contas (nome) values (${nome}) returning id`)
  const [o, d, t] = [await conta('Origem'), await conta('Destino'), await conta('Terceira')]
  const grupo = async (c: Linha, nome: string, cnpj: string) => {
    const g = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${c.id}) returning id`)
    const l = await linha(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja ' + nome}, 'C', 'R', ${g.id}) returning id`)
    return { id: g.id, loja: l.id }
  }
  const [go, gd, gt] = [await grupo(o, 'Movido', '00000000000191'), await grupo(d, 'Da destino', '00000000000272'), await grupo(t, 'Da terceira', '00000000000353')]
  const geral = await linha(tx, sql`insert into usuarios (id, nome, email, papel) values (gen_random_uuid(), 'Geral', 'geral-554@teste.invalid', 'admin_geral') returning id`)
  const cargo = await linha(tx, sql`insert into cargos (conta_id, nome) values (${o.id}, 'Caixa') returning id`)
  const vendedor = await linha(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id, cargo_id)
    values (gen_random_uuid(), 'Vendedor', 'vend-554@teste.invalid', 'cargo', ${go.loja}, ${o.id}, ${cargo.id}) returning id`)
  const rede = await linha(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
    values (gen_random_uuid(), 'Rede', 'rede-554@teste.invalid', 'admin_rede', ${gd.loja}, ${d.id}) returning id`)
  await tx.execute(sql`insert into grupos_liberados (usuario_id, grupo_id, liberado_por) values (${rede.id}, ${go.id}, ${geral.id})`)

  const cliente = await linha(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Cliente', '52998224725', ${o.id}) returning id`)
  // Mesmo CPF numa terceira Conta: não é conflito, e não pode ser tocado.
  const clienteT = await linha(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Da terceira', '52998224725', ${t.id}) returning id`)
  const plataforma = await linha(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('P', 'P554', 'autopropelido', '1', 'h', '1') returning id`)
  const proprio = await linha(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('Própria', 'X554', 'autopropelido', '1', 'h', '1', ${o.id}) returning id`)
  await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('XIS', ${proprio.id}, ${o.id})`)
  await tx.execute(sql`insert into modelo_ajustes (conta_id, modelo_id) values (${o.id}, ${plataforma.id})`)
  await tx.execute(sql`insert into conta_marcas (conta_id, marca) values (${o.id}, 'Própria'), (${d.id}, 'P')`)
  await tx.execute(sql`insert into veiculos_historico (chassi, conta_id) values ('CH554', ${o.id})`)
  const peca = await linha(tx, sql`insert into pecas_catalogo (nome, conta_id) values ('Pneu', ${o.id}) returning id`)
  await tx.execute(sql`insert into pecas_vinculo_fornecedor (conta_id, fornecedor_cnpj, codigo, nome_xml, peca_id) values (${o.id}, '1', 'C1', 'PNEU', ${peca.id})`)
  const moto = await linha(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values ('M554', ${proprio.id}, ${go.loja}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const pedido = await linha(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${go.loja}, ${vendedor.id}) returning id`)
  const venda = await linha(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_id, cliente_nome, cliente_cpf, cliente_celular, cliente_cidade, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${go.loja}, ${vendedor.id}, ${vendedor.id}, ${cliente.id}, 'Cliente', '529.982.247-25', '3599', 'C', 1000, 'pix') returning id`)
  return { o: o.id, d: d.id, t: t.id, go, gd, gt, geral: { id: geral.id, papel: 'admin_geral' }, vendedor: vendedor.id, rede: rede.id,
    cliente: cliente.id, clienteT: clienteT.id, proprio: proprio.id, peca: peca.id, venda: venda.id, cargo: cargo.id }
}

// Tudo o que aponta para uma Conta, para comparar antes e depois.
const TABELAS = ['usuarios', 'clientes', 'modelos', 'modelo_apelidos', 'modelo_ajustes', 'veiculos_historico', 'pecas_catalogo', 'pecas_vinculo_fornecedor', 'cargos', 'conta_marcas', 'grupos']
async function fotografia(tx: Tx, contaId: string) {
  const r: Record<string, number> = {}
  for (const t of TABELAS) r[t] = Number((await linha(tx, sql`select count(*)::int n from ${sql.raw(t)} where conta_id = ${contaId}`)).n)
  return r
}

test('move: tudo da origem vai para a destino, a origem fica desativada e vazia, a terceira não é tocada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const terceiraAntes = await fotografia(tx, c.t)

    const r = await moverGrupo(tx, c.geral, c.go.id, c.d)
    assert.equal(r.ok, true, r.ok ? '' : r.erro)

    const origem = await fotografia(tx, c.o)
    // As marcas ficam também na origem (desativada); a destino ganha as que não tinha.
    for (const t of TABELAS.filter(t => t !== 'conta_marcas')) assert.equal(origem[t], 0, `origem ainda tem ${t}`)
    assert.ok((await linha(tx, sql`select desativada_em from contas where id = ${c.o}`)).desativada_em, 'origem desativada')
    assert.deepEqual(await fotografia(tx, c.t), terceiraAntes, 'terceira Conta intacta')
    assert.equal((await linha(tx, sql`select conta_id from clientes where id = ${c.clienteT}`)).conta_id, c.t)

    assert.equal((await linha(tx, sql`select conta_id from grupos where id = ${c.go.id}`)).conta_id, c.d)
    assert.equal((await linha(tx, sql`select conta_id from clientes where id = ${c.cliente}`)).conta_id, c.d)
    assert.equal((await linha(tx, sql`select conta_id from usuarios where id = ${c.vendedor}`)).conta_id, c.d)
    assert.equal((await linha(tx, sql`select conta_id from cargos where id = ${c.cargo}`)).conta_id, c.d, 'cargo do usuário vai junto')
    assert.equal((await linha(tx, sql`select conta_id from pecas_vinculo_fornecedor where peca_id = ${c.peca}`)).conta_id, c.d, 'catálogo e vínculo de peça juntos')
    assert.deepEqual((await rows(tx, sql`select marca from conta_marcas where conta_id = ${c.d} order by marca`)).map(x => x.marca), ['P', 'Própria'], 'destino vê as marcas das duas')

    const venda = await linha(tx, sql`select v.cliente_id, v.loja_id from vendas v where v.id = ${c.venda}`)
    assert.equal(venda.cliente_id, c.cliente, 'venda continua com o mesmo cliente')
    assert.equal(venda.loja_id, c.go.loja, 'e na mesma loja')

    // O admin_rede da destino tinha o grupo liberado: passa a vê-lo como grupo da própria Conta.
    const rede = await linha(tx, sql`select ${c.go.id}::uuid = any(grupos_acesso) tem from usuarios where id = ${c.rede}`)
    assert.equal(rede.tem, true)
    assert.equal(Number((await linha(tx, sql`select count(*)::int n from grupos_liberados where usuario_id = ${c.rede} and revogado_em is null`)).n), 0)

    const log = await linha(tx, sql`select conta_id, detalhe->>'origemNome' origem from log_acoes where tipo = 'grupo_movido_de_conta' and grupo_id = ${c.go.id}`)
    assert.equal(log.conta_id, c.d); assert.equal(log.origem, 'Origem')
    throw new Desfazer()
  }), Desfazer)
})

test('move sem marca nova e sem nada além dos usuários (caso da rede real)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`delete from conta_marcas where conta_id = ${c.o}`)
    const r = await moverGrupo(tx, c.geral, c.go.id, c.d)
    assert.equal(r.ok, true, r.ok ? '' : r.erro)
    assert.equal((await linha(tx, sql`select conta_id from grupos where id = ${c.go.id}`)).conta_id, c.d)
    throw new Desfazer()
  }), Desfazer)
})

test('conflito: CPF ou apelido repetido na destino lista os casos e não grava nada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Já na destino', '52998224725', ${c.d})`)
    const outro = await linha(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('D', 'D554', 'autopropelido', '1', 'h', '1', ${c.d}) returning id`)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('XIS', ${outro.id}, ${c.d})`)
    await tx.execute(sql`insert into cargos (conta_id, nome) values (${c.d}, 'caixa ')`)
    const [antesO, antesD] = [await fotografia(tx, c.o), await fotografia(tx, c.d)]

    const previa = await previaMoverGrupo(tx, c.go.id, c.d)
    assert.deepEqual(previa?.conflitos.clientes.map(x => [x.cpfCnpj, x.nomeOrigem, x.nomeDestino]), [['52998224725', 'Cliente', 'Já na destino']])
    assert.deepEqual(previa?.conflitos.apelidos, ['XIS'])
    assert.deepEqual(previa?.conflitos.cargos, ['Caixa'], 'mesmo nome de cargo, mesmo com caixa e espaço diferentes')

    const r = await moverGrupo(tx, c.geral, c.go.id, c.d)
    assert.equal(r.ok, false)
    assert.deepEqual(await fotografia(tx, c.o), antesO, 'nada saiu da origem')
    assert.deepEqual(await fotografia(tx, c.d), antesD, 'nada entrou na destino')
    assert.equal((await linha(tx, sql`select desativada_em from contas where id = ${c.o}`)).desativada_em, null)
    assert.equal(Number((await linha(tx, sql`select count(*)::int n from log_acoes where tipo = 'grupo_movido_de_conta' and grupo_id = ${c.go.id}`)).n), 0)
    throw new Desfazer()
  }), Desfazer)
})

test('recusas: quem não é admin_geral, origem com outro grupo, a própria Conta, Conta inexistente', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.equal((await moverGrupo(tx, { id: c.vendedor, papel: 'admin_socio' }, c.go.id, c.d)).ok, false)
    assert.equal((await moverGrupo(tx, c.geral, c.go.id, c.o)).ok, false, 'mesma Conta')
    assert.equal((await moverGrupo(tx, c.geral, c.go.id, '00000000-0000-0000-0000-000000000000')).ok, false)
    await tx.execute(sql`update contas set desativada_em = now() where id = ${c.d}`)
    const desativada = await moverGrupo(tx, c.geral, c.go.id, c.d)
    assert.match(desativada.ok ? '' : desativada.erro, /desativada/, 'Conta de destino desativada')
    await tx.execute(sql`update contas set desativada_em = null where id = ${c.d}`)
    await tx.execute(sql`insert into grupos (nome, cnpj, conta_id) values ('Irmão', '00000000000434', ${c.o})`)
    const r = await moverGrupo(tx, c.geral, c.go.id, c.d)
    assert.equal(r.ok, false)
    assert.match(r.ok ? '' : r.erro, /um grupo só/)
    assert.equal((await linha(tx, sql`select conta_id from grupos where id = ${c.go.id}`)).conta_id, c.o)
    throw new Desfazer()
  }), Desfazer)
})
