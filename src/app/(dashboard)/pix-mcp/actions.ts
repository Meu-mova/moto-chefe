'use server'

import { db } from '@/lib/db'
import { pixRecebimentosMcp, vendas, ordensServico } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export async function lancarCorrespondenciaAction(
  id: string,
  tipo: 'venda' | 'os',
  numero: string,
) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) throw new Error('Sem permissão')

  const numeroInt = parseInt(numero, 10)
  if (!numeroInt || numeroInt <= 0) throw new Error('Número inválido')

  let vendaId: string | null = null
  let osId: string | null = null

  if (tipo === 'venda') {
    const [venda] = await db.select({ id: vendas.id }).from(vendas).where(eq(vendas.numero, numeroInt)).limit(1)
    if (!venda) throw new Error(`Venda #${numeroInt} não encontrada`)
    vendaId = venda.id
  } else {
    const [os] = await db.select({ id: ordensServico.id }).from(ordensServico).where(eq(ordensServico.numero, numeroInt)).limit(1)
    if (!os) throw new Error(`OS #${numeroInt} não encontrada`)
    osId = os.id
  }

  await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: tipo,
      vendaId,
      osId,
      lancadoPorId: usuario.id,
      lancadoEm: new Date(),
    })
    .where(eq(pixRecebimentosMcp.id, id))

  revalidatePath('/pix-mcp')
}

export async function removerCorrespondenciaAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) throw new Error('Sem permissão')

  await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: null,
      vendaId: null,
      osId: null,
      lancadoPorId: null,
      lancadoEm: null,
    })
    .where(eq(pixRecebimentosMcp.id, id))

  revalidatePath('/pix-mcp')
}
