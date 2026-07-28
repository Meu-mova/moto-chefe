import { db } from '@/lib/db'
import { kommoLeads, kommoUserMap, usuarios } from '@/lib/db/schema'
import { sql, eq } from 'drizzle-orm'

export type LinhaAtendimento = {
  usuarioId: string | null
  nome: string
  vinculado: boolean
  volume: number
  ganhos: number
  perdidos: number
  valor: number
  ganhosSemValor: number
  conversao: number
}

// Volume = leads criados no período. Ganhos/perdidos/valor = leads fechados no
// período (status 142 ganho / 143 perdido) — "vendas do mês".
export async function metricasAtendimento(inicio: Date, fim: Date): Promise<LinhaAtendimento[]> {
  const rows = await db
    .select({
      usuarioId: kommoUserMap.usuarioId,
      nomeMova: usuarios.nome,
      nomeKommo: kommoUserMap.nomeKommo,
      volume: sql<number>`count(*) filter (where ${kommoLeads.criadoEm} >= ${inicio} and ${kommoLeads.criadoEm} <= ${fim})`,
      ganhos: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${inicio} and ${kommoLeads.fechadoEm} <= ${fim})`,
      perdidos: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 143 and ${kommoLeads.fechadoEm} >= ${inicio} and ${kommoLeads.fechadoEm} <= ${fim})`,
      valor: sql<string>`coalesce(sum(${kommoLeads.price}) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${inicio} and ${kommoLeads.fechadoEm} <= ${fim}), 0)`,
      ganhosSemValor: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${inicio} and ${kommoLeads.fechadoEm} <= ${fim} and ${kommoLeads.price} = 0)`,
    })
    .from(kommoUserMap)
    .leftJoin(kommoLeads, eq(kommoLeads.kommoUserId, kommoUserMap.kommoUserId))
    .leftJoin(usuarios, eq(usuarios.id, kommoUserMap.usuarioId))
    .groupBy(kommoUserMap.kommoUserId, kommoUserMap.usuarioId, usuarios.nome, kommoUserMap.nomeKommo)

  return rows
    .map(r => {
      const volume = Number(r.volume) || 0
      const ganhos = Number(r.ganhos) || 0
      return {
        usuarioId: r.usuarioId,
        nome: r.nomeMova ?? r.nomeKommo ?? '—',
        vinculado: !!r.usuarioId,
        volume,
        ganhos,
        perdidos: Number(r.perdidos) || 0,
        valor: Number(r.valor) || 0,
        ganhosSemValor: Number(r.ganhosSemValor) || 0,
        conversao: volume ? ganhos / volume : 0,
      }
    })
    .sort((a, b) => b.volume - a.volume)
}
