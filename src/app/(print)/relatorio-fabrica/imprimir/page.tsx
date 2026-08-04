import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { carregarRelatorioFabrica } from '@/lib/queries/relatorio-fabrica'
import { PrintButtons } from './print-buttons'

const PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm']

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T12:00:00Z`).toLocaleDateString('pt-BR')

export default async function RelatorioFabricaImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS.includes(usuario.papel)) redirect('/dashboard')

  const params = await searchParams
  const { de, ate, grupo, grupos, totalQtd, totalValor, lojasForaNoGrupo } =
    await carregarRelatorioFabrica(usuario, params.de, params.ate)

  const agora = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Geist', -apple-system, Arial, sans-serif; background: #f8fafc; color: #0f172a; }

        .page-wrap { max-width: 900px; margin: 0 auto; padding: 32px 24px; }

        .actions-bar { display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 24px; }
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500;
          cursor: pointer; border: 1.5px solid #e2e8f0; background: #fff;
          color: #334155; text-decoration: none;
        }
        .btn:hover { background: #f1f5f9; }
        .btn-primary { background: #1e293b; color: #fff; border-color: #1e293b; }
        .btn-primary:hover { background: #334155; }

        /* Cabeçalho */
        .report-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 20px; border-bottom: 3px solid #1e293b; margin-bottom: 20px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-icon { height: 48px; width: auto; object-fit: contain; }
        .brand-name { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.2; }
        .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .report-meta { text-align: right; }
        .report-title { font-size: 18px; font-weight: 700; color: #0f172a; }
        .report-date { font-size: 12px; color: #64748b; margin-top: 4px; }

        /* Período */
        .period-row {
          background: #f1f5f9; border-radius: 8px; padding: 10px 16px;
          font-size: 12px; color: #475569; margin-bottom: 20px;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .period-label { font-weight: 600; color: #334155; }

        /* Cards de resumo */
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
        .summary-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
        .summary-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 600; }
        .summary-card-value { font-size: 26px; font-weight: 700; color: #0f172a; margin-top: 4px; line-height: 1; }
        .summary-card-sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
        .summary-card.valor .summary-card-value { color: #15803d; font-size: 22px; }

        /* Bloco por loja */
        .loja-block { border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
        .loja-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px; background: #1e293b; color: #fff;
        }
        .loja-nome { font-size: 14px; font-weight: 700; letter-spacing: 0.01em; }
        .loja-totais { font-size: 12px; color: #cbd5e1; }
        .loja-totais strong { color: #fff; }

        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          background: #f8fafc; color: #475569; text-align: left;
          padding: 8px 16px; font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          border-bottom: 1px solid #e2e8f0;
        }
        thead th.num { text-align: right; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        td { padding: 8px 16px; vertical-align: middle; color: #334155; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        td .marca { color: #94a3b8; font-size: 11px; margin-left: 4px; }
        tfoot td {
          padding: 9px 16px; font-weight: 700; color: #0f172a;
          border-top: 2px solid #e2e8f0; background: #f1f5f9;
        }
        tfoot td.num { text-align: right; font-variant-numeric: tabular-nums; }

        /* Total geral */
        .total-geral {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 8px; padding: 14px 18px; border-radius: 12px;
          background: #0f172a; color: #fff;
        }
        .total-geral-label { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
        .total-geral-nums { display: flex; gap: 28px; align-items: baseline; }
        .total-geral-qtd { font-size: 14px; color: #cbd5e1; }
        .total-geral-qtd strong { color: #fff; font-size: 18px; }
        .total-geral-valor { font-size: 22px; font-weight: 700; }

        .empty { text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: #fff; }

        .report-footer {
          margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0;
          font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px;
        }

        /* Print overrides */
        @media print {
          body { background: #fff !important; }
          .actions-bar { display: none !important; }
          .page-wrap { padding: 0; max-width: 100%; }
          .loja-block, .summary-card { border: 1px solid #e2e8f0 !important; }
          .loja-block { break-inside: avoid; page-break-inside: avoid; }
          .loja-head, .total-geral { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead th, tbody tr:nth-child(even), tfoot td, .summary-card.valor, .period-row {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          @page { margin: 14mm 12mm; size: A4 portrait; }
        }
      `}</style>

      <div className="page-wrap">
        <PrintButtons />

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
            <div className="report-title">Relatório de Vendas — Fábrica</div>
            <div className="report-date">Gerado em {agora}</div>
          </div>
        </div>

        <div className="period-row">
          <span className="period-label">Período:</span>
          <span>{fmtData(de)} a {fmtData(ate)}</span>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-card-label">Lojas</div>
            <div className="summary-card-value">{grupos.length}</div>
            <div className="summary-card-sub">com vendas</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Motos vendidas</div>
            <div className="summary-card-value">{totalQtd}</div>
            <div className="summary-card-sub">no período</div>
          </div>
          <div className="summary-card valor">
            <div className="summary-card-label">Valor total</div>
            <div className="summary-card-value">{fmt(totalValor)}</div>
            <div className="summary-card-sub">faturamento</div>
          </div>
        </div>

        {grupos.length === 0 ? (
          <div className="empty">Nenhuma venda no período selecionado.</div>
        ) : (
          <>
            {grupos.map(g => (
              <div key={g.lojaId} className="loja-block">
                <div className="loja-head">
                  <div className="loja-nome">{g.lojaNome}</div>
                  <div className="loja-totais">
                    <strong>{g.quantidade}</strong> {g.quantidade === 1 ? 'moto' : 'motos'} · <strong>{fmt(g.valor)}</strong>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Modelo</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.modelos.map(m => (
                      <tr key={`${g.lojaId}-${m.modelo}`}>
                        <td>{m.modelo}<span className="marca">{m.marca}</span></td>
                        <td className="num">{m.quantidade}</td>
                        <td className="num">{fmt(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total {g.lojaNome}</td>
                      <td className="num">{g.quantidade}</td>
                      <td className="num">{fmt(g.valor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}

            <div className="total-geral">
              <div className="total-geral-label">TOTAL GERAL</div>
              <div className="total-geral-nums">
                <div className="total-geral-qtd"><strong>{totalQtd}</strong> motos</div>
                <div className="total-geral-valor">{fmt(totalValor)}</div>
              </div>
            </div>
          </>
        )}

        {lojasForaNoGrupo.length > 0 && (
          <div className="report-footer">
            <span>Não entram neste relatório: {lojasForaNoGrupo.map(l => l.nome).join(', ')}.</span>
          </div>
        )}

        <div className="report-footer">
          <span>MOVA — Sistema de Gestão · MotoChefe {grupo.nome}</span>
          <span>Gerado em {agora}</span>
        </div>
      </div>
    </>
  )
}
