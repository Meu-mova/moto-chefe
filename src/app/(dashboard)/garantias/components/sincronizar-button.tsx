'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { sincronizarFabricaAction } from '../actions'
import { RefreshCw } from 'lucide-react'

export function SincronizarFabricaButton() {
  const [loading, setLoading] = useState(false)

  async function handleSync() {
    setLoading(true)
    try {
      const res = await sincronizarFabricaAction()
      const total  = res.porLoja.reduce((s, l) => s + l.atualizadas, 0)
      const erros  = res.porLoja.reduce((s, l) => s + l.erros, 0)
      const plural = total !== 1 ? 's' : ''

      const detalhe = res.porLoja
        .filter(l => l.atualizadas > 0 || l.erros > 0)
        .map(l => `${l.loja}: ${l.atualizadas}${l.erros > 0 ? ` (${l.erros} com erro)` : ''}`)
        .join(' · ')

      const semLogin = res.semCredencial.length > 0
        ? `\nSem login cadastrado: ${res.semCredencial.join(', ')}`
        : ''

      const resumo = `${total} garantia${plural} sincronizada${plural}${detalhe ? `\n${detalhe}` : ''}${semLogin}`
      if (erros > 0) toast.warning(resumo)
      else toast.success(resumo)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={loading}>
      <RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Sincronizando...' : 'Sincronizar Fábrica'}
    </Button>
  )
}
