import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarTodasOS } from '@/lib/queries/ordens-servico'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { OSCard } from './components/os-card'
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

  const [lista, mecanicos, lojasOpts] = await Promise.all([
    listarTodasOS({ status: statusFiltro, busca: params.q, lojaId: lojaScope, dataInicio, dataFim, mecanicoId: mecanicoFiltro }),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios).where(eq(usuarios.papel, 'mecanico')),
    listarLojasDoGrupoAtivo(usuario),
  ])

  const abertas             = lista.filter(o => o.status === 'aberta')
  const oficina              = lista.filter(o => o.status === 'oficina')
  const emAndamento         = lista.filter(o => o.status === 'em_andamento')
  const finalizadas         = lista.filter(o => o.status === 'finalizada')
  const pendentePagamento   = lista.filter(o => o.status === 'pendente_pagamento')
  const concluidas          = lista.filter(o => o.status === 'concluida')
  const canceladas          = lista.filter(o => o.status === 'cancelada')

  // OS cancelada não entra em faturamento nem em conciliação — o valor dela morreu junto.
  const ativas = lista.filter(o => o.status !== 'cancelada')

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-slate-500 text-sm">Pós-venda e oficina</p>
        </div>
        <AbrirOSDialog mecanicos={mecanicos} lojas={lojasOpts} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Abertas</p>
          <p className="text-3xl font-bold text-amber-700 mt-0.5">{abertas.length}</p>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">Oficina</p>
          <p className="text-3xl font-bold text-sky-700 mt-0.5">{oficina.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Em Andamento</p>
          <p className="text-3xl font-bold text-blue-700 mt-0.5">{emAndamento.length}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Finalizadas</p>
          <p className="text-3xl font-bold text-indigo-700 mt-0.5">{finalizadas.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Pend. Pagamento</p>
          <p className="text-3xl font-bold text-orange-700 mt-0.5">{pendentePagamento.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Concluídas</p>
          <p className="text-3xl font-bold text-green-700 mt-0.5">{concluidas.length}</p>
        </div>
      </div>

      {/* Valor: serviço x peça */}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-teal-600 uppercase tracking-wide">Total Serviços</p>
          <p className="text-xl font-bold text-teal-700 mt-0.5">{fmt(totalServicos)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Total Peças</p>
          <p className="text-xl font-bold text-purple-700 mt-0.5">{fmt(totalPecas)}</p>
        </div>
      </div>

      {/* Conciliação */}
      {(concStats.pendente + concStats.parcial + concStats.conciliada + gratuidades.osQtd) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Conc. Pendentes</p>
            <p className="text-2xl font-bold text-red-700 mt-0.5">{concStats.pendente}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-amber-500 uppercase tracking-wide">Conc. Parciais</p>
            <p className="text-2xl font-bold text-amber-700 mt-0.5">{concStats.parcial}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Conciliadas</p>
            <p className="text-2xl font-bold text-green-700 mt-0.5">{concStats.conciliada}</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-violet-600 uppercase tracking-wide">Gratuidades</p>
            <p className="text-2xl font-bold text-violet-700 mt-0.5">{gratuidades.osQtd}</p>
            {/* O valor é o que deixou de ser cobrado, não o total da OS: numa OS meio
                cupom, meio dinheiro só a parte gratuita entra aqui. */}
            <p className="text-xs text-violet-600 mt-0.5">{fmt(gratuidades.valor)} não cobrados</p>
            <p className="text-[11px] text-violet-500 mt-1 leading-tight">
              {gratuidades.cupomQtd} cupom · {gratuidades.cortesiaQtd} cortesia/garantia · {gratuidades.gratuitaQtd} gratuita
            </p>
          </div>
        </div>
      )}

      <OSFiltros lojas={isAdmin ? lojasOpts : []} mecanicos={mecanicos} dataInicioInicial={dataInicio} dataFimInicial={params.ate ?? ""} />

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-16">Nenhuma ordem de serviço encontrada.</p>
      )}

      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Abertas ({abertas.length})
          </h2>
          {abertas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {oficina.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
            Oficina ({oficina.length})
          </h2>
          {oficina.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Em Andamento ({emAndamento.length})
          </h2>
          {emAndamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {finalizadas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            Finalizadas ({finalizadas.length})
          </h2>
          {finalizadas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {pendentePagamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            Pendente de Pagamento ({pendentePagamento.length})
          </h2>
          {pendentePagamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {concluidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Concluídas ({concluidas.length})
          </h2>
          {concluidas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}

      {canceladas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
            Canceladas ({canceladas.length})
          </h2>
          {canceladas.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
        </section>
      )}
    </div>
  )
}
