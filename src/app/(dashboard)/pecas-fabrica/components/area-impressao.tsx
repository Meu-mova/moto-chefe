'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LojaPecasSeparadas } from '../actions'

type Props = {
  /** Já filtradas — o papel impresso é exatamente o que está na tela. */
  lojas: LojaPecasSeparadas[]
  grupo: string
  filtroStatus: string
  filtroLoja: string
}

/**
 * Folha de retirada para levar/enviar à fábrica.
 *
 * Mora num portal em `document.body` de propósito: a impressão esconde todo
 * irmão dela (sidebar, cabeçalho, filtros) e só um filho direto do body dá pra
 * isolar assim. O alternativo seria uma rota /imprimir, mas os dados aqui não
 * estão no banco — vêm de um scraping ao vivo que levaria dezenas de requisições
 * ao portal para ser refeito, e ainda poderia divergir do que a tela mostra.
 */
export function AreaImpressao({ lojas, grupo, filtroStatus, filtroLoja }: Props) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  if (!montado) return null

  const total = lojas.reduce((s, l) => s + l.pecas.length, 0)
  const agora = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const filtros = [
    filtroStatus ? `Status: ${filtroStatus}` : 'Status: Separado e Conferido',
    filtroLoja ? `Loja: ${lojas.find(l => l.lojaId === filtroLoja)?.loja ?? '—'}` : 'Lojas: todas',
  ].join(' · ')

  return createPortal(
    <div id="area-impressao-fabrica">
      <style>{`
        #area-impressao-fabrica { display: none; }

        @media print {
          body > *:not(#area-impressao-fabrica) { display: none !important; }
          #area-impressao-fabrica {
            display: block !important;
            font-family: 'Geist', -apple-system, Arial, sans-serif;
            color: #0f172a;
          }
          @page { margin: 12mm 10mm; size: A4 portrait; }

          #area-impressao-fabrica * { box-sizing: border-box; margin: 0; padding: 0; }

          #area-impressao-fabrica .cabecalho {
            display: flex; justify-content: space-between; align-items: flex-start;
            padding-bottom: 14px; border-bottom: 3px solid #1e293b; margin-bottom: 14px;
          }
          #area-impressao-fabrica .marca-nome { font-size: 19px; font-weight: 700; }
          #area-impressao-fabrica .marca-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
          #area-impressao-fabrica .meta { text-align: right; }
          #area-impressao-fabrica .titulo { font-size: 17px; font-weight: 700; }
          #area-impressao-fabrica .data { font-size: 11px; color: #64748b; margin-top: 3px; }

          #area-impressao-fabrica .linha-filtros {
            background: #f1f5f9; border-radius: 8px; padding: 8px 14px;
            font-size: 11px; color: #475569; margin-bottom: 16px;
            display: flex; justify-content: space-between; gap: 10px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #area-impressao-fabrica .linha-filtros strong { color: #0f172a; }

          #area-impressao-fabrica .bloco-loja {
            border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
            margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid;
          }
          #area-impressao-fabrica .cabecalho-loja {
            display: flex; justify-content: space-between; align-items: center;
            padding: 9px 14px; background: #1e293b; color: #fff;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #area-impressao-fabrica .nome-loja { font-size: 13px; font-weight: 700; }
          #area-impressao-fabrica .qtd-loja { font-size: 11px; color: #cbd5e1; }

          #area-impressao-fabrica table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          #area-impressao-fabrica thead th {
            background: #f8fafc; color: #475569; text-align: left;
            padding: 7px 14px; font-size: 10px; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em;
            border-bottom: 1px solid #e2e8f0;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #area-impressao-fabrica tbody tr { border-bottom: 1px solid #f1f5f9; }
          #area-impressao-fabrica tbody tr:last-child { border-bottom: none; }
          #area-impressao-fabrica td { padding: 7px 14px; color: #334155; vertical-align: middle; }
          #area-impressao-fabrica td.num, #area-impressao-fabrica th.num {
            text-align: right; font-variant-numeric: tabular-nums;
          }
          /* Quadradinho para o conferente marcar a peça ao separar no galpão. */
          #area-impressao-fabrica td.check, #area-impressao-fabrica th.check {
            width: 26px; text-align: center;
          }
          #area-impressao-fabrica .caixa {
            display: inline-block; width: 11px; height: 11px;
            border: 1.2px solid #94a3b8; border-radius: 2px;
          }

          #area-impressao-fabrica .total-geral {
            display: flex; justify-content: space-between; align-items: center;
            padding: 11px 16px; border-radius: 10px; background: #0f172a; color: #fff;
            font-size: 13px; font-weight: 600;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #area-impressao-fabrica .total-geral span { font-size: 17px; font-weight: 700; }

          #area-impressao-fabrica .assinaturas {
            display: flex; gap: 28px; margin-top: 34px; break-inside: avoid; page-break-inside: avoid;
          }
          #area-impressao-fabrica .assinatura { flex: 1; text-align: center; }
          #area-impressao-fabrica .risco { border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 10.5px; color: #64748b; }

          #area-impressao-fabrica .rodape {
            margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0;
            font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;
          }
        }
      `}</style>

      <div className="cabecalho">
        <div>
          <div className="marca-nome">MotoChefe {grupo}</div>
          <div className="marca-sub">MOVA — Sistema de Gestão</div>
        </div>
        <div className="meta">
          <div className="titulo">Retirada de Peças — Fábrica</div>
          <div className="data">Gerado em {agora}</div>
        </div>
      </div>

      <div className="linha-filtros">
        <span>{filtros}</span>
        <span><strong>{total}</strong> {total === 1 ? 'peça' : 'peças'} para retirar</span>
      </div>

      {lojas.map(loja => (
        <div key={loja.lojaId} className="bloco-loja">
          <div className="cabecalho-loja">
            <div className="nome-loja">{loja.loja}</div>
            <div className="qtd-loja">{loja.pecas.length} {loja.pecas.length === 1 ? 'peça' : 'peças'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th className="check"> </th>
                <th>Peça</th>
                <th className="num">Qtd</th>
                <th>Modelo</th>
                <th>Pedido</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loja.pecas.map((p, i) => (
                <tr key={`${p.numeroPedido}-${i}`}>
                  <td className="check"><span className="caixa" /></td>
                  <td>{p.peca}</td>
                  <td className="num">{p.quantidade ?? '—'}</td>
                  <td>{p.categoria ?? '—'}</td>
                  <td>#{p.numeroPedido}</td>
                  <td>{p.dataPedido?.split(' ')[0] ?? '—'}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="total-geral">
        <div>TOTAL DE PEÇAS</div>
        <span>{total}</span>
      </div>

      <div className="assinaturas">
        <div className="assinatura"><div className="risco">Separado por (fábrica)</div></div>
        <div className="assinatura"><div className="risco">Retirado por (loja)</div></div>
        <div className="assinatura"><div className="risco">Data da retirada</div></div>
      </div>

      <div className="rodape">
        <span>MOVA — Retirada de Peças</span>
        <span>Emitido em {agora}</span>
      </div>
    </div>,
    document.body,
  )
}
