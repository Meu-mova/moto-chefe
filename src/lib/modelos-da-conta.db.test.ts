// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
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
type Mod = typeof import('@/lib/modelos-da-conta')
let db: Db['db']
let listarModelosDaConta: Mod['listarModelosDaConta']
let salvarMarcasDaConta: Mod['salvarMarcasDaConta']
let listarMarcasDaConta: Mod['listarMarcasDaConta']
let listarApelidosDaConta: Mod['listarApelidosDaConta']
let modelosUsaveisPelaConta: Mod['modelosUsaveisPelaConta']
let salvarApelidosDoModelo: Mod['salvarApelidosDoModelo']
let excluirModelo: Mod['excluirModelo']
let salvarAjusteDoModelo: Mod['salvarAjusteDoModelo']
let ocultarModelo: Mod['ocultarModelo']
let voltarAoOriginal: Mod['voltarAoOriginal']
let carregarTelaModelos: typeof import('@/lib/modelos-tela')['carregarTelaModelos']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarModelosDaConta, salvarMarcasDaConta, listarMarcasDaConta, listarApelidosDaConta, modelosUsaveisPelaConta, salvarApelidosDoModelo, excluirModelo, salvarAjusteDoModelo, ocultarModelo, voltarAoOriginal } = await import('@/lib/modelos-da-conta'))
  ;({ carregarTelaModelos } = await import('@/lib/modelos-tela'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('Conta com marcas escolhidas não vê as outras; Conta sem escolha vê todas', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const eco = await linha(sql`insert into contas (nome) values ('Só MotoChefe') returning id`)
    const cesar = await linha(sql`insert into contas (nome) values ('Sem escolha') returning id`)
    await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values
      ('TESTE-MC', 'X12', 'autopropelido', '1000', '', ''),
      ('TESTE-VOE', 'V1', 'autopropelido', '1000', '', '')`)

    await salvarMarcasDaConta(eco.id, ['TESTE-MC', 'TESTE-MC', ' '], tx)
    assert.deepEqual(await listarMarcasDaConta(eco.id, tx), ['TESTE-MC'], 'grava sem repetir nem vazio')

    const daEco = (await listarModelosDaConta(eco.id, tx)).map(m => m.marca)
    assert.ok(daEco.includes('TESTE-MC') && !daEco.includes('TESTE-VOE'), 'só a marca escolhida')
    assert.ok(daEco.every(m => m === 'TESTE-MC'), 'nenhuma outra marca da plataforma')

    const doCesar = (await listarModelosDaConta(cesar.id, tx)).map(m => m.marca)
    assert.ok(doCesar.includes('TESTE-MC') && doCesar.includes('TESTE-VOE'), 'sem escolha, todas')

    await salvarMarcasDaConta(eco.id, [], tx)
    assert.ok((await listarModelosDaConta(eco.id, tx)).some(m => m.marca === 'TESTE-VOE'), 'limpar a escolha volta a ver todas')
    throw new Desfazer()
  }), Desfazer)
})

test('a Conta vê os modelos da plataforma e os próprios, nunca os de outra Conta (#321)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values
      ('TESTE-MC', 'Plataforma', 'autopropelido', '1000', '', '', null),
      ('TESTE-LIVRE', 'Da A', 'autopropelido', '1000', '', '', ${contaA.id}),
      ('TESTE-MC', 'Da B', 'autopropelido', '1000', '', '', ${contaB.id})`)
    await salvarMarcasDaConta(contaA.id, ['TESTE-MC'], tx)

    const daA = (await listarModelosDaConta(contaA.id, tx)).map(m => m.modelo).filter(m => ['Plataforma', 'Da A', 'Da B'].includes(m))
    assert.deepEqual(daA.sort(), ['Da A', 'Plataforma'], 'plataforma da marca escolhida + o próprio, mesmo de marca fora da escolha; nunca o da B')
    throw new Desfazer()
  }), Desfazer)
})

test('apelidos da NF: os da plataforma e os da própria Conta, nunca os de outra (#321)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const plataforma = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'Plataforma', 'autopropelido', '1000', '', '') returning id`)
    const daA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Da A', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    const daB = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Da B', 'autopropelido', '1000', '', '', ${contaB.id}) returning id`)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values
      ('TESTE-PLAT', ${plataforma.id}, null), ('TESTE-X', ${daA.id}, ${contaA.id}), ('TESTE-X', ${daB.id}, ${contaB.id})`)

    const deA = (await listarApelidosDaConta(contaA.id, tx)).filter(a => a.nome.startsWith('TESTE-'))
    assert.deepEqual(
      deA.map(a => `${a.nome}>${a.canonico}`).sort(),
      ['TESTE-PLAT>Plataforma', 'TESTE-X>Da A'],
      'o mesmo apelido em duas Contas: cada uma vê só o seu',
    )
    throw new Desfazer()
  }), Desfazer)
})

test('entrada só aceita modelo da plataforma ou da própria Conta (#321)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const plataforma = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-VOE', 'Plataforma', 'autopropelido', '1000', '', '') returning id`)
    const daA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Da A', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    const daB = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Da B', 'autopropelido', '1000', '', '', ${contaB.id}) returning id`)
    await salvarMarcasDaConta(contaA.id, ['TESTE-MC'], tx)

    const usaveis = await modelosUsaveisPelaConta(contaA.id, [plataforma.id, daA.id, daB.id], tx)
    assert.ok(usaveis.has(daA.id), 'o próprio')
    assert.ok(usaveis.has(plataforma.id), 'o da plataforma, mesmo de marca fora da escolha (a escolha só enxuga as listas)')
    assert.ok(!usaveis.has(daB.id), 'nunca o de outra Conta')
    throw new Desfazer()
  }), Desfazer)
})

test('apelido repetido só conflita dentro da Conta, e o erro não cita modelo de outra (#321)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const daA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Primeiro da A', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    const outroDaA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Segundo da A', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    const daB = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Segredo da B', 'autopropelido', '1000', '', '', ${contaB.id}) returning id`)

    await salvarApelidosDoModelo(daB.id, ['TESTE-X'], tx)
    await salvarApelidosDoModelo(daA.id, ['TESTE-X'], tx)
    assert.deepEqual(
      (await listarApelidosDaConta(contaA.id, tx)).filter(a => a.nome === 'TESTE-X').map(a => a.canonico),
      ['Primeiro da A'],
      'o mesmo apelido grava nas duas Contas, cada um na sua',
    )
    await assert.rejects(
      salvarApelidosDoModelo(outroDaA.id, ['TESTE-X'], tx),
      (e: Error) => e.message.includes('Primeiro da A') && !e.message.includes('Segredo da B'),
      'dentro da Conta recusa, citando só o modelo da própria Conta',
    )
    throw new Desfazer()
  }), Desfazer)
})

test('modelo só se exclui enquanto nenhuma moto ou demanda o usa (#321)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo A', '00000000000191', ${conta.id}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja A', 'Rua 1', 'X', ${grupo.id}) returning id`)
    const novo = async (nome: string) => linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', ${nome}, 'autopropelido', '1000', '', '', ${conta.id}) returning id`)
    const livre = await novo('Livre')
    const comMoto = await novo('Com moto')
    const comDemanda = await novo('Com demanda')
    await salvarApelidosDoModelo(livre.id, ['TESTE-LIVRE'], tx)
    await tx.execute(sql`insert into motos (chassi, modelo_id, loja_id, status, cor, nota_fiscal_entrada) values ('TESTE321CHASSI', ${comMoto.id}, ${loja.id}, 'montada', 'PRETO', '1')`)
    const solicitante = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id) values (gen_random_uuid(), 'Vendedor', 'v321@teste.invalid', 'vendedor', ${loja.id}, ${conta.id}) returning id`)
    await tx.execute(sql`insert into demandas (modelo, modelo_id, cor, loja_id, solicitante_id) values ('Com demanda', ${comDemanda.id}, 'PRETO', ${loja.id}, ${solicitante.id})`)

    await excluirModelo(livre.id, tx)
    assert.equal((await tx.execute(sql`select 1 from modelos where id = ${livre.id}`) as unknown as { rows: unknown[] }).rows.length, 0, 'sem uso: exclui, com os apelidos')
    await assert.rejects(excluirModelo(comMoto.id, tx), /moto/i, 'com moto: recusa')
    await assert.rejects(excluirModelo(comDemanda.id, tx), /demanda/i, 'com demanda: recusa')
    throw new Desfazer()
  }), Desfazer)
})

test('sócio vê só os modelos das marcas da sua Conta e não recebe a lista de Contas (#320)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo B', '00000000000191', ${contaB.id}) returning id`)
    await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values
      ('TESTE-MC', 'X12', 'autopropelido', '1000', '', ''),
      ('TESTE-VOE', 'V1', 'autopropelido', '1000', '', '')`)
    await salvarMarcasDaConta(contaB.id, ['TESTE-MC'], tx)

    const socio = await carregarTelaModelos({ adminGeral: false, contaId: contaB.id, grupoId: grupoB.id }, tx)
    assert.ok(socio.modelos.every(m => m.marca === 'TESTE-MC'), 'nenhum modelo de marca fora da Conta')
    assert.equal(socio.contas, null, 'sem a lista de Contas')

    const geral = await carregarTelaModelos({ adminGeral: true, contaId: null, grupoId: grupoB.id }, tx)
    const nomes = geral.contas?.map(c => c.nome) ?? []
    assert.ok(nomes.includes('Conta A') && nomes.includes('Conta B'), 'admin_geral vê todas as Contas')
    assert.ok(geral.modelos.some(m => m.marca === 'TESTE-VOE'), 'admin_geral vê todos os modelos')
    throw new Desfazer()
  }), Desfazer)
})

test('ajuste e ocultação de modelo da plataforma valem só para a Conta que fez', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const ajustado = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
      values ('TESTE-AJ', 'ORIGINAL', 'autopropelido', '1000', 'M1', '30') returning id`)
    const oculto = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
      values ('TESTE-AJ', 'SOME', 'autopropelido', '1000', '', '') returning id`)
    await tx.execute(sql`insert into modelo_ajustes (conta_id, modelo_id, modelo, motor) values (${contaA.id}, ${ajustado.id}, 'NOME DA A', 'M2')`)
    await tx.execute(sql`insert into modelo_ajustes (conta_id, modelo_id, oculto) values (${contaA.id}, ${oculto.id}, true)`)

    const daA = await listarModelosDaConta(contaA.id, tx)
    const ajustadoNaA = daA.find(m => m.id === ajustado.id)
    assert.equal(ajustadoNaA?.modelo, 'NOME DA A', 'nome ajustado')
    assert.equal(ajustadoNaA?.motor, 'M2', 'motor ajustado')
    assert.equal(ajustadoNaA?.velocidadeMax, '30', 'campo sem ajuste mantém o original')
    assert.ok(!daA.some(m => m.id === oculto.id), 'oculto some da lista da A')
    assert.ok((await listarModelosDaConta(contaA.id, tx, { incluirOcultos: true })).some(m => m.id === oculto.id && m.oculto),
      'a tela de modelos ainda vê o oculto, marcado')

    const daB = await listarModelosDaConta(contaB.id, tx)
    assert.equal(daB.find(m => m.id === ajustado.id)?.modelo, 'ORIGINAL', 'B vê o nome original')
    assert.ok(daB.some(m => m.id === oculto.id && !m.oculto), 'B continua vendo o que a A ocultou')

    await tx.execute(sql`insert into modelo_ajustes (conta_id, modelo_id, modelo, oculto) values (${contaB.id}, ${ajustado.id}, 'NOME DA B', true)`)
    assert.equal((await listarModelosDaConta(contaB.id, tx, { incluirOcultos: true })).find(m => m.id === ajustado.id)?.modelo, 'NOME DA B')
    const daAOutraVez = await listarModelosDaConta(contaA.id, tx)
    assert.equal(daAOutraVez.find(m => m.id === ajustado.id)?.modelo, 'NOME DA A', 'o ajuste da B não muda o da A')
    assert.equal(daAOutraVez.filter(m => m.id === ajustado.id).length, 1, 'o ajuste da B não duplica a linha na A')
    throw new Desfazer()
  }), Desfazer)
})

test('sócio ajusta, oculta, mostra e volta ao original só na própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const daPlataforma = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
      values ('TESTE-AJ', 'ORIGINAL', 'autopropelido', '1000', '', '') returning id`)
    const daA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id)
      values ('TESTE-AJ', 'SO DA A', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    const visto = async (contaId: string, id: string) =>
      (await listarModelosDaConta(contaId, tx, { incluirOcultos: true })).find(m => m.id === id)

    const campos = { modelo: 'NOME DA A', categoria: 'ciclomotor' as const, potenciaW: '2000' }
    await salvarAjusteDoModelo(contaA.id, daPlataforma.id, campos, tx)
    await salvarAjusteDoModelo(contaA.id, daPlataforma.id, { ...campos, potenciaW: '3000' }, tx)
    assert.deepEqual(
      (({ modelo, categoria, potenciaW, ajustado }) => ({ modelo, categoria, potenciaW, ajustado }))((await visto(contaA.id, daPlataforma.id))!),
      { modelo: 'NOME DA A', categoria: 'ciclomotor', potenciaW: '3000', ajustado: true }, 'gravar de novo atualiza')

    await ocultarModelo(contaA.id, daPlataforma.id, true, tx)
    assert.equal((await visto(contaA.id, daPlataforma.id))?.oculto, true)
    const tela = await carregarTelaModelos({ adminGeral: false, contaId: contaA.id, grupoId: '00000000-0000-0000-0000-000000000000' }, tx)
    assert.ok(tela.modelos.some(m => m.id === daPlataforma.id && m.oculto), 'a tela do sócio mostra o oculto, para ele reexibir')
    await ocultarModelo(contaA.id, daPlataforma.id, false, tx)
    assert.equal((await visto(contaA.id, daPlataforma.id))?.oculto, false, 'mostrar de novo')

    await ocultarModelo(contaA.id, daPlataforma.id, true, tx)
    await voltarAoOriginal(contaA.id, daPlataforma.id, tx)
    const voltou = await visto(contaA.id, daPlataforma.id)
    assert.equal(voltou?.modelo, 'ORIGINAL')
    assert.equal(voltou?.ajustado, false)
    assert.equal(voltou?.oculto, true, 'voltar ao original não reexibe')

    const naB = await visto(contaB.id, daPlataforma.id)
    assert.equal(naB?.modelo, 'ORIGINAL')
    assert.equal(naB?.oculto, false, 'nada da A aparece na B')

    for (const tentativa of [
      () => salvarAjusteDoModelo(contaB.id, daA.id, campos, tx),
      () => ocultarModelo(contaB.id, daA.id, true, tx),
      () => voltarAoOriginal(contaB.id, daA.id, tx),
    ]) await assert.rejects(tentativa(), /Modelo não encontrado/, 'modelo próprio da A não se ajusta pela B')
    await assert.rejects(salvarAjusteDoModelo(contaA.id, daA.id, campos, tx), /Modelo não encontrado/, 'o próprio se edita, não se ajusta')
    throw new Desfazer()
  }), Desfazer)
})
