import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * Muda o status da moto e grava o histórico pela função do banco, na conexão do app.
 * Quem chama confere antes se o usuário pode mudar o status desta moto.
 */
export async function mudarStatusMoto(dados: { motoId: string; novoStatus: string; usuarioId: string; observacao: string | null }) {
  await db.execute(sql`select mudar_status_moto(${dados.motoId}::uuid, ${dados.novoStatus}::moto_status,
    ${dados.usuarioId}::uuid, ${dados.observacao}::text)`)
}
