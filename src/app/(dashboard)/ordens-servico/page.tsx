import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarTodasOS } from '@/lib/queries/ordens-servico'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
import { OSLista } from './components/os-lista'
import { STATUS_OS } from './status-os'
import { Kpi } from '@/components/kpi'
import { AbrirOSDialog } from './components/abrir-os-dialog'
import { OSFiltros } from './components/os-filtros'
import { calcStatusMultiPagamento, pagamentosEfetivosOS } from '@/lib/conciliacao-status'
import { TIPO_PAGAMENTO_CUPOM } from '@/lib/cupom-revisao'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

function dataDefaultMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function OrdensServicoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; loja?: string; de?: string; ate?: string; mecanico?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/ordens-servico')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)

  const statusFiltro   = parseParam(params.status)
  const mecanicoFiltro = parseParam(params.mecanico)

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaParamBruto = parseParam(params.loja)
  const lojaValues = lojaParamBruto.length && lojaParamBruto.every(id => lojaIdsGrupo.includes(id))
    ? lojaParamBruto
    : lojaIdsGrupo

  // Escopo de loja da consulta: admin usa a seleção do filtro (ou todas do grupo);
  // não-admin fica na própria loja. Antes o não-admin caía em listarOSPorLoja, que
  // ignorava data e loja — por isso os valores não acompanhavam os filtros.
  const lojaScope = isAdmin ? lojaValues : (usuario.lojaId ? [usuario.lojaId] : [])

  const dataInicio = params.de  ?? dataDefaultMesAtual()
  const dataFim    = params.ate ?? undefined

  const grupo = await getGrupoAtivo(usuario)
  const [recorte, mecanicos, lojasOpts] = await Promise.all([
    listarTodasOS({ busca: params.q, lojaId: lojaScope, dataInicio, dataFim, mecanicoId: mecanicoFiltro }),
    listarUsuariosDoGrupo(grupo.id, { papeis: ['mecanico'] }),
    listarLojasDoGrupoAtivo(usuario),
  ])

  // O status filtra só a lista: KPIs e o número de cada botão de status olham o recorte inteiro,
  // senão marcar "Aberta" zeraria todos os outros. Cancelada vai para o fim.
  const lista = recorte
    .filter(o => statusFiltro.length === 0 || statusFiltro.includes(o.status))
    .sort((a, b) => Number(a.status === 'cancelada') - Number(b.status === 'cancelada'))

  const abertas             = recorte.filter(o => o.status === 'aberta')
  const oficina              = recorte.filter(o => o.status === 'oficina')
  const emAndamento         = recorte.filter(o => o.status === 'em_andamento')
  const finalizadas         = recorte.filter(o => o.status === 'finalizada')
  const pendentePagamento   = recorte.filter(o => o.status === 'pendente_pagamento')
  const concluidas          = recorte.filter(o => o.status === 'concluida')

  // OS cancelada não entra em faturamento nem em conciliação — o valor dela morreu junto.
  const ativas = recorte.filter(o => o.status !== 'cancelada')

  const concStats = ativas.reduce(
    (acc, o) => {
      if (o.valorTotal == null) return acc
      const pagamentos = pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal)
      const status = calcStatusMultiPagamento(pagamentos, o.conciliadoValor as number, o.pixConciliadoValor as number, o.valorTotal)
      if (status === 'pendente')   acc.pendente++
      if (status === 'parcial')    acc.parcial++
      if (status === 'conciliada') acc.conciliada++
      return acc
    },
    { pendente: 0, parcial: 0, conciliada: 0 },
  )

  // Gratuidades: OS fechada sem dinheiro entrar. São contadas como "conciliadas"
  // pelo calcStatus (não há o que casar no extrato), então sem este recorte o número
  // de conciliadas esconde quanto de serviço saiu de graça.
  //
  // 'gratuita' é a OS de valor zero — pagamentosEfetivosOS sintetiza esse tipo a
  // partir de formaPagamento, então OS ainda não fechada (sem forma nenhuma) fica
  // de fora, que é o certo: ela não foi dada, só não foi cobrada ainda.
  const gratuidades = ativas.reduce(
    (acc, o) => {
      const pagamentos = pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal)
      let ehGratuita = false
      for (const p of pagamentos) {
        const valor = Number(p.valor) || 0
        if (p.tipo === TIPO_PAGAMENTO_CUPOM) { acc.cupomQtd++;    acc.valor += valor; ehGratuita = true }
        else if (p.tipo === 'cortesia')      { acc.cortesiaQtd++; acc.valor += valor; ehGratuita = true }
        else if (p.tipo === 'gratuita')      { acc.gratuitaQtd++;                     ehGratuita = true }
      }
      // Uma OS meio cupom, meio dinheiro conta uma vez só na quantidade — o valor
      // acumulado é que diz quanto dela foi de graça.
      if (ehGratuita) acc.osQtd++
      return acc
    },
    { osQtd: 0, cupomQtd: 0, cortesiaQtd: 0, gratuitaQtd: 0, valor: 0 },
  )

  const totalServicos = ativas.reduce((s, o) => s + (parseFloat(o.valorServicos) || 0), 0)
  const totalPecas    = ativas.reduce((s, o) => s + (parseFloat(o.valorPecas)    || 0), 0)
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const contagem = Object.fromEntries(STATUS_OS.map(st => [st.value, recorte.filter(o => o.status === st.value).length]))
  const temConciliacao = concStats.pendente + concStats.parcial + concStats.conciliada + gratuidades.osQtd > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">Pós-venda e oficina</p>
        </div>
        <AbrirOSDialog mecanicos={mecanicos} lojas={lojasOpts} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
      </div>

      {/* Celular: faixa que rola para o lado, sem barra à vista. Desktop: grade (padrão de Vendas). */}
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
        <Kpi tom={abertas.length ? 'aviso' : 'neutro'} titulo="Abertas" valor={abertas.length} />
        <Kpi tom="neutro" titulo="Na oficina" valor={oficina.length + emAndamento.length} nota={`${oficina.length} oficina · ${emAndamento.length} em andamento`} />
        <Kpi tom={finalizadas.length + pendentePagamento.length ? 'aviso' : 'neutro'} titulo="A cobrar" valor={finalizadas.length + pendentePagamento.length} nota={`${finalizadas.length} finalizada(s) · ${pendentePagamento.length} pend. pagamento`} />
        <Kpi tom="ok" titulo="Concluídas" valor={concluidas.length} />
        <Kpi tom="neutro" titulo="Valor das OS" valor={fmt(totalServicos + totalPecas)} nota={`Serviços ${fmt(totalServicos)} · Peças ${fmt(totalPecas)} · sem canceladas`} />
        {temConciliacao && (
          <>
            <Kpi tom={concStats.pendente ? 'perigo' : 'neutro'} titulo="Conc. pendentes" valor={concStats.pendente} />
            <Kpi tom={concStats.parcial ? 'aviso' : 'neutro'} titulo="Conc. parciais" valor={concStats.parcial} />
            <Kpi tom="ok" titulo="Conciliadas" valor={concStats.conciliada} />
            {/* O valor é o que deixou de ser cobrado, não o total da OS: numa OS meio
                cupom, meio dinheiro só a parte gratuita entra aqui. */}
            <Kpi
              tom="neutro"
              titulo="Gratuidades"
              valor={gratuidades.osQtd}
              nota={`${fmt(gratuidades.valor)} não cobrados · ${gratuidades.cupomQtd} cupom · ${gratuidades.cortesiaQtd} cortesia/garantia · ${gratuidades.gratuitaQtd} gratuita`}
            />
          </>
        )}
      </div>

      <OSFiltros
        lojas={isAdmin ? lojasOpts : []}
        mecanicos={mecanicos}
        dataInicioInicial={dataInicio}
        dataFimInicial={params.ate ?? ""}
        contagem={contagem}
      />

      <OSLista lista={lista} />
    </div>
  )
}
