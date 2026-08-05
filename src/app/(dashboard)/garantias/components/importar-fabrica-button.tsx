'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { importarGarantiasFabricaAction } from '../actions'

export function ImportarFabricaButton() {
  const [loading, setLoading] = useState(false)

  async function handleImportar() {
    setLoading(true)
    try {
      const res = await importarGarantiasFabricaAction()
      const total = res.porLoja.reduce((s, l) => s + l.importadas, 0)
      const comErro = res.porLoja.filter(l => l.erro)

      const detalhe = res.porLoja
        .filter(l => l.importadas > 0)
        .map(l => `${l.loja}: ${l.importadas}`)
        .join(' · ')

      const semLogin = res.semCredencial.length > 0
        ? `\nSem login cadastrado: ${res.semCredencial.join(', ')}`
        : ''

      if (res.porLoja.length === 0) {
        toast.info(`Nenhuma loja com login da fábrica cadastrado${semLogin}`)
      } else if (total === 0 && comErro.length === 0) {
        toast.info(`Nenhuma garantia nova na fábrica${semLogin}`)
      } else {
        const plural = total !== 1 ? 's' : ''
        const resumo = `${total} garantia${plural} importada${plural}${detalhe ? `\n${detalhe}` : ''}${semLogin}`
        if (comErro.length > 0) {
          toast.warning(`${resumo}\nFalhou em: ${comErro.map(l => l.loja).join(', ')}`)
        } else {
          toast.success(resumo)
        }
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
