import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  motivoForaDoCalculo,
  somarDespesas,
  valorDespesa,
  soDigitos,
  type ConfigDespesas,
} from './despesas-operacionais'

const CONFIG: ConfigDespesas = {
  categoriasForaDoCalculo: new Set(['Compra de Motos', 'Retiradas', 'Transferencia entre Lojas']),
  cnpjsForaDoCalculo: new Map([
    ['53780554000115', 'compra_moto'],
    ['09089839000112', 'compra_moto'],
    ['57113017000172', 'transferencia_interna'],  // CNPJ do grupo Sul de Minas
    ['63009605000163', 'transferencia_interna'],  // CNPJ do grupo BH
  ]),
}

const saida = (over: Partial<Parameters<typeof motivoForaDoCalculo>[0]> = {}) => ({
  valor: '-100.00',
  categoria: null,
  favorecidoNome: null,
  descricao: null,
  ...over,
})

// ── o que fica de fora ───────────────────────────────────────────────────────

test('categoria marcada fica de fora', () => {
  assert.equal(motivoForaDoCalculo(saida({ categoria: 'Compra de Motos' }), CONFIG), 'categoria_marcada')
})

test('CNPJ da fábrica no favorecido, formatado como o extrato manda', () => {
  const s = saida({ favorecidoNome: '53.780.554 0001-15' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'compra_moto')
})

test('CNPJ da fábrica no meio da descrição do PIX', () => {
  const s = saida({ descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@09.089.839 0001-12|@motos' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'compra_moto')
})

test('retirada de sócio pega pela descrição, mesmo sem categoria', () => {
  const s = saida({ descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@***.855.106-**|@Retirada Cesar abril' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'retirada_socio')
})

// ── o que continua contando ──────────────────────────────────────────────────

test('saída comum é despesa operacional', () => {
  assert.equal(motivoForaDoCalculo(saida({ categoria: 'Aluguel' }), CONFIG), null)
})

test('saída sem categoria nenhuma continua contando', () => {
  assert.equal(motivoForaDoCalculo(saida({ descricao: 'DÉB.TÍTULO COBRANÇA - Posto galpão' }), CONFIG), null)
})

// ── transferência entre as empresas do grupo ─────────────────────────────────
// Sai do caixa de uma e entra no da outra: contando dos dois lados, o grupo
// "gasta" um dinheiro que nunca saiu do grupo.

test('BH mandando pro CNPJ do Sul de Minas fica de fora', () => {
  const s = saida({ descricao: 'PAGAMENTO PIX 57113017000172 MOTOCHEFE SUL DE MINAS LTDA' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'transferencia_interna')
})

test('Sul de Minas mandando pro CNPJ de BH fica de fora', () => {
  const s = saida({ favorecidoNome: '63.009.605 0001-63' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'transferencia_interna')
})

test('transferência de mesma titularidade também', () => {
  const s = saida({ descricao: "TRANSF.REALIZADA PIX SICOOB-MESMA TIT. - FAV.: ECOMOV MOBILIDADE LTDA|@57.113.017 0001-72|@" })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'transferencia_interna')
})

// As cinco transferências de abril a junho nunca foram categorizadas — é por isso que
// a regra vai por CNPJ e não só pela categoria.
test('transferência sem categoria nenhuma fica de fora pelo CNPJ', () => {
  const s = saida({ categoria: null, descricao: 'PAGAMENTO PIX 57113017000172 ECOMOV MOBILIDADE ELETRICA' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'transferencia_interna')
})

test('CNPJ parecido mas diferente não é confundido com o da fábrica', () => {
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: '53.780.554 0001-16' }), CONFIG), null)
})

test('"aposentadoria" não é lida como retirada', () => {
  assert.equal(motivoForaDoCalculo(saida({ descricao: 'INSS aposentadoria' }), CONFIG), null)
})

// As categorias com nome de pessoa (Cesar, João, Luis Paulo...) misturam salário e
// retirada na MESMA categoria. Marcar a categoria inteira como não-operacional tirava
// salário do card — quem separa é a descrição, transação a transação.
test('salário na categoria com nome de pessoa continua sendo despesa', () => {
  const s = saida({ categoria: 'Luis Paulo', descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@***.484.886-**|@Salario Luiz Paulo' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), null)
})

test('retirada na mesma categoria com nome de pessoa fica de fora', () => {
  const s = saida({ categoria: 'Luis Paulo', descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@***.484.886-**|@retirada Arouca' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'retirada_socio')
})

// ── sinal ────────────────────────────────────────────────────────────────────

test('valor negativo do extrato e positivo digitado à mão viram a mesma despesa', () => {
  assert.equal(valorDespesa('-1500.00'), 1500)
  assert.equal(valorDespesa('1500.00'), 1500)
})

test('soDigitos limpa a formatação do CNPJ', () => {
  assert.equal(soDigitos('53.780.554 0001-15'), '53780554000115')
})

// ── soma ─────────────────────────────────────────────────────────────────────

test('soma banco + manuais e separa o que ficou de fora', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-1000.00', categoria: 'Aluguel' }),
      saida({ valor: '-500.00', categoria: 'Marketing' }),
      saida({ valor: '-250000.00', favorecidoNome: '53.780.554 0001-15' }),  // fábrica
      saida({ valor: '-30000.00', descricao: 'Retirada Cesar abril' }),      // sócio
    ],
    [
      { valor: '-200.00', categoria: 'Aluguel' },   // conta paga fora do Open Finance
      { valor: '1900.00', categoria: 'Marketing' }, // digitado sem o sinal
    ],
    CONFIG,
  )

  assert.equal(r.total, 1000 + 500 + 200 + 1900)
  assert.equal(r.foraDoCalculo.compra_moto, 250000)
  assert.equal(r.foraDoCalculo.retirada_socio, 30000)
  assert.deepEqual(r.porCategoria, [
    { categoria: 'Marketing', total: 2400 },
    { categoria: 'Aluguel', total: 1200 },
  ])
})

test('saída sem categoria aparece agrupada como "Sem categoria"', () => {
  const r = somarDespesas([saida({ valor: '-80.00' })], [], CONFIG)
  assert.deepEqual(r.porCategoria, [{ categoria: 'Sem categoria', total: 80 }])
})

test('lançamento manual com categoria marcada também fica de fora', () => {
  const r = somarDespesas([], [{ valor: '-5000.00', categoria: 'Compra de Motos' }], CONFIG)
  assert.equal(r.total, 0)
  assert.equal(r.foraDoCalculo.categoria_marcada, 5000)
})

test('sem nada no período o total é zero', () => {
  const r = somarDespesas([], [], CONFIG)
  assert.equal(r.total, 0)
  assert.deepEqual(r.porCategoria, [])
})

// ── caixa da loja ────────────────────────────────────────────────────────────
// O administrativo paga contas com o dinheiro da gaveta. Isso nunca aparece no
// extrato, então sem somar o caixa a despesa em espécie sumia do resultado —
// eram R$ 9.373,13 fora do fechamento de julho/2026.

const CONFIG_CAIXA: ConfigDespesas = {
  ...CONFIG,
  categoriasCaixaForaDoCalculo: new Set(['Depósito', 'Transferencia entre lojas']),
}

test('despesa paga em dinheiro entra no total', () => {
  const r = somarDespesas([], [], CONFIG_CAIXA, [
    { valor: '150.00', categoria: 'Alimentação' },
    { valor: '80.00', categoria: 'Material oficina' },
  ])
  assert.equal(r.total, 230)
})

test('depósito não é despesa — só muda o dinheiro de lugar', () => {
  const r = somarDespesas([], [], CONFIG_CAIXA, [
    { valor: '110667.00', categoria: 'Depósito' },
    { valor: '51.00', categoria: 'Água' },
  ])
  assert.equal(r.total, 51)
  assert.equal(r.foraDoCalculo.caixa_nao_despesa, 110667)
})

test('transferência entre lojas pelo caixa também fica de fora', () => {
  const r = somarDespesas([], [], CONFIG_CAIXA, [
    { valor: '5000.00', categoria: 'Transferencia entre lojas' },
  ])
  assert.equal(r.total, 0)
  assert.equal(r.foraDoCalculo.caixa_nao_despesa, 5000)
})

test('caixa soma na mesma categoria do banco, sem criar linha duplicada', () => {
  const r = somarDespesas(
    [saida({ valor: '-300.00', categoria: 'Manutenção' })],
    [],
    CONFIG_CAIXA,
    [{ valor: '200.00', categoria: 'Manutenção' }],
  )
  assert.deepEqual(r.porCategoria, [{ categoria: 'Manutenção', total: 500 }])
})

test('caixa entra no rateio por loja', () => {
  const r = somarDespesas([], [], CONFIG_CAIXA, [
    { valor: '100.00', categoria: 'Alimentação', lojaId: 'loja-1' },
    { valor: '40.00', categoria: 'Alimentação', lojaId: 'loja-2' },
  ])
  assert.equal(r.porLoja.get('loja-1'), 100)
  assert.equal(r.porLoja.get('loja-2'), 40)
})

test('sem a configuração de caixa, nada é excluído por engano', () => {
  const r = somarDespesas([], [], CONFIG, [{ valor: '90.00', categoria: 'Alimentação' }])
  assert.equal(r.total, 90)
})

// ── Geral (Empresa) por categoria ────────────────────────────────────────────
// A despesa sem loja atribuída é a maior fatia do mês. Sem quebrar por categoria
// ela fica como um número só, impossível de discutir no fechamento.

test('separa por categoria só o que não tem loja', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-1000.00', categoria: 'Aluguel' }),                      // sem loja
      saida({ valor: '-300.00',  categoria: 'Marketing' }),                    // sem loja
      saida({ valor: '-500.00',  categoria: 'Aluguel', lojaId: 'loja-1' }),    // de loja
    ],
    [],
    CONFIG,
  )
  assert.deepEqual(r.porCategoriaGeral, [
    { categoria: 'Aluguel', total: 1000 },
    { categoria: 'Marketing', total: 300 },
  ])
  // o total por categoria continua somando tudo
  assert.deepEqual(r.porCategoria, [
    { categoria: 'Aluguel', total: 1500 },
    { categoria: 'Marketing', total: 300 },
  ])
})

test('a soma do geral por categoria bate com o porLoja[null]', () => {
  const r = somarDespesas(
    [saida({ valor: '-700.00', categoria: 'Aluguel' }), saida({ valor: '-200.00', categoria: 'Internet' })],
    [],
    CONFIG,
  )
  const soma = r.porCategoriaGeral.reduce((s, c) => s + c.total, 0)
  assert.equal(soma, r.porLoja.get(null))
})

test('tudo com loja atribuída deixa o geral vazio', () => {
  const r = somarDespesas([saida({ valor: '-100.00', categoria: 'Água', lojaId: 'loja-1' })], [], CONFIG)
  assert.deepEqual(r.porCategoriaGeral, [])
})

// ── Categorias de cada loja ──────────────────────────────────────────────────

test('cada loja tem as próprias categorias, da maior pra menor', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-500.00',  categoria: 'Aluguel',  lojaId: 'loja-1' }),
      saida({ valor: '-1200.00', categoria: 'Salários', lojaId: 'loja-1' }),
      saida({ valor: '-100.00',  categoria: 'Aluguel',  lojaId: 'loja-1' }),
      saida({ valor: '-300.00',  categoria: 'Aluguel',  lojaId: 'loja-2' }),
      saida({ valor: '-900.00',  categoria: 'Internet' }),                     // sem loja
    ],
    [],
    CONFIG,
  )
  assert.deepEqual(r.porCategoriaPorLoja.get('loja-1'), [
    { categoria: 'Salários', total: 1200 },
    { categoria: 'Aluguel', total: 600 },
  ])
  assert.deepEqual(r.porCategoriaPorLoja.get('loja-2'), [
    { categoria: 'Aluguel', total: 300 },
  ])
})

test('o que não tem loja não entra em loja nenhuma', () => {
  const r = somarDespesas([saida({ valor: '-900.00', categoria: 'Contabilidade' })], [], CONFIG)
  assert.equal(r.porCategoriaPorLoja.size, 0)
  assert.deepEqual(r.porCategoriaGeral, [{ categoria: 'Contabilidade', total: 900 }])
})

test('a soma das categorias da loja bate com o porLoja dela', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-500.00', categoria: 'Aluguel', lojaId: 'loja-1' }),
      saida({ valor: '-250.00', categoria: 'Energia', lojaId: 'loja-1' }),
    ],
    [{ valor: '-125.00', categoria: 'Água', lojaId: 'loja-1' }],
    CONFIG,
  )
  const soma = (r.porCategoriaPorLoja.get('loja-1') ?? []).reduce((s, c) => s + c.total, 0)
  assert.equal(soma, r.porLoja.get('loja-1'))
  assert.equal(soma, 875)
})

test('despesa não operacional não entra nas categorias da loja', () => {
  // Mesmo motivo do card Geral: retirada de sócio é distribuição de lucro, não
  // custo de operar — some do quadro de custos e vai pro de Retiradas.
  const r = somarDespesas(
    [
      saida({ valor: '-500.00',  categoria: 'Aluguel', lojaId: 'loja-1' }),
      saida({ valor: '-4000.00', categoria: 'Retiradas', lojaId: 'loja-1' }),
    ],
    [],
    CONFIG,
  )
  assert.deepEqual(r.porCategoriaPorLoja.get('loja-1'), [{ categoria: 'Aluguel', total: 500 }])
})

// ── Motivo por categoria ─────────────────────────────────────────────────────
// Categoria com nome de sócio é retirada; compra de moto é mercadoria. Sem
// separar o motivo, tudo caía em 'categoria_marcada' e o quadro de retiradas
// teria que adivinhar quais categorias são de sócio pelo nome.

const CONFIG_MOTIVO: ConfigDespesas = {
  categoriasForaDoCalculo: new Set(['Cesar', 'Mateus', 'Compra de Motos']),
  cnpjsForaDoCalculo: new Map(),
  motivoPorCategoria: new Map<string, 'retirada_socio' | 'compra_moto'>([
    ['Cesar', 'retirada_socio'],
    ['Mateus', 'retirada_socio'],
    ['Compra de Motos', 'compra_moto'],
  ]),
}

test('categoria de sócio conta como retirada, não como "categoria marcada"', () => {
  const r = somarDespesas([saida({ valor: '-13000.00', categoria: 'Mateus' })], [], CONFIG_MOTIVO)
  assert.equal(r.foraDoCalculo.retirada_socio, 13000)
  assert.equal(r.foraDoCalculo.categoria_marcada, 0)
})

test('quebra o que ficou fora por categoria e motivo', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-66956.52', categoria: 'Cesar' }),
      saida({ valor: '-13652.17', categoria: 'Mateus' }),
      saida({ valor: '-250000.00', categoria: 'Compra de Motos' }),
    ],
    [],
    CONFIG_MOTIVO,
  )
  const retiradas = r.foraPorCategoria.filter(f => f.motivo === 'retirada_socio')
  assert.deepEqual(retiradas, [
    { motivo: 'retirada_socio', categoria: 'Cesar', total: 66956.52 },
    { motivo: 'retirada_socio', categoria: 'Mateus', total: 13652.17 },
  ])
  assert.equal(r.foraPorCategoria.find(f => f.motivo === 'compra_moto')?.total, 250000)
})

test('mesma categoria em origens diferentes soma numa linha só', () => {
  const r = somarDespesas(
    [saida({ valor: '-1000.00', categoria: 'Cesar' })],
    [{ valor: '-500.00', categoria: 'Cesar' }],
    CONFIG_MOTIVO,
  )
  const cesar = r.foraPorCategoria.filter(f => f.categoria === 'Cesar')
  assert.equal(cesar.length, 1)
  assert.equal(cesar[0].total, 1500)
})

test('sem o mapa de motivos, o comportamento antigo se mantém', () => {
  const r = somarDespesas([saida({ valor: '-5000.00', categoria: 'Compra de Motos' })], [], CONFIG)
  assert.equal(r.foraDoCalculo.categoria_marcada, 5000)
})

test('retirada detectada pela descrição também aparece na quebra', () => {
  const r = somarDespesas([saida({ valor: '-30000.00', descricao: 'Retirada Cesar abril' })], [], CONFIG_MOTIVO)
  const f = r.foraPorCategoria.find(x => x.motivo === 'retirada_socio')
  assert.equal(f?.total, 30000)
  assert.equal(f?.categoria, 'Sem categoria')
})

// Estorno ao cliente sai do custo operacional: a entrada correspondente já foi
// contada como receita, e o estorno apenas a desfaz.
test('categoria marcada pega mesmo com grafia diferente de caixa', () => {
  const config = {
    categoriasForaDoCalculo: new Set(['Estorno ao Cliente']),
    cnpjsForaDoCalculo: new Map(),
    motivoPorCategoria: new Map([['Estorno ao Cliente', 'estorno_cliente' as const]]),
  }
  // O catálogo tem uma grafia e o lançamento tem outra — foi exatamente o que
  // fez o estorno continuar entrando no custo.
  const saida = { valor: 298, categoria: 'Estorno ao CLIENTE', favorecidoNome: null, descricao: null }
  assert.equal(motivoForaDoCalculo(saida, config), 'estorno_cliente')

  const comEspaco = { ...saida, categoria: '  estorno ao cliente  ' }
  assert.equal(motivoForaDoCalculo(comEspaco, config), 'estorno_cliente')
})

test('categoria fora do cálculo sem motivo cadastrado cai no genérico', () => {
  const config = {
    categoriasForaDoCalculo: new Set(['Alguma Coisa']),
    cnpjsForaDoCalculo: new Map(),
  }
  const saida = { valor: 10, categoria: 'ALGUMA COISA', favorecidoNome: null, descricao: null }
  assert.equal(motivoForaDoCalculo(saida, config), 'categoria_marcada')
})

// "Despesa lançada manual" marca a saída do banco cuja despesa já foi digitada
// à mão na outra aba. Sem tirá-la do cálculo, o mesmo gasto entra duas vezes:
// uma pela linha do extrato e outra pelo lançamento manual.
test('saída já lançada manualmente não conta como despesa operacional', () => {
  const config = {
    categoriasForaDoCalculo: new Set(['Despesa lançada manual']),
    cnpjsForaDoCalculo: new Map(),
    motivoPorCategoria: new Map([['Despesa lançada manual', 'ja_lancada_manual' as const]]),
  }
  const saida = { valor: 9253.88, categoria: 'Despesa lançada manual', favorecidoNome: null, descricao: null }
  assert.equal(motivoForaDoCalculo(saida, config), 'ja_lancada_manual')
})

test('transferência entre lojas continua fora, com motivo de transferência interna', () => {
  const config = {
    categoriasForaDoCalculo: new Set(['Transferencia entre Lojas']),
    cnpjsForaDoCalculo: new Map(),
    motivoPorCategoria: new Map([['Transferencia entre Lojas', 'transferencia_interna' as const]]),
  }
  const saida = { valor: 10909, categoria: 'Transferencia entre Lojas', favorecidoNome: null, descricao: null }
  assert.equal(motivoForaDoCalculo(saida, config), 'transferencia_interna')
})

// ── exclusão por NOME do favorecido ──────────────────────────────────────────
// A Stone não manda CNPJ nenhum no extrato: o payload do Open Finance vem
// `{"paymentMethod":"PIX","receiver":"Q.P.A DISTRIBUICAO LTDA"}`. A regra de
// CNPJ (a única que existia) não alcança nada dessa conta — as duas fábricas
// (R$ 761 mil) e a varredura pra conta própria (R$ 548 mil) entravam como custo
// de operar a loja. Por isso o favorecido passou a ter também um nome.

const CONFIG_NOME: ConfigDespesas = {
  categoriasForaDoCalculo: new Set(),
  cnpjsForaDoCalculo: new Map(),
  nomesForaDoCalculo: new Map([
    ['Q.P.A Distribuicao', 'compra_moto'],
    ['Laiouns', 'compra_moto'],
    ['Ecomov', 'transferencia_interna'],
    ['Motochefe', 'transferencia_interna'],
  ]),
}

test('fábrica sai pelo nome quando o extrato não traz CNPJ', () => {
  const s = saida({ favorecidoNome: 'Q.P.A DISTRIBUICAO LTDA', descricao: 'Transferência | Pix | Q.P.A DISTRIBUICAO LTDA' })
  assert.equal(motivoForaDoCalculo(s, CONFIG_NOME), 'compra_moto')
})

// O cadastro escreve "Q.P.A Distribuição" e o extrato "Q.P.A DISTRIBUICAO
// LTDA" — ponto, acento e caixa diferentes. Comparar os dois crus não casa
// nunca, que é o mesmo motivo de o CNPJ ser guardado só com dígitos.
test('nome casa sem acento, sem pontuação e sem caixa', () => {
  const config: ConfigDespesas = {
    categoriasForaDoCalculo: new Set(),
    cnpjsForaDoCalculo: new Map(),
    nomesForaDoCalculo: new Map([['Q.P.A Distribuição', 'compra_moto']]),
  }
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: 'Q.P.A DISTRIBUICAO LTDA' }), config), 'compra_moto')
})

test('varredura da maquininha pra conta própria é transferência interna', () => {
  const s = saida({ valor: '-50000.00', descricao: 'Transferência | Pix | ECOMOV MOBILIDADE LTDA' })
  assert.equal(motivoForaDoCalculo(s, CONFIG_NOME), 'transferencia_interna')
})

test('favorecido que não está na lista continua sendo despesa', () => {
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: 'CEMIG DISTRIBUICAO S.A' }), CONFIG_NOME), null)
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: 'MINISTERIO DA FAZENDA' }), CONFIG_NOME), null)
})

// Linha sem nome cadastrado vira chave vazia, e `''` está contido em QUALQUER
// texto: sem o guarda, um único cadastro pela metade zeraria o card inteiro.
test('nome em branco no cadastro não tira todas as saídas do cálculo', () => {
  const config: ConfigDespesas = {
    categoriasForaDoCalculo: new Set(),
    cnpjsForaDoCalculo: new Map(),
    nomesForaDoCalculo: new Map([['', 'compra_moto'], ['   ', 'compra_moto']]),
  }
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: 'POSTO BARRA LIMPA LTDA' }), config), null)
})

test('a soma separa a varredura da despesa real da mesma conta', () => {
  const r = somarDespesas([
    saida({ valor: '-50000.00', descricao: 'Transferência | Pix | ECOMOV MOBILIDADE LTDA' }),
    saida({ valor: '-31579.24', favorecidoNome: 'Q.P.A DISTRIBUICAO LTDA' }),
    saida({ valor: '-1200.00', categoria: 'Energia elétrica', favorecidoNome: 'CEMIG DISTRIBUICAO S.A' }),
  ], [], CONFIG_NOME)

  assert.equal(r.total, 1200)
  assert.equal(r.foraDoCalculo.transferencia_interna, 50000)
  assert.equal(r.foraDoCalculo.compra_moto, 31579.24)
})
