import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chassiValidoRenave, conferirRenave, corDenatranSugerida, exigeRenave, montarVeiculoNovo, potenciaCvSugerida,
  sugestaoRenave, validarRenave, type DadosRenave,
} from './veiculo'

const CHASSI = '9c2abc12345678901'

const PREENCHIDO: DadosRenave = {
  chassi: CHASSI,
  tipoOperacao: 'VendaConcessionaria',
  corCodigo: '11',
  corDescricao: 'preta',
  corDenatran: 'Preta',
  potenciaMotor: '1,36',
  cilindradas: '0',
  pesoLiquido: '0,0850',
  pesoBruto: '0,2350',
  numeroSerie: '45678901',
  tipoCombustivel: '07',
  numeroMotor: 'mt2026x01',
  capacidadeMaximaTracao: '0,2350',
  distanciaEixos: '1300',
  anoModelo: '2027',
  anoFabricacao: '2026',
  tipoPintura: 's',
  tipoVeiculo: '02',
  especie: 'Passageiro',
  condicaoVin: 'Normal',
  condicao: 'Acabado',
  codigoMarcaModelo: '012345',
  lotacao: '2',
  restricao: 'NaoHa',
}

test('só ciclomotor leva o grupo do veículo', () => {
  assert.equal(exigeRenave('ciclomotor'), true)
  assert.equal(exigeRenave('autopropelido'), false)
  assert.equal(exigeRenave(null), false)
})

test('chassi precisa de 17 letras e números', () => {
  assert.equal(chassiValidoRenave(CHASSI), true)
  assert.equal(chassiValidoRenave('ABC123'), false)
  assert.equal(chassiValidoRenave('9C2ABC1234567890-'), false)
})

test('cor cadastrada vira a cor DENATRAN; o que não reconhece é Fantasia', () => {
  assert.equal(corDenatranSugerida('Preto fosco'), 'Preta')
  assert.equal(corDenatranSugerida('GRAFITE'), 'Cinza')
  assert.equal(corDenatranSugerida('vermelho'), 'Vermelha')
  assert.equal(corDenatranSugerida('Tiffany'), 'Fantasia')
})

test('potência em W vira CV com até 4 caracteres', () => {
  assert.equal(potenciaCvSugerida('1000W'), '1.36')
  assert.equal(potenciaCvSugerida('1.000 W'), '1.36')
  assert.equal(potenciaCvSugerida('2kW'), '2.72')
  assert.equal(potenciaCvSugerida('10000W'), '13.6')
  assert.equal(potenciaCvSugerida(''), '')
})

test('sugestão usa a moto e, havendo, o modelo da última moto igual', () => {
  const s = sugestaoRenave({ chassi: CHASSI, cor: 'Branca', motor: 'mt1', potenciaW: '1000W', anoAtual: 2026 })
  assert.equal(s.chassi, '9C2ABC12345678901')
  assert.equal(s.numeroSerie, '45678901')
  assert.equal(s.corDenatran, 'Branca')
  assert.equal(s.corCodigo, '04')
  assert.equal(s.numeroMotor, 'MT1')
  assert.equal(s.pesoBruto, '')

  const h = sugestaoRenave({ chassi: CHASSI, cor: 'Branca', motor: 'mt1', potenciaW: '1000W', anoAtual: 2026, anterior: PREENCHIDO })
  // Do modelo: herda.
  assert.equal(h.pesoBruto, '0,2350')
  assert.equal(h.codigoMarcaModelo, '012345')
  // Da moto: não herda.
  assert.equal(h.corDenatran, 'Branca')
  assert.equal(h.numeroMotor, 'MT1')
  assert.equal(h.chassi, '9C2ABC12345678901')
  assert.equal(h.anoModelo, '2026')
})

test('validação normaliza vírgula, caixa e mantém zero à esquerda do código RENAVAM', () => {
  const v = validarRenave(PREENCHIDO)
  assert.ok(v.ok)
  assert.equal(v.dados.pesoLiquido, '0.0850')
  assert.equal(v.dados.potenciaMotor, '1.36')
  assert.equal(v.dados.corDescricao, 'PRETA')
  assert.equal(v.dados.tipoPintura, 'S')
  assert.equal(v.dados.codigoMarcaModelo, '012345')
})

test('validação recusa o que o leiaute não aceita, dizendo o campo', () => {
  const v = validarRenave({ ...PREENCHIDO, chassi: 'ABC123', pesoBruto: '', anoModelo: '2029', numeroSerie: '1234567890', especie: 'x' })
  assert.equal(v.ok, false)
  if (v.ok) return
  assert.match(v.error, /Chassi/)
  assert.match(v.error, /Peso bruto/)
  assert.match(v.error, /Ano do modelo/)
  assert.match(v.error, /Número de série/)
  assert.match(v.error, /Espécie/)
})

test('peso bruto menor que o líquido é recusado', () => {
  const v = validarRenave({ ...PREENCHIDO, pesoBruto: '0,05' })
  assert.equal(v.ok, false)
})

test('monta o grupo veiculoNovo como a API recebe', () => {
  const v = validarRenave(PREENCHIDO)
  assert.ok(v.ok)
  const g = montarVeiculoNovo(v.dados)
  assert.equal(g.chassi, '9C2ABC12345678901')
  assert.deepEqual(g.cor, { codigo: '11', descricao: 'PRETA', denatran: 'Preta' })
  assert.equal(g.pesoLiquido, 0.085)
  assert.equal(g.anoModelo, 2027)
  assert.equal(g.lotacao, 2)
  assert.equal(g.codigoMarcaModelo, '012345')
  assert.equal(g.restricao, 'NaoHa')
})

test('combustível e tipo de veículo vão à API sem zero à esquerda, como no exemplo da NG', () => {
  const v = validarRenave(PREENCHIDO)
  assert.ok(v.ok)
  const g = montarVeiculoNovo(v.dados)
  assert.equal(g.tipoCombustivel, '7')
  assert.equal(g.tipoVeiculo, '2')
  // Código RENAVAM continua com o zero: lá ele faz parte do código.
  assert.equal(g.codigoMarcaModelo, '012345')
})

test('tipo da operação e restrição não vêm da moto anterior: são da venda', () => {
  const h = sugestaoRenave({
    chassi: CHASSI, cor: 'Branca', motor: 'mt1', potenciaW: '1000W', anoAtual: 2026,
    anterior: { ...PREENCHIDO, restricao: 'AlienacaoFiduciaria', tipoOperacao: 'Outros' },
  })
  assert.equal(h.restricao, '')
  assert.equal(h.tipoOperacao, '')
})

test('sem moto anterior, o MOVA não supõe nenhum valor de tabela: a loja escolhe', () => {
  const s = sugestaoRenave({ chassi: CHASSI, cor: 'Branca', motor: 'mt1', potenciaW: '1000W', anoAtual: 2026 })
  for (const k of ['tipoOperacao', 'cilindradas', 'tipoCombustivel', 'tipoPintura', 'tipoVeiculo', 'especie', 'condicaoVin', 'condicao', 'restricao'] as const) {
    assert.equal(s[k], '', k)
  }
  const v = validarRenave(s)
  assert.ok(!v.ok && /Tipo da operação: escolha/.test(v.error) && /Restrição: escolha/.test(v.error))
})

test('CMT zero é aceita; pesos zero não', () => {
  assert.ok(validarRenave({ ...PREENCHIDO, capacidadeMaximaTracao: '0' }).ok)
  assert.equal(validarRenave({ ...PREENCHIDO, pesoLiquido: '0' }).ok, false)
})

test('tipo de pintura aceita qualquer caractere único (J18), como o A da nota da fábrica', () => {
  const a = validarRenave({ ...PREENCHIDO, tipoPintura: 'a' })
  assert.ok(a.ok && a.dados.tipoPintura === 'A')
  for (const ruim of ['', 'AB']) {
    const v = validarRenave({ ...PREENCHIDO, tipoPintura: ruim })
    assert.equal(v.ok, false)
    if (!v.ok) assert.match(v.error, /Tipo de pintura/)
  }
})

test('conferirRenave: recusa ciclomotor sem dados ou com dado inválido, e passa o resto', () => {
  assert.deepEqual(conferirRenave(false, null), { ok: true, dados: null })
  const sem = conferirRenave(true, null)
  assert.equal(sem.ok, false)
  const invalido = conferirRenave(true, { ...PREENCHIDO, chassi: '' })
  assert.ok(!invalido.ok && invalido.error.startsWith('Dados do veículo (RENAVE):'))
  const ok = conferirRenave(true, PREENCHIDO)
  assert.ok(ok.ok && ok.dados)
})
