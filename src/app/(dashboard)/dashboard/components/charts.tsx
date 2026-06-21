'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type VendasDia = { dia: string; total: number; valor: number }
type EstoqueLoja = { loja: string; total: number }
type VendasLoja = { loja: string; total: number; valor: string | null }

export function GraficoVendasPorDia({ dados }: { dados: VendasDia[] }) {
  const formatted = dados.map(d => ({
    ...d,
    diaLabel: d.dia.substring(8, 10) + '/' + d.dia.substring(5, 7),
  }))

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Vendas por dia</h3>
      {formatted.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nenhuma venda no período</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="diaLabel" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              formatter={(value, name) =>
                name === 'valor' ? formatCurrency(Number(value)) : value
              }
              labelFormatter={l => `Dia ${l}`}
            />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Qtd" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function GraficoEstoquePorLoja({ dados }: { dados: EstoqueLoja[] }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Estoque por loja</h3>
      {dados.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis dataKey="loja" type="category" tick={{ fontSize: 12 }} width={100} />
            <Tooltip />
            <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Motos" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function GraficoVendasPorLoja({ dados }: { dados: VendasLoja[] }) {
  const pieData = dados.map(d => ({ name: d.loja, value: d.total }))

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Vendas por loja</h3>
      {pieData.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nenhuma venda no período</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
