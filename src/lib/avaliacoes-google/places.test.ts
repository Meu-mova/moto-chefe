import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buscarLugarNoGoogle, codigoPlacaValido, gerarCodigoPlaca, lerRespostaPlaces, linkEscreverAvaliacao,
  mensagemErroPlaces, placeIdValido,
} from './places'

test('lê nota, total, link e as avaliações da resposta da Places API', () => {
  const r = lerRespostaPlaces({
    rating: 4.7,
    userRatingCount: 213,
    googleMapsUri: 'https://maps.google.com/?cid=1',
    reviews: [
      {
        name: 'places/ChIJabc/reviews/r1',
        rating: 5,
        text: { text: 'Ótimo atendimento' },
        publishTime: '2026-10-20T13:00:00Z',
        authorAttribution: { displayName: 'Maria', uri: 'https://www.google.com/maps/contrib/1' },
      },
      { name: 'places/ChIJabc/reviews/r2', rating: 3, originalText: { text: 'ok' } },
      { rating: 1 },
    ],
  })
  assert.equal(r.nota, 4.7)
  assert.equal(r.total, 213)
  assert.equal(r.mapsUri, 'https://maps.google.com/?cid=1')
  assert.deepEqual(r.avaliacoes, [
    { googleId: 'places/ChIJabc/reviews/r1', autor: 'Maria', autorUri: 'https://www.google.com/maps/contrib/1', nota: 5, texto: 'Ótimo atendimento', publicadaEm: '2026-10-20T13:00:00Z' },
    { googleId: 'places/ChIJabc/reviews/r2', autor: null, autorUri: null, nota: 3, texto: 'ok', publicadaEm: null },
  ])
})

test('ficha sem avaliação volta nota e total nulos', () => {
  assert.deepEqual(lerRespostaPlaces({}), { nota: null, total: null, mapsUri: null, avaliacoes: [] })
  assert.deepEqual(lerRespostaPlaces(null), { nota: null, total: null, mapsUri: null, avaliacoes: [] })
})

test('Place ID fora do formato não chega à URL da API', async () => {
  assert.equal(placeIdValido('ChIJN1t_tDeuEmsRUsoyG83frY4'), true)
  assert.equal(placeIdValido('../places/x?key=1'), false)
  let chamou = false
  await assert.rejects(
    buscarLugarNoGoogle('chave', '../x', (async () => { chamou = true; return new Response('{}') }) as typeof fetch),
    /Place ID inválido/,
  )
  assert.equal(chamou, false)
})

test('a chave vai no cabeçalho, não na URL, e o erro do Google vira frase sem a chave', async () => {
  let url = ''
  let cabecalhos: Headers | undefined
  const falso = (async (u: string, init?: RequestInit) => {
    url = u
    cabecalhos = new Headers(init?.headers)
    return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 })
  }) as unknown as typeof fetch
  await assert.rejects(buscarLugarNoGoogle('AIzaSEGREDO1234567890', 'ChIJN1t_tDeuEmsRUsoyG83frY4', falso), e => {
    assert.match((e as Error).message, /Chave recusada/)
    assert.doesNotMatch((e as Error).message, /SEGREDO/)
    return true
  })
  assert.equal(url, 'https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4?languageCode=pt-BR')
  assert.equal(cabecalhos?.get('x-goog-api-key'), 'AIzaSEGREDO1234567890')
  assert.equal(cabecalhos?.get('x-goog-fieldmask'), 'rating,userRatingCount,googleMapsUri,reviews')
})

test('mensagens de erro da Places API', () => {
  assert.equal(mensagemErroPlaces(404, null), 'Loja não encontrada no Google com esse Place ID')
  assert.equal(mensagemErroPlaces(429, null), 'Limite de consultas do Google atingido; tente mais tarde')
  assert.equal(mensagemErroPlaces(500, null), 'Google respondeu HTTP 500')
})

test('link de escrever avaliação', () => {
  assert.equal(
    linkEscreverAvaliacao('ChIJN1t_tDeuEmsRUsoyG83frY4'),
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
  )
})

test('código da placa: 10 caracteres sem os que se confundem, e não repete', () => {
  const codigos = new Set(Array.from({ length: 500 }, gerarCodigoPlaca))
  assert.equal(codigos.size, 500)
  for (const c of codigos) {
    assert.equal(codigoPlacaValido(c), true, c)
    assert.doesNotMatch(c, /[01ilo]/)
  }
  assert.equal(codigoPlacaValido('ABCDEFGHJK'), false)
  assert.equal(codigoPlacaValido('abc'), false)
})
