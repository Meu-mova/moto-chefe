import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigosDaRecusa, fraseDaRecusa, gruposDaRecusa, telaDaRecusa } from './recusa'

test('lê o código da SEFAZ no início do motivo, com qualquer separador', () => {
  assert.deepEqual(codigosDaRecusa('237 - Rejeição: CPF do destinatário inválido'), ['237'])
  assert.deepEqual(codigosDaRecusa('778: Rejeição: Informado NCM inexistente'), ['778'])
})

test('lê os códigos da Nota Gateway, com letras, inclusive vários na mesma recusa', () => {
  assert.deepEqual(codigosDaRecusa('Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.'), ['GW7324'])
  assert.deepEqual(
    codigosDaRecusa('Nota Gateway recusou a nota: Código: CEST001\r\nDescrição: x; Código: _0006\r\nDescrição: y'),
    ['CEST001', '_0006'],
  )
})

test('motivo sem código não inventa um', () => {
  assert.deepEqual(codigosDaRecusa('Nota Gateway recusou a nota: sem detalhe'), [])
  assert.deepEqual(codigosDaRecusa(null), [])
})

test('cada código abre o grupo que o corrige', () => {
  assert.deepEqual(gruposDaRecusa('237 - Rejeição: CPF do destinatário inválido'), ['comprador'])
  assert.deepEqual(gruposDaRecusa('728 - Rejeição: NF-e sem informação da IE do destinatário'), ['comprador'])
  assert.deepEqual(gruposDaRecusa('778 - Rejeição: Informado NCM inexistente'), ['moto'])
  assert.deepEqual(gruposDaRecusa('Código: CEST001\r\nDescrição: CEST com 7 dígitos'), ['moto'])
  assert.deepEqual(gruposDaRecusa('Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.'), ['empresa'])
  assert.deepEqual(gruposDaRecusa('481 - Rejeição: Código Regime Tributário do emitente diverge do cadastro na SEFAZ'), ['empresa'])
})

test('CFOP × UF (523, 732, 733) abre comprador e empresa: costuma ser a UF do comprador', () => {
  for (const c of ['523', '732', '733']) assert.deepEqual(gruposDaRecusa(`${c} - Rejeição`), ['comprador', 'empresa'], c)
})

test('código desconhecido ou ausente abre os grupos editáveis', () => {
  assert.deepEqual(gruposDaRecusa('999 - Rejeição: Erro não catalogado'), ['comprador', 'moto'])
  assert.deepEqual(gruposDaRecusa('sem código'), ['comprador', 'moto'])
})

test('o "Por quê?" diz a causa em linguagem de loja, sem travessão', () => {
  assert.equal(fraseDaRecusa('237 - Rejeição: CPF do destinatário inválido'), 'O CPF do cliente está errado.')
  assert.equal(fraseDaRecusa('Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.'), 'O CFOP do produto está num formato que a nota não aceita.')
  assert.equal(fraseDaRecusa('302 - Uso Denegado'), 'A Inscrição Estadual do cliente está com problema na SEFAZ.')
})

test('código sem frase devolve nulo: a tela mostra o motivo como veio', () => {
  assert.equal(fraseDaRecusa('999 - Rejeição: Erro não catalogado'), null)
  assert.equal(fraseDaRecusa(null), null)
})

test('a tela da recusa: campos só quando há o que corrigir no cadastro (#347)', () => {
  const t = (motivo: string) => telaDaRecusa({ status: 'Negada', motivoStatus: motivo })
  assert.deepEqual(t('237 - Rejeição: CPF do destinatário inválido'), { tipo: 'corrigir', abertos: ['comprador'], empresa: false })
  assert.deepEqual(t('523 - Rejeição: CFOP'), { tipo: 'corrigir', abertos: ['comprador'], empresa: true })
  assert.deepEqual(t('999 - Rejeição: Erro não catalogado'), { tipo: 'corrigir', abertos: ['comprador', 'moto'], empresa: false })
  assert.deepEqual(t('Código: GW7324\r\nDescrição: x'), { tipo: 'empresa' })
  assert.deepEqual(t('302 - Uso Denegado'), { tipo: 'denegada_cliente' })
  assert.deepEqual(t('303 - Uso Denegado'), { tipo: 'denegada_cliente' })
  assert.deepEqual(t('301 - Uso Denegado'), { tipo: 'denegada_empresa' })
})

test('denegada sem código conhecido não abre campos: só emite a nova nota (#347)', () => {
  assert.deepEqual(telaDaRecusa({ status: 'Denegada', motivoStatus: null }), { tipo: 'denegada' })
  assert.deepEqual(telaDaRecusa({ status: 'Denegada', motivoStatus: 'Uso denegado' }), { tipo: 'denegada' })
})

test('539 abre a tela do número já usado, sem campos (#347)', () => {
  assert.deepEqual(telaDaRecusa({ status: 'Negada', motivoStatus: '539 - Rejeição: Duplicidade de NF-e, com diferença na Chave de Acesso' }), { tipo: 'duplicidade' })
})
