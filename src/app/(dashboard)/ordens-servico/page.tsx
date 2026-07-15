import { getUsuarioLogado } from '@/lib/auth'
import { listarOSPorLoja, listarTodasOS } from '@/lib/queries/ordens-servico'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { OSCard } from './components/os-card'
import { AbrirOSDialog } from './components/abrir-os-dialog'
import { OSFiltros } from './components/os-filtros'
import { calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'

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
  searchParams: Promise<{ status?: string; q?: string; loja?: string; de?: string; ate?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const statusFiltro = parseParam(params.status)

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaParamBruto = parseParam(params.loja)
  const lojaValues = lojaParamBruto.length && lojaParamBruto.every(id => lojaIdsGrupo.includes(id))
    ? lojaParamBruto
    : lojaIdsGrupo

  const dataInicio = params.de  ?? dataDefaultMesAtual()
  const dataFim    = params.ate ?? undefined

  const [lista, mecanicos, lojasOpts] = await Promise.all([
    isAdmin
      ? listarTodasOS({ status: statusFiltro, busca: params.q, lojaId: lojaValues, dataInicio, dataFim })
      : listarOSPorLoja(usuario.lojaId!),
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

  const concStats = lista.reduce(
    (acc, o) => {
      const status = calcStatusPagamentoUnicoOS(o.formaPagamento, o.valorTotal, o.conciliadoValor as number, o.pixConciliadoValor as number)
      if (status === 'pendente')   acc.pendente++
      if (status === 'parcial')    acc.parcial++
      if (status === 'conciliada') acc.conciliada++
      return acc
    },
    { pendente: 0, parcial: 0, conciliada: 0 },
  )

  const totalServicos = lista.reduce((s, o) => s + (parseFloat(o.valorServicos) || 0), 0)
  const totalPecas    = lista.reduce((s, o) => s + (parseFloat(o.valorPecas)    || 0), 0)
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
      {(concStats.pendente + concStats.parcial + concStats.conciliada) > 0 && (
        <div className="grid grid-cols-3 gap-3 max-w-xl">
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
        </div>
      )}

      <OSFiltros lojas={isAdmin ? lojasOpts : []} dataInicioInicial={dataInicio} dataFimInicial={params.ate ?? ''} />

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
    </div>
  )
}
