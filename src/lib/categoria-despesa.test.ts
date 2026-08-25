import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarClassificacao, rotuloMotivo, MOTIVOS_CATEGORIA } from './categoria-despesa'

test('operacional não guarda motivo', () => {
  const r = normalizarClassificacao({ contaComoDespesa: true, motivoNaoOperacional: 'retirada_socio' })
  assert.deepEqual(r, { contaComoDespesa: true, motivoNaoOperacional: null })
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

test('os quatro motivos da tela são aceitos', () => {
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
