import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apagarZipsVencidos, type ArmazemZips } from './notas-contador-limpeza'

const AGORA = Date.parse('2026-10-26T12:00:00Z')
const dias = (n: number) => new Date(AGORA - n * 24 * 60 * 60 * 1000).toISOString()

// Bucket falso: pasta raiz lista as pastas (id null, como o Supabase); cada pasta lista seus arquivos.
function armazem(arquivos: Record<string, string | null>, quebradas: string[] = []): ArmazemZips & { removidos: string[] } {
  const restantes = new Map(Object.entries(arquivos))
  const removidos: string[] = []
  return {
    removidos,
    async listar(pasta, offset, limite) {
      if (quebradas.includes(pasta)) throw new Error('falha de rede')
      const nomes = pasta === ''
        ? [...new Set([...restantes.keys()].map(c => c.split('/')[0]))].map(name => ({ name, id: null, created_at: null }))
        : [...restantes].filter(([c]) => c.startsWith(`${pasta}/`)).map(([c, em]) => ({ name: c.slice(pasta.length + 1), id: c, created_at: em }))
      return nomes.slice(offset, offset + limite)
    },
    async remover(caminhos) { for (const c of caminhos) { restantes.delete(c); removidos.push(c) } },
  }
}

test('apaga só os zips com mais de 7 dias, de todas as pastas', async () => {
  const a = armazem({ 'g1/velho.zip': dias(8), 'g1/novo.zip': dias(1), 'g2/velho.zip': dias(30), 'g2/quase.zip': dias(6.9) })
  assert.deepEqual(await apagarZipsVencidos(a, AGORA), { apagados: 2, falhas: 0 })
  assert.deepEqual(a.removidos.sort(), ['g1/velho.zip', 'g2/velho.zip'])
})

test('percorre todas as páginas da listagem', async () => {
  const muitos = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`g1/z${i}.zip`, dias(10)]))
  const a = armazem({ ...muitos, 'g1/novo.zip': dias(0) })
  assert.deepEqual(await apagarZipsVencidos(a, AGORA), { apagados: 250, falhas: 0 })
})

test('pasta que falha ao listar volta contada, e as outras são limpas', async () => {
  const a = armazem({ 'g1/velho.zip': dias(8), 'g2/velho.zip': dias(8) }, ['g1'])
  assert.deepEqual(await apagarZipsVencidos(a, AGORA), { apagados: 1, falhas: 1 })
  assert.deepEqual(a.removidos, ['g2/velho.zip'])
})

test('raiz que falha ao listar: nada apagado, uma falha', async () => {
  assert.deepEqual(await apagarZipsVencidos(armazem({ 'g1/velho.zip': dias(8) }, ['']), AGORA), { apagados: 0, falhas: 1 })
})

test('arquivo sem data fica', async () => {
  const a = armazem({ 'g1/sem-data.zip': null })
  assert.deepEqual(await apagarZipsVencidos(a, AGORA), { apagados: 0, falhas: 0 })
})
