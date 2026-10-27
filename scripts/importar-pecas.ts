/**
 * Script de importação do catálogo de peças a partir de planilha Excel.
 * Uso: npx tsx scripts/importar-pecas.ts "D:\ECOMOV\todas peças moto chefe.xlsx" --conta <id da Conta>
 *
 * Espera a aba "Produtos" com colunas: Nome | Modelo/Aplicação | Preço (núm.) | Disponibilidade
 *
 * Regras:
 *  - Só importa linhas com Disponibilidade = "Em Estoque" (indisponíveis ficam de fora).
 *  - Nome final = "<Nome> (<Modelo/Aplicação>)", pois o mesmo nome de peça se repete
 *    para modelos e preços diferentes na planilha.
 *  - Pula nomes finais duplicados (mesma peça + mesmo modelo aparecendo mais de uma vez)
 *    e nomes que já existem no catálogo da mesma Conta.
 *  - O catálogo é por Conta (#195): sem --conta o script não roda.
 */

import * as XLSX from 'xlsx'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { contas, pecasCatalogo } from '../src/lib/db/schema'
import { eq } from 'drizzle-orm'
import * as path from 'path'

const DB_URL = process.env.DATABASE_URL!
const BATCH_INSERT = 100

function lerPlanilha(arquivo: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(arquivo)
  const ws = wb.Sheets['Produtos'] ?? wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

async function main() {
  const arquivo = process.argv[2]
  const iConta = process.argv.indexOf('--conta')
  const contaId = iConta > 0 ? process.argv[iConta + 1] : undefined
  if (!arquivo || arquivo.startsWith('--') || !contaId) {
    console.error('\nUso: npx tsx scripts/importar-pecas.ts "caminho/planilha.xlsx" --conta <id da Conta>')
    process.exit(1)
  }

  const caminhoAbsoluto = path.resolve(arquivo)
  console.log(`\nLendo: ${caminhoAbsoluto}`)

  const linhas = lerPlanilha(caminhoAbsoluto)
  console.log(`${linhas.length} linhas na planilha.`)

  const emEstoque = linhas.filter(r => String(r['Disponibilidade']).trim() === 'Em Estoque')
  console.log(`${emEstoque.length} linhas "Em Estoque" (as demais foram ignoradas).\n`)

  const client = postgres(DB_URL, { prepare: false })
  const db = drizzle(client)

  const [conta] = await db.select({ nome: contas.nome }).from(contas).where(eq(contas.id, contaId)).limit(1)
  if (!conta) {
    console.error(`\nConta ${contaId} não encontrada.`)
    await client.end()
    process.exit(1)
  }
  console.log(`Conta de destino: ${conta.nome}`)

  const existentes = await db.select({ nome: pecasCatalogo.nome }).from(pecasCatalogo).where(eq(pecasCatalogo.contaId, contaId))
  const nomesExistentes = new Set(existentes.map(p => p.nome))

  const vistosNestaImportacao = new Set<string>()
  const paraInserir: { nome: string; valor: string; contaId: string }[] = []
  let puladasDuplicadas = 0
  let puladasJaExistiam = 0
  let erros = 0

  for (let i = 0; i < emEstoque.length; i++) {
    const row = emEstoque[i]
    const nLinha = i + 2
    try {
      const nomeBase = String(row['Nome']).trim()
      const modelo = String(row['Modelo/Aplicação']).trim()
      const preco = Number(row['Preço (núm.)'])

      if (!nomeBase) throw new Error('Nome vazio')
      if (!Number.isFinite(preco) || preco < 0) throw new Error(`Preço inválido: ${row['Preço (núm.)']}`)

      const nomeFinal = modelo ? `${nomeBase} (${modelo})` : nomeBase

      if (nomesExistentes.has(nomeFinal)) {
        puladasJaExistiam++
        continue
      }
      if (vistosNestaImportacao.has(nomeFinal)) {
        puladasDuplicadas++
        continue
      }
      vistosNestaImportacao.add(nomeFinal)

      paraInserir.push({ nome: nomeFinal, valor: String(preco), contaId })
    } catch (err: any) {
      erros++
      console.error(`  ✖  Linha ${nLinha}: ${err.message}`)
    }
  }

  console.log(`\nPreparadas para inserir: ${paraInserir.length}`)

  let inseridas = 0
  for (let i = 0; i < paraInserir.length; i += BATCH_INSERT) {
    const lote = paraInserir.slice(i, i + BATCH_INSERT)
    await db.insert(pecasCatalogo).values(lote)
    inseridas += lote.length
    console.log(`Inseridas: ${inseridas}/${paraInserir.length}`)
  }

  await client.end()

  console.log('\n─────────────────────────────────────────────')
  console.log('Importação concluída:')
  console.log(`  ✔  Inseridas         : ${inseridas}`)
  console.log(`  ↩  Já existiam       : ${puladasJaExistiam}`)
  console.log(`  ↩  Duplicadas na planilha : ${puladasDuplicadas}`)
  console.log(`  ✖  Erros             : ${erros}`)
}

main().catch(e => {
  console.error('\nErro fatal:', e.message)
  process.exit(1)
})
