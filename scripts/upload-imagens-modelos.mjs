import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join, extname, basename } from 'path'

import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (.env.local)')
  process.exit(1)
}
const IMAGENS_DIR = 'D:/ECOMOV/Arquivos ECOMOV/IMAGENS'
const BUCKET = 'modelos'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Mapeamento: nome do arquivo (sem extensão) → nome do modelo no banco
const MAPA_NOMES = {
  'BIG TRI':   'BIG TRI',
  'BOB':       'BOB',
  'GIGA':      'GIGA',
  'GRID':      'GRID',
  'JET MAX':   'JETMAX',
  'JET':       'JET',
  'LIBERTY':   'LIBERTY',
  'MC20 MINI': 'MC20 MINI',
  'MC20':      'MC20',
  'MIA TRI':   'MIA TRI',
  'MIA':       'MIA',
  'RET':       'RET',
  'RETRO':     'RETRO',
  'ROMA':      'ROMA',
  'SOFIA':     'SOFIA',
  'SOMA':      'SOMA',
  'SPACE':     'SPACE',
  'STYLE':     'VTB3 STYLE',
  'SUPER JOY': 'SUPER JOY',
  'VED':       null,           // sem correspondência conhecida
  'X11':       'X11 MINI',
  'X12':       'X12',
  'X15':       'X15',
}

async function main() {
  // 1. Criar bucket público (ignora se já existe)
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  })
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    console.error('Erro ao criar bucket:', bucketErr.message)
    process.exit(1)
  }
  console.log(`Bucket "${BUCKET}" pronto.\n`)

  // 2. Listar imagens
  const arquivos = readdirSync(IMAGENS_DIR).filter(f =>
    ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(f).toLowerCase())
  )
  console.log(`${arquivos.length} imagens encontradas.\n`)

  const resultados = []

  for (const arquivo of arquivos) {
    const nomeBase = basename(arquivo, extname(arquivo))
    const nomeModelo = MAPA_NOMES[nomeBase]
    const storagePath = arquivo.toLowerCase().replace(/ /g, '-')

    const bytes = readFileSync(join(IMAGENS_DIR, arquivo))
    const contentType = extname(arquivo).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true })

    if (uploadErr) {
      console.error(`  ✗ ${arquivo}: ${uploadErr.message}`)
      continue
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    console.log(`  ✓ ${arquivo} → ${storagePath}`)

    if (nomeModelo) {
      resultados.push({ nomeModelo, publicUrl })
    } else {
      console.log(`    ⚠ sem mapeamento para "${nomeBase}" — URL: ${publicUrl}`)
    }
  }

  // 3. Atualizar precificacao.imagem_url
  console.log('\nAtualizando banco de dados...')
  for (const { nomeModelo, publicUrl } of resultados) {
    const { error } = await supabase
      .from('precificacao')
      .update({ imagem_url: publicUrl })
      .eq('nome', nomeModelo)

    if (error) {
      console.error(`  ✗ precificacao "${nomeModelo}": ${error.message}`)
    } else {
      console.log(`  ✓ precificacao: ${nomeModelo}`)
    }
  }

  // 4. Atualizar modelos.imagem_url
  console.log('\nAtualizando tabela modelos...')
  for (const { nomeModelo, publicUrl } of resultados) {
    const { error } = await supabase
      .from('modelos')
      .update({ imagem_url: publicUrl })
      .eq('modelo', nomeModelo)

    if (error) {
      console.error(`  ✗ modelos "${nomeModelo}": ${error.message}`)
    } else {
      console.log(`  ✓ modelos: ${nomeModelo}`)
    }
  }

  console.log('\nConcluído!')
}

main().catch(console.error)
