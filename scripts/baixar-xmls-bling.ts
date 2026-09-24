/**
 * Baixa os XMLs das notas de ENTRADA guardadas no Bling.
 *
 * As notas de entrada anteriores a junho/2026 não estão em lugar nenhum que o
 * MOVA alcance: o Radar Fiscal só lê a Distribuição DF-e da SEFAZ, que guarda
 * poucos meses, e as pastas do Cesar não têm tudo. O Bling tem — ele recebeu
 * cada nota de compra desde sempre, e a API devolve um link assinado para o XML
 * ORIGINAL do fornecedor, não uma reconstrução.
 *
 * Baixar o XML (em vez de ler os campos fiscais do JSON do Bling) é de
 * propósito: o arquivo entra no mesmo caminho que as outras notas, então quem
 * extrai a ficha continua sendo `extrairFiscalDaNfe` e quem liga o chassi
 * continua sendo `ligarFichasAosChassis`. Um formato a menos para manter.
 *
 * Só precisa do escopo de NF-e do app Bling, que já está autorizado — é o de
 * Produtos que devolve 403.
 *
 * Uso:
 *   node --import tsx scripts/baixar-xmls-bling.ts --grupo "Sul de Minas"
 *   ... --destino "D:\ECOMOV\Notas de Entrada\_Bling"   (padrão)
 *   ... --paginas 10                                     (padrão: até acabar)
 *
 * Reentrante: XML que já está no destino não é baixado de novo.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../src/lib/db'
import { sql } from 'drizzle-orm'

const args = process.argv.slice(2)
const valor = (nome: string, padrao = '') => {
  const i = args.indexOf(nome)
  return i >= 0 ? (args[i + 1] ?? padrao) : padrao
}
const grupoNome = valor('--grupo', 'Sul de Minas')
const destinoRaiz = valor('--destino', 'D:\\ECOMOV\\Notas de Entrada\\_Bling')
const maxPaginas = Number(valor('--paginas', '30'))

const API = 'https://api.bling.com.br/Api/v3'
// O Bling limita a 3 req/s; 400ms entre chamadas deixa folga.
const dorme = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const r: any = await db.execute(sql`
    select c.access_token, c.expires_at
      from bling_config c
      join grupos g on g.id = c.grupo_id
     where g.nome = ${grupoNome}`)
  const cfg = ((r as any).rows ?? r)[0]
  if (!cfg?.access_token) {
    console.error(`Grupo "${grupoNome}" sem access_token do Bling. Reconecte em Admin → Bling NF-e.`)
    process.exit(1)
  }
  if (cfg.expires_at && new Date(cfg.expires_at) < new Date()) {
    console.error('Access token do Bling vencido. Abra /admin (Bling NF-e) para renovar e rode de novo.')
    process.exit(1)
  }
  const token = cfg.access_token as string

  const api = async (p: string) => {
    const res = await fetch(`${API}${p}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401) throw new Error('401 do Bling — token vencido, reconecte em Admin → Bling NF-e')
    return { status: res.status, body: await res.text() }
  }

  const destino = join(destinoRaiz, grupoNome)
  mkdirSync(destino, { recursive: true })

  // 1) lista as notas de entrada (tipo=0)
  const notas: { id: number; numero: string; chave: string; contato: string }[] = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const { status, body } = await api(`/nfe?tipo=0&pagina=${pagina}&limite=100`)
    if (status !== 200) { console.error(`erro ${status} na página ${pagina}: ${body.slice(0, 200)}`); break }
    const d = JSON.parse(body)?.data ?? []
    if (!d.length) break
    for (const n of d) {
      notas.push({
        id: n.id,
        numero: String(n.numero ?? '').replace(/^0+/, ''),
        chave: n.chaveAcesso ?? '',
        contato: n.contato?.nome ?? '',
      })
    }
    await dorme(400)
  }
  console.log(`${notas.length} nota(s) de entrada no Bling (${grupoNome})`)

  // 2) para cada uma, pega o link do XML e baixa
  let baixados = 0, pulados = 0, semXml = 0, erros = 0
  for (const nota of notas) {
    // O nome usa a chave quando existe: é única e evita colisão entre
    // fornecedores que repetem número de nota.
    const arquivo = join(destino, `${nota.chave || `nf${nota.numero}-${nota.id}`}.xml`)
    if (existsSync(arquivo)) { pulados++; continue }

    try {
      const { status, body } = await api(`/nfe/${nota.id}`)
      await dorme(400)
      if (status !== 200) { erros++; continue }
      const link = JSON.parse(body)?.data?.xml
      if (!link) { semXml++; continue }

      const res = await fetch(link)
      if (!res.ok) { erros++; continue }
      const xml = await res.text()
      // O link assinado às vezes devolve uma página de erro em HTML.
      if (!xml.includes('<infNFe')) { semXml++; continue }

      writeFileSync(arquivo, xml, 'utf8')
      baixados++
      if (baixados % 25 === 0) console.log(`  ${baixados} baixados...`)
      await dorme(400)
    } catch (e) {
      console.error(`  NF ${nota.numero} (${nota.contato}): ${e instanceof Error ? e.message : e}`)
      erros++
      if (String(e).includes('401')) break
    }
  }

  console.log(`\n${baixados} XML(s) baixado(s) em ${destino}`)
  console.log(`  ${pulados} já existiam · ${semXml} sem XML no Bling · ${erros} com erro`)
  console.log(`\nAgora rode:\n  npx dotenv-cli -e .env.local -- node --import tsx scripts/semear-fiscal-motos.ts --pasta "${destinoRaiz}" --aplicar`)
  process.exit(0)
}

main()
