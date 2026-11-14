import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UFS } from '@/lib/sefaz/uf'
import { TABELA_DIFAL_PADRAO, aliquotaImportadoDoForm, numerosDifalDaUf, percentualValido, siglaUfValida } from './difal-ufs'

test('U1: a tabela padrão tem exatamente as 27 UFs, com base única', () => {
  assert.deepEqual(Object.keys(TABELA_DIFAL_PADRAO).sort(), UFS.map(u => u.sigla).sort())
  for (const p of Object.values(TABELA_DIFAL_PADRAO)) assert.equal(p.base, 'unica')
})

test('U1: todo número padrão tem fonte com URL e data de conferência', () => {
  for (const [uf, p] of Object.entries(TABELA_DIFAL_PADRAO)) {
    const temNumero = p.aliquotaInterna !== null || p.fcp !== null
    if (!temNumero) { assert.equal(p.fonte, null, uf); continue }
    assert.match(p.fonte ?? '', /https?:\/\//, uf)
    assert.match(p.conferidoEm ?? '', /^\d{4}-\d{2}-\d{2}$/, uf)
    assert.ok(p.aliquotaInterna === null || percentualValido(p.aliquotaInterna), uf)
  }
})

test('U1: só UF com alíquota confirmada em fonte oficial tem número (Luis, 14/11)', () => {
  const comNumero = Object.entries(TABELA_DIFAL_PADRAO).filter(([, p]) => p.aliquotaInterna !== null).map(([uf]) => uf).sort()
  assert.deepEqual(comNumero, ['AC', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MG', 'MS', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RO', 'RR', 'RS', 'SC', 'SP', 'TO'])
  // Parciais e sem fonte aberta ficam sem número: o grupo preenche com o contador.
  for (const uf of ['MT', 'AL', 'RN', 'SE', 'MA'] as const) assert.equal(TABELA_DIFAL_PADRAO[uf].aliquotaInterna, null, uf)
})

test('U1: FCP 0 só onde a lei foi lida; null onde não foi conferido', () => {
  const fcp = (v: number | null) => Object.entries(TABELA_DIFAL_PADRAO).filter(([, p]) => p.aliquotaInterna !== null && p.fcp === v).map(([uf]) => uf).sort()
  assert.deepEqual(fcp(0), ['AC', 'AP', 'BA', 'CE', 'MS', 'PB', 'PE', 'PI', 'RO', 'RR', 'RS', 'TO'])
  assert.deepEqual(fcp(null), ['AM', 'DF', 'ES', 'GO', 'MG', 'PA', 'PR', 'RJ', 'SC', 'SP'])
})

test('U1: moto 8711 a 12% onde a lei dá alíquota própria (BA, RS, RR, SC)', () => {
  for (const uf of ['BA', 'RS', 'RR', 'SC'] as const) assert.equal(TABELA_DIFAL_PADRAO[uf].aliquotaInterna, 12, uf)
})

test('U2: UF sem correção devolve o padrão', () => {
  const n = numerosDifalDaUf('SP', [])
  assert.deepEqual(n && { a: n.aliquotaInterna, f: n.fcp, b: n.base, o: n.origem }, { a: 18, f: null, b: 'unica', o: 'padrao' })
})

test('U2: UF sem número padrão devolve nulos, para a NF travar', () => {
  const n = numerosDifalDaUf('MA', [])
  assert.deepEqual(n && { a: n.aliquotaInterna, f: n.fcp, o: n.origem }, { a: null, f: null, o: 'padrao' })
})

test('U3: UF corrigida devolve a correção e o padrão junto', () => {
  const n = numerosDifalDaUf('SP', [{ uf: 'SP', aliquotaInterna: 18, fcp: 2, base: 'dupla' }, { uf: 'RJ', aliquotaInterna: 20, fcp: 2, base: 'unica' }])
  assert.deepEqual(n && { a: n.aliquotaInterna, f: n.fcp, b: n.base, o: n.origem, p: n.padrao.fcp }, { a: 18, f: 2, b: 'dupla', o: 'corrigido', p: null })
})

test('U4: sigla em minúscula ou com espaço é normalizada; sigla inválida dá null', () => {
  assert.equal(numerosDifalDaUf(' rj ', [{ uf: 'RJ', aliquotaInterna: 20, fcp: 2, base: 'unica' }])?.origem, 'corrigido')
  assert.equal(numerosDifalDaUf('XX', []), null)
  assert.equal(siglaUfValida('mg'), 'MG')
})

test('D7 (puro): percentual de 0 a 100 com até 2 casas', () => {
  for (const ok of [0, 4, 4.1, 20.5, 19.75, 100]) assert.ok(percentualValido(ok), String(ok))
  for (const ruim of [-1, 100.01, 4.123, NaN, Infinity]) assert.ok(!percentualValido(ruim), String(ruim))
})

test('D6 (puro): campo do importado: ausente não mexe, vazio limpa, vírgula vira ponto, fora da faixa recusa', () => {
  assert.deepEqual(aliquotaImportadoDoForm(undefined), { ok: true, valor: undefined })
  assert.deepEqual(aliquotaImportadoDoForm('  '), { ok: true, valor: null })
  assert.deepEqual(aliquotaImportadoDoForm('4,00'), { ok: true, valor: '4.00' })
  for (const ruim of ['101', '-4', '4,123', 'quatro', '4%']) assert.equal(aliquotaImportadoDoForm(ruim).ok, false, ruim)
})
