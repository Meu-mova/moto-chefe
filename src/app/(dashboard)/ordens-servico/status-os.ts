/**
 * Rótulo e tom de cada status da OS, para lista, painel e filtros (#248). Só variáveis do
 * globals.css: aguardando alguém = aviso; na oficina = primário suave; fechada = primário;
 * cancelada = apagada.
 */
export const STATUS_OS = [
  { value: 'aberta',             label: 'Aberta',                curto: 'Aberta',          tom: 'bg-warning/10 text-warning ring-1 ring-warning/40' },
  { value: 'oficina',            label: 'Oficina',               curto: 'Oficina',         tom: 'bg-primary-soft text-primary-text ring-1 ring-primary/30' },
  { value: 'em_andamento',       label: 'Em Andamento',          curto: 'Em andamento',    tom: 'bg-primary-soft text-primary-text ring-1 ring-primary/30' },
  { value: 'finalizada',         label: 'Finalizada',            curto: 'Finalizada',      tom: 'bg-primary-soft text-primary-text ring-1 ring-primary/30' },
  { value: 'pendente_pagamento', label: 'Pendente de Pagamento', curto: 'Pend. pagamento', tom: 'bg-warning/10 text-warning ring-1 ring-warning/40' },
  { value: 'concluida',          label: 'Concluída',             curto: 'Concluída',       tom: 'bg-primary text-primary-foreground' },
  { value: 'cancelada',          label: 'Cancelada',             curto: 'Cancelada',       tom: 'bg-muted text-muted-foreground ring-1 ring-border' },
] as const

const POR_VALOR = new Map<string, (typeof STATUS_OS)[number]>(STATUS_OS.map(s => [s.value, s]))

export const rotuloStatusOS = (s: string) => POR_VALOR.get(s)?.label ?? s
export const tomStatusOS = (s: string) => POR_VALOR.get(s)?.tom ?? 'bg-muted text-muted-foreground'
