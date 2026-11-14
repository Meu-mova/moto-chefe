'use client'
// Exportar (CSV para Excel) e imprimir a aba aberta. O arquivo chega pronto do servidor
// (planilhaDoPainel): este Client Component não recebe as listas, só o arquivo pronto.
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { baixarArquivo } from '@/lib/baixar-arquivo'

export function AcoesPainel({ arquivo, rotuloExportar, urlImpressao }: {
  arquivo: { nome: string; conteudo: string }
  rotuloExportar: string
  urlImpressao: string
}) {
  const exportar = () => baixarArquivo(arquivo.nome, new Blob([arquivo.conteudo], { type: 'text/csv;charset=utf-8' }))
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="gap-2" onClick={exportar}><Download size={14} /> {rotuloExportar}</Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(urlImpressao, '_blank')}><Printer size={14} /> Imprimir / PDF</Button>
    </div>
  )
}
