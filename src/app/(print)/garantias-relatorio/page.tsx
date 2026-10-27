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
        .tema-claro { font-family: 'Geist', -apple-system, Arial, sans-serif; background: var(--muted); color: var(--foreground); }

        .page-wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

        /* Barra de ações (esconde no print) */
        .actions-bar {
          display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 24px;
        }
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500;
          cursor: pointer; border: 1.5px solid var(--border); background: var(--card);
          color: var(--foreground); text-decoration: none; transition: background 0.15s;
        }
        .btn:hover { background: var(--muted); }
        .btn-primary { background: var(--foreground); color: var(--card); border-color: var(--foreground); }
        .btn-primary:hover { background: var(--foreground); }

        /* Cabeçalho do relatório */
        .report-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 20px; border-bottom: 3px solid var(--foreground); margin-bottom: 24px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-icon {
          height: 48px; width: auto; object-fit: contain;
        }
        .brand-name { font-size: 20px; font-weight: 700; color: var(--foreground); line-height: 1.2; }
        .brand-sub { font-size: 12px; color: var(--muted-foreground); margin-top: 2px; }
        .report-meta { text-align: right; }
        .report-title { font-size: 18px; font-weight: 700; color: var(--foreground); }
        .report-date { font-size: 12px; color: var(--muted-foreground); margin-top: 4px; }

        /* Filtros */
        .filters-row {
          background: var(--muted); border-radius: 8px; padding: 10px 16px;
          font-size: 12px; color: var(--muted-foreground); margin-bottom: 24px;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .filters-label { font-weight: 600; color: var(--foreground); }
        .filter-tag {
          background: var(--border); border-radius: 4px; padding: 2px 8px; font-size: 11px;
        }

        /* Cards de resumo */
        .summary-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
          margin-bottom: 28px;
        }
        .summary-card {
          background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
          padding: 14px 16px;
        }
        .summary-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); font-weight: 600; }
        .summary-card-value { font-size: 28px; font-weight: 700; color: var(--foreground); margin-top: 4px; line-height: 1; }
        .summary-card-sub { font-size: 11px; color: var(--muted-foreground); margin-top: 4px; }
        .summary-card.ativas .summary-card-value { color: var(--success); }
        .summary-card.encerradas .summary-card-value { color: var(--muted-foreground); }
        .summary-card.pedidos .summary-card-value { color: var(--info); }

        /* Tabela */
        .table-section { background: var(--card); border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; }
        .table-title { font-size: 13px; font-weight: 600; color: var(--foreground); padding: 14px 16px; border-bottom: 1px solid var(--border); background: var(--muted); }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          background: var(--primary); color: var(--primary-foreground); text-align: left;
          padding: 10px 12px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          white-space: nowrap;
        }
        tbody tr { border-bottom: 1px solid var(--muted); }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:nth-child(even) { background: var(--muted); }
        tbody tr:hover { background: var(--muted); }
        td { padding: 9px 12px; vertical-align: top; color: var(--foreground); }
        td.mono { font-family: 'Geist Mono', 'Courier New', monospace; font-size: 11.5px; }
        td.center { text-align: center; }
        td.muted { color: var(--muted-foreground); }

        /* Badges inline */
        .badge {
          display: inline-block; padding: 2px 8px; border-radius: 99px;
          font-size: 10.5px; font-weight: 600; white-space: nowrap;
        }
        .badge-ativa     { background: color-mix(in srgb, var(--success) 15%, var(--card)); color: var(--success); }
        .badge-encerrada { background: var(--muted); color: var(--muted-foreground); }
        .badge-urgente   { background: color-mix(in srgb, var(--destructive) 10%, var(--card)); color: var(--destructive); }
        .badge-atencao   { background: color-mix(in srgb, var(--warning) 12%, var(--card)); color: var(--warning); }

        .pedido-link { color: var(--info); text-decoration: none; font-size: 11.5px; }
        .pedido-link:hover { text-decoration: underline; }
        .status-fab {
          display: inline-block; font-size: 10.5px; padding: 2px 7px;
          border-radius: 4px; background: var(--muted); color: var(--muted-foreground);
          border: 1px solid var(--border); white-space: nowrap; margin-top: 3px;
        }
        .status-fab.critico { background: color-mix(in srgb, var(--destructive) 10%, var(--card)); color: var(--destructive); border-color: color-mix(in srgb, var(--destructive) 40%, var(--card)); }

        /* Empty state */
        .empty { text-align: center; padding: 60px 20px; color: var(--muted-foreground); font-size: 14px; }

        /* Rodapé */
        .report-footer {
          margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--border);
          font-size: 11px; color: var(--muted-foreground); display: flex; justify-content: space-between;
        }

        /* Print overrides */
        @media print {
          .tema-claro { background: var(--card) !important; }
          .actions-bar { display: none !important; }
          .page-wrap { padding: 0; max-width: 100%; }
          .table-section { border: 1px solid var(--border) !important; border-radius: 0 !important; }
          thead th { background: var(--primary) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tbody tr:nth-child(even) { background: var(--muted) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .summary-card { border: 1px solid var(--border) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
                        <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{g.modelo}</span>
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
