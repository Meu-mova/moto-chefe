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
      toast.success(`${res.atualizadas} garantia${res.atualizadas !== 1 ? 's' : ''} sincronizada${res.atualizadas !== 1 ? 's' : ''}${res.erros > 0 ? ` (${res.erros} erro${res.erros !== 1 ? 's' : ''})` : ''}`)
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
