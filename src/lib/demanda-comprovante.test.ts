// Comprovante do sinal da demanda: obrigatório, foto/PDF até 10MB, na pasta do grupo, 90 dias.
import test from 'node:test'
import assert from 'node:assert/strict'
import { caminhoComprovanteSinal, comprovanteSinalVigente, exigirComprovanteSinal } from './demanda-comprovante'
import { apagarArquivosVencidos, type Armazem } from './storage-limpeza'

const GRUPO = '11111111-2222-3333-4444-555555555555'
const arquivo = (type: string, size: number) => new File([new Uint8Array(size)], 'x', { type })

test('sem arquivo, o sinal não passa', () => {
  assert.throws(() => exigirComprovanteSinal(null), /Anexe o comprovante/)
  assert.throws(() => exigirComprovanteSinal(arquivo('image/png', 0)), /Anexe o comprovante/)
})

test('só foto ou PDF de até 10MB', () => {
  assert.throws(() => exigirComprovanteSinal(arquivo('text/plain', 10)), /Formato não suportado/)
  assert.throws(() => exigirComprovanteSinal(arquivo('application/pdf', 10 * 1024 * 1024 + 1)), /muito grande/)
  assert.equal(exigirComprovanteSinal(arquivo('application/pdf', 100)).ext, 'pdf')
  assert.equal(exigirComprovanteSinal(arquivo('image/jpeg', 100)).ext, 'jpg')
})

test('caminho nasce na pasta do grupo e recusa grupo que não é uuid', () => {
  assert.equal(caminhoComprovanteSinal(GRUPO, 'pdf', 'abc'), `demandas/${GRUPO}/abc.pdf`)
  assert.throws(() => caminhoComprovanteSinal('../caixa', 'pdf'), /Grupo inválido/)
})

test('abre até 90 dias do envio; sem envio, não abre', () => {
  const agora = new Date('2026-11-03T12:00:00Z')
  assert.equal(comprovanteSinalVigente(new Date('2026-08-06T12:00:01Z'), agora), true)
  assert.equal(comprovanteSinalVigente(new Date('2026-08-05T12:00:00Z'), agora), false)
  assert.equal(comprovanteSinalVigente(null, agora), false)
})

test('limpeza: só demandas/<grupo>/ com mais de 90 dias; o resto do bucket fica', async () => {
  const agora = Date.parse('2026-11-03T12:00:00Z')
  const velho = '2026-08-01T00:00:00Z'
  const novo = '2026-10-30T00:00:00Z'
  const arvore: Record<string, { name: string; id: string | null; created_at: string | null }[]> = {
    demandas: [{ name: 'g1', id: null, created_at: null }, { name: 'g2', id: null, created_at: null }],
    'demandas/g1': [{ name: 'a.pdf', id: '1', created_at: velho }, { name: 'b.pdf', id: '2', created_at: novo }],
    'demandas/g2': [{ name: 'c.jpg', id: '3', created_at: velho }],
    caixa: [{ name: 'saida.pdf', id: '4', created_at: velho }],
  }
  const listadas: string[] = []
  const removidos: string[] = []
  const a: Armazem = {
    async listar(pasta, offset) { listadas.push(pasta); return offset === 0 ? arvore[pasta] ?? [] : [] },
    async remover(c) { removidos.push(...c) },
  }
  const r = await apagarArquivosVencidos(a, { raiz: 'demandas', dias: 90 }, agora)
  assert.deepEqual(r, { apagados: 2, falhas: 0 })
  assert.deepEqual(removidos.sort(), ['demandas/g1/a.pdf', 'demandas/g2/c.jpg'])
  assert.ok(!listadas.includes('caixa') && !listadas.includes(''), 'não lista fora de demandas/')
})
