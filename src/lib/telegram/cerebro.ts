import Anthropic from '@anthropic-ai/sdk'
import { client } from '@/lib/db'
import { consultaSomenteLeitura, ConsultaError } from '@/lib/jarvis/consulta-readonly'

const MODELO = 'claude-haiku-4-5-20251001' // barato; suba para 'claude-sonnet-5' se errar SQL

const SISTEMA = [
  'Voce e o assistente de consultas do ERP MOVA (motos), SOMENTE LEITURA.',
  'Para responder sobre o negocio: primeiro chame schema_mova para ver tabelas/colunas,',
  'depois consultar_mova com UM unico SELECT (sem ";"). Datas em America/Sao_Paulo',
  '(use "AT TIME ZONE \'America/Sao_Paulo\'"; nao use current_date cru).',
  'Responda em portugues do Brasil, curto, com o numero e — em uma linha — a consulta usada.',
].join(' ')

const TOOLS: Anthropic.Tool[] = [
  { name: 'schema_mova', description: 'Lista tabelas e colunas do MOVA.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'consultar_mova',
    description: 'Roda UM SELECT (sem ;) somente-leitura e devolve as linhas em JSON.',
    input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
]

async function schemaTexto(): Promise<string> {
  const linhas = await client<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`
  const schema: Record<string, string[]> = {}
  for (const l of linhas) (schema[l.table_name] ??= []).push(`${l.column_name}:${l.data_type}`)
  return JSON.stringify(schema).slice(0, 6000)
}

async function executarTool(nome: string, input: unknown): Promise<string> {
  if (nome === 'schema_mova') return await schemaTexto()
  if (nome === 'consultar_mova') {
    try {
      const sql = typeof input === 'object' && input !== null && 'sql' in input ? String((input as { sql?: unknown }).sql ?? '') : ''
      const r = await consultaSomenteLeitura(sql)
      return JSON.stringify(r.rows).slice(0, 4000)
    } catch (e) {
      return e instanceof ConsultaError ? `erro (${e.tipo}): ${e.detalhe}` : 'erro na consulta'
    }
  }
  return 'tool desconhecida'
}

export async function responderComClaude(pergunta: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return 'Cerebro indisponivel (sem chave). Tenta uma pergunta do /menu.'
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pergunta }]

  for (let i = 0; i < 6; i++) {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: SISTEMA,
      tools: TOOLS,
      messages,
    })
    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content })
      const resultados: Anthropic.ToolResultBlockParam[] = []
      for (const bloco of resp.content) {
        if (bloco.type === 'tool_use') {
          resultados.push({
            type: 'tool_result',
            tool_use_id: bloco.id,
            content: await executarTool(bloco.name, bloco.input),
          })
        }
      }
      messages.push({ role: 'user', content: resultados })
      continue
    }
    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    return texto || '(sem resposta)'
  }
  return 'Nao consegui concluir a consulta. Tenta reformular ou usa o /menu.'
}
