'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from 'recharts'

type Ponto = { periodo: string; leads: number; ganhos: number }

// Rótulo curto: "05/08" no diário, "ago/26" no mensal.
function rotulo(periodo: string, gran: 'dia' | 'mes') {
  const [ano, mes, dia] = periodo.split('-')
  if (gran === 'mes') {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${nomes[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
  }
  return `${dia}/${mes}`
}

export function EvolucaoChart({ dados, gran }: { dados: Ponto[]; gran: 'dia' | 'mes' }) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">Sem leads no período.</p>
  }
  const data = dados.map(d => ({ ...d, label: rotulo(d.periodo, gran) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} interval="preserveStartEnd" />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
        <YAxis yAxisId="g" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
        <Tooltip contentStyle={{ background: 'var(--popover)', borderColor: 'var(--border)', color: 'var(--popover-foreground)' }} cursor={{ fill: 'var(--muted)' }} />
        <Legend />
        <Bar yAxisId="l" dataKey="leads" name="Leads de entrada" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
        <Line yAxisId="g" type="monotone" dataKey="ganhos" name="Ganhos" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
