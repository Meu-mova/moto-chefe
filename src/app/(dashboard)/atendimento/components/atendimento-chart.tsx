'use client'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from 'recharts'

type Dado = { nome: string; volume: number; ganhos: number }

export function AtendimentoChart({ dados }: { dados: Dado[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">Sem dados no período.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, dados.length * 38)}>
      <BarChart data={dados} layout="vertical" margin={{ left: 24, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="volume" name="Leads" fill="#6366f1" radius={[0, 4, 4, 0]} />
        <Bar dataKey="ganhos" name="Ganhos" fill="#16a34a" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
