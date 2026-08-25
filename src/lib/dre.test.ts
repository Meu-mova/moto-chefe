import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarDre, somarEntradas, grupoOuOutras, rotuloGrupo,
  GRUPOS_DRE, ENTRADA_VAZIA, montarMatriz, type EntradaDre,
} from './dre'

const valor = (linhas: ReturnType<typeof montarDre>, chave: string) =>
  linhas.find(l => l.chave === chave)?.valor

const BASE: EntradaDre = {
  receitaMotos: 1_505_190,
  receitaServicos: 15_260,
  receitaPecas: 5_644,
  taxasCartao: 38_204,
  cmvMotos: 915_205,
  despesasPorGrupo: { pessoal: 102_300, ocupacao: 41_200, administrativas: 31_400 },
}

test('as três receitas somam a receita bruta', () => {
  const l = montarDre(BASE)
  assert.equal(valor(l, 'receita_bruta'), 1_526_094)
})

test('receita líquida é a bruta menos as taxas de cartão', () => {
  const l = montarDre(BASE)
  assert.equal(valor(l, 'receita_liquida'), 1_526_094 - 38_204)
})

test('lucro bruto desconta o CMV das motos', () => {
  const l = montarDre(BASE)
  assert.equal(valor(l, 'lucro_bruto'), 1_526_094 - 38_204 - 915_205)
})

test('resultado operacional bate com a conta do /financeiro', () => {
  // faturamento líquido − custo − despesas. Se esta conta mudar aqui e não lá,
  // as duas telas passam a discordar do mesmo mês.
  const l = montarDre(BASE)
  const faturamentoLiquido = 1_526_094 - 38_204
  const esperado = faturamentoLiquido - 915_205 - (102_300 + 41_200 + 31_400)
  assert.equal(valor(l, 'resultado'), esperado)
  assert.equal(valor(l, 'despesas_total'), 174_900)
})

test('os oito grupos aparecem sempre, mesmo zerados', () => {
  // A visão por loja zipa as colunas pela chave: linha que some numa coluna
  // desalinha a tabela inteira.
  const l = montarDre({ ...BASE, despesasPorGrupo: {} })
  for (const g of GRUPOS_DRE) {
    const linha = l.find(x => x.chave === `despesa_${g.valor}`)
    assert.ok(linha, `faltou o grupo ${g.valor}`)
    assert.equal(linha.valor, 0)
  }
})

test('a ordem das linhas não depende dos valores', () => {
  const a = montarDre(BASE).map(l => l.chave)
  const b = montarDre(ENTRADA_VAZIA).map(l => l.chave)
  assert.deepEqual(a, b)
})

test('percentual é sobre a receita líquida', () => {
  const l = montarDre({ ...ENTRADA_VAZIA, receitaMotos: 1000, despesasPorGrupo: { pessoal: 250 } })
  assert.equal(l.find(x => x.chave === 'receita_liquida')?.percentual, 100)
  assert.equal(l.find(x => x.chave === 'despesa_pessoal')?.percentual, 25)
})

test('sem receita o percentual é zero, não infinito', () => {
  // O recorte Geral (Empresa) não tem receita — só despesa de estrutura.
  const l = montarDre({ ...ENTRADA_VAZIA, despesasPorGrupo: { administrativas: 12_000 } })
  const pessoal = l.find(x => x.chave === 'despesa_administrativas')
  assert.equal(pessoal?.percentual, 0)
  assert.equal(valor(l, 'resultado'), -12_000)
})

test('memorando não entra no resultado', () => {
  const semMemo = montarDre(BASE)
  const comMemo = montarDre({ ...BASE, memorando: { retiradasSocios: 90_000, compraMercadoria: 700_000 } })
  assert.equal(valor(comMemo, 'resultado'), valor(semMemo, 'resultado'))
  assert.equal(valor(comMemo, 'memo_retiradas'), 90_000)
})

test('memorando ausente vira zeros, não linhas faltando', () => {
  const l = montarDre(BASE)
  assert.equal(l.filter(x => x.tipo === 'memo').length, 4)
  assert.equal(valor(l, 'memo_retiradas'), 0)
})

test('somar entradas acumula receita, custo e cada grupo', () => {
  const a: EntradaDre = { ...ENTRADA_VAZIA, receitaMotos: 100, cmvMotos: 60, despesasPorGrupo: { pessoal: 10 } }
  const b: EntradaDre = { ...ENTRADA_VAZIA, receitaMotos: 200, cmvMotos: 130, despesasPorGrupo: { pessoal: 5, ocupacao: 7 } }
  const r = somarEntradas(a, b)
  assert.equal(r.receitaMotos, 300)
  assert.equal(r.cmvMotos, 190)
  assert.deepEqual(r.despesasPorGrupo, { pessoal: 15, ocupacao: 7 })
})

test('somar mantém o resultado igual à soma dos resultados', () => {
  const a: EntradaDre = { ...ENTRADA_VAZIA, receitaMotos: 1000, cmvMotos: 600, despesasPorGrupo: { pessoal: 100 } }
  const b: EntradaDre = { ...ENTRADA_VAZIA, receitaMotos: 500, cmvMotos: 300, despesasPorGrupo: { ocupacao: 50 } }
  const rA = valor(montarDre(a), 'resultado')!
  const rB = valor(montarDre(b), 'resultado')!
  assert.equal(valor(montarDre(somarEntradas(a, b)), 'resultado'), rA + rB)
})

test('categoria sem grupo cai em Outras em vez de sumir', () => {
  assert.equal(grupoOuOutras(null), 'outras')
  assert.equal(grupoOuOutras(''), 'outras')
  assert.equal(grupoOuOutras('grupo_que_nao_existe'), 'outras')
  assert.equal(grupoOuOutras('pessoal'), 'pessoal')
})

test('rótulo desconhecido não vira vazio', () => {
  assert.equal(rotuloGrupo('pessoal'), 'Pessoal')
  assert.equal(rotuloGrupo('zzz'), 'zzz')
})

test('a matriz alinha as mesmas linhas em todas as colunas', () => {
  const linhas = montarMatriz([
    { chave: 'a', rotulo: 'Loja A', entrada: { ...ENTRADA_VAZIA, receitaMotos: 1000, despesasPorGrupo: { pessoal: 100 } } },
    { chave: 'b', rotulo: 'Loja B', entrada: { ...ENTRADA_VAZIA, receitaMotos: 500, despesasPorGrupo: { ocupacao: 50 } } },
  ])
  const pessoal = linhas.find(l => l.chave === 'despesa_pessoal')
  assert.deepEqual(pessoal?.valores, [100, 0])
  const ocupacao = linhas.find(l => l.chave === 'despesa_ocupacao')
  assert.deepEqual(ocupacao?.valores, [0, 50])
  // toda linha tem um valor por coluna, sem buraco
  for (const l of linhas) assert.equal(l.valores.length, 2)
})

test('matriz sem coluna nenhuma é lista vazia, não estouro', () => {
  assert.deepEqual(montarMatriz([]), [])
})
