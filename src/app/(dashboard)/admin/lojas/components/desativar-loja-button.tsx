'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { desativarLojaAction } from '../actions'

export function DesativarLojaButton({ lojaId }: { lojaId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDesativar() {
    if (!confirm('Desativar esta loja?')) return
    setLoading(true)
    try {
      await desativarLojaAction(lojaId)
      toast.success('Loja desativada.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDesativar} disabled={loading}>
      {loading ? 'Desativando...' : 'Desativar'}
    </Button>
  )
}
