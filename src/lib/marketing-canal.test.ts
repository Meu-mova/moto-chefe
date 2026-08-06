import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nomeOrigem, formatarPerfil, rotuloCanal,
  calcularCpl, calcularCac, calcularRoas, taxa,
  variacaoPct, periodoAnterior, granularidade,
} from './marketing-canal'

test('nomeOrigem traduz os códigos da API e devolve o cru quando não conhece', () => {
  assert.equal(nomeOrigem('com.amocrm.amocrmwa'), 'WhatsApp')
  assert.equal(nomeOrigem('instagram_business'), 'Instagram')
  assert.equal(nomeOrigem('facebook'), 'Facebook')
  assert.equal(nomeOrigem('canal_novo_da_kommo'), 'canal_novo_da_kommo')
  assert.equal(nomeOrigem(null), null)
  assert.equal(nomeOrigem('  '), null)
})

test('formatarPerfil só mexe em número de telefone', () => {
  assert.equal(formatarPerfil('553599884773'), '(35) 9988-4773')
  assert.equal(formatarPerfil('5512988622525'), '(12) 98862-2525')
  assert.equal(formatarPerfil('motochefepocos'), 'motochefepocos')
  assert.equal(formatarPerfil('EcoMov - Mobilidade Elétrica'), 'EcoMov - Mobilidade Elétrica')
  assert.equal(formatarPerfil(null), null)
})

test('rotuloCanal respeita a precedência nome > perfil > canal > id', () => {
  assert.equal(
    rotuloCanal({ sourceId: 1, origem: 'instagram_business', perfil: 'motochefepocos', nome: 'Insta Poços (pago)' }),
    'Insta Poços (pago)',
  )
  assert.equal(
    rotuloCanal({ sourceId: 1, origem: 'instagram_business', perfil: 'motochefepocos' }),
    'Instagram · motochefepocos',
  )
  assert.equal(rotuloCanal({ sourceId: 1, origem: 'facebook' }), 'Facebook')
  assert.equal(rotuloCanal({ sourceId: 57985 }), 'Canal 57985')
  assert.equal(rotuloCanal({ sourceId: null }), 'Não identificado')
  // nome só de espaços não vale como rótulo
  assert.equal(rotuloCanal({ sourceId: 1, origem: 'facebook', nome: '   ' }), 'Facebook')
})

test('CPL/CAC/ROAS devolvem null quando não há como dividir', () => {
  assert.equal(calcularCpl(1000, 250), 4)
  assert.equal(calcularCpl(1000, 0), null)   // verba sem lead: não é CPL infinito
  assert.equal(calcularCpl(0, 250), null)    // sem verba lançada não há custo a mostrar
  assert.equal(calcularCac(1000, 5), 200)
  assert.equal(calcularCac(1000, 0), null)
  assert.equal(calcularRoas(30000, 1000), 30)
  assert.equal(calcularRoas(30000, 0), null)
})

test('taxa não divide por zero', () => {
  assert.equal(taxa(3, 12), 0.25)
  assert.equal(taxa(0, 0), 0)
})

test('variacaoPct trata estreia como sem-base, não como +infinito', () => {
  assert.equal(variacaoPct(120, 100), 0.2)
  assert.equal(variacaoPct(80, 100), -0.2)
  assert.equal(variacaoPct(12, 0), null)
  assert.equal(variacaoPct(0, 0), null)
})

test('periodoAnterior devolve janela de mesma duração terminando na véspera', () => {
  // agosto tem 31 dias → a janela anterior é julho inteiro
  assert.deepEqual(periodoAnterior('2026-08-01', '2026-08-31'), { de: '2026-07-01', ate: '2026-07-31' })
  // fevereiro (28) recua só 28 dias, não "um mês"
  assert.deepEqual(periodoAnterior('2026-02-01', '2026-02-28'), { de: '2026-01-04', ate: '2026-01-31' })
  assert.deepEqual(periodoAnterior('2026-08-06', '2026-08-06'), { de: '2026-08-05', ate: '2026-08-05' })
})

test('granularidade vira mensal acima de 60 dias', () => {
  assert.equal(granularidade('2026-08-01', '2026-08-31'), 'dia')
  assert.equal(granularidade('2026-01-01', '2026-08-31'), 'mes')
})
