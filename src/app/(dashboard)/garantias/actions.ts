'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { motos, garantias } from '@/lib/db/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { loginFabrica, buscarStatusGarantiaFabrica, listarPedidosGarantiaFabrica, buscarDetalhePedidoGarantia } from '@/lib/fabrica-scraper'
import { exportarRelatorioGarantias } from '@/lib/queries/garantias'
import { listarContasFabrica } from '@/lib/fabrica-contas'

export async function exportarRelatorioGarantiasAction(filtros: {
  lojaId?: string
  status?: string
  modeloId?: string
  statusFabrica?: string
  dataInicio?: string
  dataFim?: string
}) {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(u.papel)) {
    throw new Error('Sem permissão')
  }
  const isAdmin = ['admin_geral', 'admin_socio'].includes(u.papel)

  if (!isAdmin) {
    const rows = await exportarRelatorioGarantias({ ...filtros, lojaId: u.lojaId ?? undefined })
    return rows
  }

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(u)
  const lojaIdValido = filtros.lojaId && lojaIdsGrupo.includes(filtros.lojaId) ? filtros.lojaId : undefined
  const rows = await exportarRelatorioGarantias({ ...filtros, lojaId: lojaIdValido })
  return lojaIdValido ? rows : rows.filter(r => lojaIdsGrupo.includes(r.lojaId))
}

export async function abrirGarantiaAction(params: {
  motoId: string
  osId?: string
  descricao: string
  dataInicio: string
  dataPedidoPeca?: string
  numeroPedidoFabrica?: string
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir garantia')
  }

  // O RPC valida que moto.loja_id == p_loja_id; admins não têm lojaId próprio,
  // então sempre buscamos a loja da moto para passar ao RPC.
  const [moto] = await db
    .select({ lojaId: motos.lojaId })
    .from(motos)
    .where(eq(motos.id, params.motoId))
    .limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  // Prazo fixo de 30 dias a partir da data de abertura
  const fim = new Date(params.dataInicio)
  fim.setDate(fim.getDate() + 30)
  const dataFim = fim.toISOString().split('T')[0]

  const supabase = await createClient()
  const { error } = await supabase.rpc('abrir_garantia', {
    p_moto_id: params.motoId,
    p_loja_id: moto.lojaId,
    p_aberta_por: usuario.id,
    p_os_id: params.osId ?? null,
    p_descricao: params.descricao,
    p_data_inicio: params.dataInicio,
    p_data_fim: dataFim,
    p_data_pedido_peca: params.dataPedidoPeca ?? null,
    p_numero_pedido_fabrica: params.numeroPedidoFabrica ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath('/vendas')
  revalidatePath(`/estoque/${params.motoId}`)
}

export async function sincronizarFabricaAction(): Promise<{
  porLoja: { loja: string; atualizadas: number; erros: number }[]
  semCredencial: string[]
}> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const { contas, semCredencial } = await listarContasFabrica(usuario)
  const porLoja: { loja: string; atualizadas: number; erros: number }[] = []

  // Sequencial: o portal é frágil e login em paralelo na mesma origem arrisca
  // derrubar a sessão da outra loja.
  for (const conta of contas) {
    const lista = await db
      .select({ id: garantias.id, numeroPedidoFabrica: garantias.numeroPedidoFabrica })
      .from(garantias)
      .where(and(eq(garantias.lojaId, conta.lojaId), isNotNull(garantias.numeroPedidoFabrica)))

    if (lista.length === 0) {
      porLoja.push({ loja: conta.lojaNome, atualizadas: 0, erros: 0 })
      continue
    }

    let atualizadas = 0
    let erros = 0

    try {
      const session = await loginFabrica({ email: conta.email, senha: conta.senha })
      const agora = new Date()
      for (const g of lista) {
        if (!g.numeroPedidoFabrica) continue
        try {
          const status = await buscarStatusGarantiaFabrica(session, g.numeroPedidoFabrica)
          await db
            .update(garantias)
            .set({ statusFabrica: status, statusFabricaSyncEm: agora })
            .where(eq(garantias.id, g.id))
          atualizadas++
        } catch {
          erros++
        }
      }
    } catch {
      // Login recusado ou portal fora do ar: a loja inteira falhou, mas as
      // outras ainda têm que sincronizar.
      erros = lista.length
    }

    porLoja.push({ loja: conta.lojaNome, atualizadas, erros })
  }

  revalidatePath('/garantias')
  return { porLoja, semCredencial }
}

export type ResultadoImportacaoFabrica = {
  porLoja: { loja: string; importadas: number; semChassi: number; erro?: string }[]
  semCredencial: string[]
}

export async function importarGarantiasFabricaAction(): Promise<ResultadoImportacaoFabrica> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const { contas, semCredencial } = await listarContasFabrica(usuario)
  const supabase = await createClient()
  const porLoja: ResultadoImportacaoFabrica['porLoja'] = []

  for (const conta of contas) {
    let importadas = 0
    let semChassi = 0

    try {
      const session = await loginFabrica({ email: conta.email, senha: conta.senha })
      const lista = await listarPedidosGarantiaFabrica(session)

      // Do mais recente pro mais antigo, parando no primeiro já cadastrado: é o
      // corte que evita varrer o histórico inteiro do portal a cada clique.
      for (const { numeroPedido, dataAbertura } of lista) {
        const [jaExiste] = await db
          .select({ id: garantias.id })
          .from(garantias)
          .where(eq(garantias.numeroPedidoFabrica, numeroPedido))
          .limit(1)
        if (jaExiste) break

        const { chassi, peca, status } = await buscarDetalhePedidoGarantia(session, numeroPedido)
        if (!chassi) {
          semChassi++
          continue
        }

        // Busca na base toda, não só na loja da conta: o chassi é único e a loja
        // da garantia sai de moto.loja_id, então moto transferida cai certo.
        const [moto] = await db
          .select({ id: motos.id, lojaId: motos.lojaId })
          .from(motos)
          .where(eq(motos.chassi, chassi))
          .limit(1)
        if (!moto) {
          semChassi++
          continue
        }

        const fim = new Date(dataAbertura)
        fim.setDate(fim.getDate() + 30)

        const { error } = await supabase.rpc('abrir_garantia', {
          p_moto_id: moto.id,
          p_loja_id: moto.lojaId,
          p_aberta_por: usuario.id,
          p_os_id: null,
          p_descricao: peca ?? `Pedido fábrica #${numeroPedido}`,
          p_data_inicio: dataAbertura,
          p_data_fim: fim.toISOString().split('T')[0],
          p_data_pedido_peca: null,
          p_numero_pedido_fabrica: numeroPedido,
        })
        if (error) throw new Error(error.message)

        if (status) {
          await db
            .update(garantias)
            .set({ statusFabrica: status, statusFabricaSyncEm: new Date() })
            .where(eq(garantias.numeroPedidoFabrica, numeroPedido))
        }

        importadas++
      }

      porLoja.push({ loja: conta.lojaNome, importadas, semChassi })
    } catch (e) {
      // Falha numa loja não pode calar as outras; o que já entrou fica.
      porLoja.push({
        loja: conta.lojaNome,
        importadas,
        semChassi,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/garantias')
  return { porLoja, semCredencial }
}

export async function encerrarGarantiaAction(garantiaId: string, observacao?: string, dataEncerramento?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()
  const { error } = await supabase.rpc('encerrar_garantia', {
    p_garantia_id: garantiaId,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
    p_observacao: observacao ?? null,
    p_data_encerramento: dataEncerramento ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath('/estoque')
}
