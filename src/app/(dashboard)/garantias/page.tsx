import { Suspense } from 'react'
import { getUsuarioLogado } from '@/lib/auth'
import { listarGarantias } from '@/lib/queries/garantias'
import { db } from '@/lib/db'
import { motos, modelos, ordensServico, lojas } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { GarantiaCard } from './components/garantia-card'
import { AbrirGarantiaDialog } from './components/abrir-garantia-dialog'
import { GarantiasFiltros } from './components/garantias-filtros'
import { SincronizarFabricaButton } from './components/sincronizar-button'

const STATUS_FABRICA_CRITICOS = new Set(['Em Exigência', 'Rejeitado', 'Aguardando Postagem Reversa'])

const ADMINS = ['admin_geral', 'admin_socio']

export default async function GarantiasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nf?: string; status?: string; loja?: string; modelo?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  // Filtros de busca
  const lojaFiltro   = isAdmin ? params.loja : (usuario.lojaId ?? undefined)
  const statusFiltro = params.status  // 'ativa' | 'encerrada' | undefined = todos
  const modeloFiltro = params.modelo

  const [lista, motosParaGarantia, ordensAbertas, lojasOpts, modelosOpts] = await Promise.all([
    listarGarantias({
      lojaId:               lojaFiltro,
      status:               statusFiltro,
      chassiBusca:          params.q,
      numeroPedidoFabrica:  params.nf,
      modeloId:             modeloFiltro,
    }),

    isAdmin
      ? db.select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
          .from(motos).innerJoin(modelos, eq(motos.modeloId, modelos.id))
          .where(inArray(motos.status, ['faturada', 'montada', 'disponivel', 'em_garantia']))
      : db.select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
          .from(motos).innerJoin(modelos, eq(motos.modeloId, modelos.id))
          .where(eq(motos.lojaId, usuario.lojaId!)),

    db.select({ id: ordensServico.id, descricao: ordensServico.descricao, motoId: ordensServico.motoId })
      .from(ordensServico)
      .where(inArray(ordensServico.status, ['aberta', 'em_andamento'])),

    isAdmin
      ? db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome)
      : Promise.resolve([]),

    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
  ])

  const ativas      = lista.filter(g => g.status === 'ativa')
  const encerradas  = lista.filter(g => g.status === 'encerrada')
  const criticas    = ativas.filter(g => g.statusFabrica && STATUS_FABRICA_CRITICOS.has(g.statusFabrica))

  // Conta urgências nas ativas (para o banner)
  const agora      = Date.now()
  const diasDecorridos = (d: unknown) => d ? Math.floor((agora - new Date(d as string).getTime()) / 86400000) : null
  const urgentes   = ativas.filter(g => (diasDecorridos(g.dataInicio) ?? 0) >= 20)
  const atencao    = ativas.filter(g => { const d = diasDecorridos(g.dataInicio) ?? 0; return d >= 10 && d < 20 })

  const temFiltro  = !!(params.q || params.nf || params.status || params.loja || params.modelo)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Garantias</h1>
          <p className="text-slate-500 text-sm">
            Acompanhamento — uma moto pode ter múltiplas garantias ao longo do tempo
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || usuario.papel === 'aux_adm') && <SincronizarFabricaButton />}
          <AbrirGarantiaDialog motos={motosParaGarantia} ordens={ordensAbertas} papel={usuario.papel} />
        </div>
      </div>

      {/* Filtros */}
      <Suspense>
        <GarantiasFiltros
          lojas={lojasOpts}
          modelos={modelosOpts}
          isAdmin={isAdmin}
          chassiInicial={params.q ?? ''}
          nfInicial={params.nf ?? ''}
        />
      </Suspense>

      {/* Banner fábrica — status críticos */}
      {!statusFiltro && criticas.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm space-y-1">
          <p className="font-semibold text-red-800">
            🚨 {criticas.length} garantia{criticas.length !== 1 ? 's' : ''} requer{criticas.length !== 1 ? 'em' : ''} ação na fábrica
          </p>
          {criticas.map(g => (
            <p key={g.id} className="text-red-700 text-xs">
              · {g.marca} {g.modelo} ({g.chassi.slice(-6)}) — <strong>{g.statusFabrica}</strong>
              {g.numeroPedidoFabrica && (
                <a
                  href={`https://motochefebrasil.store/clientes/trocas/detalhes/${g.numeroPedidoFabrica}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline"
                >
                  Ver #{ g.numeroPedidoFabrica}
                </a>
              )}
            </p>
          ))}
        </div>
      )}

      {/* Banner de urgência — só quando não há filtro de status */}
      {!statusFiltro && ativas.length > 0 && (urgentes.length > 0 || atencao.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm space-y-1">
          {urgentes.length > 0 && (
            <p className="font-medium text-red-700">
              ⚠ {urgentes.length} {urgentes.length === 1 ? 'garantia urgente (≥ 20 dias)' : 'garantias urgentes (≥ 20 dias)'}
            </p>
          )}
          {atencao.length > 0 && (
            <p className="text-amber-700">
              ⚠ {atencao.length} {atencao.length === 1 ? 'garantia requer atenção (10–19 dias)' : 'garantias requerem atenção (10–19 dias)'}
            </p>
          )}
        </div>
      )}

      {/* Resultados */}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">
          {temFiltro ? 'Nenhuma garantia corresponde aos filtros.' : 'Nenhuma garantia registrada.'}
        </p>
      )}

      {/* Quando filtro de status está ativo: lista plana */}
      {statusFiltro && lista.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            {statusFiltro === 'ativa' ? 'Ativas' : 'Encerradas'} ({lista.length})
          </h2>
          {lista.map(g => (
            <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {/* Sem filtro de status: seções separadas */}
      {!statusFiltro && (
        <>
          {ativas.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-sm text-slate-700">Ativas ({ativas.length})</h2>
              {ativas.map(g => (
                <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
              ))}
            </section>
          )}

          {encerradas.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-sm text-slate-700">Encerradas ({encerradas.length})</h2>
              {encerradas.map(g => (
                <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
