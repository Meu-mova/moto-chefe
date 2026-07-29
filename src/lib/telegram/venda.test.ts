import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarAvisoVenda } from './venda'

test('formata as quatro informacoes pedidas', () => {
  const texto = formatarAvisoVenda({
    marca: 'Shineray',
    modelo: 'SHI 175',
    valor: 12500,
    vendedor: 'Kawan Manso',
    loja: 'Pouso Alegre',
  })
  assert.equal(
    texto,
    '🏍️ Moto vendida\n' +
    'Modelo: Shineray SHI 175\n' +
    'Valor: R$ 12.500,00\n' +
    'Vendedor: Kawan Manso\n' +
    'Loja: Pouso Alegre'
  )
})

test('valor com centavos sai no padrao brasileiro', () => {
  const texto = formatarAvisoVenda({
    marca: 'Honda', modelo: 'Biz', valor: 9899.9,
    vendedor: 'Anne Ester', loja: 'Varginha',
  })
  assert.match(texto, /Valor: R\$ 9\.899,90/)
})

test('nao escapa markdown: modelo com _ sai literal', () => {
  // enviarMensagem manda texto plano (sem parse_mode), entao o _ nao pode
  // ser alterado — se algum dia alguem ligar parse_mode, este teste quebra
  // junto com a formatacao e obriga a revisar o escape.
  const texto = formatarAvisoVenda({
    marca: '', modelo: 'BIZ_110', valor: 1,
    vendedor: 'A', loja: 'B',
  })
  assert.match(texto, /Modelo: BIZ_110/)
})
