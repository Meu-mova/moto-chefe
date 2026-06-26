import { db } from '../src/lib/db'
import { clientes } from '../src/lib/db/schema'
import { primeiroNome, classificarSexo, lerCSVBling } from './lib/csv-utils'

// AVISO: Requer DATABASE_URL com acesso direto ao Postgres (porta 5432).
// Se o DATABASE_URL local usar PgBouncer (porta 6543), use os scripts alternativos:
// 1. npx tsx scripts/classificar-clientes-bling.ts  (gera clientes.json)
// 2. npx tsx scripts/inserir-clientes-json.ts        (insere via Supabase REST)

const CSV_PATH = 'D:\\ECOMOV\\exportar clientes Bling.csv'

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
  const BATCH_INSERT = 100
  let total = 0
  for (let i = 0; i < registros.length; i += BATCH_INSERT) {
    const lote = registros.slice(i, i + BATCH_INSERT)
    const comCpf = lote.filter(r => r.cpfCnpj)
    const semCpf = lote.filter(r => !r.cpfCnpj)
    if (comCpf.length > 0) {
      await db.insert(clientes).values(comCpf).onConflictDoNothing({ target: clientes.cpfCnpj })
    }
    if (semCpf.length > 0) {
      await db.insert(clientes).values(semCpf)
    }
    total += lote.length
    console.log(`Inseridos: ${total}/${registros.length}`)
  }
  console.log('✓ Importação concluída!')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
