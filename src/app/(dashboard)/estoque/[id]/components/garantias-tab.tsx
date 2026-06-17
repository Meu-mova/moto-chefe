import { listarGarantiasPorMoto } from '@/lib/queries/garantias'
import { Badge } from '@/components/ui/badge'
import { EncerrarGarantiaButton } from './encerrar-garantia-button'

type Props = {
  motoId: string
  papel: string
  lojaIdUsuario: string | null
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export async function GarantiasTab({ motoId, papel, lojaIdUsuario }: Props) {
  const lista = await listarGarantiasPorMoto(motoId)

  const podeEncerrar = (lojaIdGarantia: string) =>
    ['admin_geral', 'admin_socio'].includes(papel) ||
    (papel === 'aux_adm' && lojaIdUsuario === lojaIdGarantia)

  return (
    <div className="space-y-3">
      {lista.map(g => (
        <div key={g.id} className="p-3 border rounded-lg space-y-2">
          <div className="flex justify-between items-start">
            <p className="text-sm font-medium">{g.descricao}</p>
            <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
              {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
            </Badge>
          </div>
          <div className="text-xs text-slate-400 space-y-0.5">
            <p>Abertura: {formatDate(g.dataInicio)} · Prazo: {formatDate(g.dataFim)}</p>
            {g.dataEncerramento && (
              <p>Encerrada em: <span className="text-slate-600 font-medium">{formatDate(g.dataEncerramento)}</span></p>
            )}
            {g.numeroPedidoFabrica && (
              <p>Pedido fábrica: {g.numeroPedidoFabrica}</p>
            )}
          </div>
          {g.status === 'ativa' && podeEncerrar(g.lojaId) && (
            <EncerrarGarantiaButton
              garantiaId={g.id}
              descricao={g.descricao}
              dataInicio={formatDate(g.dataInicio)}
              papel={papel}
              lojaIdUsuario={lojaIdUsuario}
              lojaIdGarantia={g.lojaId}
            />
          )}
        </div>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma garantia para esta moto.</p>
      )}
    </div>
  )
}
