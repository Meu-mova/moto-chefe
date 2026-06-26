import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim())
  const [headerLine, ...rows] = lines
  const cols = headerLine.split(';').map(c => c.trim())
  return rows.map(row => {
    const values = row.split(';')
    return Object.fromEntries(cols.map((c, i) => [c, (values[i] ?? '').trim()]))
  })
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

export async function classificarSexo(
  nomes: string[]
): Promise<Record<string, 'masculino' | 'feminino' | 'nao_identificado'>> {
  const client = new Anthropic()
  const resultado: Record<string, 'masculino' | 'feminino' | 'nao_identificado'> = {}
  const BATCH = 80

  for (let i = 0; i < nomes.length; i += BATCH) {
    const lote = nomes.slice(i, i + BATCH)
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Classifique o sexo de cada primeiro nome brasileiro abaixo como "masculino", "feminino" ou "nao_identificado".\nRetorne APENAS um objeto JSON, sem texto adicional, no formato: {"Nome": "masculino", ...}\n\nNomes:\n${lote.join('\n')}`,
      }],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    try {
      const match = text.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(match?.[0] ?? '{}') as Record<string, string>
      for (const [nome, sexo] of Object.entries(parsed)) {
        if (sexo === 'masculino' || sexo === 'feminino' || sexo === 'nao_identificado') {
          resultado[nome] = sexo
        } else {
          resultado[nome] = 'nao_identificado'
        }
      }
    } catch {
      lote.forEach(n => { resultado[n] = 'nao_identificado' })
    }

    const loteNum = Math.floor(i / BATCH) + 1
    const total = Math.ceil(nomes.length / BATCH)
    console.log(`Classificação: lote ${loteNum}/${total}`)
  }

  return resultado
}

export function lerCSVBling(csvPath: string): Record<string, string>[] {
  if (!fs.existsSync(csvPath)) throw new Error(`Arquivo não encontrado: ${csvPath}`)
  const content = fs.readFileSync(csvPath, 'latin1')
  return parseCSV(content).filter(r => r['Nome'])
}

export type ClienteRegistro = {
  nome: string
  tipoPessoa: 'fisica' | 'juridica'
  cpfCnpj: string | null
  sexo: 'masculino' | 'feminino' | 'nao_identificado'
  email: string | null
  celular: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  cidade: string | null
  uf: string | null
}

export function transformarRegistros(
  rows: Record<string, string>[],
  sexoMap: Record<string, 'masculino' | 'feminino' | 'nao_identificado'>
): ClienteRegistro[] {
  return rows.map(r => ({
    nome: r['Nome'],
    tipoPessoa: (r['Tipo pessoa']?.includes('ur') ? 'juridica' : 'fisica') as 'fisica' | 'juridica',
    cpfCnpj: r['CNPJ / CPF']?.replace(/\D/g, '') || null,
    sexo: (sexoMap[primeiroNome(r['Nome'])] ?? 'nao_identificado') as 'masculino' | 'feminino' | 'nao_identificado',
    email: r['E-mail'] || null,
    celular: r['Celular'] || null,
    endereco: r['Endereço'] || null,
    numero: r['Número'] || null,
    complemento: r['Complemento'] || null,
    bairro: r['Bairro'] || null,
    cep: r['CEP'] || null,
    cidade: r['Cidade'] || null,
    uf: r['UF'] || null,
  }))
}
