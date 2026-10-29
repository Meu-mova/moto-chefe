import { and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'

// Preço de compra e totais da impressão só para os sócios (decisão do Luis, #512).
const VEEM_VALORES = ['admin_geral', 'admin_socio']

// O preço não vem na consulta da tela; para quem não é sócio nem se busca (null).
// As lojas repetem o filtro já validado: id de moto de outra loja não traz preço.
export async function precosParaImpressao(papel: string, motoIds: string[], lojaIds: string[], exec: Pick<typeof db, 'select'> = db) {
  if (!VEEM_VALORES.includes(papel)) return null
  if (!motoIds.length || !lojaIds.length) return new Map<string, string | null>()
  const linhas = await exec.select({ chassi: motos.chassi, preco: motos.precoCompra }).from(motos)
    .where(and(inArray(motos.id, motoIds), inArray(motos.lojaId, lojaIds)))
  return new Map(linhas.map(m => [m.chassi, m.preco]))
}
