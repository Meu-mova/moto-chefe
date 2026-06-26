import fs from 'fs'
import { primeiroNome, classificarSexo, lerCSVBling } from './lib/csv-utils'

const CSV_PATH = 'D:\\ECOMOV\\exportar clientes Bling.csv'
const OUTPUT_PATH = 'D:\\ECOMOV\\clientes-classificados.json'

async function main() {
  const rows = lerCSVBling(CSV_PATH)
  console.log(`Total de registros: ${rows.length}`)
  const nomesUnicos = [...new Set(rows.map(r => primeiroNome(r['Nome'])))]
  console.log(`Primeiros nomes únicos: ${nomesUnicos.length}`)
  const sexoMap = await classificarSexo(nomesUnicos)
  console.log('Classificação de sexo concluída.')
  const registros = rows.map(r => ({
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
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(registros, null, 2), 'utf-8')
  console.log(`Registros salvos em: ${OUTPUT_PATH}`)
  console.log(`Total: ${registros.length} registros`)
}

main().catch(err => { console.error(err); process.exit(1) })
