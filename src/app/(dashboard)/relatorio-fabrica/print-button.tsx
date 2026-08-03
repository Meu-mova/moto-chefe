'use client'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer size={14} className="mr-1.5" />
      Imprimir / PDF
    </Button>
  )
}
