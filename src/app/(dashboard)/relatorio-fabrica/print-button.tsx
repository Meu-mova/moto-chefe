'use client'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintButton({ de, ate }: { de: string; ate: string }) {
  const href = `/relatorio-fabrica/imprimir?de=${de}&ate=${ate}`
  return (
    <Button variant="outline" size="sm" onClick={() => window.open(href, '_blank')}>
      <Printer size={14} className="mr-1.5" />
      Imprimir / PDF
    </Button>
  )
}
