import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherEndpointMcp, resumirEndpoint } from './mcpai-credencial'

const GLOBAL = 'https://api.mcp.ai/global/token-global-1234'
const DO_GRUPO = 'https://api.mcp.ai/vale/token-do-vale-9876'

test('a chave da empresa ganha da global', () => {
  assert.equal(
    escolherEndpointMcp({ grupoNome: 'Vale', doGrupo: DO_GRUPO, global: GLOBAL }),
    DO_GRUPO,
  )
})

test('sem chave própria, cai na global — é o que mantém Sul de Minas e BH de pé', () => {
  assert.equal(
    escolherEndpointMcp({ grupoNome: 'Sul de Minas', doGrupo: null, global: GLOBAL }),
    GLOBAL,
  )
})

test('string em branco não conta como chave cadastrada', () => {
  assert.equal(
    escolherEndpointMcp({ grupoNome: 'Vale', doGrupo: '   ', global: GLOBAL }),
    GLOBAL,
  )
})

test('sem nenhuma das duas, o erro diz QUAL empresa falta cadastrar', () => {
  assert.throws(
    () => escolherEndpointMcp({ grupoNome: 'Vale', doGrupo: null, global: undefined }),
    // O nome na mensagem é o ponto: o erro antigo ("MCPAI_ENDPOINT_URL não
    // configurada") mandava procurar em variável de ambiente, quando o que
    // falta é o cadastro de uma empresa.
    /grupo Vale não tem a chave do mcp\.ai cadastrada/,
  )
})

test('resumo mostra host e o fim da chave, nunca o miolo', () => {
  const resumo = resumirEndpoint('https://api.mcp.ai/v1/sk-segredo-que-nao-pode-vazar-abcd')
  assert.equal(resumo, 'api.mcp.ai/…abcd')
  assert.ok(!resumo.includes('sk-segredo-que-nao-pode-vazar'))
})

test('resumo de valor que não é URL avisa em vez de quebrar a tela', () => {
  assert.equal(resumirEndpoint('colei a coisa errada aqui'), 'valor salvo (não parece uma URL)')
})
