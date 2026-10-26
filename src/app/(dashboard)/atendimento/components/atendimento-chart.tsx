'use client'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from 'recharts'

type Dado = { nome: string; volume: number; ganhos: number }

export function AtendimentoChart({ dados }: { dados: Dado[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, dados.length * 38)}>
      <BarChart data={dados} layout="vertical" margin={{ left: 24, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={{ stroke: 'var(--input)' }} />
        <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
        <Tooltip contentStyle={{ background: 'var(--popover)', borderColor: 'var(--border)', color: 'var(--popover-foreground)' }} cursor={{ fill: 'var(--muted)' }} />
        <Legend />
        <Bar dataKey="volume" name="Leads" fill="var(--chart-4)" radius={[0, 4, 4, 0]} />
        <Bar dataKey="ganhos" name="Ganhos" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
