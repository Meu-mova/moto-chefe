import { Suspense } from 'react'
import { getUsuarioLogado } from '@/lib/auth'
import { listarGarantias } from '@/lib/queries/garantias'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { modelos, ordensServico, lojas } from '@/lib/db/schema'
import { inArray, eq } from 'drizzle-orm'
import { GarantiaCard } from './components/garantia-card'
import { AbrirGarantiaDialog } from './components/abrir-garantia-dialog'
import { GarantiasFiltros } from './components/garantias-filtros'
import { SincronizarFabricaButton } from './components/sincronizar-button'
import { ImportarFabricaButton } from './components/importar-fabrica-button'
import { RelatorioGarantiasButton } from './components/relatorio-garantias-button'

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
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaFiltro   = isAdmin
    ? (params.loja && lojaIdsGrupo.includes(params.loja) ? params.loja : undefined)
    : (usuario.lojaId ?? undefined)
  const statusFiltro = params.status  // 'ativa' | 'encerrada' | undefined = todos
  const modeloFiltro = params.modelo

  const [listaBruta, ordensAbertas, lojasOpts, modelosOpts, lojaUsuarioRow] = await Promise.all([
    listarGarantias({
      lojaId:               lojaFiltro,
      status:               statusFiltro,
      chassiBusca:          params.q,
      numeroPedidoFabrica:  params.nf,
      modeloId:             modeloFiltro,
    }),

    db.select({ id: ordensServico.id, descricao: ordensServico.descricao, motoId: ordensServico.motoId })
      .from(ordensServico)
      .where(inArray(ordensServico.status, ['aberta', 'em_andamento'])),

    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),

    db.select({ id: modelos.id, marca: modelos.marca, modelo: modelos.modelo })
      .from(modelos).orderBy(modelos.marca, modelos.modelo),

    !isAdmin && usuario.lojaId
      ? db.select({ nome: lojas.nome }).from(lojas).where(eq(lojas.id, usuario.lojaId)).limit(1)
      : Promise.resolve([]),
  ])

  const lojaUsuarioNome = lojaUsuarioRow[0]?.nome ?? null

  const lista = isAdmin && !lojaFiltro
    ? listaBruta.filter(g => lojaIdsGrupo.includes(g.lojaId))
    : listaBruta

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
          {isAdmin && <ImportarFabricaButton />}
          {(isAdmin || usuario.papel === 'aux_adm') && <SincronizarFabricaButton />}
          {(isAdmin || usuario.papel === 'aux_adm') && (
            <RelatorioGarantiasButton
              lojas={lojasOpts}
              modelos={modelosOpts}
              isAdmin={isAdmin}
            />
          )}
          <AbrirGarantiaDialog
            ordens={ordensAbertas}
            papel={usuario.papel}
            modelos={modelosOpts}
            lojas={lojasOpts}
            isAdmin={isAdmin}
            lojaUsuarioNome={lojaUsuarioNome}
          />
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
