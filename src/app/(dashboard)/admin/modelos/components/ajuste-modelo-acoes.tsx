'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ocultarModeloAction, voltarAoOriginalAction } from '../actions'

export function AjusteModeloAcoes({ id, nome, oculto, ajustado }: { id: string; nome: string; oculto: boolean; ajustado: boolean }) {
  const [pending, start] = useTransition()
  function executar(acao: () => Promise<void>, sucesso: string) {
    start(async () => {
      try {
        await acao()
        toast.success(sucesso)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending}
        aria-label={oculto ? 'Mostrar modelo' : 'Ocultar modelo'}
        title={oculto ? 'Mostrar nas listas da sua Conta' : 'Ocultar das listas da sua Conta'}
        onClick={() => executar(() => ocultarModeloAction(id, !oculto), oculto ? 'Modelo visível de novo' : 'Modelo oculto')}>
        {oculto ? <Eye size={14} /> : <EyeOff size={14} />}
      </Button>
      {ajustado && (
        <Button variant="ghost" size="sm" disabled={pending} aria-label="Voltar ao original" title="Voltar ao original da MotoChefe"
          onClick={() => {
            if (!confirm(`Voltar "${nome}" ao original da MotoChefe?`)) return
            executar(() => voltarAoOriginalAction(id), 'Modelo voltou ao original')
          }}>
          <RotateCcw size={14} />
        </Button>
      )}
    </>
  )
}
