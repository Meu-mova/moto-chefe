import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linhasDespesa, competenciasEntre, type FontesDespesa } from './export-contabil'
import { somarDespesas, type ConfigDespesas } from './despesas-operacionais'

const CONFIG: ConfigDespesas = {
  categoriasForaDoCalculo: new Set(['Compra de Motos']),
  cnpjsForaDoCalculo: new Map([['53780554000115', 'compra_moto']]),
  nomesForaDoCalculo: new Map([['Ecomov', 'transferencia_interna']]),
  categoriasCaixaForaDoCalculo: new Set(['Depósito']),
  motivoPorCategoria: new Map([['Compra de Motos', 'compra_moto']]),
}

const LOJAS = new Map([['loja-1', 'Pouso Alegre']])
const nomeLoja = (id: string | null) => (id ? LOJAS.get(id) ?? '(loja removida)' : 'Geral (Empresa)')

const FONTES: FontesDespesa = {
  config: CONFIG,
  banco: [
    { data: new Date('2026-08-12T03:00:00.000Z'), banco: 'Sicoob Empresas', valor: '-1200.00',
      categoria: 'Energia elétrica', favorecidoNome: 'CEMIG', descricao: 'PAGAMENTO', lojaId: 'loja-1' },
    { data: new Date('2026-08-14T03:00:00.000Z'), banco: 'Stone Pagamentos Empresas', valor: '-50000.00',
      categoria: null, favorecidoNome: 'ECOMOV MOBILIDADE LTDA', descricao: 'Transferência | Pix | ECOMOV MOBILIDADE LTDA', lojaId: null },
    { data: new Date('2026-08-20T03:00:00.000Z'), banco: 'Sicoob Empresas', valor: '-31000.00',
      categoria: 'Compra de Motos', favorecidoNome: 'Q.P.A', descricao: null, lojaId: null },
  ],
  manuais: [
    { data: '2026-08-05', valor: '900.00', categoria: 'Aluguel', descricao: 'Aluguel loja',
      beneficiario: null, banco: null, formaPagamento: 'PIX', lojaId: 'loja-1' },
  ],
  caixa: [
    { data: '2026-08-07', valor: '80.00', categoria: 'Alimentação', descricao: 'Almoço equipe', lojaId: 'loja-1' },
    { data: '2026-08-09', valor: '5000.00', categoria: 'Depósito', descricao: null, lojaId: 'loja-1' },
  ],
}

test('cada fonte vira linha, rotulada por onde o dinheiro saiu', () => {
  const linhas = linhasDespesa(FONTES, nomeLoja)
  assert.equal(linhas.length, 6)
  assert.deepEqual(
    [...new Set(linhas.map(l => l.origem))].sort(),
    ['Caixa da loja', 'Extrato bancário', 'Lançamento manual'],
  )
})

test('a linha que é custo de operar a loja entra, e sem motivo', () => {
  const cemig = linhasDespesa(FONTES, nomeLoja).find(l => l.favorecido === 'CEMIG')!
  assert.equal(cemig.entraNoResultado, 'Sim')
  assert.equal(cemig.motivo, '')
  assert.equal(cemig.valor, 1200)
  assert.equal(cemig.loja, 'Pouso Alegre')
})

test('a que não é custo sai com o motivo escrito por extenso', () => {
  const linhas = linhasDespesa(FONTES, nomeLoja)
  const varredura = linhas.find(l => l.favorecido.includes('ECOMOV'))!
  assert.equal(varredura.entraNoResultado, 'Não')
  assert.equal(varredura.motivo, 'Transferência entre empresas do grupo')

  const fabrica = linhas.find(l => l.categoria === 'Compra de Motos')!
  assert.equal(fabrica.entraNoResultado, 'Não')
  assert.equal(fabrica.motivo, 'Compra de moto')

  const deposito = linhas.find(l => l.categoria === 'Depósito')!
  assert.equal(deposito.entraNoResultado, 'Não')
  assert.equal(deposito.motivo, 'Depósito do caixa no banco')
})

// O relatório existe para o contador conferir o DRE. Se a soma da coluna de
// valor das linhas "Sim" não for exatamente o total do card, o relatório
// desmente a tela — que é o único jeito de ele não servir para nada.
test('a soma das linhas que entram é igual ao total do DRE', () => {
  const linhas = linhasDespesa(FONTES, nomeLoja)
  const soma = linhas.filter(l => l.entraNoResultado === 'Sim').reduce((s, l) => s + l.valor, 0)
  const resumo = somarDespesas(FONTES.banco, FONTES.manuais, FONTES.config, FONTES.caixa)
  assert.equal(soma, resumo.total)
})

// "2026-08-05" no new Date() é meia-noite UTC, que em Brasília é 21h do dia 4.
// Lançamento manual e caixa guardam a data como texto justamente por isso.
test('data de lançamento manual não volta um dia', () => {
  const aluguel = linhasDespesa(FONTES, nomeLoja).find(l => l.categoria === 'Aluguel')!
  assert.equal(aluguel.data, '05/08/2026')
})

test('saída sem loja é da empresa, não de uma loja em branco', () => {
  const varredura = linhasDespesa(FONTES, nomeLoja).find(l => l.favorecido.includes('ECOMOV'))!
  assert.equal(varredura.loja, 'Geral (Empresa)')
})

// Quem lança à mão às vezes digita sem o sinal e o extrato vem negativo. A
// planilha tem que somar, não abater.
test('valor sai sempre positivo, venha como vier', () => {
  for (const l of linhasDespesa(FONTES, nomeLoja)) assert.ok(l.valor > 0, `${l.categoria} veio ${l.valor}`)
})

// ── período da exportação ────────────────────────────────────────────────────

test('o período vai de um mês ao outro, inclusive', () => {
  assert.deepEqual(competenciasEntre('2026-07', '2026-08'), [
    { ano: 2026, mes: 7 },
    { ano: 2026, mes: 8 },
  ])
})

test('o mesmo mês nas duas pontas é um mês só', () => {
  assert.deepEqual(competenciasEntre('2026-08', '2026-08'), [{ ano: 2026, mes: 8 }])
})

test('a virada de ano não pula dezembro nem repete janeiro', () => {
  assert.deepEqual(competenciasEntre('2025-11', '2026-02'), [
    { ano: 2025, mes: 11 },
    { ano: 2025, mes: 12 },
    { ano: 2026, mes: 1 },
    { ano: 2026, mes: 2 },
  ])
})

// A rota lê isso da URL. Período inválido tem que virar 400, não uma consulta
// que varre o banco inteiro ou uma planilha vazia sem explicação.
test('período impossível ou grande demais é recusado', () => {
  assert.equal(competenciasEntre('2026-08', '2026-07'), null, 'invertido')
  assert.equal(competenciasEntre('2026-13', '2026-14'), null, 'mês 13')
  assert.equal(competenciasEntre('agosto', '2026-08'), null, 'texto solto')
  assert.equal(competenciasEntre('2026-8', '2026-09'), null, 'mês sem zero à esquerda')
  assert.equal(competenciasEntre('2025-01', '2026-08'), null, 'mais de 12 meses')
  assert.deepEqual(competenciasEntre('2025-09', '2026-08')?.length, 12, '12 meses passa')
})
