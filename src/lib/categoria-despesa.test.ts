import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarClassificacao, rotuloMotivo, MOTIVOS_CATEGORIA } from './categoria-despesa'

test('operacional não guarda motivo', () => {
  const r = normalizarClassificacao({ contaComoDespesa: true, motivoNaoOperacional: 'retirada_socio' })
  assert.deepEqual(r, { contaComoDespesa: true, motivoNaoOperacional: null, grupoDre: null })
})

test('não operacional exige motivo', () => {
  assert.throws(
    () => normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: null }),
    /motivo/i,
  )
  assert.throws(
    () => normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: '   ' }),
    /motivo/i,
  )
})

test('motivo fora da lista não passa', () => {
  // 'categoria_marcada' existe no cálculo, mas é o que ele assume quando NÃO há
  // motivo — gravá-lo à mão seria escolher "não escolhi".
  assert.throws(
    () => normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: 'categoria_marcada' }),
    /inválido/i,
  )
  assert.throws(
    () => normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: 'qualquer_coisa' }),
    /inválido/i,
  )
})

test('todos os motivos da tela são aceitos', () => {
  for (const m of MOTIVOS_CATEGORIA) {
    const r = normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: m.valor })
    assert.equal(r.motivoNaoOperacional, m.valor)
    assert.equal(r.contaComoDespesa, false)
  }
})

test('rótulo cai no próprio valor quando o motivo é antigo', () => {
  assert.equal(rotuloMotivo('retirada_socio'), 'Retirada de sócio')
  assert.equal(rotuloMotivo(null), 'Sem motivo')
  // Linha gravada antes desta tela, com motivo que a tela não oferece: mostra o
  // valor cru em vez de sumir.
  assert.equal(rotuloMotivo('categoria_marcada'), 'categoria_marcada')
})

test('grupo do DRE só vale em categoria operacional', () => {
  const r = normalizarClassificacao({ contaComoDespesa: true, grupoDre: 'pessoal' })
  assert.equal(r.grupoDre, 'pessoal')

  // Não operacional aparece no memorando, classificada pelo motivo — guardar um
  // grupo do DRE nela seria dado que ninguém lê.
  const naoOp = normalizarClassificacao({
    contaComoDespesa: false, motivoNaoOperacional: 'retirada_socio', grupoDre: 'pessoal',
  })
  assert.equal(naoOp.grupoDre, null)
})

test('grupo em branco é permitido — a leitura joga em Outras', () => {
  assert.equal(normalizarClassificacao({ contaComoDespesa: true }).grupoDre, null)
  assert.equal(normalizarClassificacao({ contaComoDespesa: true, grupoDre: '  ' }).grupoDre, null)
})

test('grupo inventado não passa', () => {
  assert.throws(
    () => normalizarClassificacao({ contaComoDespesa: true, grupoDre: 'marketing_digital' }),
    /Grupo do DRE inválido/,
  )
})

test('"já lançada manualmente" é um motivo escolhível na tela', () => {
  const r = normalizarClassificacao({ contaComoDespesa: false, motivoNaoOperacional: 'ja_lancada_manual' })
  assert.equal(r.motivoNaoOperacional, 'ja_lancada_manual')
  assert.equal(r.contaComoDespesa, false)
  assert.equal(rotuloMotivo('ja_lancada_manual'), 'Já lançada manualmente')
})
