import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarHtmlDocumento, CLAUSULA_ACEITE, LABEL_TIPO, ITENS_CARTILHA_BATERIA,
  dadosVendedoraCompletos, type DadosDocumento,
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

test('o Anexo I (cartilha da bateria) faz parte do contrato', () => {
  const html = montarHtmlDocumento('contrato_venda', DADOS)
  assert.ok(html.includes('ANEXO I'))
  assert.equal(ITENS_CARTILHA_BATERIA.length, 14)
  for (const item of ITENS_CARTILHA_BATERIA) assert.ok(html.includes(item.slice(0, 30)))
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
  assert.equal(dadosVendedoraCompletos(DADOS), true)
})

test('rótulos existem para os dois tipos', () => {
  assert.equal(LABEL_TIPO.contrato_venda, 'contrato de venda')
  assert.equal(LABEL_TIPO.checklist_entrega, 'checklist de entrega')
})
