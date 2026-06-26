import fs from 'fs'
import { primeiroNome, classificarSexo, lerCSVBling, transformarRegistros } from './lib/csv-utils'

// Script intermediário: classifica os nomes dos clientes do CSV Bling e gera clientes.json.
// Use quando o DATABASE_URL usa PgBouncer (porta 6543), impedindo conexão direta do Drizzle.
// Fluxo: 1) npx tsx scripts/classificar-clientes-bling.ts  2) npx tsx scripts/inserir-clientes-json.ts

const CSV_PATH = 'D:\\ECOMOV\\exportar clientes Bling.csv'
const OUTPUT_PATH = 'D:\\ECOMOV\\clientes-classificados.json'

async function main() {
  const rows = lerCSVBling(CSV_PATH)
  console.log(`Total de registros: ${rows.length}`)
  const nomesUnicos = [...new Set(rows.map(r => primeiroNome(r['Nome'])))]
  console.log(`Primeiros nomes únicos: ${nomesUnicos.length}`)
  const sexoMap = await classificarSexo(nomesUnicos)
  console.log('Classificação de sexo concluída.')
  const registros = transformarRegistros(rows, sexoMap)
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(registros, null, 2), 'utf-8')
  console.log(`Registros salvos em: ${OUTPUT_PATH}`)
  console.log(`Total: ${registros.length} registros`)
}

main().catch(err => { console.error(err); process.exit(1) })
