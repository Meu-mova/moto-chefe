import { getUsuarioLogado } from '@/lib/auth'
import { exportarRelatorioGarantias } from '@/lib/queries/garantias'
import { listarLojasDoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { PrintButtons } from './print-buttons'
import { lojasDoEscopoDeGarantias } from '@/lib/escopo-garantias'

const ADMINS = ['admin_geral', 'admin_socio']

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function diasDecorridos(dataInicio: string | null | undefined): number | null {
  if (!dataInicio) return null
  return Math.floor((Date.now() - new Date(dataInicio + 'T12:00:00').getTime()) / 86400000)
}

function urgenciaClass(dias: number | null, status: string): string {
  if (status !== 'ativa' || dias === null) return ''
  if (dias >= 20) return 'urgente'
  if (dias >= 10) return 'atencao'
  return ''
}

export default async function GarantiasRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    lojaId?: string
    modeloId?: string
    statusFabrica?: string
    dataInicio?: string
    dataFim?: string
  }>
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const isAdmin = ADMINS.includes(usuario.papel)
  const lojaIds = await lojasDoEscopoDeGarantias(usuario, params.lojaId)
  // Nome no cabeçalho só quando a loja pedida está no escopo.
  const lojaIdFiltro = isAdmin
    ? (params.lojaId && lojaIds.includes(params.lojaId) ? params.lojaId : undefined)
    : (usuario.lojaId ?? undefined)
  const grupo = await getGrupoAtivo(usuario)

  const [rows, lojasDb] = await Promise.all([
    exportarRelatorioGarantias({
      status:        params.status        || undefined,
      lojaIds,
      modeloId:      params.modeloId      || undefined,
      statusFabrica: params.statusFabrica || undefined,
      dataInicio:    params.dataInicio    || undefined,
      dataFim:       params.dataFim       || undefined,
    }),
    isAdmin ? listarLojasDoGrupoAtivo(usuario, { somenteAtivas: false }) : Promise.resolve([]),
  ])

  const agora = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const ativas     = rows.filter(r => r.status === 'ativa')
  const encerradas = rows.filter(r => r.status === 'encerrada')
  const comPedido  = rows.filter(r => r.numeroPedidoFabrica)

  const lojaNomeFiltro = lojasDb.find(l => l.id === lojaIdFiltro)?.nome

  const filtrosAtivos: string[] = []
  if (params.status === 'ativa')      filtrosAtivos.push('Apenas ativas')
  else if (params.status === 'encerrada') filtrosAtivos.push('Apenas encerradas')
  if (lojaNomeFiltro)                 filtrosAtivos.push(`Loja: ${lojaNomeFiltro}`)
  else if (!isAdmin && usuario.lojaId) filtrosAtivos.push(`Sua loja`)
  if (params.statusFabrica === '__sem') filtrosAtivos.push('Sem pedido na fábrica')
  else if (params.statusFabrica)      filtrosAtivos.push(`Status fábrica: ${params.statusFabrica}`)
  if (params.dataInicio)              filtrosAtivos.push(`A partir de ${fmt(params.dataInicio)}`)
  if (params.dataFim)                 filtrosAtivos.push(`Até ${fmt(params.dataFim)}`)

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Geist', -apple-system, Arial, sans-serif; background: #f8fafc; color: #0f172a; }

        .page-wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

        /* Barra de ações (esconde no print) */
        .actions-bar {
          display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 24px;
        }
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500;
          cursor: pointer; border: 1.5px solid #e2e8f0; background: #fff;
          color: #334155; text-decoration: none; transition: background 0.15s;
        }
        .btn:hover { background: #f1f5f9; }
        .btn-primary { background: #1e293b; color: #fff; border-color: #1e293b; }
        .btn-primary:hover { background: #334155; }

        /* Cabeçalho do relatório */
        .report-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 20px; border-bottom: 3px solid #1e293b; margin-bottom: 24px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-icon {
          height: 48px; width: auto; object-fit: contain;
        }
        .brand-name { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.2; }
        .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .report-meta { text-align: right; }
        .report-title { font-size: 18px; font-weight: 700; color: #0f172a; }
        .report-date { font-size: 12px; color: #64748b; margin-top: 4px; }

        /* Filtros */
        .filters-row {
          background: #f1f5f9; border-radius: 8px; padding: 10px 16px;
          font-size: 12px; color: #475569; margin-bottom: 24px;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .filters-label { font-weight: 600; color: #334155; }
        .filter-tag {
          background: #e2e8f0; border-radius: 4px; padding: 2px 8px; font-size: 11px;
        }

        /* Cards de resumo */
        .summary-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
          margin-bottom: 28px;
        }
        .summary-card {
          background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
          padding: 14px 16px;
        }
        .summary-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 600; }
        .summary-card-value { font-size: 28px; font-weight: 700; color: #0f172a; margin-top: 4px; line-height: 1; }
        .summary-card-sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
        .summary-card.ativas .summary-card-value { color: #16a34a; }
        .summary-card.encerradas .summary-card-value { color: #64748b; }
        .summary-card.pedidos .summary-card-value { color: #2563eb; }

        /* Tabela */
        .table-section { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .table-title { font-size: 13px; font-weight: 600; color: #334155; padding: 14px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          background: #1e293b; color: #e2e8f0; text-align: left;
          padding: 10px 12px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          white-space: nowrap;
        }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody tr:hover { background: #f1f5f9; }
        td { padding: 9px 12px; vertical-align: top; color: #334155; }
        td.mono { font-family: 'Geist Mono', 'Courier New', monospace; font-size: 11.5px; }
        td.center { text-align: center; }
        td.muted { color: #94a3b8; }

        /* Badges inline */
        .badge {
          display: inline-block; padding: 2px 8px; border-radius: 99px;
          font-size: 10.5px; font-weight: 600; white-space: nowrap;
        }
        .badge-ativa     { background: #dcfce7; color: #166534; }
        .badge-encerrada { background: #f1f5f9; color: #475569; }
        .badge-urgente   { background: #fee2e2; color: #991b1b; }
        .badge-atencao   { background: #fef3c7; color: #92400e; }

        .pedido-link { color: #2563eb; text-decoration: none; font-size: 11.5px; }
        .pedido-link:hover { text-decoration: underline; }
        .status-fab {
          display: inline-block; font-size: 10.5px; padding: 2px 7px;
          border-radius: 4px; background: #f1f5f9; color: #475569;
          border: 1px solid #e2e8f0; white-space: nowrap; margin-top: 3px;
        }
        .status-fab.critico { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

        /* Empty state */
        .empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 14px; }

        /* Rodapé */
        .report-footer {
          margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0;
          font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;
        }

        /* Print overrides */
        @media print {
          body { background: #fff !important; }
          .actions-bar { display: none !important; }
          .page-wrap { padding: 0; max-width: 100%; }
          .table-section { border: 1px solid #e2e8f0 !important; border-radius: 0 !important; }
          thead th { background: #1e293b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tbody tr:nth-child(even) { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .summary-card { border: 1px solid #e2e8f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm 12mm; size: A4 landscape; }
          table { font-size: 10.5px; }
          td { padding: 6px 10px; }
        }
      `}</style>

      <div className="page-wrap">
        {/* Barra de ações */}
        <PrintButtons />

        {/* Cabeçalho */}
        <div className="report-header">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/motochefe-logo.png" alt="MotoChefe" className="brand-icon" />
            <div>
              <div className="brand-name">MotoChefe {grupo.nome}</div>
              <div className="brand-sub">MOVA — Sistema de Gestão</div>
            </div>
          </div>
          <div className="report-meta">
            <div className="report-title">Relatório de Garantias</div>
            <div className="report-date">Gerado em {agora}</div>
          </div>
        </div>

        {/* Filtros aplicados */}
        {filtrosAtivos.length > 0 ? (
          <div className="filters-row">
            <span className="filters-label">Filtros:</span>
            {filtrosAtivos.map((f, i) => (
              <span key={i} className="filter-tag">{f}</span>
            ))}
          </div>
        ) : (
          <div className="filters-row">
            <span className="filters-label">Filtros:</span>
            <span className="filter-tag">Todas as garantias</span>
          </div>
        )}

        {/* Cards de resumo */}
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-card-label">Total</div>
            <div className="summary-card-value">{rows.length}</div>
            <div className="summary-card-sub">garantias</div>
          </div>
          <div className="summary-card ativas">
            <div className="summary-card-label">Ativas</div>
            <div className="summary-card-value">{ativas.length}</div>
            <div className="summary-card-sub">em andamento</div>
          </div>
          <div className="summary-card encerradas">
            <div className="summary-card-label">Encerradas</div>
            <div className="summary-card-value">{encerradas.length}</div>
            <div className="summary-card-sub">concluídas</div>
          </div>
          <div className="summary-card pedidos">
            <div className="summary-card-label">Com Pedido Fábrica</div>
            <div className="summary-card-value">{comPedido.length}</div>
            <div className="summary-card-sub">pedidos abertos</div>
          </div>
        </div>

        {/* Tabela */}
        <div className="table-section">
          <div className="table-title">Detalhamento — {rows.length} {rows.length === 1 ? 'garantia' : 'garantias'}</div>
          {rows.length === 0 ? (
            <div className="empty">Nenhuma garantia encontrada com os filtros selecionados.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Loja</th>
                  <th>Marca / Modelo</th>
                  <th>Chassi</th>
                  <th>Descrição</th>
                  <th>Abertura</th>
                  <th>Prazo</th>
                  <th>Dias</th>
                  <th>Status</th>
                  <th>Pedido Fábrica</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => {
                  const dias = g.status === 'ativa' ? diasDecorridos(g.dataInicio) : null
                  const urg = urgenciaClass(dias, g.status)
                  const CRITICOS = new Set(['Em Exigência', 'Rejeitado', 'Aguardando Postagem Reversa'])
                  return (
                    <tr key={g.id}>
                      <td className="center muted" style={{ fontSize: 11 }}>{i + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{g.lojaNome}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <strong>{g.marca}</strong><br />
                        <span style={{ color: '#64748b', fontSize: 11 }}>{g.modelo}</span>
                      </td>
                      <td className="mono">{g.chassi}</td>
                      <td style={{ maxWidth: 220 }}>{g.descricao}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmt(g.dataInicio)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {g.status === 'ativa' ? fmt(g.dataFim) : fmt(g.dataEncerramento)}
                      </td>
                      <td className="center">
                        {g.status === 'ativa' && dias !== null
                          ? <span className={`badge ${urg === 'urgente' ? 'badge-urgente' : urg === 'atencao' ? 'badge-atencao' : 'badge-ativa'}`}>{dias}d</span>
                          : <span className="muted">—</span>
                        }
                      </td>
                      <td>
                        <span className={`badge ${g.status === 'ativa' ? (urg === 'urgente' ? 'badge-urgente' : urg === 'atencao' ? 'badge-atencao' : 'badge-ativa') : 'badge-encerrada'}`}>
                          {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
                        </span>
                      </td>
                      <td>
                        {g.numeroPedidoFabrica ? (
                          <>
                            <a
                              href={`https://motochefebrasil.store/clientes/trocas/detalhes/${g.numeroPedidoFabrica}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pedido-link"
                            >
                              #{g.numeroPedidoFabrica}
                            </a>
                            {g.statusFabrica && (
                              <div>
                                <span className={`status-fab ${CRITICOS.has(g.statusFabrica) ? 'critico' : ''}`}>
                                  {g.statusFabrica}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rodapé */}
        <div className="report-footer">
          <span>MOVA — Sistema de Gestão · MotoChefe {grupo.nome}</span>
          <span>Gerado em {agora}</span>
        </div>
      </div>

    </>
  )
}
