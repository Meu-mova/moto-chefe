'use client'
import { Input } from '@/components/ui/input'
import { type ComponentProps } from 'react'

function formatCurrency(v: string): string {
  if (!v) return ''
  const num = parseFloat(v)
  if (isNaN(num)) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrency(formatted: string): string {
  const digits = formatted.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  return (cents / 100).toFixed(2)
}

type Props = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: string
  onChange?: (value: string) => void
}

export function CurrencyInput({ value, onChange, readOnly, ...props }: Props) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      readOnly={readOnly}
      value={formatCurrency(value)}
      onChange={readOnly ? undefined : e => onChange?.(parseCurrency(e.target.value))}
    />
  )
}
