import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destaqueAvista12x } from './simulador-padrao'
import { folhaSimulacao, htmlAvista12x } from './simulador-impressao'

const modelo = { nome: 'Scooter <X> "3000"', imagemUrl: null }
const DATA = '5 de novembro de 2026'
// toLocaleString põe espaço não separável entre "R$" e o número.
const sem = (html: string) => html.replace(/ /g, ' ')

test('impressão com 12x: PIX em destaque e "ou 12x de"', () => {
  const html = sem(htmlAvista12x(modelo, destaqueAvista12x(13990, 15600), null, DATA))
  assert.match(html, /R\$ 13\.990,00/)
  assert.match(html, /12x de R\$ 1\.300,00/)
  assert.match(html, /total R\$ 15\.600,00/)
  assert.match(html, /10% de desconto/)
  assert.match(html, /economia de R\$ 1\.610,00/)
  assert.match(html, /5 de novembro de 2026/)
})

test('impressão sem 12x: sai só o PIX, sem card vazio para o cliente', () => {
  const html = htmlAvista12x(modelo, destaqueAvista12x(13990, null), null, DATA)
  assert.doesNotMatch(html, /12x/)
  assert.match(sem(html), /R\$ 13\.990,00/)
})

test('impressão com frete: PIX + frete e 12x + frete', () => {
  const html = sem(htmlAvista12x(modelo, destaqueAvista12x(13990, 15600, 168), 84.2, DATA))
  assert.match(html, /84,2 km ida e volta/)
  assert.match(html, /PIX \+ frete: R\$ 14\.158,00/)
  assert.match(html, /12x \+ frete: 12x de R\$ 1\.314,00/)
})

test('nome do modelo sai escapado e o texto não tem travessão', () => {
  const html = htmlAvista12x(modelo, destaqueAvista12x(13990, 15600), null, DATA)
  assert.match(html, /Scooter &lt;X&gt; &quot;3000&quot;/)
  assert.doesNotMatch(html, /<X>/)
  assert.doesNotMatch(html, /—/)
})

test('imagem só sai com https, escapada', () => {
  const comImg = (url: string) => htmlAvista12x({ nome: 'M', imagemUrl: url }, destaqueAvista12x(1, null), null, DATA)
  assert.match(comImg('https://x.test/a.png?b="c"'), /src="https:\/\/x\.test\/a\.png\?b=&quot;c&quot;"/)
  assert.doesNotMatch(comImg('javascript:alert(1)'), /<img/)
})

test('papel comum aos dois padrões: marca e título sem travessão, nome escapado', () => {
  const html = folhaSimulacao({ modelo: { nome: 'M <1>', imagemUrl: null }, dataTexto: DATA, estilos: '', corpo: '<p>corpo</p>', rodape: 'rodapé' })
  assert.match(html, /<title>Simulação: M &lt;1&gt;<\/title>/)
  assert.match(html, /MOVA, gestão em mobilidade elétrica/)
  assert.doesNotMatch(html, /—/)
})
