import { getUsuarioLogado } from '@/lib/auth'
import { listarOSPorLoja, listarTodasOS } from '@/lib/queries/ordens-servico'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { OSCard } from './components/os-card'
import { AbrirOSDialog } from './components/abrir-os-dialog'
import { OSFiltros } from './components/os-filtros'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export default async function OrdensServicoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const statusFiltro = parseParam(params.status)

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []

  const [lista, mecanicos, lojasOpts] = await Promise.all([
    isAdmin
      ? listarTodasOS({ status: statusFiltro, busca: params.q, lojaId: lojaIdsGrupo })
      : listarOSPorLoja(usuario.lojaId!),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios).where(inArray(usuarios.papel, ['mecanico', 'aux_adm', 'admin_geral', 'admin_socio'] as any[])),
    listarLojasDoGrupoAtivo(usuario),
  ])

  const abertas      = lista.filter(o => o.status === 'aberta')
  const emAndamento  = lista.filter(o => o.status === 'em_andamento')
  const concluidas   = lista.filter(o => o.status === 'concluida')

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
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Em Andamento</p>
          <p className="text-3xl font-bold text-blue-700 mt-0.5">{emAndamento.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Concluídas</p>
          <p className="text-3xl font-bold text-green-700 mt-0.5">{concluidas.length}</p>
        </div>
      </div>

      <OSFiltros />

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

      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Em Andamento ({emAndamento.length})
          </h2>
          {emAndamento.map(o => <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />)}
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
