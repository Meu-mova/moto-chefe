import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarNfeVendaMoto, origemDeSaida, type DadosVendaMoto, type RegraSaida } from './payload'

// Regra do Sul de Minas, extraída das 198 notas que ele já emitiu pelo Bling.
const REGRA: RegraSaida = {
  naturezaOperacao: 'Venda de mercadoria com ST',
  cfopInterno: '5405',
  cstIcmsInterno: '60',
  cfopInterestadual: '6404',
  cstIcmsInterestadual: '00',
  aliquotaIcmsInterestadual: '12.00',
  cstPis: '01',
  aliquotaPis: '0.6500',
  cstCofins: '01',
  aliquotaCofins: '3.0000',
  cstIpi: '99',
  cstIbsCbs: '000',
  classTribIbsCbs: '000001',
  crt: 3,
  origemFixa: '0',
}

// Espelha a NF 002470 real: BOB da Q.P.A, cliente em MG.
const VENDA: DadosVendaMoto = {
  idExterno: 'mova-venda-abc123',
  ambiente: 'Homologacao',
  ufEmitente: 'MG',
  cliente: {
    tipoPessoa: 'F',
    nome: 'BRUNA MARIA ASSIS DA SILVA',
    cpfCnpj: '35281765043',
    email: 'bruna@exemplo.com',
    telefone: '35999998888',
    endereco: { uf: 'MG', cidade: 'Varginha', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cep: '37000000' },
  },
  moto: {
    // Ficha da nota de entrada — é ela que manda no nome e na classificação.
    xProd: 'BOB MOTO CHEFE',
    codigo: 'BOB MOTO CHEFE',
    ncm: '87116000',
    cest: '2600100',
    unidade: 'UN',
    origem: '4',
  },
  valor: 8725.85,
  pagamentos: [{ tipo: 'PagamentoInstantaneoPix', valor: 8725.85 }],
}

test('venda dentro de MG usa CFOP 5405 e CST 60', () => {
  const p = montarNfeVendaMoto(VENDA, REGRA)
  assert.equal(p.itens[0].cfop, '5405')
  assert.equal(p.itens[0].impostos.icms.situacaoTributaria, '60')
  assert.equal(p.naturezaOperacao, 'Venda de mercadoria com ST')
  assert.equal(p.tipoOperacao, 'Saida')
  assert.equal(p.finalidade, 'Normal')
})

test('venda para fora da UF vira CFOP 6404 com ICMS destacado', () => {
  const p = montarNfeVendaMoto(
    { ...VENDA, cliente: { ...VENDA.cliente, endereco: { ...VENDA.cliente.endereco, uf: 'SP', cidade: 'Campinas' } } },
    REGRA,
  )
  assert.equal(p.itens[0].cfop, '6404')
  assert.equal(p.itens[0].impostos.icms.situacaoTributaria, '00')
  assert.equal(p.itens[0].impostos.icms.aliquota, 12)
})

test('o nome fiscal é o LITERAL da nota de entrada, nunca o comercial', () => {
  const p = montarNfeVendaMoto(
    { ...VENDA, moto: { ...VENDA.moto, xProd: 'MOTOCICLETA ELETRICA SCOOTER FANTON' } },
    REGRA,
  )
  assert.equal(p.itens[0].descricao, 'MOTOCICLETA ELETRICA SCOOTER FANTON')
})

test('origemFixa vence a origem da moto quando preenchida', () => {
  const p = montarNfeVendaMoto(VENDA, REGRA)
  // A moto entrou com origem 4, mas a regra fixa 0 — é o que o Bling faz hoje.
  assert.equal(p.itens[0].impostos.icms.origem, 0)
})

test('sem origemFixa, usa a origem real da moto', () => {
  const p = montarNfeVendaMoto(VENDA, { ...REGRA, origemFixa: null })
  assert.equal(p.itens[0].impostos.icms.origem, 4)
})

test('NCM e CEST vêm da ficha da moto, não da regra', () => {
  const p = montarNfeVendaMoto(VENDA, REGRA)
  assert.equal(p.itens[0].ncm, '87116000')
  assert.equal(p.itens[0].cest, '2600100')
  assert.equal(p.itens[0].unidadeMedida, 'UN')
})

test('PIS, COFINS e IBS/CBS saem da regra', () => {
  const p = montarNfeVendaMoto(VENDA, REGRA)
  assert.equal(p.itens[0].impostos.pis.situacaoTributaria, '01')
  assert.equal(p.itens[0].impostos.pis.porAliquota?.aliquota, 0.65)
  assert.equal(p.itens[0].impostos.cofins.situacaoTributaria, '01')
  assert.equal(p.itens[0].impostos.cofins.porAliquota?.aliquota, 3)
  assert.equal(p.itens[0].impostos.ibsCbs?.classificacaoTributaria, '000001')
})

test('moto é sempre quantidade 1 e o valor da venda é o unitário', () => {
  const p = montarNfeVendaMoto(VENDA, REGRA)
  assert.equal(p.itens[0].quantidade, 1)
  assert.equal(p.itens[0].valorUnitario, 8725.85)
})

test('ambiente vai no payload — é o que separa teste de nota valendo', () => {
  assert.equal(montarNfeVendaMoto(VENDA, REGRA).ambienteEmissao, 'Homologacao')
  assert.equal(montarNfeVendaMoto({ ...VENDA, ambiente: 'Producao' }, REGRA).ambienteEmissao, 'Producao')
})

test('recusa moto sem NCM em vez de emitir nota incompleta', () => {
  assert.throws(
    () => montarNfeVendaMoto({ ...VENDA, moto: { ...VENDA.moto, ncm: '' } }, REGRA),
    /sem ficha fiscal/i,
  )
})

test('recusa venda sem pagamento que feche com o valor', () => {
  assert.throws(
    () => montarNfeVendaMoto({ ...VENDA, pagamentos: [{ tipo: 'PagamentoInstantaneoPix', valor: 100 }] }, REGRA),
    /pagamento/i,
  )
})

test('CEST vazio não vai como string vazia — a SEFAZ rejeita', () => {
  const p = montarNfeVendaMoto({ ...VENDA, moto: { ...VENDA.moto, cest: '' } }, REGRA)
  assert.equal('cest' in p.itens[0], false)
})

test('com IBPT na regra, manda o total aproximado de tributos (Lei da Transparência)', () => {
  const p = montarNfeVendaMoto({ ...VENDA, valor: 12990, pagamentos: [{ tipo: 'Dinheiro', valor: 12990 }] },
    { ...REGRA, ibptFederal: '31.60', ibptEstadual: '12.00' })
  // Valores conferidos na NF 3003 de homologação: 4104,84 + 1558,80 = 5663,64.
  assert.deepEqual(p.itens[0].impostos.percentualAproximadoTributos, {
    detalhado: {
      percentualFederal: 31.6, valorFederal: 4104.84,
      percentualEstadual: 12, valorEstadual: 1558.8,
      percentualMunicipal: 0, valorMunicipal: 0,
      valorTotal: 5663.64,
    },
    fonte: 'IBPT',
  })
})

test('sem IBPT na regra, a nota sai sem o total de tributos', () => {
  const p = montarNfeVendaMoto(VENDA, { ...REGRA, ibptFederal: null, ibptEstadual: null })
  assert.equal(p.itens[0].impostos.percentualAproximadoTributos, undefined)
})

test('PIS, COFINS e IPI levam a alíquota dentro de porAliquota', () => {
  const { pis, cofins, ipi } = montarNfeVendaMoto(VENDA, REGRA).itens[0].impostos
  assert.deepEqual(pis, { situacaoTributaria: '01', porAliquota: { aliquota: 0.65 } })
  assert.deepEqual(cofins, { situacaoTributaria: '01', porAliquota: { aliquota: 3 } })
  assert.deepEqual(ipi, { situacaoTributaria: '99', porAliquota: { aliquota: 0 } })
})

test('sem CST de IPI na regra, o bloco de IPI não vai', () => {
  const p = montarNfeVendaMoto(VENDA, { ...REGRA, cstIpi: null })
  assert.equal(p.itens[0].impostos.ipi, undefined)
})

test('origem de saída segue o contador: 0→0, 1→2, 4→4 (e 2 continua 2)', () => {
  assert.equal(origemDeSaida('0'), '0')
  assert.equal(origemDeSaida('1'), '2')
  assert.equal(origemDeSaida('2'), '2')
  assert.equal(origemDeSaida('4'), '4')
  assert.equal(origemDeSaida(null), '0')
})

test('moto importada direto (origem 1) sai com origem 2', () => {
  const p = montarNfeVendaMoto({ ...VENDA, moto: { ...VENDA.moto, origem: '1' } }, { ...REGRA, origemFixa: null })
  assert.equal(p.itens[0].impostos.icms.origem, 2)
})

test('nota de homologação nunca manda e-mail ao cliente; produção manda', () => {
  assert.equal(montarNfeVendaMoto({ ...VENDA, ambiente: 'Homologacao' }, REGRA).enviarPorEmail, false)
  assert.equal(montarNfeVendaMoto({ ...VENDA, ambiente: 'Producao' }, REGRA).enviarPorEmail, true)
})

const CLIENTE_PJ = { ...VENDA.cliente, tipoPessoa: 'J' as const, nome: 'LOCADORA TESTE LTDA', cpfCnpj: '11222333000181' }

test('comprador PJ: o indicador de contribuinte do ICMS sai do cadastro, com a IE quando contribuinte', () => {
  const contrib = montarNfeVendaMoto({ ...VENDA, cliente: { ...CLIENTE_PJ, indicadorIe: 'contribuinte', inscricaoEstadual: '0623079040081' } }, REGRA)
  assert.equal(contrib.cliente.indicadorContribuinteICMS, 'Contribuinte')
  assert.equal(contrib.cliente.inscricaoEstadual, '0623079040081')

  const isento = montarNfeVendaMoto({ ...VENDA, cliente: { ...CLIENTE_PJ, indicadorIe: 'isento' } }, REGRA)
  // Conferido em homologação (NF 408, 15/10/2026): 'Isento' sai no XML como indIEDest 2.
  assert.equal(isento.cliente.indicadorContribuinteICMS, 'Isento')
  assert.equal('inscricaoEstadual' in isento.cliente, false)

  const nao = montarNfeVendaMoto({ ...VENDA, cliente: { ...CLIENTE_PJ, indicadorIe: 'nao_contribuinte' } }, REGRA)
  assert.equal(nao.cliente.indicadorContribuinteICMS, 'NaoContribuinte')
  assert.equal('inscricaoEstadual' in nao.cliente, false)
})

test('ciclomotor leva o grupo veiculoNovo no item; sem ele, o item sai como antes', () => {
  const veiculo = {
    tipoOperacao: 'VendaConcessionaria', chassi: '9C2ABC12345678901',
    cor: { codigo: '11', descricao: 'PRETA', denatran: 'Preta' },
    potenciaMotor: '1.36', cilindradas: '0', pesoLiquido: 0.085, pesoBruto: 0.235, numeroSerie: '45678901',
    tipoCombustivel: '07', numeroMotor: 'MT1', capacidadeMaximaTracao: 0.235, distanciaEixos: '1300',
    anoModelo: 2026, anoFabricacao: 2026, tipoPintura: 'S', tipoVeiculo: '02', especie: 'Passageiro',
    condicaoVin: 'Normal', condicao: 'Acabado', codigoMarcaModelo: '012345', lotacao: 2, restricao: 'NaoHa',
  }
  const com = montarNfeVendaMoto({ ...VENDA, moto: { ...VENDA.moto, veiculo } }, REGRA)
  assert.deepEqual(com.itens[0].veiculoNovo, veiculo)
  const sem = montarNfeVendaMoto(VENDA, REGRA)
  assert.equal('veiculoNovo' in sem.itens[0], false)
})
