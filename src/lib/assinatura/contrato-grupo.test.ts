import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_CONTRATO, colarNoTexto, textoColadoParaMarcacao, validarTextoContrato, renderizarContratoGrupo, valorPorExtenso,
} from './contrato-grupo'
import { ITENS_CARTILHA_BATERIA, type DadosDocumento } from './documento'

const DADOS: DadosDocumento = {
  vendaId: 'v1',
  clienteNome: 'João da Silva',
  clienteCpf: '52998224725',
  clienteEmail: 'joao@exemplo.com',
  clienteEndereco: 'Rua A, nº 10, Centro, Cidade X/MG',
  vendedoraRazaoSocial: 'LOJA TESTE LTDA.',
  vendedoraCnpj: '11222333000181',
  vendedoraEndereco: 'Rua da Sede, 1, Cidade Y',
  cidadeSede: 'Cidade Y',
  comarcaForo: 'Cidade Y, Minas Gerais',
  lojaNome: 'Loja Teste',
  lojaCidade: 'Cidade X',
  marca: 'Marca',
  modelo: 'Modelo Z',
  chassi: '9C2ABC123',
  cor: 'Vermelha',
  motor: 'MOT1',
  valor: '12.990,50',
  formaPagamento: 'Cartão',
  pagamentos: [{ tipo: 'pix', valor: 2000 }, { tipo: 'cartao_credito', valor: 10990.5, parcelas: 12 }],
  dataVenda: '29/10/2026',
}

const MINIMO = '{comprador_qualificacao}\nChassi {chassi}, preço R$ {valor}.'

test('texto com comprador, chassi e valor passa na validação', () => {
  assert.deepEqual(validarTextoContrato(MINIMO), { ok: true })
  assert.deepEqual(validarTextoContrato('Comprador {cliente_nome}, chassi {chassi}, {valor_extenso}.'), { ok: true })
})

test('campo desconhecido é recusado e nomeado, inclusive com espaço ou maiúscula', () => {
  const r = validarTextoContrato(`${MINIMO}\n{cliente_cpff} {Cliente Nome}`)
  assert.equal(r.ok, false)
  assert.deepEqual(!r.ok && r.desconhecidos, ['{cliente_cpff}', '{Cliente Nome}'])
})

test('falta de comprador, chassi ou valor é recusada dizendo qual falta', () => {
  const r = validarTextoContrato('Um contrato sem campo nenhum.')
  assert.equal(r.ok, false)
  assert.deepEqual(!r.ok && r.faltando, ['comprador', 'chassi', 'valor'])
  assert.match(!r.ok ? r.erro : '', /comprador.*chassi.*valor/)
})

test('texto vazio é recusado', () => {
  assert.equal(validarTextoContrato('   \n ').ok, false)
})

test('cada campo da lista vira o dado da venda', () => {
  const texto = CAMPOS_CONTRATO.filter(c => !['comprador_qualificacao', 'pagamentos', 'cartilha_bateria'].includes(c.chave))
    .map(c => `${c.chave}=[{${c.chave}}]`).join('\n')
  const html = renderizarContratoGrupo(texto, DADOS)
  for (const esperado of [
    'cliente_nome=[João da Silva]', 'cliente_cpf=[529.982.247-25]', 'cliente_email=[joao@exemplo.com]',
    'cliente_endereco=[Rua A, nº 10, Centro, Cidade X/MG]', 'marca=[Marca]', 'modelo=[Modelo Z]', 'cor=[Vermelha]',
    'chassi=[9C2ABC123]', 'valor=[12.990,50]',
    'valor_extenso=[doze mil novecentos e noventa reais e cinquenta centavos]',
    'loja_razao_social=[LOJA TESTE LTDA.]', 'loja_cnpj=[11.222.333/0001-81]', 'loja_endereco=[Rua da Sede, 1, Cidade Y]',
    'comarca=[Cidade Y, Minas Gerais]', 'cidade=[Cidade Y]', 'data=[29/10/2026]',
  ]) assert.ok(html.includes(esperado), esperado)
})

test('qualificação do comprador sai como pessoa física ou jurídica', () => {
  assert.match(renderizarContratoGrupo(MINIMO, DADOS), /<b>COMPRADOR\(A\)<\/b>: João da Silva, brasileiro\(a\), inscrito no CPF/)
  const pj = renderizarContratoGrupo(MINIMO, { ...DADOS, clienteNome: 'Empresa X', clienteCpf: '11222333000181', representanteNome: 'Ana' })
  assert.match(pj, /Empresa X, pessoa jurídica, inscrita no CNPJ sob o nº 11\.222\.333\/0001-81/)
  assert.match(pj, /representada por Ana/)
})

test('pagamentos: sozinho na linha vira lista; no meio da frase, separados por ponto e vírgula', () => {
  const lista = renderizarContratoGrupo(`${MINIMO}\n{pagamentos}`, DADOS)
  assert.ok(lista.includes('<ul><li>R$ 2.000,00 no PIX</li><li>R$ 10.990,50 no cartão de crédito em 12x</li></ul>'))
  const frase = renderizarContratoGrupo(`${MINIMO} Pago assim: {pagamentos}.`, DADOS)
  assert.ok(frase.includes('Pago assim: R$ 2.000,00 no PIX; R$ 10.990,50 no cartão de crédito em 12x.'))
})

test('{cartilha_bateria} insere a cartilha do MOVA como lista', () => {
  const html = renderizarContratoGrupo(`${MINIMO}\n{cartilha_bateria}`, DADOS)
  assert.equal(html.match(/<li>/g)?.length, ITENS_CARTILHA_BATERIA.length)
})

test('marcação: # título, linha é parágrafo, "- " e "• " viram lista, **negrito**', () => {
  const html = renderizarContratoGrupo(
    '# CONTRATO DE CICLOMOTOR\n## ANEXO I\n\n**CLÁUSULA PRIMEIRA** – objeto.\n- um\n• dois\nfim {chassi} {valor} {cliente_nome}', DADOS)
  assert.ok(html.includes('<h1>CONTRATO DE CICLOMOTOR</h1>'))
  assert.ok(html.includes('<h2>ANEXO I</h2>'))
  assert.ok(html.includes('<p><b>CLÁUSULA PRIMEIRA</b> – objeto.</p>'))
  assert.ok(html.includes('<ul><li>um</li><li>dois</li></ul>'))
  assert.ok(!html.includes('<p></p>'))
})

test('HTML do texto e dos dados é escapado: nada vira tag', () => {
  const html = renderizarContratoGrupo(
    '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n**<b>x</b>**\n{cliente_nome} {chassi} {valor}',
    { ...DADOS, clienteNome: '<script>roubar()</script> & cia' },
  )
  assert.ok(!/<script|<img/i.test(html))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('&lt;script&gt;roubar()&lt;/script&gt; &amp; cia'))
  assert.ok(html.includes('<b>&lt;b&gt;x&lt;/b&gt;</b>'))
})

test('dado da venda com chave de campo não é trocado de novo', () => {
  const html = renderizarContratoGrupo(MINIMO, { ...DADOS, clienteNome: '{chassi}' })
  assert.ok(html.includes('<b>COMPRADOR(A)</b>: {chassi}, brasileiro(a)'))
  assert.equal(html.split('9C2ABC123').length, 2)
})

test('valor por extenso em reais e centavos', () => {
  assert.equal(valorPorExtenso('0,00'), 'zero real')
  assert.equal(valorPorExtenso('1,00'), 'um real')
  assert.equal(valorPorExtenso('0,01'), 'um centavo')
  assert.equal(valorPorExtenso('2,10'), 'dois reais e dez centavos')
  assert.equal(valorPorExtenso('100,00'), 'cem reais')
  assert.equal(valorPorExtenso('101,00'), 'cento e um reais')
  assert.equal(valorPorExtenso('1.000,00'), 'mil reais')
  assert.equal(valorPorExtenso('1.001,00'), 'mil e um reais')
  assert.equal(valorPorExtenso('1.100,00'), 'mil e cem reais')
  assert.equal(valorPorExtenso('1.234,00'), 'mil duzentos e trinta e quatro reais')
  assert.equal(valorPorExtenso('21.000,00'), 'vinte e um mil reais')
  assert.equal(valorPorExtenso('1.000.000,00'), 'um milhão de reais')
  assert.equal(valorPorExtenso('2.500.000,00'), 'dois milhões e quinhentos mil reais')
  assert.equal(valorPorExtenso('1.000.001,00'), 'um milhão e um reais')
})

test('colar do Word: marcadores viram "- " e linha toda em caixa alta vira título', () => {
  const colado = [
    'CONTRATO DE COMPRA E VENDA DE CICLOMOTOR ELÉTRICO',
    '',
    '',
    'CLÁUSULA PRIMEIRA – O objeto é o veículo.',
    '\t•\tNUNCA deixe a bateria carregando.',
    '◦ Item de segundo nível',
    '- Já marcado',
    'ANEXO I',
    'A MAIORIA DOS ACIDENTES COM BATERIAS OCORRE POR NEGLIGÊNCIA OU USO INCORRETO. SIGA CUIDADOSAMENTE ESTAS RECOMENDAÇÕES.',
    '# Já é título',
    '{cliente_nome}',
  ].join('\r\n')
  assert.equal(textoColadoParaMarcacao(colado), [
    '# CONTRATO DE COMPRA E VENDA DE CICLOMOTOR ELÉTRICO',
    '',
    'CLÁUSULA PRIMEIRA – O objeto é o veículo.',
    '- NUNCA deixe a bateria carregando.',
    '- Item de segundo nível',
    '- Já marcado',
    '# ANEXO I',
    // Parágrafo longo em caixa alta é aviso, não título.
    'A MAIORIA DOS ACIDENTES COM BATERIAS OCORRE POR NEGLIGÊNCIA OU USO INCORRETO. SIGA CUIDADOSAMENTE ESTAS RECOMENDAÇÕES.',
    '# Já é título',
    '{cliente_nome}',
  ].join('\n'))
})

test('colar várias linhas no meio de uma linha abre linhas próprias para o trecho colado', () => {
  const texto = 'Cidade, {data}.\n## ANEXO I'
  const fim = 'Cidade, {data}.'.length
  const r = colarNoTexto(texto, fim, fim, '\r\nANEXO II\r\n\t•\tUm.')
  assert.equal(r.texto, 'Cidade, {data}.\n# ANEXO II\n- Um.\n## ANEXO I')
  assert.equal(r.cursor, 'Cidade, {data}.\n# ANEXO II\n- Um.'.length)
})

test('colar uma palavra no meio da frase não quebra a linha', () => {
  const r = colarNoTexto('Preço de R$ .', 12, 12, '{valor}')
  assert.deepEqual(r, { texto: 'Preço de R$ {valor}.', cursor: 19 })
})

test('colar texto já na marcação não muda: negrito com ** não vira item de lista', () => {
  const marcado = '# CONTRATO\n**CLÁUSULA PRIMEIRA** – texto\n* item com asterisco\n- item\n{cliente_nome}'
  assert.equal(textoColadoParaMarcacao(marcado), '# CONTRATO\n**CLÁUSULA PRIMEIRA** – texto\n- item com asterisco\n- item\n{cliente_nome}')
  assert.equal(textoColadoParaMarcacao('**CLÁUSULA** – texto'), '**CLÁUSULA** – texto')
})

test('colar uma palavra em caixa alta no meio da frase não vira título', () => {
  assert.equal(textoColadoParaMarcacao('CPF'), 'CPF')
  assert.deepEqual(colarNoTexto('Cidade de Pouso Alegre, .', 24, 24, 'MG'), { texto: 'Cidade de Pouso Alegre, MG.', cursor: 26 })
  // Com mais de uma linha, a regra de título continua valendo.
  assert.equal(textoColadoParaMarcacao('ANEXO I\nTexto.'), '# ANEXO I\nTexto.')
})
