import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  montarHtmlDocumento, CLAUSULA_ACEITE, LABEL_TIPO, ITENS_CARTILHA_BATERIA,
  dadosVendedoraCompletos, checklistCompleto, descreverPagamentos, ITENS_CHECKLIST,
  type DadosDocumento, type RespostasChecklist,
} from './documento'

const DADOS: DadosDocumento = {
  vendaId: 'v1',
  clienteNome: 'João da Silva',
  clienteCpf: '123.456.789-00',
  clienteEmail: 'joao@exemplo.com',
  clienteEndereco: 'Rua A, nº 10, Centro, Poços de Caldas/MG, CEP 37700-000',
  vendedoraRazaoSocial: 'MOTOCHEFE SUL DE MINAS LTDA.',
  vendedoraCnpj: '57.113.017/0001-72',
  vendedoraEndereco: 'Avenida Prefeito Tuany Toledo, n° 249, Bairro Fátima II, CEP: 37.553-571, Pouso Alegre – MG',
  cidadeSede: 'Pouso Alegre',
  comarcaForo: 'Pouso Alegre, Minas Gerais',
  lojaNome: 'Motochefe Poços',
  lojaCidade: 'Poços de Caldas',
  marca: 'Shineray',
  modelo: 'Jetmax',
  chassi: '9C2ABC123',
  cor: 'Vermelha',
  motor: 'MOT987654',
  valor: '12.990,00',
  formaPagamento: 'Cartão 12x',
  pagamentos: [
    { tipo: 'pix', valor: 2000 },
    { tipo: 'cartao_credito', valor: 4000, parcelas: 12, operadora: 'infinitypay' },
    { tipo: 'cartao_credito', valor: 6990, parcelas: 21, operadora: 'stone' },
  ],
  dataVenda: '11/08/2026',
}

test('contrato traz comprador, veículo, valor e vendedora', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const t of ['João da Silva', '123.456.789-00', '9C2ABC123', '12.990,00', 'Jetmax',
                   'MOTOCHEFE SUL DE MINAS LTDA.', '57.113.017/0001-72']) {
    assert.ok(html.includes(t), `faltou "${t}" no contrato`)
  }
})

test('o contrato reproduz as cláusulas do modelo', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const c of ['CLÁUSULA PRIMEIRA', 'CLÁUSULA TERCEIRA', 'CLÁUSULA DÉCIMA PRIMEIRA',
                   'CLÁUSULA DÉCIMA QUINTA', 'CLÁUSULA DÉCIMA SEXTA']) {
    assert.ok(html.includes(c), `faltou ${c}`)
  }
  assert.ok(html.includes('Resolução CONTRAN nº 996'))
  assert.ok(html.includes('1.000 W'))
})

// O comprador que dividiu em três formas precisa ver as três no contrato — um
// "Cartão 12x" sozinho esconderia os outros R$ 8.990.
test('a cláusula do preço lista cada forma de pagamento com seu valor', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(html.includes('R$ 2.000,00 no PIX'))
  assert.ok(html.includes('R$ 4.000,00 no cartão de crédito em 12x'))
  assert.ok(html.includes('R$ 6.990,00 no cartão de crédito em 21x'))
})

test('pagamento à vista não inventa parcelas', () => {
  const linhas = descreverPagamentos([{ tipo: 'dinheiro', valor: 500, parcelas: 1 }], '')
  assert.deepEqual(linhas, ['R$ 500,00 no dinheiro'])
})

test('venda antiga sem detalhe cai no texto da forma de pagamento', () => {
  assert.deepEqual(descreverPagamentos([], 'Cartão 12x'), ['Cartão 12x'])
  assert.deepEqual(descreverPagamentos(null, 'Cartão 12x'), ['Cartão 12x'])
  assert.deepEqual(descreverPagamentos(null, ''), [])
})

test('pagamento zerado não entra na lista', () => {
  const linhas = descreverPagamentos(
    [{ tipo: 'pix', valor: 1000 }, { tipo: 'dinheiro', valor: 0 }], '')
  assert.deepEqual(linhas, ['R$ 1.000,00 no PIX'])
})

test('tipo de pagamento desconhecido sai legível, não some', () => {
  assert.deepEqual(descreverPagamentos([{ tipo: 'carta_credito', valor: 300 }], ''),
    ['R$ 300,00 no carta credito'])
})

test('o Anexo I (cartilha da bateria) faz parte do contrato', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(html.includes('ANEXO I'))
  assert.equal(ITENS_CARTILHA_BATERIA.length, 14)
  for (const item of ITENS_CARTILHA_BATERIA) assert.ok(html.includes(item.slice(0, 30)))
})

// O fecho é o local do ato da pessoa jurídica. Uma venda feita na loja de
// Poços, pela empresa do Sul de Minas, fecha em Pouso Alegre.
test('o fecho usa a cidade da sede, não a da loja que vendeu', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(html.includes('Pouso Alegre, 11/08/2026'))
  assert.ok(!html.includes('Poços de Caldas, 11/08/2026'))
})

test('a comarca do foro vem do grupo, não fixa em Pouso Alegre', () => {
  const bh = montarHtmlDocumento('contrato_venda', { ...DADOS, comarcaForo: 'Belo Horizonte, Minas Gerais' })
  assert.ok(bh.includes('Belo Horizonte, Minas Gerais'))
  assert.ok(!bh.includes('Comarca de Pouso Alegre,'))
})

test('o contrato não pede estado civil, profissão nem RG', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  for (const t of ['estado civil', 'profissão', 'RG sob o nº']) {
    assert.ok(!html.includes(t), `"${t}" deveria ter saído da qualificação`)
  }
})

test('o contrato não traz número do motor nem ano de fabricação', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(!html.includes('MOT987654'), 'número do motor não entra no contrato')
  assert.ok(!html.includes('ano de fabricação'))
})

test('o checklist de entrega, esse sim, confere o motor', () => {
  assert.ok(montarHtmlDocumento('checklist_entrega', DADOS).includes('MOT987654'))
})

test('o contrato não traz campo de testemunha', () => {
  assert.ok(!montarHtmlDocumento('contrato_venda', DADOS).includes('TESTEMUNHA'))
})

test('todo documento carrega a cláusula de aceite eletrônico', () => {
  for (const tipo of ['contrato_venda', 'checklist_entrega'] as const) {
    assert.ok(montarHtmlDocumento(tipo, DADOS).includes(CLAUSULA_ACEITE))
  }
})

test('checklist lista os itens conferidos na entrega', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS)
  for (const item of ['Freios em funcionamento', 'Buzina', 'Carregador em funcionamento']) {
    assert.ok(html.includes(item), `faltou o item "${item}"`)
  }
})

test('checklist tem as três colunas OK / NÃO / NA', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS)
  assert.ok(html.includes('>OK<'))
  assert.ok(html.includes('>NÃO<'))
  assert.ok(html.includes('>NA<'))
  assert.ok(html.includes('não se aplica'))
})

test('checklist sem respostas sai em branco; com respostas sai marcado', () => {
  const branco = montarHtmlDocumento('checklist_entrega', DADOS)
  assert.ok(!branco.includes('✓'))

  const respostas = {
    itens: Object.fromEntries(ITENS_CHECKLIST.map((i, n) =>
      [i, n === 1 ? 'nao' : n === 2 ? 'na' : 'ok'] as const)),
    observacoes: 'Retrovisor esquerdo riscado',
  } as RespostasChecklist
  const preenchido = montarHtmlDocumento('checklist_entrega', DADOS, respostas)
  assert.ok(preenchido.includes('✓'))
  assert.ok(preenchido.includes('Retrovisor esquerdo riscado'))
})

test('observação em branco vira travessão, não some da via', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS, {
    itens: Object.fromEntries(ITENS_CHECKLIST.map(i => [i, 'ok' as const])),
    observacoes: '   ',
  })
  assert.ok(html.includes('Observações'))
  assert.ok(html.includes('—'))
})

test('checklist só está completo com todos os itens respondidos', () => {
  const todos = Object.fromEntries(ITENS_CHECKLIST.map(i => [i, 'ok' as const]))
  assert.equal(checklistCompleto({ itens: todos, observacoes: '' }), true)

  const { [ITENS_CHECKLIST[0]]: _, ...faltando } = todos
  assert.equal(checklistCompleto({ itens: faltando, observacoes: '' }), false)
  assert.equal(checklistCompleto(null), false)
})

test('observação do comprador é escapada — checklist aceita texto livre', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS, {
    itens: Object.fromEntries(ITENS_CHECKLIST.map(i => [i, 'ok' as const])),
    observacoes: '<img src=x onerror=alert(1)>',
  })
  assert.ok(html.includes('&lt;img'))
  assert.ok(!html.includes('<img src=x'))
})

test('o HTML é determinístico — mesmo dado, mesmo documento', () => {
  assert.equal(
    montarHtmlDocumento('contrato_venda', DADOS),
    montarHtmlDocumento('contrato_venda', { ...DADOS }),
  )
})

test('dado do cliente com < ou & não quebra o HTML', () => {
  const html = montarHtmlDocumento('contrato_venda', { ...DADOS, clienteNome: 'A & B <script>' })
  assert.ok(html.includes('A &amp; B &lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
})

test('grupo sem qualificação cadastrada não pode emitir contrato', () => {
  assert.equal(dadosVendedoraCompletos({ ...DADOS, vendedoraRazaoSocial: '' }), false)
  assert.equal(dadosVendedoraCompletos({ ...DADOS, comarcaForo: '  ' }), false)
  assert.equal(dadosVendedoraCompletos({ ...DADOS, cidadeSede: '' }), false)
  assert.equal(dadosVendedoraCompletos(DADOS), true)
})

test('rótulos existem para os dois tipos', () => {
  assert.equal(LABEL_TIPO.contrato_venda, 'contrato de venda')
  assert.equal(LABEL_TIPO.checklist_entrega, 'checklist de entrega')
})

// Hashes capturados em 15/10/2026, antes de o contrato aceitar comprador pessoa
// jurídica (#65): o documento de pessoa física tem de sair igual byte a byte.
// Se o texto de pessoa física mudar de propósito, recalcule com
// sha256(montarHtmlDocumento(...)) e troque os valores abaixo.
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const RESPOSTAS_MISTAS = {
  itens: Object.fromEntries(ITENS_CHECKLIST.map((i, n) => [i, (['ok', 'nao', 'na'] as const)[n % 3]])),
  observacoes: 'Riscado no para-lama',
}

test('comprador pessoa física: contrato e checklist idênticos aos de antes da #65', () => {
  assert.equal(sha256(montarHtmlDocumento('contrato_venda', DADOS)),
    '2156dff20ce516989acc5c909bdf65a2b318c3db0084469fbadea4ef480443f3')
  assert.equal(sha256(montarHtmlDocumento('checklist_entrega', DADOS)),
    '3a2efe857cff9b4e5b17d673e368ffda24229587d3516225019d5d77b153b386')
  assert.equal(sha256(montarHtmlDocumento('checklist_entrega', DADOS, RESPOSTAS_MISTAS)),
    '42ba45c3f5c0df1fbba44c7ea677f13d6301d31cc04507cb8d76a8af6f152529')
})

const DADOS_PJ: DadosDocumento = {
  ...DADOS,
  clienteNome: 'Locadora Teste Ltda',
  clienteCpf: '11.222.333/0001-81',
  clienteEmail: 'compras@locadora.com',
  clienteEndereco: 'Av. Brasil, nº 500, Centro, Pouso Alegre/MG, CEP 37550-000',
  representanteNome: 'Maria Souza',
  representanteCpf: '529.982.247-25',
}

test('comprador pessoa jurídica: o contrato qualifica a empresa e quem a representa', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS_PJ)
  assert.ok(html.includes(
    'Locadora Teste Ltda, pessoa jurídica, inscrita no CNPJ sob o nº 11.222.333/0001-81, com sede ' +
    'na Av. Brasil, nº 500, Centro, Pouso Alegre/MG, CEP 37550-000, endereço eletrônico: ' +
    'compras@locadora.com, neste ato representada por Maria Souza, CPF 529.982.247-25.'))
  assert.ok(!html.includes('brasileiro(a)'))
  assert.ok(!html.includes('inscrito no CPF'))
})

test('contrato do MOVA de pessoa jurídica: HTML idêntico ao de antes do contrato por grupo', () => {
  assert.equal(sha256(montarHtmlDocumento('contrato_venda', DADOS_PJ)),
    '0decb449a38387b35cfffb615254bc26db1baf94713f799f123c2ecfd57c4d7a')
})

test('pessoa jurídica sem representante: nome e CPF saem em linha em branco, para completar à mão', () => {
  const html = montarHtmlDocumento('contrato_venda', { ...DADOS_PJ, representanteNome: null, representanteCpf: '' })
  assert.ok(html.includes(
    'neste ato representada por ______________________________, CPF ________________.'))
})

test('checklist de pessoa jurídica identifica o comprador pelo CNPJ', () => {
  const html = montarHtmlDocumento('checklist_entrega', DADOS_PJ)
  assert.ok(html.includes('<td>Locadora Teste Ltda — CNPJ 11.222.333/0001-81</td>'))
})

test('nome do representante com < ou & não quebra o HTML', () => {
  const html = montarHtmlDocumento('contrato_venda', { ...DADOS_PJ, representanteNome: 'Ana & <b>Bia</b>' })
  assert.ok(html.includes('representada por Ana &amp; &lt;b&gt;Bia&lt;/b&gt;, CPF'))
  assert.ok(!html.includes('<b>Bia</b>'))
})

test('CPF e CNPJ gravados só com números saem formatados no contrato', () => {
  const html = montarHtmlDocumento('contrato_venda', {
    ...DADOS_PJ,
    vendedoraCnpj: '11111111000191',
    clienteCpf: '11222333000181',
    representanteCpf: '52998224725',
  })
  assert.ok(html.includes('inscrita\n    no CNPJ sob o nº 11.111.111/0001-91'))
  assert.ok(html.includes('inscrita no CNPJ sob o nº 11.222.333/0001-81'))
  assert.ok(html.includes('CPF 529.982.247-25.'))
})
