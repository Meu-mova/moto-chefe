import type { ComprovanteTransferencia } from '@/lib/transferencia-tela'

// Só papel: a conferência é marcada à mão na chegada e nada disso volta para o MOVA.
const ITENS_CONFERENCIA = [
  'Chave (quantidade: ___)', 'Carregador', 'Manual', 'Retrovisores', 'Sem avarias', 'Com avarias (descrever abaixo)',
] as const

const LINHAS_ANOTACOES = 3

export function Comprovante({ c }: { c: ComprovanteTransferencia }) {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .tema-claro { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: var(--foreground); background: var(--card); padding: 28px 32px; }
        .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid var(--foreground); padding-bottom: 10px; margin-bottom: 14px; }
        .cab h1 { font-size: 16px; font-weight: 900; letter-spacing: .02em; }
        .emp { font-size: 11px; color: var(--muted-foreground); margin-top: 2px; }
        .num { text-align: right; font-size: 11px; color: var(--muted-foreground); white-space: nowrap; }
        .num b { display: block; font-size: 14px; color: var(--foreground); }
        table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
        td { border: 1px solid var(--border); padding: 6px 8px; vertical-align: top; }
        td.k { width: 30%; color: var(--muted-foreground); background: var(--muted); }
        .tit { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 6px; }
        .chk { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
        .caixa { display: inline-block; width: 11px; height: 11px; border: 1px solid var(--foreground); margin-right: 6px; vertical-align: -1px; }
        .linha { border-bottom: 1px solid var(--muted-foreground); height: 22px; }
        .ass { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 48px; break-inside: avoid; }
        .ass p { border-top: 1px solid var(--foreground); padding-top: 4px; font-size: 11px; text-align: center; }
        @media print {
          .tema-claro { padding: 0; }
          @page { size: A4; margin: 1.5cm; }
        }
      `}</style>

      <header className="cab">
        <div>
          <h1>COMPROVANTE DE TRANSFERÊNCIA</h1>
          <p className="emp">{c.empresa} · CNPJ {c.cnpj}</p>
        </div>
        <div className="num">
          Transferência<b>{c.data}</b>Status: {c.status}
        </div>
      </header>

      <table>
        <tbody>
          <tr><td className="k">Moto</td><td>{c.moto}</td></tr>
          <tr><td className="k">De → Para</td><td>{c.origem} → {c.destino}</td></tr>
          <tr><td className="k">Solicitado por</td><td>{c.solicitado}</td></tr>
          {c.resposta && <tr><td className="k">{c.resposta.rotulo}</td><td>{c.resposta.texto}</td></tr>}
          {c.observacao && <tr><td className="k">Observação</td><td>{c.observacao}</td></tr>}
        </tbody>
      </table>

      <h2 className="tit">Conferência na chegada</h2>
      <ul className="chk">
        {ITENS_CONFERENCIA.map(item => <li key={item}><span className="caixa" />{item}</li>)}
      </ul>

      <h2 className="tit">Anotações</h2>
      <div>
        {Array.from({ length: LINHAS_ANOTACOES }, (_, i) => <div key={i} className="linha" />)}
      </div>

      <div className="ass">
        <p>Entregue por (loja de origem)</p>
        <p>Recebido e conferido por (loja de destino)</p>
      </div>
    </>
  )
}
