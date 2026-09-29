/**
 * Arquiva no disco o XML e o DANFE (PDF) de toda NF-e de SAÍDA emitida pelo
 * Bling — feito para encerrar a conta do Bling sem perder o acervo fiscal
 * (a lei pede guardar o XML por 5 anos).
 *
 * Reentrante: pula o que já está baixado. Rode de novo no último dia antes de
 * encerrar o Bling para pegar as notas mais novas.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/arquivar-nfe-saida-bling.ts --grupo "Sul de Minas"
 *   (opcional) --pasta "D:\ECOMOV\Notas de Saida\_Bling"
 *
 * Saída: <pasta>/<grupo>/<AAAA-MM>/NF-<numero>_<chave>.xml|.pdf e
 * <pasta>/<grupo>/indice.csv (inclusive as notas que nunca foram autorizadas).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { buscarNfeIdPorNumero } from '../src/lib/bling'

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

const API = 'https://api.bling.com.br/Api/v3'
const SITUACAO: Record<number, string> = {
  1: 'Pendente', 2: 'Cancelada', 3: 'Aguardando recibo', 4: 'Rejeitada', 5: 'Autorizada',
  6: 'Emitida DANFE', 7: 'Registrada', 8: 'Aguardando protocolo', 9: 'Denegada', 10: 'Consulta situação', 11: 'Bloqueada',
}
// Só estas têm XML autorizado pela SEFAZ. Cancelada também: o XML original
// precisa ser guardado junto com o evento de cancelamento.
const COM_XML = new Set([2, 5, 6, 7])

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false })
  const [g] = await sql`select id from grupos where nome = ${grupoNome!}`
  if (!g) throw new Error(`Grupo "${grupoNome}" não encontrado`)

  let token = ''
  const renovar = async () => {
    // Qualquer chamada autenticada do app passa por getToken, que renova e grava.
    await buscarNfeIdPorNumero(g.id, '1')
    const [c] = await sql`select access_token from bling_config where grupo_id = ${g.id}`
    token = c.access_token
  }
  await renovar()

  const api = async (p: string): Promise<any> => {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      await espera(380) // limite do Bling: 3 req/s
      const r = await fetch(API + p, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      if (r.status === 401) { await renovar(); continue }
      if (r.status === 429) { await espera(3000); continue }
      if (!r.ok) throw new Error(`Bling ${p} → ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return r.json()
    }
    throw new Error(`Bling ${p}: desisti depois de 5 tentativas`)
  }

  const baixar = async (url: string, destino: string, confere: (b: Buffer) => boolean) => {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(url)
      const b = Buffer.from(await r.arrayBuffer())
      if (r.ok && confere(b)) { writeFileSync(destino, b); return true }
      await espera(1500)
    }
    return false
  }

  const pastaGrupo = join(raiz, grupoNome!)
  mkdirSync(pastaGrupo, { recursive: true })

  // 1) lista todas as notas de saída
  const notas: any[] = []
  for (let pagina = 1; ; pagina++) {
    const r = await api(`/nfe?tipo=1&pagina=${pagina}&limite=100`)
    if (!r?.data?.length) break
    notas.push(...r.data)
  }
  console.log(`${grupoNome}: ${notas.length} notas de saída no Bling`)

  const linhas = [['numero', 'serie', 'data_emissao', 'situacao', 'cliente', 'documento', 'valor', 'chave', 'xml', 'danfe'].join(';')]
  let novos = 0, jaTinha = 0, falhas = 0

  notas.sort((a, b) => String(a.dataEmissao).localeCompare(String(b.dataEmissao)))
  for (const [i, n] of notas.entries()) {
    const situacao = SITUACAO[n.situacao] ?? String(n.situacao)
    const data = String(n.dataEmissao ?? '').slice(0, 10)
    const mes = data.slice(0, 7) || 'sem-data'
    let chave = n.chaveAcesso ?? ''
    let xmlArq = '', pdfArq = ''

    if (COM_XML.has(n.situacao)) {
      const pasta = join(pastaGrupo, mes)
      mkdirSync(pasta, { recursive: true })
      const base = (c: string) => join(pasta, `NF-${n.numero}_${c || n.id}`)

      // Já baixado numa rodada anterior? (chave vem na listagem)
      if (chave && existsSync(base(chave) + '.xml') && existsSync(base(chave) + '.pdf')) {
        xmlArq = base(chave) + '.xml'; pdfArq = base(chave) + '.pdf'; jaTinha++
      } else {
        const d = (await api(`/nfe/${n.id}`))?.data ?? {}
        chave = d.chaveAcesso || chave
        const alvo = base(chave)
        const okXml = d.xml && (existsSync(alvo + '.xml') || await baixar(d.xml, alvo + '.xml', b => b.includes('<infNFe') || b.includes('<nfeProc')))
        const okPdf = d.linkPDF && (existsSync(alvo + '.pdf') || await baixar(d.linkPDF, alvo + '.pdf', b => b.subarray(0, 4).toString() === '%PDF'))
        if (okXml) xmlArq = alvo + '.xml'
        if (okPdf) pdfArq = alvo + '.pdf'
        if (okXml && okPdf) novos++
        else { falhas++; console.warn(`  ! NF ${n.numero}: ${okXml ? '' : 'XML '}${okPdf ? '' : 'PDF '}não baixou`) }
      }
    }

    // A listagem do Bling não traz série nem valor; o XML baixado traz.
    let serie = n.serie ?? '', valor = n.valorNota ?? ''
    if (xmlArq) {
      const x = readFileSync(xmlArq, 'utf8')
      serie = x.match(/<serie>(\d+)<\/serie>/)?.[1] ?? serie
      valor = x.match(/<vNF>([\d.]+)<\/vNF>/)?.[1] ?? valor
    }
    linhas.push([
      csv(n.numero), csv(serie), csv(data), csv(situacao), csv(n.contato?.nome),
      csv(n.contato?.numeroDocumento), csv(String(valor).replace('.', ',')), csv(chave),
      csv(xmlArq ? xmlArq.slice(pastaGrupo.length + 1) : ''), csv(pdfArq ? pdfArq.slice(pastaGrupo.length + 1) : ''),
    ].join(';'))

    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${notas.length} (novos ${novos}, já tinha ${jaTinha}, falhas ${falhas})`)
  }

  // BOM para o Excel abrir acentos certos.
  writeFileSync(join(pastaGrupo, 'indice.csv'), '\uFEFF' + linhas.join('\r\n'), 'utf8')
  console.log(`${grupoNome}: pronto — novos ${novos}, já tinha ${jaTinha}, falhas ${falhas}. Índice em ${join(pastaGrupo, 'indice.csv')}`)
  await sql.end()
  process.exit(falhas ? 2 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
