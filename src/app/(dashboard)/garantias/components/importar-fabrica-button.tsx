'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { importarUltimaGarantiaFabricaAction } from '../actions'

export function ImportarFabricaButton() {
  const [loading, setLoading] = useState(false)

  async function handleImportar() {
    setLoading(true)
    try {
      const res = await importarUltimaGarantiaFabricaAction()
      if (res.resultado === 'importada') {
        toast.success(`Garantia importada — Chassi ${res.chassi} (Pedido #${res.numeroPedido})`)
      } else if (res.resultado === 'ja_existe') {
        toast.info(`Pedido #${res.numeroPedido} já está cadastrado no sistema`)
      } else if (res.resultado === 'lista_vazia') {
        toast.info('Nenhum pedido encontrado na fábrica')
      } else if (res.resultado === 'nenhum_chassi_encontrado') {
        toast.info('Nenhum chassi dos pedidos recentes foi encontrado no sistema')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar da fábrica')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleImportar} disabled={loading}>
      <Download size={14} className="mr-1.5" />
      {loading ? 'Importando...' : 'Importar da Fábrica'}
    </Button>
  )
}
