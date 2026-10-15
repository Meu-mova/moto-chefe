import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerTodasAsPaginas, vaziaSuspeita, TAMANHO_MAX_PAGINA_VAZIA, type BuscaPagina } from './paginacao-mcpai'

const chave = (n: number) => String(n)
const OPTS = { maxPaginas: 60, maxTentativas: 3 }

// Fonte fictícia: `itens` é a lista inteira; cada página tem `tam` itens.
function fonte(itens: number[], tam: number): BuscaPagina<number> {
  return async pagina => ({
    linhas: itens.slice((pagina - 1) * tam, pagina * tam),
    total: itens.length,
    totalPages: Math.max(1, Math.ceil(itens.length / tam)),
  })
}

test('lê todas as páginas, inclusive a última incompleta', async () => {
  const itens = Array.from({ length: 11 }, (_, i) => i)
  const r = await lerTodasAsPaginas(fonte(itens, 5), chave, OPTS)
  assert.ok(r.ok)
  assert.equal(r.linhas.length, 11)
  assert.equal(r.paginas, 3)
  assert.equal(r.total, 11)
})

test('lista vazia: uma página, nenhuma linha', async () => {
  const r = await lerTodasAsPaginas(fonte([], 5), chave, OPTS)
  assert.ok(r.ok)
  assert.equal(r.linhas.length, 0)
})

test('erro na página 1 pula a conta, como o sync sempre fez', async () => {
  const r = await lerTodasAsPaginas(async () => 'erro', chave, OPTS)
  assert.ok(r.ok)
  assert.equal(r.ignorada, true)
})

test('erro depois da página 1 devolve ok: false', async () => {
  const base = fonte(Array.from({ length: 10 }, (_, i) => i), 5)
  const r = await lerTodasAsPaginas(async p => (p === 2 ? 'erro' : base(p)), chave, OPTS)
  assert.equal(r.ok, false)
})

test('acima do limite de páginas falha sem ler o resto', async () => {
  let chamadas = 0
  const r = await lerTodasAsPaginas(
    async () => { chamadas++; return { linhas: [1], total: 5000, totalPages: 100 } },
    chave,
    OPTS,
  )
  assert.equal(r.ok, false)
  assert.equal(chamadas, 1)
})

test('linha repetida por deslocamento entre páginas é descartada', async () => {
  // entrou uma linha nova no topo entre as leituras: o 4 aparece nas duas páginas
  const paginas = [[0, 1, 2, 3, 4], [4, 5, 6, 7, 8]]
  const r = await lerTodasAsPaginas(
    async p => ({ linhas: paginas[p - 1], total: 9, totalPages: 2 }),
    chave,
    OPTS,
  )
  assert.ok(r.ok)
  assert.equal(r.linhas.length, 9)
})

test('total que muda no meio da leitura relê; estabilizando, aceita', async () => {
  let rodada = 0
  const buscar: BuscaPagina<number> = async p => {
    if (p === 1) rodada++
    // na 1ª rodada o total cai de 10 para 9 entre a página 1 e a 2 (uma linha sumiu)
    const total = rodada === 1 && p === 2 ? 9 : rodada === 1 ? 10 : 9
    const itens = rodada === 1 ? Array.from({ length: 10 }, (_, i) => i) : Array.from({ length: 9 }, (_, i) => i)
    return { linhas: itens.slice((p - 1) * 5, p * 5), total, totalPages: 2 }
  }
  const r = await lerTodasAsPaginas(buscar, chave, OPTS)
  assert.ok(r.ok)
  assert.equal(r.tentativas, 2)
  assert.equal(r.linhas.length, 9)
})

test('total que nunca estabiliza falha depois das tentativas', async () => {
  let n = 0
  const buscar: BuscaPagina<number> = async p => ({ linhas: [p], total: p === 1 ? 10 : 10 + ++n, totalPages: 2 })
  const r = await lerTodasAsPaginas(buscar, chave, { maxPaginas: 60, maxTentativas: 2 })
  assert.equal(r.ok, false)
})

test('entrada e saída que se compensam: o total não muda, mas uma linha foi pulada, então relê', async () => {
  // 1ª rodada: depois da página 1 entra uma linha nova no topo e a linha 6 some. O total continua 10,
  // mas a página 2 vem deslocada e a linha 6 deixa de ser lida (9 únicas contra total 10).
  const antes = Array.from({ length: 10 }, (_, i) => i)
  const depois = ['nova', ...antes.filter(i => i !== 6)] // 10 linhas; tudo abaixo da nova sobe/desce
  let rodada = 0
  const buscar: BuscaPagina<number | string> = async p => {
    if (p === 1) rodada++
    const lista = rodada === 1 && p === 1 ? antes : rodada === 1 ? depois : antes
    return { linhas: lista.slice((p - 1) * 5, p * 5), total: 10, totalPages: 2 }
  }
  const r = await lerTodasAsPaginas(buscar, String, OPTS)
  assert.ok(r.ok)
  assert.equal(r.tentativas, 2)
  assert.equal(r.linhas.length, 10)
})

test('linhas únicas abaixo do total que nunca se corrigem falham depois das tentativas', async () => {
  const buscar: BuscaPagina<number> = async p => ({ linhas: p === 1 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8], total: 10, totalPages: 2 })
  const r = await lerTodasAsPaginas(buscar, chave, { maxPaginas: 60, maxTentativas: 2 })
  assert.equal(r.ok, false)
})

test('total 0 depois de uma tentativa que viu linhas não é aceito: falha em vez de gravar a conta vazia', async () => {
  // 1ª tentativa: total muda entre a primeira e a última página (rejeitada). Demais: lista vazia, formato válido.
  let chamadas = 0
  const base = fonte(Array.from({ length: 10 }, (_, i) => i), 5)
  const busca: BuscaPagina<number> = async pagina => {
    chamadas++
    if (chamadas <= 2) return pagina === 1 ? base(1) : { ...(await base(2) as { linhas: number[]; totalPages: number }), total: 11 }
    return { linhas: [], total: 0, totalPages: 0 }
  }
  const rejeicoes: string[] = []
  const r = await lerTodasAsPaginas(busca, chave, { ...OPTS, aoRejeitar: x => rejeicoes.push(x.motivo) })
  assert.equal(r.ok, false)
  assert.deepEqual(rejeicoes, ['total_mudou', 'vazia_apos_dados', 'vazia_apos_dados'])
})

test('total 0 logo na primeira tentativa continua valendo (conta nova ou janela sem movimento)', async () => {
  const r = await lerTodasAsPaginas(async () => ({ linhas: [], total: 0, totalPages: 0 }), chave, OPTS)
  assert.ok(r.ok)
  assert.equal(r.tentativas, 1)
  assert.equal(r.linhas.length, 0)
})

test('relê e aceita quando a segunda tentativa estabiliza, avisando o motivo da primeira', async () => {
  let rodada = 0
  const base = fonte(Array.from({ length: 10 }, (_, i) => i), 5)
  const busca: BuscaPagina<number> = async pagina => {
    if (pagina === 1) rodada++
    // 1ª rodada: a última página repete linhas da primeira (ids únicos < total).
    if (rodada === 1 && pagina === 2) return { linhas: [0, 1, 2, 3, 4], total: 10, totalPages: 2 }
    return base(pagina)
  }
  const motivos: string[] = []
  const r = await lerTodasAsPaginas(busca, chave, { ...OPTS, aoRejeitar: x => motivos.push(`${x.motivo}:${x.unicas}`) })
  assert.ok(r.ok)
  assert.equal(r.tentativas, 2)
  assert.deepEqual(motivos, ['ids_diferentes:5'])
})

test('vaziaSuspeita: total 0 com resposta de 1534 caracteres (o caso observado) é suspeito', () => {
  assert.equal(vaziaSuspeita({ total: 0 }, 1534), true)
})

test('vaziaSuspeita: total 0 com warning não vazio é suspeito, mesmo com resposta pequena', () => {
  assert.equal(vaziaSuspeita({ total: 0, warning: 'provider incident' }, 200), true)
  assert.equal(vaziaSuspeita({ total: 0, warning: '   ' }, 200), false)
})

test('vaziaSuspeita: total 0 até o limite de tamanho, sem warning, não é suspeito', () => {
  assert.equal(vaziaSuspeita({ total: 0 }, 300), false)
  assert.equal(vaziaSuspeita({ total: 0 }, TAMANHO_MAX_PAGINA_VAZIA), false)
})

test('vaziaSuspeita: total diferente de 0 nunca é suspeito, por maior que seja a resposta', () => {
  assert.equal(vaziaSuspeita({ total: 20 }, 50_000), false)
  assert.equal(vaziaSuspeita({ total: 20, warning: 'x' }, 50_000), false)
})
