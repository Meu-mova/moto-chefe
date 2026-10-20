'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { motos, garantias } from '@/lib/db/schema'
import { and, eq, ilike, inArray, isNotNull } from 'drizzle-orm'
import { loginFabrica, buscarStatusGarantiaFabrica, listarPedidosGarantiaFabrica, buscarDetalhePedidoGarantia } from '@/lib/fabrica-scraper'
import { escolherMotoPorChassi, garantiaEmAndamento, normalizarNumeroPedido, MIN_DIGITOS_SUFIXO_CHASSI } from '@/lib/garantia-importacao'
import { exportarRelatorioGarantias } from '@/lib/queries/garantias'
import { listarContasFabrica, lojaDaContaDaGarantia } from '@/lib/fabrica-contas'

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

  // Uma consulta só, do grupo ativo inteiro, agrupada em memória por
  // `lojaDaContaDaGarantia`: o pedido antigo de Varginha vive na conta velha, e
  // deixar esse desvio no SQL duplicaria a regra num segundo lugar.
  const lojaIdsDoGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const doGrupo = await db
    .select({
      id: garantias.id,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      fabricaContaLojaId: garantias.fabricaContaLojaId,
    })
    .from(garantias)
    .where(and(
      inArray(garantias.lojaId, lojaIdsDoGrupo),
      isNotNull(garantias.numeroPedidoFabrica),
    ))

  // Sequencial: o portal é frágil e login em paralelo na mesma origem arrisca
  // derrubar a sessão da outra loja.
  for (const conta of contas) {
    const lista = doGrupo.filter(g => lojaDaContaDaGarantia(g) === conta.lojaId)

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
          // null = portal fora, sessão expirada, ou pedido que não pertence a esta conta.
          // Gravar isso apagaria um status bom — inclusive os que disparam o alerta na tela.
          if (!status) { erros++; continue }
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
  const lojaIdsDoGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  // Carrega os números já lançados uma vez só, normalizados: quem lança à mão
  // grava "#38780", a importação grava "38780".
  const jaCadastrados = new Set(
    (await db
      .select({ numero: garantias.numeroPedidoFabrica })
      .from(garantias)
      .where(isNotNull(garantias.numeroPedidoFabrica)))
      .map(g => normalizarNumeroPedido(g.numero)),
  )

  for (const conta of contas) {
    let importadas = 0
    let semChassi = 0

    try {
      const session = await loginFabrica({ email: conta.email, senha: conta.senha })
      const lista = await listarPedidosGarantiaFabrica(session)

      // Varre a lista inteira. Antes parava no primeiro número já cadastrado, e
      // toda garantia mais antiga que tivesse ficado sem lançar nunca entrava.
      for (const { numeroPedido, dataAbertura, status: statusLista } of lista) {
        if (jaCadastrados.has(normalizarNumeroPedido(numeroPedido))) continue
        // Só o que ainda está andando na fábrica. Encerrada (ou situação que não
        // conhecemos) já se resolveu, e abrir_garantia poria uma moto vendida há
        // meses de volta em "em garantia".
        if (!garantiaEmAndamento(statusLista)) continue

        const { chassi, peca, status } = await buscarDetalhePedidoGarantia(session, numeroPedido)
        if (!chassi) {
          semChassi++
          continue
        }

        // Chassi exato na base toda (moto transferida de grupo cai certo, a loja
        // da garantia sai de moto.loja_id). Final do chassi só dentro do grupo:
        // na base toda, um "3024" casaria com moto de outro CNPJ.
        // O exato vem numa consulta própria: junto com os do final, um corte de
        // linhas podia deixá-lo de fora e a garantia cair na moto errada.
        const alvo = chassi.replace(/\s+/g, '').toUpperCase()
        const colunas = { id: motos.id, lojaId: motos.lojaId, chassi: motos.chassi }
        const exatas = await db.select(colunas).from(motos).where(eq(motos.chassi, chassi)).limit(1)
        const podeBuscarPeloFinal = /^[A-Z0-9]+$/.test(alvo) && alvo.length >= MIN_DIGITOS_SUFIXO_CHASSI && lojaIdsDoGrupo.length > 0
        // Duas já bastam para ser ambíguo; o limite só evita trazer o estoque inteiro.
        const candidatas = exatas.length || !podeBuscarPeloFinal
          ? exatas
          : await db.select(colunas).from(motos)
            .where(and(inArray(motos.lojaId, lojaIdsDoGrupo), ilike(motos.chassi, `%${alvo}`)))
            .limit(20)
        const moto = escolherMotoPorChassi(chassi, candidatas)
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
        jaCadastrados.add(normalizarNumeroPedido(numeroPedido))

        // A garantia já existe a partir daqui — o update de status abaixo é só
        // enfeite e não pode derrubar a importação nem deixar de contar a garantia.
        importadas++

        // Marca a conta que trouxe o pedido, mesmo quando é a da própria loja: se
        // a moto for transferida depois, o Sincronizar tem que continuar batendo
        // na conta que enxerga o pedido, não na loja nova da moto.
        try {
          await db
            .update(garantias)
            .set({
              fabricaContaLojaId: conta.lojaId,
              ...(status ? { statusFabrica: status, statusFabricaSyncEm: new Date() } : {}),
            })
            .where(eq(garantias.numeroPedidoFabrica, numeroPedido))
        } catch {
          // Enfeite: a garantia já foi criada e contada acima.
        }
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
