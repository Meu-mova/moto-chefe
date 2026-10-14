import type { Metadata } from 'next'
import { FormAdesao } from './form-adesao'

export const metadata: Metadata = {
  title: 'MOVA — Adesão',
  description: 'Envie os dados da sua loja para começar a usar o MOVA.',
}

export default function AdesaoPage() {
  return <FormAdesao />
}
