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
let nomeDoModeloNaLoja: Mod['nomeDoModeloNaLoja']
let lembrarApelidosDaEntrada: Mod['lembrarApelidosDaEntrada']
let carregarTelaModelos: typeof import('@/lib/modelos-tela')['carregarTelaModelos']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarModelosDaConta, salvarMarcasDaConta, listarMarcasDaConta, listarApelidosDaConta, modelosUsaveisPelaConta, salvarApelidosDoModelo, excluirModelo, salvarAjusteDoModelo, ocultarModelo, voltarAoOriginal, nomeDoModeloNaLoja, lembrarApelidosDaEntrada } = await import('@/lib/modelos-da-conta'))
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

    // Campo igual ao original não fica da Conta: a correção da plataforma chega nele.
    await salvarAjusteDoModelo(contaA.id, daPlataforma.id, { modelo: 'SO O NOME', categoria: 'autopropelido', potenciaW: '1000' }, tx)
    await tx.execute(sql`update modelos set potencia_w = '1500' where id = ${daPlataforma.id}`)
    const soNome = await visto(contaA.id, daPlataforma.id)
    assert.deepEqual([soNome?.modelo, soNome?.potenciaW], ['SO O NOME', '1500'])
    await salvarAjusteDoModelo(contaA.id, daPlataforma.id, { modelo: 'ORIGINAL', categoria: 'autopropelido', potenciaW: '1500' }, tx)
    assert.equal((await visto(contaA.id, daPlataforma.id))?.ajustado, false, 'tudo igual ao original não é ajuste')

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

test('nome do modelo nas consultas: o ajustado pela Conta dona da loja, o original nas outras', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const lojaDa = async (nome: string, cnpj: string) => {
      const conta = await linha(sql`insert into contas (nome) values (${nome}) returning id`)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'G ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'L ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
      return { contaId: conta.id, lojaId: loja.id }
    }
    const a = await lojaDa('Conta A', '11111111000191')
    const b = await lojaDa('Conta B', '22222222000191')
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
      values ('TESTE-AJ', 'ORIGINAL', 'autopropelido', '1000', '', '') returning id`)
    await salvarAjusteDoModelo(a.contaId, modelo.id, { modelo: 'NOME DA A', categoria: 'autopropelido', potenciaW: '1000' }, tx)
    const motoNa = async (lojaId: string, chassi: string) => linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${chassi}, ${modelo.id}, ${lojaId}, 'Preta', '1', 'disponivel', 'disponivel') returning id`)
    const motoA = await motoNa(a.lojaId, 'TESTEAJ00000000A1')
    const motoB = await motoNa(b.lojaId, 'TESTEAJ00000000B1')

    const { modelos, motos } = await import('@/lib/db/schema')
    const { eq, inArray } = await import('drizzle-orm')
    const linhas = await tx.select({ id: motos.id, nome: nomeDoModeloNaLoja(motos.lojaId) })
      .from(motos).innerJoin(modelos, eq(modelos.id, motos.modeloId))
      .where(inArray(motos.id, [motoA.id, motoB.id]))
    const nome = new Map(linhas.map(l => [l.id, l.nome]))
    assert.equal(nome.get(motoA.id), 'NOME DA A', 'moto da loja da A')
    assert.equal(nome.get(motoB.id), 'ORIGINAL', 'moto da loja da B não vê o ajuste da A')
    throw new Desfazer()
  }), Desfazer)
})

test('Cód. Bling e Apelidos só para Conta com credencial do Bling em algum grupo dela', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = (nome: string) => linha(sql`insert into contas (nome) values (${nome}) returning id`)
    const grupo = (contaId: string, cnpj: string, id: string | null, segredo: string | null) =>
      linha(sql`insert into grupos (nome, cnpj, conta_id, bling_client_id, bling_client_secret) values (${'G ' + cnpj}, ${cnpj}, ${contaId}, ${id}, ${segredo}) returning id`)
    const contaA = await conta('Com Bling')
    const contaB = await conta('Sem Bling')
    const contaC = await conta('Meia credencial')
    // A: um grupo sem e outro com credencial; basta um.
    const grupoA = await grupo(contaA.id, '47600000000101', null, null)
    await grupo(contaA.id, '47600000000102', 'cliente', 'segredo')
    const grupoB = await grupo(contaB.id, '47600000000201', null, null)
    const grupoC = await grupo(contaC.id, '47600000000301', 'cliente', null)
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
      values ('TESTE-BL', 'BL1', 'autopropelido', '1000', '', '') returning id`)
    await tx.execute(sql`insert into modelo_bling_codigos (modelo_id, grupo_id, codigo) values (${modelo.id}, ${grupoA.id}, 'COD1')`)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id) values ('BL-APELIDO', ${modelo.id})`)

    const daA = await carregarTelaModelos({ adminGeral: false, contaId: contaA.id, grupoId: grupoA.id }, tx)
    assert.equal(daA.usaBling, true)
    assert.ok(daA.codigos.some(c => c.codigo === 'COD1') && daA.apelidos.some(a => a.apelido === 'BL-APELIDO'))

    for (const [contaId, grupoId, quem] of [[contaB.id, grupoB.id, 'sem credencial'], [contaC.id, grupoC.id, 'só o client_id']] as const) {
      const tela = await carregarTelaModelos({ adminGeral: false, contaId, grupoId }, tx)
      assert.equal(tela.usaBling, false, quem)
      assert.deepEqual([tela.codigos, tela.apelidos], [[], []], `${quem}: nem busca códigos e apelidos`)
    }
    assert.equal((await carregarTelaModelos({ adminGeral: true, contaId: null, grupoId: grupoB.id }, tx)).usaBling, false,
      'admin_geral num grupo de Conta sem Bling')
    assert.equal((await carregarTelaModelos({ adminGeral: true, contaId: null, grupoId: grupoA.id }, tx)).usaBling, true)
    throw new Desfazer()
  }), Desfazer)
})

test('entrada lembra o texto da nota como apelido da Conta, só da Conta, e não rouba apelido de outro modelo (#476)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const giga = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'TESTE GIGA', 'autopropelido', '1000', '', '') returning id`)
    const x12 = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'TESTE X12', 'autopropelido', '1000', '', '') returning id`)
    const apelidosDe = async (contaId: string) =>
      (await listarApelidosDaConta(contaId, tx)).filter(a => a.nome.startsWith('TESTE')).map(a => `${a.nome}>${a.canonico}`).sort()

    const avisos = await lembrarApelidosDaEntrada(contaA.id, [
      { texto: 'teste bau grande', modeloId: giga.id },
      { texto: 'TESTE BAU GRANDE', modeloId: giga.id },
      { texto: 'TESTE GIGA LITE', modeloId: giga.id },
      { texto: 'TESTE X12', modeloId: x12.id },
    ], tx)
    assert.deepEqual(avisos, [])
    assert.deepEqual(await apelidosDe(contaA.id), ['TESTE BAU GRANDE>TESTE GIGA'], 'grava uma vez, normalizado; o que já casa pelo nome ou prefixo não vira apelido')
    assert.deepEqual(await apelidosDe(contaB.id), [], 'a Conta B não recebe o apelido da A')

    const avisosDoConflito = await lembrarApelidosDaEntrada(contaA.id, [
      { texto: 'TESTE BAU GRANDE', modeloId: x12.id },
      { texto: 'TESTE GIGA', modeloId: x12.id },
    ], tx)
    assert.equal(avisosDoConflito.length, 2, 'avisa os dois: apelido e nome de outro modelo')
    assert.match(avisosDoConflito[0], /TESTE BAU GRANDE.*TESTE GIGA/)
    assert.deepEqual(await apelidosDe(contaA.id), ['TESTE BAU GRANDE>TESTE GIGA'], 'não regrava')

    assert.deepEqual(await lembrarApelidosDaEntrada(contaB.id, [{ texto: 'TESTE BAU GRANDE', modeloId: x12.id }], tx), [],
      'apelido da A não pesa na B')
    assert.deepEqual(await apelidosDe(contaB.id), ['TESTE BAU GRANDE>TESTE X12'])
    assert.deepEqual(await apelidosDe(contaA.id), ['TESTE BAU GRANDE>TESTE GIGA'], 'a gravação da B não mexe na A')
    throw new Desfazer()
  }), Desfazer)
})

test('entrada não lembra apelido para modelo de outra Conta (#476)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const daB = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-MC', 'Segredo da B', 'autopropelido', '1000', '', '', ${contaB.id}) returning id`)
    await lembrarApelidosDaEntrada(contaA.id, [{ texto: 'TESTE FORJADO', modeloId: daB.id }], tx)
    const gravados = await tx.execute(sql`select 1 from modelo_apelidos where apelido = 'TESTE FORJADO'`) as unknown as { rows: unknown[] }
    assert.equal(gravados.rows.length, 0)
    throw new Desfazer()
  }), Desfazer)
})

test('apelido aprendido pela Conta num modelo da plataforma: o admin_geral não vê, não apaga e não toma (#476)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id, bling_client_id, bling_client_secret) values ('G AP', '47600000000901', ${contaA.id}, 'cliente', 'segredo') returning id`)
    const plataforma = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'TESTE PLAT', 'autopropelido', '1000', '', '') returning id`)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('TESTE DA PLATAFORMA', ${plataforma.id}, null)`)
    await lembrarApelidosDaEntrada(contaA.id, [{ texto: 'TESTE APRENDIDO', modeloId: plataforma.id }], tx)

    const doAdmin = await carregarTelaModelos({ adminGeral: true, contaId: null, grupoId: grupo.id }, tx)
    assert.deepEqual(doAdmin.apelidos.filter(a => a.modeloId === plataforma.id).map(a => a.apelido), ['TESTE DA PLATAFORMA'],
      'a célula do admin_geral mostra só os da plataforma')

    await salvarApelidosDoModelo(plataforma.id, ['TESTE NOVO'], tx)
    const donos = await tx.execute(sql`select apelido, conta_id from modelo_apelidos where modelo_id = ${plataforma.id} order by apelido`) as unknown as { rows: { apelido: string; conta_id: string | null }[] }
    assert.deepEqual(donos.rows, [
      { apelido: 'TESTE APRENDIDO', conta_id: contaA.id },
      { apelido: 'TESTE NOVO', conta_id: null },
    ], 'o da A continua só da A; o da plataforma foi trocado')
    throw new Desfazer()
  }), Desfazer)
})

test('entrada casa pelo nome original do modelo ajustado e prefere o apelido da Conta ao da plataforma (#476)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const ajustado = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'TESTE ORIGINAL', 'autopropelido', '1000', '', '') returning id`)
    const outro = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-MC', 'TESTE OUTRO', 'autopropelido', '1000', '', '') returning id`)
    await salvarAjusteDoModelo(contaA.id, ajustado.id, { modelo: 'TESTE APELIDADO NA LOJA', categoria: 'autopropelido', potenciaW: '1000' }, tx)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values
      ('TESTE MESMO TEXTO', ${ajustado.id}, null), ('TESTE MESMO TEXTO', ${outro.id}, ${contaA.id})`)

    const { modeloIdDaNota } = await import('@/lib/nfe-entrada')
    const [cadastro, apelidos] = await Promise.all([listarModelosDaConta(contaA.id, tx), listarApelidosDaConta(contaA.id, tx)])
    assert.equal(modeloIdDaNota('TESTE ORIGINAL', cadastro, apelidos), ajustado.id, 'nome original da fábrica')
    assert.equal(modeloIdDaNota('TESTE APELIDADO NA LOJA', cadastro, apelidos), ajustado.id, 'nome ajustado')
    assert.equal(modeloIdDaNota('TESTE MESMO TEXTO', cadastro, apelidos), outro.id, 'o apelido da Conta vence o da plataforma')
    throw new Desfazer()
  }), Desfazer)
})
