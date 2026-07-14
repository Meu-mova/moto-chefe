'use client'
import { Input } from '@/components/ui/input'
import { type ComponentProps } from 'react'

function formatCep(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onChange?: (value: string) => void
}

export function CepInput({ value, onChange, ...props }: Props) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      placeholder={props.placeholder ?? '00000-000'}
      value={formatCep(value)}
      onChange={e => onChange?.(formatCep(e.target.value))}
    />
  )
}
