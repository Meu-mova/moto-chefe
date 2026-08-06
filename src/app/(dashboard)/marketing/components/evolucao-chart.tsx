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
    return <p className="text-sm text-slate-400 text-center py-12">Sem leads no período.</p>
  }
  const data = dados.map(d => ({ ...d, label: rotulo(d.periodo, gran) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis yAxisId="l" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis yAxisId="g" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="l" dataKey="leads" name="Leads de entrada" fill="#6366f1" radius={[3, 3, 0, 0]} />
        <Line yAxisId="g" type="monotone" dataKey="ganhos" name="Ganhos" stroke="#16a34a" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
