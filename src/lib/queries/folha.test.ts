import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarFolha, type DadosFolha } from './folha'

const VAZIO: DadosFolha = {
  funcionarios: [], configs: [], faixas: [],
  vendasPorVendedor: [], pecasPorVendedor: [], osPorMecanico: [], osPecasPorAbertaPor: [],
  motosPorLoja: [], pecasPorLoja: [], osPecasPorLoja: [], ajustes: [], adiantamentos: [], lojas: [], funcionariosGrupo: [],
}

const adiantamento = (over: Partial<DadosFolha['adiantamentos'][0]> = {}) => ({
  id: 'ad1', lojaId: 'L1', lojaNome: 'Pouso Alegre', usuarioId: 'u1', usuarioNome: 'Fulano',
  valor: '800', data: null, observacao: null, ...over,
})

const func = (over: Partial<DadosFolha['funcionarios'][0]> = {}) => ({
  id: 'u1', nome: 'Fulano', papel: 'vendedor', papeisExtras: [], lojaId: 'L1', lojaNome: 'Pouso Alegre', ...over,
})
const config = (over: Partial<DadosFolha['configs'][0]> = {}): DadosFolha['configs'][0] => ({
  usuarioId: 'u1', salario: '2000', comissaoPercentual: '1', ajudaCusto: null,
  adiantamentoFixo: null, ativo: true, baseComissao: 'padrao', ...over,
})

test('vendedor comissiona sobre as próprias motos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config()],
    vendasPorVendedor: [{ vendedorId: 'u1', total: '100000' }],
    motosPorLoja: [{ lojaId: 'L1', total: '500000' }],
  })
  assert.equal(r.ativos[0].baseComissao, 100000)   // as dele, não as da loja
  assert.equal(r.ativos[0].comissao, 1000)         // 1%
  assert.equal(r.ativos[0].totalPagar, 3000)       // salário + comissão
})

test('aux_adm com base de loja comissiona sobre o total da loja', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func({ papel: 'aux_adm' })],
    configs: [config({ baseComissao: 'loja_motos', comissaoPercentual: '0.5' })],
    vendasPorVendedor: [{ vendedorId: 'u1', total: '0' }],
    motosPorLoja: [{ lojaId: 'L1', total: '500000' }],
  })
  assert.equal(r.ativos[0].baseComissao, 500000)
  assert.equal(r.ativos[0].comissao, 2500)
})

test('mecânico comissiona só sobre mão de obra, não sobre peça da OS', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func({ papel: 'mecanico' })],
    configs: [config({ comissaoPercentual: '10' })],
    osPorMecanico: [{ mecanicoId: 'u1', total: '3000' }],
    osPecasPorAbertaPor: [{ abertaPor: 'u1', total: '9999' }],
  })
  assert.equal(r.ativos[0].baseComissao, 3000)
  assert.equal(r.ativos[0].comissao, 300)
})

test('mês sem venda nenhuma zera tudo, sem NaN', () => {
  const r = agregarFolha({ ...VAZIO, funcionarios: [func()], configs: [config()] })
  const f = r.ativos[0]
  for (const v of [f.baseComissao, f.comissao, f.premiacao]) {
    assert.equal(Number.isNaN(v), false)
    assert.equal(v, 0)
  }
  assert.equal(f.totalPagar, 2000)                 // só o salário
  assert.equal(r.totais.geral, 2000)
})

test('funcionário inativo sai dos ativos e dos totais, mas fica em todos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Inativo' })],
    configs: [config(), config({ usuarioId: 'u2', ativo: false, salario: '9999' })],
  })
  assert.equal(r.todos.length, 2)
  assert.equal(r.ativos.length, 1)
  assert.equal(r.totais.salarios, 2000)            // não soma o inativo
})

test('ajuste de venda soma na base da loja E na do funcionário apontado', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Colega' })],
    configs: [config({ baseComissao: 'loja_motos' }), config({ usuarioId: 'u2' })],
    motosPorLoja: [{ lojaId: 'L1', total: '1000' }],
    vendasPorVendedor: [{ vendedorId: 'u2', total: '1000' }],
    ajustes: [{ id: 'a1', lojaId: 'L1', lojaNome: 'Pouso Alegre', tipo: 'motos', usuarioId: 'u2', usuarioNome: 'Colega', valor: '500', observacao: null }],
  })
  const comBaseDeLoja = r.ativos.find(f => f.id === 'u1')!
  const apontado = r.ativos.find(f => f.id === 'u2')!
  assert.equal(comBaseDeLoja.baseComissao, 1500)   // loja recebeu o ajuste
  assert.equal(apontado.baseComissao, 1500)        // e o funcionário também
})

test('totais são a soma dos ativos', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Outro' })],
    configs: [config({ ajudaCusto: '300' }), config({ usuarioId: 'u2', salario: '1500' })],
  })
  assert.equal(r.totais.salarios, 3500)
  assert.equal(r.totais.ajudaCusto, 300)
  assert.equal(r.totais.geral, 3800)
})

// ── Adiantamento salarial ────────────────────────────────────────────────────

test('adiantamento desconta do total a pagar', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ comissaoPercentual: '0' })],
    adiantamentos: [adiantamento({ valor: '800' })],
  })
  assert.equal(r.ativos[0].adiantamento, 800)
  assert.equal(r.ativos[0].totalPagar, 1200)   // salário 2000 - 800
  assert.equal(r.totais.adiantamentos, 800)
  assert.equal(r.totais.geral, 1200)
})

test('dois adiantamentos no mesmo mês somam para a mesma pessoa', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ comissaoPercentual: '0' })],
    adiantamentos: [
      adiantamento({ id: 'ad1', valor: '300' }),
      adiantamento({ id: 'ad2', valor: '500' }),
    ],
  })
  assert.equal(r.ativos[0].adiantamento, 800)
  assert.equal(r.ativos[0].totalPagar, 1200)
})

test('adiantamento de outra pessoa não desconta de quem não pegou', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func(), func({ id: 'u2', nome: 'Colega' })],
    configs: [config(), config({ usuarioId: 'u2' })],
    adiantamentos: [adiantamento({ usuarioId: 'u2', valor: '900' })],
  })
  assert.equal(r.ativos[0].adiantamento, 0)
  assert.equal(r.ativos[1].adiantamento, 900)
})

test('adiantamento maior que a folha deixa o total negativo, sem esconder', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ salario: '500', comissaoPercentual: '0' })],
    adiantamentos: [adiantamento({ valor: '800' })],
  })
  assert.equal(r.ativos[0].totalPagar, -300)
})

test('adiantamento de funcionário inativo não entra no total geral', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ ativo: false })],
    adiantamentos: [adiantamento({ valor: '800' })],
  })
  assert.equal(r.totais.adiantamentos, 0)
  assert.equal(r.totais.geral, 0)
})

// ── Adiantamento fixo (vale que se repete todo mês) ──────────────────────────

test('adiantamento fixo desconta sem precisar de lançamento no mês', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ comissaoPercentual: '0', adiantamentoFixo: '500' })],
  })
  assert.equal(r.ativos[0].adiantamentoFixo, 500)
  assert.equal(r.ativos[0].adiantamentoEventual, 0)
  assert.equal(r.ativos[0].totalPagar, 1500)   // salário 2000 - 500
})

test('fixo e eventual se somam no mesmo mês', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ comissaoPercentual: '0', adiantamentoFixo: '500' })],
    adiantamentos: [adiantamento({ valor: '300' })],
  })
  assert.equal(r.ativos[0].adiantamentoFixo, 500)
  assert.equal(r.ativos[0].adiantamentoEventual, 300)
  assert.equal(r.ativos[0].adiantamento, 800)
  assert.equal(r.ativos[0].totalPagar, 1200)
  assert.equal(r.totais.adiantamentos, 800)
})

test('sem vale fixo cadastrado o desconto é só o do mês', () => {
  const r = agregarFolha({
    ...VAZIO,
    funcionarios: [func()],
    configs: [config({ comissaoPercentual: '0' })],
    adiantamentos: [adiantamento({ valor: '300' })],
  })
  assert.equal(r.ativos[0].adiantamentoFixo, 0)
  assert.equal(r.ativos[0].adiantamento, 300)
})
