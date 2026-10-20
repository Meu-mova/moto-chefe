import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarContratoAdesao, dadosContratoCompletos, motivoBloqueioEnvio, TERMOS, TERMOS_CONFIRMADOS, type DadosContratoAdesao } from './contrato-adesao'

const DADOS: DadosContratoAdesao = {
  razaoSocial: 'ECOMOTO LAVRAS COMERCIO LTDA',
  cnpj: '11222333000181',
  enderecoSede: 'Rua A, 100, Centro, Lavras/MG',
  email: 'contato@ecomoto.com.br',
  responsavelNome: 'Bruno Lima',
  responsavelCpf: '52998224725',
  taxaImplantacao: '999.00',
  valorMensal: '499.00',
}

test('contrato traz licenciante, licenciada formatada e os valores da adesão', () => {
  const html = montarContratoAdesao(DADOS)
  assert.match(html, /INFINITY FIT TREINAMENTO E DESENVOLVIMENTO LTDA/)
  assert.match(html, /13\.481\.112\/0001-53/)
  assert.match(html, /ECOMOTO LAVRAS COMERCIO LTDA, inscrita no CNPJ sob o nº 11\.222\.333\/0001-81/)
  assert.match(html, /representada por Bruno Lima, CPF 529\.982\.247-25/)
  assert.match(html, /Taxa de implantação: R\$ 999,00, paga junto com a primeira mensalidade/)
  assert.match(html, /mensalidade de R\$ 499,00 por CNPJ/)
  assert.match(html, /Pouso Alegre\/MG/)
})

test('contrato não promete banco de dados próprio nem tem testemunhas', () => {
  const html = montarContratoAdesao(DADOS)
  assert.doesNotMatch(html, /banco de dados (próprio|exclusivo)/i)
  assert.doesNotMatch(html, /Testemunhas/i)
})

test('contrato escapa HTML vindo dos dados do lojista', () => {
  const html = montarContratoAdesao({ ...DADOS, razaoSocial: 'A & B <script>x</script>' })
  assert.match(html, /A &amp; B &lt;script&gt;x&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test('dadosContratoCompletos exige todos os campos e valores', () => {
  assert.equal(dadosContratoCompletos(DADOS), true)
  assert.equal(dadosContratoCompletos({ ...DADOS, responsavelCpf: null }), false)
  assert.equal(dadosContratoCompletos({ ...DADOS, valorMensal: null }), false)
})

test('montarContratoAdesao recusa dados incompletos', () => {
  assert.throws(() => montarContratoAdesao({ ...DADOS, email: '' }))
})

test('franqueado MotoChefe: contrato sai com os valores gravados na adesão (799/399)', () => {
  const html = montarContratoAdesao({ ...DADOS, taxaImplantacao: '799.00', valorMensal: '399.00' })
  assert.match(html, /Taxa de implantação: R\$ 799,00/)
  assert.match(html, /mensalidade de R\$ 399,00 por CNPJ/)
})

test('com os termos confirmados, nenhum valor pendente sobra no contrato', () => {
  const pendentes = Object.entries(TERMOS).filter(([, v]) => String(v).includes('[a confirmar'))
  if (TERMOS_CONFIRMADOS) assert.deepEqual(pendentes, [])
  else assert.ok(pendentes.length > 0, 'com valores pendentes, TERMOS_CONFIRMADOS tem de ficar false')
})

test('contrato traz os termos fechados em 17/10/2026', () => {
  const html = montarContratoAdesao(DADOS)
  assert.match(html, /para pagamento por PIX ou boleto\./)
  assert.doesNotMatch(html, /cart[aã]o de cr[eé]dito|cart[aã]o de d[eé]bito/i)
  assert.doesNotMatch(html, /nota fiscal de servi[cç]o/i)
  assert.match(html, /das 9h às 12h e das 14h às 17h, respondendo em até 2 horas úteis/)
  assert.match(html, /backup\) do banco de dados do CLIENTE pelo menos uma vez por dia, mantida por no mínimo 7 dias\. Arquivos anexados/)
  assert.match(html, /limitada ao valor de uma mensalidade/)
  assert.match(html, /antes de completar 6 meses de vigência, paga multa de uma mensalidade/)
})

const ENVIO = { statusAdesao: 'dados_completos' as const, dados: DADOS, jaAssinado: false, producao: true, termosConfirmados: true }

test('envio liberado com dados completos e termos confirmados', () => {
  assert.equal(motivoBloqueioEnvio(ENVIO), null)
})

test('envio recusado sem dados completos', () => {
  assert.match(motivoBloqueioEnvio({ ...ENVIO, statusAdesao: 'pendente' })!, /dados do contrato/)
  assert.match(motivoBloqueioEnvio({ ...ENVIO, dados: { ...DADOS, email: null } })!, /dados do contrato/)
})

test('envio recusado quando a adesão já tem contrato assinado', () => {
  assert.match(motivoBloqueioEnvio({ ...ENVIO, jaAssinado: true })!, /já tem contrato assinado/)
})

test('termos não confirmados travam o envio só na produção', () => {
  assert.match(motivoBloqueioEnvio({ ...ENVIO, termosConfirmados: false })!, /travado na produção/)
  assert.equal(motivoBloqueioEnvio({ ...ENVIO, termosConfirmados: false, producao: false }), null)
})
