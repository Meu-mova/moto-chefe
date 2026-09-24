/**
 * Preenche a ficha fiscal das motos já cadastradas, a partir dos XMLs das notas
 * de entrada.
 *
 * O caminho normal é a importação no módulo Entrada, que grava a ficha junto com
 * a moto. Este script é o mesmo trabalho olhando para trás, para as motos que
 * entraram antes de a ficha existir. A ligação é pelo CHASSI, que a nota traz no
 * infAdic/infCpl — por isso dá para acertar moto a moto, e não por modelo.
 *
 * Lê duas fontes:
 *   - uma pasta de XMLs (recursiva), como `D:\ECOMOV\Notas de Entrada\Sul de Minas`
 *   - o que o Radar Fiscal já baixou da SEFAZ (`nfe_recebidas.xml`), com --radar
 *
 * Uso:
 *   node --import tsx scripts/semear-fiscal-motos.ts --pasta "D:\...\Sul de Minas"
 *   node --import tsx scripts/semear-fiscal-motos.ts --radar
 *   ... --aplicar    para gravar (sem isso, só simula)
 *
 * Reentrante: a ficha é um snapshot da entrada, então moto que já tem não é
 * tocada (`onConflictDoNothing`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../src/lib/db'
import { motos, motosFiscal, nfeRecebidas, modelos } from '../src/lib/db/schema'
import { isNotNull } from 'drizzle-orm'
import { parseMotosInfCpl, extrairDaNfe } from '../src/lib/nfe-entrada'
import { extrairFiscalDaNfe, extrairEmitenteDaNfe, ligarFichasAosChassis } from '../src/lib/nfe-fiscal'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const usarRadar = args.includes('--radar')
const pasta = args[args.indexOf('--pasta') + 1]

function listarXmls(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...listarXmls(p))
    else if (nome.toLowerCase().endsWith('.xml')) out.push(p)
  }
  return out
}

/** Notas antigas saem em ISO-8859-1; ler tudo como UTF-8 corrompe o acento. */
function lerXml(caminho: string): string {
  const buf = readFileSync(caminho)
  const utf8 = buf.toString('utf8')
  return utf8.includes('\uFFFD') ? buf.toString('latin1') : utf8
}

async function main() {
  if (!pasta && !usarRadar) {
    console.error('Informe --pasta "<caminho>" ou --radar')
    process.exit(1)
  }

  const xmls: string[] = []
  if (pasta) xmls.push(...listarXmls(pasta).map(lerXml))
  if (usarRadar) {
    const rows = await db
      .select({ xml: nfeRecebidas.xml })
      .from(nfeRecebidas)
      .where(isNotNull(nfeRecebidas.xml))
    xmls.push(...rows.map(r => r.xml!))
  }

  const noBanco = await db.select({ id: motos.id, chassi: motos.chassi }).from(motos)
  // O catálogo desempata nomes que só ele liga: "X12-1000W" do infCpl com o
  // item "X12 MOTO CHEFE" da nota. Ver ligarFichasAosChassis.
  const nomesCatalogo = (await db.select({ modelo: modelos.modelo }).from(modelos)).map(m => m.modelo)
  const idPorChassi = new Map(noBanco.map(m => [m.chassi.trim().toUpperCase(), m.id]))
  const jaTem = new Set(
    (await db.select({ motoId: motosFiscal.motoId }).from(motosFiscal)).map(r => r.motoId),
  )

  const aGravar = new Map<string, { motoId: string; valores: typeof motosFiscal.$inferInsert; emit: string }>()
  let semMoto = 0
  let semFicha = 0

  for (const xml of xmls) {
    const emitente = extrairEmitenteDaNfe(xml)
    const { infCpl } = extrairDaNfe(xml)
    const motosDaNota = parseMotosInfCpl(infCpl)
    const ligadas = ligarFichasAosChassis(motosDaNota, extrairFiscalDaNfe(xml), nomesCatalogo)

    for (const m of motosDaNota) {
      const chassi = m.chassi.trim().toUpperCase()
      const motoId = idPorChassi.get(chassi)
      if (!motoId) { semMoto++; continue }
      if (jaTem.has(motoId) || aGravar.has(chassi)) continue
      const ficha = ligadas.get(chassi)
      if (!ficha) { semFicha++; continue }

      aGravar.set(chassi, {
        motoId,
        emit: `${emitente.cnpj} ${emitente.nome}`,
        valores: {
          motoId,
          emitenteCnpj: emitente.cnpj,
          emitenteNome: emitente.nome || null,
          nfNumero: emitente.nfNumero || null,
          nfChave: emitente.nfChave || null,
          cProd: ficha.codigo || null,
          xProd: ficha.descricao || null,
          ncm: ficha.ncm,
          cest: ficha.cest || null,
          unidade: ficha.unidade || null,
          origem: ficha.origem || null,
          cfopEntrada: ficha.cfopEntrada || null,
          cstIcmsEntrada: ficha.cstIcmsEntrada || null,
          cstPis: ficha.cstPis || null,
          cstCofins: ficha.cstCofins || null,
          classTribIbsCbs: ficha.classTribIbsCbs || null,
        },
      })
    }
  }

  const porEmitente = new Map<string, number>()
  for (const { emit } of aGravar.values()) porEmitente.set(emit, (porEmitente.get(emit) ?? 0) + 1)

  console.log(`${xmls.length} XMLs · ${noBanco.length} motos no banco · ${jaTem.size} já com ficha`)
  console.log(`${aGravar.size} moto(s) a preencher`)
  console.log(`  ${semMoto} chassi(s) da nota sem moto no banco · ${semFicha} sem ficha identificada`)
  console.log('\nPor fornecedor:')
  for (const [e, n] of [...porEmitente].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${e}`)
  }

  if (!aplicar) {
    console.log('\n(simulação — rode com --aplicar para gravar)')
    process.exit(0)
  }

  let gravadas = 0
  const lista = [...aGravar.values()].map(v => v.valores)
  // Em lotes: são centenas de linhas e o pooler não gosta de insert gigante.
  for (let i = 0; i < lista.length; i += 200) {
    const res = await db
      .insert(motosFiscal)
      .values(lista.slice(i, i + 200))
      .onConflictDoNothing()
      .returning({ motoId: motosFiscal.motoId })
    gravadas += res.length
  }

  console.log(`\n${gravadas} ficha(s) gravada(s).`)
  process.exit(0)
}

main()
