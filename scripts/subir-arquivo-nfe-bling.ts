/**
 * Sobe para o Storage (bucket privado nfe-bling) o acervo baixado por
 * arquivar-nfe-saida-bling.ts e registra cada nota em nfe_bling_arquivo.
 * É o que mantém o botão DANFE das vendas antigas funcionando depois que a
 * conta do Bling for encerrada.
 *
 * Reentrante: nota já registrada com os arquivos não sobe de novo.
 *
 * Uso:
 *   npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/subir-arquivo-nfe-bling.ts --grupo "Sul de Minas"
 *   (opcional) --pasta "D:\ECOMOV\Notas de Saida\_Bling"
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const grupoNome = arg('--grupo')
const raiz = arg('--pasta') ?? 'D:\\ECOMOV\\Notas de Saida\\_Bling'
if (!grupoNome) {
  console.error('Informe --grupo "<nome>"')
  process.exit(1)
}
const BUCKET = 'nfe-bling'

/** Linha do indice.csv: campos entre aspas separados por ";", aspas dobradas. */
function lerLinha(l: string): string[] {
  const campos: string[] = []
  const re = /"((?:[^"]|"")*)"(?:;|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(l))) campos.push(m[1].replace(/""/g, '"'))
  return campos
}

/** A rede daqui derruba conexão (ECONNRESET) de vez em quando. */
async function comRetentativa<T>(f: () => Promise<T>): Promise<T> {
  for (let t = 0; ; t++) {
    try { return await f() } catch (e) {
      if (t === 3) throw e
      await new Promise(r => setTimeout(r, 2000 * (t + 1)))
    }
  }
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false })
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
  const [g] = await sql`select id from grupos where nome = ${grupoNome!}`
  if (!g) throw new Error(`Grupo "${grupoNome}" não encontrado`)

  const { error: errBucket } = await storage.createBucket(BUCKET, { public: false })
  if (errBucket && !/already exists/i.test(errBucket.message)) throw errBucket

  const pastaGrupo = join(raiz, grupoNome!)
  const [cab, ...linhas] = readFileSync(join(pastaGrupo, 'indice.csv'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  const col = cab.split(';')
  const idx = (n: string) => col.indexOf(n)
  if (idx('bling_id') < 0) throw new Error('indice.csv sem a coluna bling_id — rode arquivar-nfe-saida-bling.ts de novo')

  const feitos = new Map(
    (await sql`select bling_nfe_id, documento from nfe_bling_arquivo where grupo_id = ${g.id}`)
      .map(r => [r.bling_nfe_id as string, r.documento as string | null]),
  )

  const subir = async (rel: string, tipo: string) => {
    const local = join(pastaGrupo, rel)
    if (!rel || !existsSync(local)) return null
    const caminho = `${g.id}/${rel.replace(/\\/g, '/')}`
    await comRetentativa(async () => {
      const { error } = await storage.from(BUCKET).upload(caminho, readFileSync(local), { contentType: tipo, upsert: true })
      if (error) throw new Error(`${rel}: ${error.message}`)
    })
    return caminho
  }

  let novos = 0, jaTinha = 0
  const vistos = new Set<string>()
  for (const [i, l] of linhas.entries()) {
    if (!l.trim()) continue
    const c = lerLinha(l)
    const blingId = c[idx('bling_id')]
    if (!blingId || vistos.has(blingId)) continue // o Bling lista algumas notas em dobro
    vistos.add(blingId)
    const documento = (c[idx('documento')] ?? '').replace(/\D/g, '') || null
    if (feitos.has(blingId)) {
      // Linha gravada antes da coluna documento existir: completa sem subir de novo.
      if (!feitos.get(blingId) && documento)
        await comRetentativa(() => sql`update nfe_bling_arquivo set documento = ${documento} where grupo_id = ${g.id} and bling_nfe_id = ${blingId}`)
      jaTinha++
      continue
    }

    const xmlPath = await subir(c[idx('xml')], 'application/xml')
    const pdfPath = await subir(c[idx('danfe')], 'application/pdf')
    await comRetentativa(() => sql`
      insert into nfe_bling_arquivo (grupo_id, bling_nfe_id, numero, serie, chave, documento, data_emissao, situacao, xml_path, pdf_path)
      values (${g.id}, ${blingId}, ${c[idx('numero')]}, ${c[idx('serie')] || null}, ${c[idx('chave')] || null}, ${documento},
              ${c[idx('data_emissao')] || null}, ${c[idx('situacao')]}, ${xmlPath}, ${pdfPath})
      on conflict (grupo_id, bling_nfe_id) do update set
        numero = excluded.numero, serie = excluded.serie, chave = excluded.chave, documento = excluded.documento, data_emissao = excluded.data_emissao,
        situacao = excluded.situacao, xml_path = excluded.xml_path, pdf_path = excluded.pdf_path`)
    novos++
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${linhas.length} (novos ${novos}, já tinha ${jaTinha})`)
  }

  console.log(`${grupoNome}: pronto — novos ${novos}, já tinha ${jaTinha}`)
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
