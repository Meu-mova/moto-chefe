'use client'

import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import type { PontoFaturamento } from '@/lib/dashboard-series'
import { Secao } from './painel-secoes'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
// Caixa é conferido no centavo; no gráfico o valor arredondado basta.
const brlCentavos = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${Math.round(v / 1000)} mil` : brl(v))
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// Margem do eixo Y pelo maior rótulo (~6,5px por caractere a 11px): fixa, ela corta "R$ 100 mil" no celular.
function larguraEixoY(max: number) {
  return Math.ceil(brlCurto(max).length * 6.5) + 12
}

const eixo = { fontSize: 11, fill: 'var(--muted-foreground)' }

// Tick próprio: o padrão do Recharts quebra "R$ 28 mil" em duas linhas quando a largura aperta.
function TickReais({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
      {brlCurto(payload?.value ?? 0)}
    </text>
  )
}

function Legenda() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-chart-1" />Período</span>
      <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-chart-4" />Período anterior</span>
    </div>
  )
}

type CampoValor = Exclude<keyof PontoFaturamento, 'dia'>
type Campos = { atual: CampoValor; anterior: CampoValor }

function Dica({ active, payload, campos }: {
  active?: boolean
  payload?: { payload: PontoFaturamento }[]
  campos: Campos
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const atual = p[campos.atual]
  const anterior = p[campos.anterior]
  const dif = atual - anterior
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="font-semibold">{diaMes(p.dia)}</div>
      <div className="tabular-nums">Período: {brl(atual)}</div>
      <div className="tabular-nums text-muted-foreground">Anterior: {brl(anterior)}</div>
      <div className={`tabular-nums ${dif < 0 ? 'text-destructive' : 'text-primary-text'}`}>
        {dif >= 0 ? '+' : '−'}{brl(Math.abs(dif))}
      </div>
    </div>
  )
}

// Eixos e grade iguais nos dois gráficos, como props: o XAxis/YAxis continua filho direto do gráfico.
const grade = { vertical: false, stroke: 'var(--border)' }
const eixoX = { dataKey: 'dia', tickFormatter: diaMes, tick: eixo, tickLine: false, axisLine: { stroke: 'var(--input)' } }
const eixoY = (max: number) => ({ tick: <TickReais />, tickLine: false, axisLine: false, width: larguraEixoY(max) })

function QuadroGrafico({ titulo, vazio, altura, children }: {
  titulo: string
  vazio: boolean
  altura: number
  children: React.ReactElement
}) {
  return (
    <Secao titulo={titulo}>
      {vazio ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda no período</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={altura} className="mt-3">{children}</ResponsiveContainer>
          <Legenda />
        </>
      )}
    </Secao>
  )
}

export function GraficoFaturamentoPorDia({ serie }: { serie: PontoFaturamento[] }) {
  const max = Math.max(0, ...serie.flatMap(p => [p.atual, p.anterior]))
  const maiorDia = Math.max(0, ...serie.map(p => p.atual))
  return (
    <QuadroGrafico titulo="Faturamento por dia" vazio={max === 0} altura={240}>
      <ComposedChart data={serie} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...grade} />
        <XAxis {...eixoX} minTickGap={12} />
        <YAxis {...eixoY(max)} />
        <Tooltip content={<Dica campos={{ atual: 'atual', anterior: 'anterior' }} />} cursor={{ fill: 'var(--muted)' }} />
        <Bar dataKey="atual" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          <LabelList
            dataKey="atual"
            content={({ x, y, width, value }) =>
              Number(value) === maiorDia ? (
                <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
                  {brlCurto(maiorDia)}
                </text>
              ) : null
            }
          />
        </Bar>
        <Line dataKey="anterior" type="linear" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </QuadroGrafico>
  )
}

export function GraficoAcumulado({ serie }: { serie: PontoFaturamento[] }) {
  const ultimo = serie.at(-1)
  const max = Math.max(0, ultimo?.atualAcumulado ?? 0, ultimo?.anteriorAcumulado ?? 0)
  const fim = serie.length - 1
  // Valor na ponta de cada linha: responde "à frente ou atrás?" sem passar o mouse.
  const renderPonta = (cor: string, campo: CampoValor, comPonto: boolean) =>
    function Ponta({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
      if (index !== fim || !ultimo) return <g key={index} />
      return (
        <g key={index}>
          {comPonto && <circle cx={cx} cy={cy} r={3.5} fill={cor} />}
          <text x={Number(cx) + 6} y={Number(cy) + 4} fontSize={11} fontWeight={600} fill={cor}>{brlCurto(ultimo[campo])}</text>
        </g>
      )
    }
  return (
    <QuadroGrafico titulo="Acumulado do período" vazio={max === 0} altura={200}>
      <ComposedChart data={serie} margin={{ top: 14, right: 62, bottom: 0, left: 0 }}>
        <CartesianGrid {...grade} />
        <XAxis {...eixoX} ticks={serie.length > 1 ? [serie[0].dia, serie[fim].dia] : undefined} interval={0} />
        <YAxis {...eixoY(max)} />
        <Tooltip content={<Dica campos={{ atual: 'atualAcumulado', anterior: 'anteriorAcumulado' }} />} cursor={{ stroke: 'var(--input)' }} />
        <Area dataKey="atualAcumulado" type="linear" stroke="var(--chart-1)" strokeWidth={2.5} fill="var(--chart-1)" fillOpacity={0.12}
          dot={renderPonta('var(--chart-1)', 'atualAcumulado', true)} activeDot={false} isAnimationActive={false} />
        <Line dataKey="anteriorAcumulado" type="linear" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 4"
          dot={renderPonta('var(--muted-foreground)', 'anteriorAcumulado', false)} activeDot={false} isAnimationActive={false} />
      </ComposedChart>
    </QuadroGrafico>
  )
}

type CaixaLoja = { loja: string; saldo: string }

export function GraficoCaixaPorLoja({ dados }: { dados: CaixaLoja[] }) {
  const lojas = dados.map(d => ({ loja: d.loja, saldo: Number(d.saldo) }))
  const total = lojas.reduce((s, l) => s + l.saldo, 0)
  const maior = Math.max(1, ...lojas.map(l => Math.abs(l.saldo)))
  // Com saldo negativo em alguma loja a fatia passa de 100% ou fica negativa: aí não mostra.
  const mostraPct = total > 0 && lojas.every(l => l.saldo >= 0)
  return (
    <Secao titulo="Caixa por loja">
      <div className="flex gap-6 pt-3 pb-2">
        <div><b className="block text-lg tabular-nums">{brlCentavos(total)}</b><span className="text-xs text-muted-foreground">total em caixa</span></div>
        <div><b className="block text-lg tabular-nums">{lojas.length}</b><span className="text-xs text-muted-foreground">lojas</span></div>
      </div>
      <ul className="space-y-2">
        {lojas.map(l => (
          <li key={l.loja} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,10rem)_1fr_auto]">
            <span className="truncate">{l.loja}</span>
            <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded-sm bg-muted sm:col-span-1 sm:row-start-auto">
              <i className={`block h-full ${l.saldo < 0 ? 'bg-destructive' : 'bg-chart-1'}`} style={{ width: `${(Math.abs(l.saldo) / maior) * 100}%` }} />
            </span>
            <span className={`text-right tabular-nums ${l.saldo < 0 ? 'text-destructive' : ''}`}>
              {brlCentavos(l.saldo)}
              {mostraPct && <span className="ml-1.5 text-xs text-muted-foreground">{Math.round((l.saldo / total) * 100)}%</span>}
            </span>
          </li>
        ))}
      </ul>
    </Secao>
  )
}
