import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const JSON_PATH = 'D:\\ECOMOV\\clientes-classificados.json'

interface ClienteRecord {
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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const registros: ClienteRecord[] = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  console.log(`Total de registros: ${registros.length}`)

  // Mapear para snake_case conforme a tabela
  const rows = registros.map(r => ({
    nome: r.nome,
    tipo_pessoa: r.tipoPessoa,
    cpf_cnpj: r.cpfCnpj || null,
    sexo: r.sexo,
    email: r.email || null,
    celular: r.celular || null,
    endereco: r.endereco || null,
    numero: r.numero || null,
    complemento: r.complemento || null,
    bairro: r.bairro || null,
    cep: r.cep || null,
    cidade: r.cidade || null,
    uf: r.uf || null,
  }))

  const BATCH = 100
  let totalInseridos = 0
  let totalIgnorados = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = rows.slice(i, i + BATCH)
    // onConflict: ignorar duplicatas de cpf_cnpj
    const { error, count } = await supabase
      .from('clientes')
      .upsert(lote, {
        onConflict: 'cpf_cnpj',
        ignoreDuplicates: true,
        count: 'exact',
      })

    if (error) {
      console.error(`Erro no lote ${Math.floor(i / BATCH) + 1}:`, error.message)
      // Tentar inserir um a um para não perder o lote inteiro
      for (const row of lote) {
        const { error: e2 } = await supabase.from('clientes').upsert([row], {
          onConflict: row.cpf_cnpj ? 'cpf_cnpj' : undefined,
          ignoreDuplicates: true,
        })
        if (e2) {
          console.warn(`  Ignorado (${row.nome}): ${e2.message}`)
          totalIgnorados++
        } else {
          totalInseridos++
        }
      }
    } else {
      totalInseridos += lote.length
    }

    console.log(`Inseridos: ${totalInseridos}/${rows.length}`)
  }

  if (totalIgnorados > 0) {
    console.log(`Ignorados por conflito: ${totalIgnorados}`)
  }
  console.log('✓ Importação concluída!')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
