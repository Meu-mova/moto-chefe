/**
 * Script de importação de vendas históricas.
 * Uso: npx tsx scripts/importar-vendas.ts "caminho/planilha.xlsx"
 *
 * Colunas esperadas:
 *   MODELO | COR | MODELO CHASSI MOTOR COR | LOJA | VENDEDOR | NF SAÍDA | VALOR | DATA
 */

import * as XLSX from 'xlsx'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, inArray } from 'drizzle-orm'
import { motos, modelos, lojas, usuarios, pedidosVenda, vendas, historicoEstoque } from '../src/lib/db/schema'
import * as path from 'path'
import { randomUUID } from 'crypto'

const DB_URL = 'postgresql://postgres:Motochefe%402026@db.bzlaradpofaecqzawyym.supabase.co:5432/postgres'

// Apelidos/nomes curtos usados na planilha → nome que aparece no banco
const ALIASES: Record<string, string> = {
  'juninho': 'juscelino',
  'karla':   'karla',
}

// Correções manuais: linha → valor corrigido
const CORRECOES_VALOR: Record<number, string> = {
  71: '12290',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function col(row: Record<string, unknown>, nome: string): string {
  const key = Object.keys(row).find(k => k.trim().toUpperCase() === nome.toUpperCase())
  return String(key ? (row[key] ?? '') : '').trim()
}

function req(row: Record<string, unknown>, nome: string): string {
  const v = col(row, nome)
  if (!v) throw new Error(`Coluna "${nome}" está vazia`)
  return v
}

function excelDateToISO(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

function parseValor(v: string): number {
  // Remove prefixo "R$" e espaços
  let s = v.replace(/R\$\s*/gi, '').trim()
  if (s.includes(',')) {
    // Formato brasileiro: 8.990,00 → remove pontos de milhar, troca vírgula por ponto
    s = s.replace(/\./g, '').replace(',', '.')
  }
  // Se só tem ponto (ex: 10990.00) ou número puro (ex: 8000), parseFloat direto
  return parseFloat(s)
}

function sortear<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const arquivo = process.argv[2]
  if (!arquivo) {
    console.error('\nUso: npx tsx scripts/importar-vendas.ts "caminho/planilha.xlsx"')
    process.exit(1)
  }

  const caminhoAbsoluto = path.resolve(arquivo)
  console.log(`\nLendo: ${caminhoAbsoluto}`)

  const wb = XLSX.readFile(caminhoAbsoluto)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const linhas = (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[])
    .filter(r => Object.values(r).some(v => String(v).trim() !== ''))

  console.log(`${linhas.length} linhas encontradas.`)

  // ── Pré-passa: mapeia NF SAÍDA → data para interpolar datas vazias ────────
  const nfParaData = new Map<number, string>()
  for (const r of linhas) {
    const nf      = parseFloat(col(r, 'NF SAÍDA'))
    const dataRaw = col(r, 'DATA')
    if (!isNaN(nf) && dataRaw) {
      const serial = parseFloat(dataRaw)
      if (!isNaN(serial)) nfParaData.set(nf, excelDateToISO(serial))
    }
  }

  function dataDoNFMaisProximo(nf: number): string | null {
    let melhor: string | null = null
    let menorDist = Infinity
    for (const [n, d] of nfParaData) {
      const dist = Math.abs(n - nf)
      if (dist < menorDist) { menorDist = dist; melhor = d }
    }
    return melhor
  }

  console.log(`  ${nfParaData.size} datas mapeadas via NF SAÍDA.\n`)

  const client = postgres(DB_URL, { prepare: false })
  const db = drizzle(client)

  // ── Pré-carrega lojas ─────────────────────────────────────────────────────
  const todasLojas = await db.select({ id: lojas.id, nome: lojas.nome }).from(lojas)
  const lojaCache = new Map<string, string>()
  for (const l of todasLojas) lojaCache.set(norm(l.nome), l.id)
  // Aliases de loja: nomes usados na planilha → nome no banco
  const lojaAliases: Record<string, string> = {
    'galpão': 'galpão matriz',
    'galpao': 'galpão matriz',
  }
  for (const [alias, real] of Object.entries(lojaAliases)) {
    const id = lojaCache.get(norm(real))
    if (id) lojaCache.set(alias, id)
  }

  // ── Garante que Karla existe como usuária inativa ─────────────────────────
  const karlaEmail = 'karla.inativa@motochefesuldeminas.com.br'
  const lojaVarginha = todasLojas.find(l => norm(l.nome).includes('varginha'))

  let todosUsuarios = await db
    .select({ id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId, papel: usuarios.papel })
    .from(usuarios)

  const karlaExiste = todosUsuarios.find(u => norm(u.nome) === 'karla')
  if (!karlaExiste && lojaVarginha) {
    const karlaId = randomUUID()
    await db.insert(usuarios).values({
      id:     karlaId,
      nome:   'Karla',
      email:  karlaEmail,
      papel:  'vendedor' as any,
      lojaId: lojaVarginha.id,
    })
    todosUsuarios.push({ id: karlaId, nome: 'Karla', lojaId: lojaVarginha.id, papel: 'vendedor' as any })
    console.log(`  ✚  Usuária criada: Karla (Varginha, inativa)\n`)
  }

  // ── Vendedores por loja (para sorteio quando VENDEDOR estiver vazio) ───────
  const papeisPodeVender = new Set(['vendedor', 'aux_adm', 'admin_socio'])
  const vendedoresPorLoja = new Map<string, typeof todosUsuarios>()
  for (const u of todosUsuarios) {
    if (!u.lojaId || !papeisPodeVender.has(u.papel)) continue
    if (!vendedoresPorLoja.has(u.lojaId)) vendedoresPorLoja.set(u.lojaId, [])
    vendedoresPorLoja.get(u.lojaId)!.push(u)
  }

  // ── Pré-carrega modelos ───────────────────────────────────────────────────
  const todosModelos = await db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos)
  const modeloCache = new Map<string, string>()

  let inseridas = 0
  let puladas   = 0
  let erros     = 0

  for (let i = 0; i < linhas.length; i++) {
    const row    = linhas[i]
    const nLinha = i + 2

    try {
      // ── Campos obrigatórios ───────────────────────────────────────────────
      const modeloNome = req(row, 'MODELO')
      const cor        = req(row, 'COR')
      const chassiRaw  = req(row, 'MODELO CHASSI MOTOR COR')
      const lojaNome   = req(row, 'LOJA')
      const nfSaida        = col(row, 'NF SAÍDA')
      const valorRawOrig   = col(row, 'VALOR')
      const valorRaw       = CORRECOES_VALOR[nLinha] ?? valorRawOrig
      const dataRaw        = col(row, 'DATA')

      if (!valorRaw) throw new Error('Coluna "VALOR" está vazia')

      const valor = parseValor(String(valorRaw))
      if (isNaN(valor) || valor <= 0) throw new Error(`Valor inválido: "${valorRawOrig}"`)

      // Data: usa a da planilha ou interpola pelo NF mais próximo
      let dataISO: string
      if (dataRaw) {
        const serial = parseFloat(String(dataRaw))
        dataISO = isNaN(serial) ? String(dataRaw) : excelDateToISO(serial)
      } else {
        const nfNum = parseFloat(nfSaida)
        const interpolada = !isNaN(nfNum) ? dataDoNFMaisProximo(nfNum) : null
        if (!interpolada) throw new Error('DATA vazia e não foi possível interpolar')
        dataISO = interpolada
        console.log(`  ℹ  Linha ${nLinha}: data interpolada (NF ${nfSaida}) → ${dataISO}`)
      }

      // ── Resolve loja ──────────────────────────────────────────────────────
      let lojaId = lojaCache.get(norm(lojaNome))
      if (!lojaId) {
        const partial = todasLojas.find(l =>
          norm(l.nome).includes(norm(lojaNome)) || norm(lojaNome).includes(norm(l.nome))
        )
        if (partial) { lojaId = partial.id; lojaCache.set(norm(lojaNome), lojaId) }
        else throw new Error(`Loja "${lojaNome}" não encontrada`)
      }

      // ── Resolve vendedor ──────────────────────────────────────────────────
      const vendedorNomeRaw = col(row, 'VENDEDOR')
      let vendedor: typeof todosUsuarios[0] | undefined

      if (vendedorNomeRaw) {
        const busca = ALIASES[norm(vendedorNomeRaw.split(' ')[0])] ?? norm(vendedorNomeRaw.split(' ')[0])
        vendedor = todosUsuarios.find(u =>
          norm(u.nome).startsWith(busca) ||
          norm(u.nome).split(' ').some(p => p === busca)
        )
        if (!vendedor) throw new Error(`Vendedor "${vendedorNomeRaw}" não encontrado`)
      } else {
        // Sorteia um vendedor da mesma loja
        const pool = vendedoresPorLoja.get(lojaId) ?? []
        if (pool.length === 0) throw new Error(`Nenhum vendedor encontrado para a loja "${lojaNome}"`)
        vendedor = sortear(pool)
      }

      // ── Resolve modelo ────────────────────────────────────────────────────
      const modeloKey = norm(modeloNome)
      let modeloId = modeloCache.get(modeloKey)
      if (!modeloId) {
        const existente = todosModelos.find(m => norm(m.modelo) === modeloKey)
        if (existente) {
          modeloId = existente.id
        } else {
          const [novo] = await db.insert(modelos).values({
            marca: 'Desconhecida', modelo: modeloNome,
            categoria: 'autopropelido', potenciaW: '—', motor: '—', velocidadeMax: '—',
          }).returning({ id: modelos.id })
          modeloId = novo.id
          todosModelos.push({ id: modeloId, modelo: modeloNome })
          console.log(`  ✚  Modelo criado: ${modeloNome}`)
        }
        modeloCache.set(modeloKey, modeloId)
      }

      // ── Verifica chassi duplicado ─────────────────────────────────────────
      const [motoExistente] = await db
        .select({ id: motos.id })
        .from(motos)
        .where(eq(motos.chassi, chassiRaw))
        .limit(1)

      if (motoExistente) {
        console.log(`  ↩  Linha ${nLinha}: chassi já existe — pulado`)
        puladas++
        continue
      }

      // ── Cria moto (vendida) ───────────────────────────────────────────────
      const [novaMoto] = await db.insert(motos).values({
        chassi:            chassiRaw,
        modeloId,
        lojaId,
        cor,
        notaFiscalEntrada: 'Histórico',
        status:            'vendida' as any,
        disponibilidade:   'vendida' as any,
      }).returning({ id: motos.id })

      const dataTimestamp = new Date(dataISO + 'T12:00:00Z')

      // ── Cria pedido de venda ──────────────────────────────────────────────
      const [pedido] = await db.insert(pedidosVenda).values({
        motoId:          novaMoto.id,
        lojaId,
        vendedorId:      vendedor.id,
        status:          'efetivado' as any,
        dataPedido:      dataTimestamp,
        dataAtualizacao: dataTimestamp,
        observacao:      'Importação histórica',
      }).returning({ id: pedidosVenda.id })

      // ── Cria venda ────────────────────────────────────────────────────────
      await db.insert(vendas).values({
        pedidoVendaId:   pedido.id,
        motoId:          novaMoto.id,
        lojaId,
        vendedorId:      vendedor.id,
        efetivadoPor:    vendedor.id,
        clienteNome:     'Não informado',
        clienteCpf:      '000.000.000-00',
        valor:           String(valor),
        formaPagamento:  'Não informado',
        notaFiscalSaida: nfSaida || null,
        dataVenda:       dataTimestamp,
      } as any)

      // ── Histórico ─────────────────────────────────────────────────────────
      await db.insert(historicoEstoque).values({
        motoId:         novaMoto.id,
        usuarioId:      vendedor.id,
        tipo:           'saida' as any,
        statusAnterior: 'montada' as any,
        statusNovo:     'vendida' as any,
        data:           dataTimestamp,
        observacao:     `Venda histórica — NF Saída: ${nfSaida || 'N/A'} — R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      })

      inseridas++
      const semVendedor = vendedorNomeRaw ? '' : ' [vendedor sorteado]'
      console.log(`  ✔  Linha ${nLinha}: ${modeloNome} | ${cor} | ${lojaNome} | ${vendedor.nome}${semVendedor} | R$ ${valor.toLocaleString('pt-BR')} | ${dataISO}`)

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
}

main().catch(e => {
  console.error('\nErro fatal:', e.message)
  process.exit(1)
})
