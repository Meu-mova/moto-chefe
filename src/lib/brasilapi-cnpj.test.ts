import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultarEmpresaReceita, mapearEmpresaReceita } from './brasilapi-cnpj'

// Resposta fixa no formato da BrasilAPI, com dados fictícios. Sem rede.
const RESPOSTA = {
  cnpj: '12345678000195', razao_social: 'EMPRESA TESTE LTDA', nome_fantasia: 'LOJA TESTE',
  descricao_situacao_cadastral: 'ATIVA', opcao_pelo_simples: true, opcao_pelo_mei: false,
  ddd_telefone_1: '1133330000', cep: '1001000', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DE TESTE',
  numero: '100', complemento: 'SALA 2', bairro: 'CENTRO', municipio: 'SAO PAULO', uf: 'SP', codigo_municipio_ibge: 3550308,
  qsa: [{ nome_socio: 'FULANO DE TAL', cnpj_cpf_do_socio: '***123456**' }],
}

test('mapeia os campos da adesão e deixa os sócios de fora', () => {
  const e = mapearEmpresaReceita(RESPOSTA)
  assert.deepEqual(e, {
    razaoSocial: 'EMPRESA TESTE LTDA', nomeFantasia: 'LOJA TESTE', situacao: 'ATIVA', regime: 'simples',
    telefone: '1133330000', cep: '01001000', logradouro: 'RUA DE TESTE', numero: '100', complemento: 'SALA 2',
    bairro: 'CENTRO', cidade: 'SAO PAULO', uf: 'SP', codigoIbge: '3550308',
  })
  assert.ok(!JSON.stringify(e).includes('FULANO'))
})

test('regime: MEI vence o Simples; sem Simples é normal; sem informação fica em branco', () => {
  assert.equal(mapearEmpresaReceita({ opcao_pelo_simples: true, opcao_pelo_mei: true }).regime, 'mei')
  assert.equal(mapearEmpresaReceita({ opcao_pelo_simples: false }).regime, 'normal')
  assert.equal(mapearEmpresaReceita({}).regime, null)
  const nuncaOptou = { opcao_pelo_simples: null, regime_tributario: [{ ano: 2016, forma_de_tributacao: 'SIMPLES' }, { ano: 2022, forma_de_tributacao: 'LUCRO REAL' }] }
  assert.equal(mapearEmpresaReceita(nuncaOptou).regime, 'normal', 'sem opção, vale o ano mais recente')
})

test('falha de rede, 403/5xx ou CNPJ mal formado devolvem null sem lançar', async () => {
  const falha = (async () => { throw new Error('rede') }) as unknown as typeof fetch
  const http403 = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
  const http500 = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch
  assert.equal(await consultarEmpresaReceita('12345678000195', falha), null)
  assert.equal(await consultarEmpresaReceita('12345678000195', http403), null)
  assert.equal(await consultarEmpresaReceita('12345678000195', http500), null)
  assert.equal(await consultarEmpresaReceita('123', falha), null)
})

test('404 da BrasilAPI é CNPJ não encontrado, não falha', async () => {
  const http404 = (async () => new Response('{"message":"CNPJ não encontrado"}', { status: 404 })) as unknown as typeof fetch
  assert.equal(await consultarEmpresaReceita('12345678000195', http404), 'nao_encontrado')
})

test('resposta boa consulta a URL do CNPJ com User-Agent do MOVA e devolve o mapeado', async () => {
  let url = ''
  let ua = ''
  const ok = (async (u: string, init?: RequestInit) => {
    url = u
    ua = new Headers(init?.headers).get('user-agent') ?? ''
    return new Response(JSON.stringify(RESPOSTA))
  }) as unknown as typeof fetch
  const e = await consultarEmpresaReceita('12345678000195', ok)
  assert.equal(url, 'https://brasilapi.com.br/api/cnpj/v1/12345678000195')
  assert.match(ua, /^MOVA\//, 'sem User-Agent próprio a BrasilAPI responde 403')
  assert.equal(typeof e === 'object' && e?.razaoSocial, 'EMPRESA TESTE LTDA')
})
