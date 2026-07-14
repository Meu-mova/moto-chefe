'use server'

import { db } from '@/lib/db'
import { pixRecebimentosMcp, vendas, ordensServico, pedidosVenda, vendasPecas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export async function lancarCorrespondenciaAction(
  id: string,
  tipo: 'venda' | 'os' | 'pedido' | 'peca',
  numero: string,
) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  let vendaId: string | null = null
  let osId: string | null = null
  let pedidoId: string | null = null
  let pecaVendaId: string | null = null

  if (tipo === 'venda') {
    const [venda] = await db.select({ id: vendas.id, lojaId: vendas.lojaId }).from(vendas).where(eq(vendas.notaFiscalSaida, numero)).limit(1)
    if (!venda || !lojaIdsGrupo.includes(venda.lojaId)) throw new Error(`NF ${numero} não encontrada no grupo ${grupo.nome}`)
    vendaId = venda.id
  } else if (tipo === 'os') {
    const numeroInt = parseInt(numero, 10)
    if (!numeroInt || numeroInt <= 0) throw new Error('Número inválido')
    const [os] = await db.select({ id: ordensServico.id, lojaId: ordensServico.lojaId }).from(ordensServico).where(eq(ordensServico.numero, numeroInt)).limit(1)
    if (!os || !lojaIdsGrupo.includes(os.lojaId)) throw new Error(`OS #${numeroInt} não encontrada no grupo ${grupo.nome}`)
    osId = os.id
  } else if (tipo === 'pedido') {
    const numeroInt = parseInt(numero, 10)
    if (!numeroInt || numeroInt <= 0) throw new Error('Número inválido')
    const [pedido] = await db.select({ id: pedidosVenda.id, lojaId: pedidosVenda.lojaId }).from(pedidosVenda).where(eq(pedidosVenda.numero, numeroInt)).limit(1)
    if (!pedido || !lojaIdsGrupo.includes(pedido.lojaId)) throw new Error(`Pedido #${numeroInt} não encontrado no grupo ${grupo.nome}`)
    pedidoId = pedido.id
  } else {
    const numeroInt = parseInt(numero, 10)
    if (!numeroInt || numeroInt <= 0) throw new Error('Número inválido')
    const [peca] = await db.select({ id: vendasPecas.id, lojaId: vendasPecas.lojaId }).from(vendasPecas).where(eq(vendasPecas.numero, numeroInt)).limit(1)
    if (!peca || !lojaIdsGrupo.includes(peca.lojaId)) throw new Error(`Venda PA #${numeroInt} não encontrada no grupo ${grupo.nome}`)
    pecaVendaId = peca.id
  }

  const atualizadas = await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: tipo,
      vendaId,
      osId,
      pedidoId,
      pecaVendaId,
      lancadoPorId: usuario.id,
      lancadoEm: new Date(),
    })
    .where(and(eq(pixRecebimentosMcp.id, id), eq(pixRecebimentosMcp.grupoId, grupo.id)))
    .returning({ id: pixRecebimentosMcp.id })

  if (atualizadas.length === 0) throw new Error('PIX não encontrado no grupo ativo')

  revalidatePath('/pix-mcp')
}

export async function removerCorrespondenciaAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const atualizadas = await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: null,
      vendaId: null,
      osId: null,
      pedidoId: null,
      pecaVendaId: null,
      lancadoPorId: null,
      lancadoEm: null,
    })
    .where(and(eq(pixRecebimentosMcp.id, id), eq(pixRecebimentosMcp.grupoId, grupo.id)))
    .returning({ id: pixRecebimentosMcp.id })

  if (atualizadas.length === 0) throw new Error('PIX não encontrado no grupo ativo')

  revalidatePath('/pix-mcp')
}
