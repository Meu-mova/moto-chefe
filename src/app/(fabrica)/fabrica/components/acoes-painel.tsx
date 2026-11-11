'use client'
// Exportar (CSV para Excel) e imprimir o que está filtrado na aba aberta. Tudo no navegador:
// o login da fábrica não chama Server Action nenhuma.
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  paraCsv, type Aba, type LinhaEstoquePainel, type LojaPainel, type VendaPainel,
} from '@/lib/painel-fabrica'

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

const dataBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function AcoesPainel({ aba, lojas, estoque, vendas, de, ate, hoje, urlImpressao }: {
  aba: Aba
  lojas: LojaPainel[]
  estoque: LinhaEstoquePainel[]
  /** Já filtradas e em ordem (filtrarVendas). */
  vendas: VendaPainel[]
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

  const exportar = () => aba === 'estoque'
    ? baixar(`estoque-motochefe-${hoje}.csv`, paraCsv(
      ['Loja', 'Cidade', 'Empresa', 'Modelo', 'Cor', 'Quantidade'],
      estoque.map(l => [...colunasLoja(l.lojaId), l.modelo, l.cor, l.quantidade])
        .sort((a, b) => a.join('|').localeCompare(b.join('|'), 'pt-BR')),
    ))
    : baixar(`vendas-motochefe-${de}-a-${ate}.csv`, paraCsv(
      ['Data', 'Venda', 'Loja', 'Cidade', 'Empresa', 'Modelo', 'Cor', 'Chassi'],
      vendas.map(v => [dataBr(v.data), v.numero, ...colunasLoja(v.lojaId), v.modelo, v.cor, v.chassi]),
    ))

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="gap-2" onClick={exportar}>
        <Download size={14} /> {aba === 'estoque' ? 'Estoque' : 'Vendas'} (Excel)
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(urlImpressao, '_blank')}>
        <Printer size={14} /> Imprimir / PDF
      </Button>
    </div>
  )
}
