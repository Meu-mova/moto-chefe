'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { atualizarStatusOSAction } from '../actions'
import type { OSComDetalhes } from '@/lib/queries/ordens-servico'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberta: 'outline',
  em_andamento: 'default',
  concluida: 'secondary',
}

const nextStatus: Record<string, string> = {
  aberta: 'em_andamento',
  em_andamento: 'concluida',
}

const nextLabel: Record<string, string> = {
  aberta: 'Iniciar',
  em_andamento: 'Concluir',
}

type Props = {
  os: OSComDetalhes
  papel: string
  lojaIdUsuario: string | null
}

export function OSCard({ os, papel, lojaIdUsuario }: Props) {
  const [loading, setLoading] = useState(false)

  const podeAtualizar =
    os.status !== 'concluida' &&
    ['admin_geral', 'aux_adm', 'mecanico'].includes(papel) &&
    (papel === 'admin_geral' || lojaIdUsuario === os.lojaId)

  async function handleAvancar() {
    const novo = nextStatus[os.status]
    if (!novo) return
    setLoading(true)
    try {
      await atualizarStatusOSAction(os.id, novo)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar OS')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{os.marca} {os.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{os.chassi}</p>
          </div>
          <Badge variant={statusBadge[os.status] ?? 'secondary'}>
            {os.status === 'aberta' ? 'Aberta' : os.status === 'em_andamento' ? 'Em Andamento' : 'Concluída'}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{os.descricao}</p>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{os.lojaNome}</span></p>
          <p>Aberta por: <span className="text-slate-700">{os.abertaPorNome}</span> em {os.dataAbertura ? format(new Date(os.dataAbertura), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</p>
          {os.dataConclusao && (
            <p>Concluída em: {format(new Date(os.dataConclusao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
          )}
        </div>
        {podeAtualizar && nextStatus[os.status] && (
          <Button size="sm" onClick={handleAvancar} disabled={loading}>
            {loading ? 'Salvando...' : nextLabel[os.status]}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
