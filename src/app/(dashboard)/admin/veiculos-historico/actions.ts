'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { veiculosHistorico, motos } from '@/lib/db/schema'
import { sql, inArray } from 'drizzle-orm'

export type VeiculoImportRow = {
  chassi: string
  numeroMotor?: string
  marca: string
  modelo: string
  cor?: string
  ano?: number
  nfEntrada?: string
}

export async function importarVeiculosAction(rows: VeiculoImportRow[]) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  if (!rows.length) throw new Error('Nenhum registro para importar')
  if (rows.length > 50000) throw new Error('Máximo de 50.000 registros por importação')

  // Valida campos obrigatórios
  const invalidos = rows.filter(r => !r.chassi?.trim() || !r.marca?.trim() || !r.modelo?.trim())
  if (invalidos.length > 0) {
    throw new Error(`${invalidos.length} linhas sem chassi, marca ou modelo`)
  }

  const valoresBrutos = rows.map(r => ({
    chassi:       r.chassi.trim().toUpperCase(),
    numeroMotor:  r.numeroMotor?.trim() || null,
    marca:        r.marca.trim(),
    modelo:       r.modelo.trim(),
    cor:          r.cor?.trim() || null,
    ano:          r.ano ?? null,
    nfEntrada:    r.nfEntrada?.trim() || null,
  }))

  // Deduplica por chassi (mantém a última ocorrência) para evitar
  // "ON CONFLICT DO UPDATE cannot affect row a second time"
  const mapaDedup = new Map<string, typeof valoresBrutos[0]>()
  for (const v of valoresBrutos) mapaDedup.set(v.chassi, v)
  const valores = Array.from(mapaDedup.values())

  // Insere em lotes de 500 para não estourar o limite de 65535 parâmetros do PostgreSQL
  const LOTE = 500
  for (let i = 0; i < valores.length; i += LOTE) {
    await db
      .insert(veiculosHistorico)
      .values(valores.slice(i, i + LOTE))
      .onConflictDoUpdate({
        target: veiculosHistorico.chassi,
        set: {
          numeroMotor: sql`excluded.numero_motor`,
          marca:       sql`excluded.marca`,
          modelo:      sql`excluded.modelo`,
          cor:         sql`excluded.cor`,
          ano:         sql`excluded.ano`,
          nfEntrada:   sql`excluded.nf_entrada`,
          importadoEm: sql`now()`,
        },
      })
  }

  return { importados: valores.length }
}

// Retorna o Set de chassis que já existem na tabela motos (estoque ativo/vendido)
export async function verificarChassisExistentesAction(chassiList: string[]): Promise<Set<string>> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) return new Set()
  if (!chassiList.length) return new Set()

  const normalizados = chassiList.map(c => c.trim().toUpperCase())

  // inArray também tem limite — busca em lotes de 1000
  const LOTE = 1000
  const todoEncontrados: string[] = []
  for (let i = 0; i < normalizados.length; i += LOTE) {
    const lote = normalizados.slice(i, i + LOTE)
    const resultado = await db
      .select({ chassi: motos.chassi })
      .from(motos)
      .where(inArray(motos.chassi, lote))
    todoEncontrados.push(...resultado.map(r => r.chassi).filter(Boolean) as string[])
  }

  return new Set(todoEncontrados)
}

export async function contarVeiculosHistoricoAction() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) return 0
  const [r] = await db.select({ total: sql<number>`count(*)::int` }).from(veiculosHistorico)
  return r?.total ?? 0
}
