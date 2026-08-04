'use client'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

// Serve a mais de uma tela (relatório da fábrica e folha de pagamento), por isso
// a rota vem por parâmetro em vez de fixa no código.
export function PrintButton({ href, rotulo = 'Imprimir / PDF' }: { href: string; rotulo?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.open(href, '_blank')}>
      <Printer size={14} className="mr-1.5" />
      {rotulo}
    </Button>
  )
}
