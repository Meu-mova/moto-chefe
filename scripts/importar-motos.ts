/**
 * Script de importação de motos a partir de planilha Excel.
 * Uso: npx tsx scripts/importar-motos.ts "C:\caminho\planilha.xlsx"
 *
 * Colunas esperadas (nome exato, case-insensitive):
 *   MARCA | MODELO | COR | POTÊNCIA | NF ENTRADA | STATUS | DISPONIBILIDADE
 *   CHASSI | MOTOR | LOCALIZAÇÃO | CATEGORIA
 */

import * as XLSX from 'xlsx'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, and } from 'drizzle-orm'
import { modelos, motos, lojas } from '../src/lib/db/schema'
import * as path from 'path'

const DB_URL = process.env.DATABASE_URL!

// ── Mapeamentos ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  'caixa':    'caixa',
  'montado':  'montada',
  'montada':  'montada',
  'garantia': 'em_garantia',
  'em garantia': 'em_garantia',
}

const DISP_MAP: Record<string, string | null> = {
  'disponível':    'disponivel',
  'disponivel':    'disponivel',
  'indisponível':  null,          // sem equivalente — importa sem disponibilidade
  'indisponivel':  null,
  'reservada':     'reservada',
  'vendida':       'vendida',
}

const CAT_MAP: Record<string, string> = {
  'autopropelido': 'autopropelido',
  'ciclomotor':    'ciclomotor',
  'triciclo':      'triciclo',
  'bike':          'bike',
  'brinquedo':     'brinquedo',
  'patinete':      'patinete',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function col(row: Record<string, unknown>, nome: string): string {
  const key = Object.keys(row).find(k => k.trim().toUpperCase() === nome.toUpperCase())
  return String(key ? row[key] : '').trim()
}

function req(row: Record<string, unknown>, nome: string, nLinha: number): string {
  const v = col(row, nome)
  if (!v) throw new Error(`Coluna "${nome}" está vazia`)
  return v
}

// ── Leitura do Excel ──────────────────────────────────────────────────────────

function lerPlanilha(arquivo: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(arquivo)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
  // Filtra linhas completamente vazias
  return rows.filter(r => Object.values(r).some(v => String(v).trim() !== ''))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const arquivo = process.argv[2]
  if (!arquivo) {
    console.error('\nUso: npx tsx scripts/importar-motos.ts "caminho/planilha.xlsx"')
    process.exit(1)
  }

  const caminhoAbsoluto = path.resolve(arquivo)
  console.log(`\nLendo: ${caminhoAbsoluto}`)

  let linhas: Record<string, unknown>[]
  try {
    linhas = lerPlanilha(caminhoAbsoluto)
  } catch (e: any) {
    console.error(`Erro ao ler o arquivo: ${e.message}`)
    process.exit(1)
  }

  console.log(`${linhas.length} linhas encontradas.\n`)

  const client = postgres(DB_URL, { prepare: false })
  const db = drizzle(client)

  // Pré-carrega lojas
  const todasLojas = await db.select({ id: lojas.id, nome: lojas.nome }).from(lojas)
  const lojaCache = new Map<string, string>()
  for (const l of todasLojas) lojaCache.set(norm(l.nome), l.id)

  // Cache de modelos criados/encontrados nesta execução
  const modeloCache = new Map<string, string>()

  let inseridas = 0
  let puladas = 0
  let erros = 0

  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i]
    const nLinha = i + 2

    try {
      // ── Campos obrigatórios ───────────────────────────────────────────────
      const marca       = req(row, 'MARCA',          nLinha)
      const modeloNome  = req(row, 'MODELO',         nLinha)
      const cor         = req(row, 'COR',            nLinha)
      const potencia    = req(row, 'POTÊNCIA',       nLinha)
      const nfEntrada   = col(row, 'NF ENTRADA')
      const chassi      = req(row, 'CHASSI',         nLinha)
      const motor       = req(row, 'MOTOR',          nLinha)
      const localizacao = req(row, 'LOCALIZAÇÃO',    nLinha)
      const statusRaw   = req(row, 'STATUS',         nLinha)
      const categoriaRaw= col(row, 'CATEGORIA')
      const dispRaw     = col(row, 'DISPONIBILIDADE')

      // ── Mapeamento de status ──────────────────────────────────────────────
      const status = STATUS_MAP[norm(statusRaw)]
      if (!status) {
        throw new Error(`Status "${statusRaw}" não reconhecido. Aceitos: Caixa, Montado, Garantia`)
      }

      // ── Mapeamento de disponibilidade ─────────────────────────────────────
      let disponibilidade: string | null = null
      if (dispRaw) {
        const chave = norm(dispRaw)
        if (!(chave in DISP_MAP)) {
          throw new Error(`Disponibilidade "${dispRaw}" não reconhecida. Aceitos: Disponível, Indisponível, Reservada, Vendida`)
        }
        disponibilidade = DISP_MAP[chave]
        if (disponibilidade === null) {
          console.log(`  ⚠  Linha ${nLinha}: "${dispRaw}" importado sem disponibilidade (sem equivalente no sistema)`)
        }
      }

      // ── Mapeamento de categoria ───────────────────────────────────────────
      const categoria = categoriaRaw ? (CAT_MAP[norm(categoriaRaw)] ?? null) : null
      if (categoriaRaw && !categoria) {
        throw new Error(`Categoria "${categoriaRaw}" não reconhecida. Aceitos: Autopropelido, Ciclomotor, Triciclo, Bike, Brinquedo, Patinete`)
      }

      // ── Resolve loja ──────────────────────────────────────────────────────
      let lojaId = lojaCache.get(norm(localizacao))
      if (!lojaId) {
        // match parcial — ex: "loja a" encontra "Loja A - Centro"
        const partial = todasLojas.find(l =>
          norm(l.nome).includes(norm(localizacao)) ||
          norm(localizacao).includes(norm(l.nome))
        )
        if (partial) {
          lojaId = partial.id
          lojaCache.set(norm(localizacao), lojaId)
        } else {
          throw new Error(
            `Loja "${localizacao}" não encontrada. Lojas cadastradas: ${todasLojas.map(l => l.nome).join(' | ')}`
          )
        }
      }

      // ── Resolve modelo (cria se não existir) ──────────────────────────────
      const modeloKey = `${norm(marca)}||${norm(modeloNome)}`
      let modeloId = modeloCache.get(modeloKey)

      if (!modeloId) {
        const [existente] = await db
          .select({ id: modelos.id })
          .from(modelos)
          .where(and(eq(modelos.marca, marca), eq(modelos.modelo, modeloNome)))
          .limit(1)

        if (existente) {
          modeloId = existente.id
        } else {
          const [novo] = await db.insert(modelos).values({
            marca,
            modelo: modeloNome,
            categoria: (categoria ?? 'autopropelido') as any,
            potenciaW: String(potencia),
            motor,
            velocidadeMax: '—',
          }).returning({ id: modelos.id })
          modeloId = novo.id
          console.log(`  ✚  Modelo criado: ${marca} ${modeloNome} (${categoria ?? 'autopropelido'})`)
        }

        modeloCache.set(modeloKey, modeloId)
      }

      // ── Verifica chassi duplicado ─────────────────────────────────────────
      const [motoExistente] = await db
        .select({ id: motos.id })
        .from(motos)
        .where(eq(motos.chassi, chassi))
        .limit(1)

      if (motoExistente) {
        console.log(`  ↩  Linha ${nLinha}: chassi ${chassi} já existe — pulado`)
        puladas++
        continue
      }

      // ── Insere moto ───────────────────────────────────────────────────────
      await db.insert(motos).values({
        chassi,
        modeloId,
        lojaId,
        cor,
        notaFiscalEntrada: String(nfEntrada),
        status: status as any,
        disponibilidade: disponibilidade as any ?? undefined,
      })

      inseridas++
      console.log(`  ✔  Linha ${nLinha}: ${marca} ${modeloNome} | ${chassi} | ${cor} → ${localizacao}`)

    } catch (err: any) {
      erros++
      console.error(`  ✖  Linha ${nLinha}: ${err.message}`)
    }
  }

  await client.end()

  console.log('\n─────────────────────────────────────────────')
  console.log(`Importação concluída:`)
  console.log(`  ✔  Inseridas : ${inseridas}`)
  console.log(`  ↩  Puladas   : ${puladas} (chassi duplicado)`)
  console.log(`  ✖  Erros     : ${erros}`)
  if (erros > 0) {
    console.log('\nRevise as linhas com erro e execute novamente — as já inseridas serão puladas.')
  }
}

main().catch(e => {
  console.error('\nErro fatal:', e.message)
  process.exit(1)
})
