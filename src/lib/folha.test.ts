import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolverBaseComissao, isBaseComissao, isTipoAjuste, isTipoRegra,
  regraVigenteNoMes, calcularRegrasFolha, type TotaisBase, type RegraFolha,
} from './folha'
import { temPapel } from './auth'

const TOTAIS: TotaisBase = {
  propriasMotos:    100,
  propriasPecas:    200,
  propriosServicos: 300,
  lojaMotos:        1000,
  lojaPecas:        2000,
  lojaServicos:     3000,
}

// ─── base 'padrao' reproduz o comportamento histórico, derivado do papel ──────

test('padrão: vendedor comissiona sobre as motos dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'vendedor', TOTAIS), 100)
})

test('padrão: mecânico comissiona sobre a mão de obra dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'mecanico', TOTAIS), 300)
})

test('padrão: aux_adm comissiona sobre as peças dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'aux_adm', TOTAIS), 200)
})

test('padrão: papel sem comissão não tem base', () => {
  assert.equal(resolverBaseComissao('padrao', 'admin_socio', TOTAIS), 0)
})

// ─── bases explícitas ignoram o papel ────────────────────────────────────────

test('Charles: aux_adm com base nas motos da loja', () => {
  assert.equal(resolverBaseComissao('loja_motos', 'aux_adm', TOTAIS), 1000)
})

test('Pedro Henrique: aux_adm com base nas peças da loja', () => {
  assert.equal(resolverBaseComissao('loja_pecas', 'aux_adm', TOTAIS), 2000)
})

test('Tiago: aux_adm que vende, base nas motos dele', () => {
  assert.equal(resolverBaseComissao('proprias_motos', 'aux_adm', TOTAIS), 100)
})

test('base desconhecida cai no padrão em vez de zerar a comissão', () => {
  assert.equal(resolverBaseComissao('base_que_nao_existe', 'vendedor', TOTAIS), 100)
})

// ─── validação ───────────────────────────────────────────────────────────────

test('valida base de comissão contra a lista fechada', () => {
  assert.equal(isBaseComissao('loja_pecas'), true)
  assert.equal(isBaseComissao('loja_servicos'), true)
  assert.equal(isBaseComissao('base_inventada'), false)
})

test('valida tipo de regra contra a lista fechada', () => {
  assert.equal(isTipoRegra('comissao'), true)
  assert.equal(isTipoRegra('premiacao'), true)
  assert.equal(isTipoRegra('bonus'), false)
})

test('valida tipo de ajuste contra a lista fechada', () => {
  assert.equal(isTipoAjuste('servicos'), true)
  assert.equal(isTipoAjuste('outros'), false)
})

// ─── papéis acumulados ───────────────────────────────────────────────────────

test('papel principal conta', () => {
  assert.equal(temPapel({ papel: 'vendedor' }, 'vendedor'), true)
})

test('papel extra conta', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: ['vendedor'] }, 'vendedor'), true)
})

test('sem o papel, nem principal nem extra', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: [] }, 'vendedor'), false)
  assert.equal(temPapel({ papel: 'aux_adm' }, 'vendedor'), false)
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: null }, 'vendedor'), false)
})

test('papel extra não promove a admin por tabela', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: ['vendedor'] }, 'admin_geral'), false)
})

// ─── bases novas ─────────────────────────────────────────────────────────────

test('mão de obra da loja é base própria, separada da do mecânico', () => {
  assert.equal(resolverBaseComissao('loja_servicos', 'aux_adm', TOTAIS), 3000)
  assert.equal(resolverBaseComissao('proprios_servicos', 'aux_adm', TOTAIS), 300)
})

test('"tudo que a loja vendeu" soma motos, peças e mão de obra da loja', () => {
  assert.equal(resolverBaseComissao('loja_total', 'aux_adm', TOTAIS), 6000)
})

test('peças da própria pessoa é base explícita, não só o padrão do aux_adm', () => {
  assert.equal(resolverBaseComissao('proprias_pecas', 'vendedor', TOTAIS), 200)
})

// ─── vigência ────────────────────────────────────────────────────────────────

const regra = (over: Partial<RegraFolha> = {}): RegraFolha => ({
  id: 'r1', usuarioId: 'u1', tipo: 'comissao', base: 'proprias_pecas', percentual: '5',
  vigenciaInicio: null, vigenciaFim: null, descricao: null, ...over,
})

test('regra sem vigência vale em qualquer mês', () => {
  assert.equal(regraVigenteNoMes(regra(), '2020-01'), true)
  assert.equal(regraVigenteNoMes(regra(), '2030-12'), true)
})

test('regra só passa a valer do mês de início em diante', () => {
  const r = regra({ vigenciaInicio: '2026-09' })
  assert.equal(regraVigenteNoMes(r, '2026-08'), false)
  assert.equal(regraVigenteNoMes(r, '2026-09'), true)
  assert.equal(regraVigenteNoMes(r, '2026-10'), true)
})

test('mês de fim é inclusivo', () => {
  const r = regra({ vigenciaInicio: '2026-01', vigenciaFim: '2026-09' })
  assert.equal(regraVigenteNoMes(r, '2026-09'), true)
  assert.equal(regraVigenteNoMes(r, '2026-10'), false)
})

test('virada de ano compara certo (texto YYYY-MM ordena como data)', () => {
  const r = regra({ vigenciaInicio: '2026-12' })
  assert.equal(regraVigenteNoMes(r, '2027-01'), true)
  assert.equal(regraVigenteNoMes(r, '2026-11'), false)
})

// ─── várias regras por pessoa ────────────────────────────────────────────────

test('Julia: 5% das peças dela como comissão + 0,2% das motos da loja como premiação', () => {
  const r = calcularRegrasFolha([
    regra({ id: 'c', tipo: 'comissao',  base: 'proprias_pecas', percentual: '5' }),
    regra({ id: 'p', tipo: 'premiacao', base: 'loja_motos',     percentual: '0.2' }),
  ], 'aux_adm', TOTAIS, '2026-09')

  assert.equal(r.comissao, 10)     // 5% de 200
  assert.equal(r.premiacao, 2)     // 0,2% de 1000
  assert.equal(r.detalhes.length, 2)
  assert.equal(r.detalhes[0].valorBase, 200)
  assert.equal(r.detalhes[1].valorBase, 1000)
})

test('regras do mesmo tipo somam', () => {
  const r = calcularRegrasFolha([
    regra({ id: 'a', base: 'proprias_pecas', percentual: '5' }),
    regra({ id: 'b', base: 'loja_pecas',     percentual: '1' }),
  ], 'aux_adm', TOTAIS, '2026-09')
  assert.equal(r.comissao, 10 + 20)
  assert.equal(r.premiacao, 0)
})

test('regra fora da vigência não entra no mês nem no detalhamento', () => {
  const r = calcularRegrasFolha([
    regra({ id: 'a', percentual: '5' }),
    regra({ id: 'b', percentual: '99', vigenciaInicio: '2026-10' }),
  ], 'aux_adm', TOTAIS, '2026-09')
  assert.equal(r.comissao, 10)
  assert.equal(r.detalhes.length, 1)
  assert.equal(r.detalhes[0].id, 'a')
})

test('pessoa sem regra nenhuma zera, sem NaN', () => {
  const r = calcularRegrasFolha([], 'vendedor', TOTAIS, '2026-09')
  assert.equal(r.comissao, 0)
  assert.equal(r.premiacao, 0)
  assert.equal(r.detalhes.length, 0)
})

test('duas regras na mesma base somam — é decisão de quem cadastrou, não erro', () => {
  const r = calcularRegrasFolha([
    regra({ id: 'a', base: 'loja_motos', percentual: '1' }),
    regra({ id: 'b', base: 'loja_motos', percentual: '0.5' }),
  ], 'aux_adm', TOTAIS, '2026-09')
  assert.equal(r.comissao, 15)
})

test('percentual inválido não contamina o total com NaN', () => {
  const r = calcularRegrasFolha([regra({ percentual: 'abc' })], 'aux_adm', TOTAIS, '2026-09')
  assert.equal(r.comissao, 0)
})
