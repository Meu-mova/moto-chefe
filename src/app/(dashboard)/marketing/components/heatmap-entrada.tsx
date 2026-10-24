// Quando o lead chega: dia da semana × faixa de hora (BRT). Server component —
// é só uma grade, não precisa de JS no cliente.
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Faixas de 3h: 24 colunas viram tiras ilegíveis no celular.
const FAIXAS: [string, number, number][] = [
  ['0–6', 0, 5], ['6–9', 6, 8], ['9–12', 9, 11],
  ['12–15', 12, 14], ['15–18', 15, 17], ['18–21', 18, 20], ['21–24', 21, 23],
]

export function HeatmapEntrada({ dados }: { dados: { dia: number; hora: number; leads: number }[] }) {
  if (dados.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Sem leads no período.</p>

  const grade = DIAS.map((_, d) => FAIXAS.map(([, ini, fim]) =>
    dados.filter(x => x.dia === d && x.hora >= ini && x.hora <= fim).reduce((a, x) => a + x.leads, 0)))
  const max = Math.max(1, ...grade.flat())
  const total = grade.flat().reduce((a, n) => a + n, 0)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10" />
              {FAIXAS.map(([rot]) => <th key={rot} className="font-medium text-muted-foreground px-1">{rot}h</th>)}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((dia, d) => (
              <tr key={dia}>
                <td className="text-muted-foreground pr-1 text-right">{dia}</td>
                {grade[d].map((n, i) => {
                  const intensidade = n / max
                  return (
                    <td key={i}>
                      <div
                        className="h-7 min-w-11 rounded flex items-center justify-center tabular-nums"
                        style={{
                          backgroundColor: n === 0 ? 'var(--muted)' : `color-mix(in oklch, var(--info) ${Math.round(8 + intensidade * 42)}%, transparent)`,
                          // Até 50% de info o texto do tema fica acima de 4.5:1 nos dois temas; sem troca de cor no meio.
                          color: 'var(--foreground)',
                        }}
                        title={`${DIAS[d]}, ${FAIXAS[i][0]}h — ${n} lead(s)`}
                      >
                        {n || ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString('pt-BR')} leads no período, por horário de Brasília. Serve para escalar atendimento
        e ajustar a veiculação: lead que chega quando não tem ninguém para responder é verba desperdiçada.
      </p>
    </div>
  )
}
