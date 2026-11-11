'use client'
// Exportar (CSV para Excel) e imprimir o que está filtrado na tela.
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  paraCsv, type LinhaEstoquePainel, type LinhaVendaPainel, type LojaPainel,
} from '@/lib/painel-fabrica'

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function AcoesPainel({ lojas, estoque, vendas, de, ate, hoje, urlImpressao }: {
  lojas: LojaPainel[]
  estoque: LinhaEstoquePainel[]
  vendas: LinhaVendaPainel[]
  de: string
  ate: string
  /** hojeBrt(), do servidor: nome do arquivo de estoque. */
  hoje: string
  urlImpressao: string
}) {
  const loja = new Map(lojas.map(l => [l.lojaId, l]))
  const colunasLoja = (id: string) => {
    const l = loja.get(id)
    return [l?.lojaNome ?? '', l?.cidade ?? '', l?.grupoNome ?? '']
  }
  const ordem = (a: (string | number)[], b: (string | number)[]) => String(a.join('|')).localeCompare(String(b.join('|')), 'pt-BR')

  const exportarEstoque = () => baixar(
    `estoque-motochefe-${hoje}.csv`,
    paraCsv(['Loja', 'Cidade', 'Empresa', 'Modelo', 'Cor', 'Quantidade'],
      estoque.map(l => [...colunasLoja(l.lojaId), l.modelo, l.cor, l.quantidade]).sort(ordem)),
  )
  const exportarVendas = () => baixar(
    `vendas-motochefe-${de}-a-${ate}.csv`,
    paraCsv(['Loja', 'Cidade', 'Empresa', 'Modelo', 'Quantidade', 'De', 'Até'],
      vendas.map(l => [...colunasLoja(l.lojaId), l.modelo, l.quantidade, de, ate]).sort(ordem)),
  )

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="gap-2" onClick={exportarEstoque}><Download size={14} /> Estoque (Excel)</Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={exportarVendas}><Download size={14} /> Vendas (Excel)</Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(urlImpressao, '_blank')}><Printer size={14} /> Imprimir / PDF</Button>
    </div>
  )
}
