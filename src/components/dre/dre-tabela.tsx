import { montarMatriz, type ColunaMatriz } from '@/lib/dre'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/**
 * O DRE em colunas. Serve as duas visões (loja a loja e mês a mês) e as duas
 * telas (a de navegar e a de imprimir) — um demonstrativo que muda de forma
 * conforme onde é lido deixa de servir para conferir contra o outro.
 *
 * Os valores saem sem sinal: o "(−)" já está no rótulo da linha, à esquerda, e
 * vale para a fileira inteira. Repetir o menos em cada célula só suja.
 */
export function DreTabela({
  colunas,
  mostrarPercentual = true,
  destacarUltima = true,
}: {
  colunas: ColunaMatriz[]
  /** A análise vertical (% sobre a receita líquida) cabe na visão por loja; na de 12 meses, não. */
  mostrarPercentual?: boolean
  /** A última coluna é o TOTAL na visão por loja, e o mês corrente na de evolução. */
  destacarUltima?: boolean
}) {
  const linhas = montarMatriz(colunas)
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nada no período.</p>
  }

  const corpo = linhas.filter(l => l.tipo !== 'memo')
  const memo = linhas.filter(l => l.tipo === 'memo')
  const temMemo = memo.some(l => l.valores.some(v => v !== 0))

  const classeLinha = (tipo: string) => {
    if (tipo === 'resultado') return 'border-t-2 border-foreground font-bold text-base'
    if (tipo === 'subtotal') return 'border-t border-border font-semibold bg-muted'
    if (tipo === 'deducao') return 'font-medium'
    return ''
  }

  const corValor = (tipo: string, v: number) => {
    if (tipo === 'resultado') return v >= 0 ? 'text-success' : 'text-destructive'
    if (tipo === 'deducao' || tipo === 'despesa') return 'text-destructive'
    if (tipo === 'subtotal') return 'text-foreground'
    return 'text-muted-foreground'
  }

  const ultima = colunas.length - 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-foreground">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-card">
              &nbsp;
            </th>
            {colunas.map((c, i) => (
              <th
                key={c.chave}
                className={`text-right px-3 py-2 font-medium whitespace-nowrap ${
                  destacarUltima && i === ultima ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {corpo.map(l => (
            <tr key={l.chave} className={classeLinha(l.tipo)}>
              <td
                className={`px-3 py-1.5 whitespace-nowrap sticky left-0 ${
                  l.tipo === 'subtotal' ? 'bg-muted' : 'bg-card'
                } ${l.nivel === 1 ? 'pl-7 text-muted-foreground' : ''}`}
              >
                {l.rotulo}
              </td>
              {l.valores.map((v, i) => (
                <td
                  key={colunas[i].chave}
                  className={`px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums ${corValor(l.tipo, v)} ${
                    destacarUltima && i === ultima ? 'bg-muted/60' : ''
                  }`}
                >
                  {v === 0 ? <span className="text-muted-foreground">—</span> : brl(v)}
                  {mostrarPercentual && l.tipo !== 'receita' && l.percentuais[i] !== 0 && (
                    <span className="block text-[10px] text-muted-foreground font-sans">
                      {l.percentuais[i].toFixed(1)}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}

          {temMemo && (
            <>
              <tr>
                <td
                  colSpan={colunas.length + 1}
                  className="px-3 pt-5 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Memorando — fora do resultado
                </td>
              </tr>
              {memo.map(l => (
                <tr key={l.chave} className="text-muted-foreground">
                  <td className="px-3 py-1.5 pl-7 whitespace-nowrap sticky left-0 bg-card">{l.rotulo}</td>
                  {l.valores.map((v, i) => (
                    <td
                      key={colunas[i].chave}
                      className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums"
                    >
                      {v === 0 ? <span className="text-muted-foreground">—</span> : brl(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
