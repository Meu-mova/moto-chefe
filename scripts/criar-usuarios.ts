/**
 * Script: apaga dados de teste e cria os funcionários reais.
 * Uso: npx tsx scripts/criar-usuarios.ts
 */

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, inArray } from 'drizzle-orm'
import { usuarios, historicoEstoque, ordensServico } from '../src/lib/db/schema'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DB_URL       = process.env.DATABASE_URL!
const DOMINIO      = 'motochefesuldeminas.com.br'
const SENHA        = process.env.DEFAULT_USER_PASSWORD!

// IDs das lojas reais (buscados após limpeza)
const LOJAS: Record<string, string> = {
  'VARGINHA':        '44351a40-b800-47af-9e31-af4621b6cbc1',
  'POÇOS DE CALDAS': '32763fa6-df4d-46ed-a710-3a3c7be44a8a',
  'POUSO ALEGRE':    '269bb2f7-6a1c-48f4-a073-bfdf0e23094b',
  'ITAJUBA':         '08d5d285-d775-4113-aee5-d71900efc8b6',
  'LAVRAS':          'd27be175-1a99-4382-a335-7a027195922e',
}

const PAPEIS: Record<string, string> = {
  'VENDEDOR':     'vendedor',
  'MECÂNICO':     'mecanico',
  'AUX ADM':      'aux_adm',
  'ADMIN GERAL':  'admin_geral',
  'ADMIN SÓCIO':  'admin_socio',
}

const FUNCIONARIOS = [
  { nome: 'Adrielly Marques',   funcao: 'VENDEDOR',     loja: 'VARGINHA' },
  { nome: 'Alexsander Lopes',   funcao: 'MECÂNICO',     loja: 'POÇOS DE CALDAS' },
  { nome: 'Anne Ester',         funcao: 'VENDEDOR',     loja: 'POUSO ALEGRE' },
  { nome: 'Brenda Aquiles',     funcao: 'VENDEDOR',     loja: 'VARGINHA' },
  { nome: 'Carlos Barbosa',     funcao: 'AUX ADM',      loja: 'ITAJUBA' },
  { nome: 'Cesar Rodrigues',    funcao: 'ADMIN GERAL',  loja: 'GERAL' },
  { nome: 'Charles Carvalho',   funcao: 'AUX ADM',      loja: 'POUSO ALEGRE' },
  { nome: 'Emanuel Paiva',      funcao: 'VENDEDOR',     loja: 'VARGINHA' },
  { nome: 'Fernando Betão',     funcao: 'VENDEDOR',     loja: 'VARGINHA' },
  { nome: 'Fernando Silverio',  funcao: 'MECÂNICO',     loja: 'POUSO ALEGRE' },
  { nome: 'João Brito',         funcao: 'ADMIN SÓCIO',  loja: 'GERAL' },
  { nome: 'Julia Nascimento',   funcao: 'VENDEDOR',     loja: 'POÇOS DE CALDAS' },
  { nome: 'Julia Sampaio',      funcao: 'AUX ADM',      loja: 'POÇOS DE CALDAS' },
  { nome: 'Juscelino Junior',   funcao: 'VENDEDOR',     loja: 'ITAJUBA' },
  { nome: 'Kawan Manso',        funcao: 'VENDEDOR',     loja: 'POUSO ALEGRE' },
  { nome: 'Luara Alkmin',       funcao: 'VENDEDOR',     loja: 'ITAJUBA' },
  { nome: 'Luiz Paulo',         funcao: 'ADMIN SÓCIO',  loja: 'GERAL' },
  { nome: 'Mateus',             funcao: 'ADMIN SÓCIO',  loja: 'GERAL' },
  { nome: 'Murilo Belo',        funcao: 'MECÂNICO',     loja: 'VARGINHA' },
  { nome: 'Pablo Albinati',     funcao: 'VENDEDOR',     loja: 'VARGINHA' },
  { nome: 'Pedro Henrique',     funcao: 'AUX ADM',      loja: 'POUSO ALEGRE' },
  { nome: 'Rayssa Dayane',      funcao: 'VENDEDOR',     loja: 'POÇOS DE CALDAS' },
  { nome: 'Tiago Souza Gomes',  funcao: 'AUX ADM',      loja: 'LAVRAS' },
  { nome: 'Vitor',              funcao: 'MECÂNICO',     loja: 'POUSO ALEGRE' },
  { nome: 'Marina Paiva',       funcao: 'ADMIN SÓCIO',  loja: 'GERAL' },
]

function nomeParaEmail(nome: string): string {
  const partes = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove acentos
    .toLowerCase()
    .split(' ')
    .filter(Boolean)

  const slug = partes.length === 1
    ? partes[0]
    : `${partes[0]}.${partes[partes.length - 1]}`  // primeiro.ultimo

  return `${slug}@${DOMINIO}`
}

async function main() {
  if (!SERVICE_KEY || !SUPABASE_URL || !DB_URL || !SENHA) {
    console.error('Variáveis obrigatórias: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, DEFAULT_USER_PASSWORD')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const client = postgres(DB_URL, { prepare: false })
  const db = drizzle(client)

  // ── Criar funcionários reais ───────────────────────────────────────────────
  console.log('\n── Criando funcionários ────────────────────────────────────')

  let criados = 0
  let erros = 0

  for (const f of FUNCIONARIOS) {
    const email  = nomeParaEmail(f.nome)
    const papel  = PAPEIS[f.funcao]
    const lojaId = LOJAS[f.loja] ?? null

    if (!papel) {
      console.error(`  ✖  ${f.nome}: função "${f.funcao}" não reconhecida`)
      erros++
      continue
    }

    try {
      // Cria no Supabase Auth
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: SENHA,
        email_confirm: true,
      })

      if (error) throw new Error(error.message)

      const authId = data.user!.id

      // Insere no perfil
      await db.insert(usuarios).values({
        id: authId,
        nome: f.nome,
        email,
        papel: papel as any,
        lojaId,
      })

      console.log(`  ✔  ${f.nome} | ${email} | ${f.funcao} | ${f.loja}`)
      criados++
    } catch (err: any) {
      console.error(`  ✖  ${f.nome}: ${err.message}`)
      erros++
    }
  }

  await client.end()

  console.log('\n─────────────────────────────────────────────')
  console.log(`Concluído: ${criados} criados, ${erros} erros`)
}

main().catch(e => {
  console.error('\nErro fatal:', e.message)
  process.exit(1)
})
