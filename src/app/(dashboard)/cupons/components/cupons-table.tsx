'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Ban } from 'lucide-react'
import { statusCupom, type StatusCupom } from '@/lib/cupom-revisao'
import { cancelarCupomAction, type CupomRow } from '../actions'

const STATUS_LABEL: Record<StatusCupom, string> = {
  ativo: 'Ativo', usado: 'Utilizado', cancelado: 'Cancelado', vencido: 'Vencido',
}

const STATUS_CLS: Record<StatusCupom, string> = {
  ativo:     'border-green-300 text-green-700 bg-green-50',
  usado:     'border-slate-300 text-slate-600 bg-slate-50',
  cancelado: 'border-red-300 text-red-700 bg-red-50',
  vencido:   'border-amber-300 text-amber-700 bg-amber-50',
}

function fmtData(d: string | null) {
  if (!d) return '—'
  const [ano, mes, dia] = String(d).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function fmtDataHora(d: Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function CuponsTable({ cupons, hoje, podeCancelar }: {
  cupons: CupomRow[]
  /** 'YYYY-MM-DD' do servidor: 'vencido' sai da data, e a data é a de Brasília. */
  hoje: string
  podeCancelar: boolean
}) {
  const [pending, start] = useTransition()

  function cancelar(id: string, codigo: string) {
    const motivo = prompt(`Cancelar o cupom ${codigo}? Descreva o motivo:`)
    if (motivo === null) return
    if (motivo.trim().length < 3) { toast.error('Informe o motivo do cancelamento'); return }
    start(async () => {
      try {
        await cancelarCupomAction(id, motivo)
        toast.success(`Cupom ${codigo} cancelado`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cancelar')
      }
    })
  }

  return (
    <div className="bg-white rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cliente / Chassi</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead>Válido até</TableHead>
            <TableHead>Uso</TableHead>
            <TableHead>Emitido</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {cupons.map(c => {
            const status = statusCupom({ status: c.status, validoAte: c.validoAte, osId: c.osId }, hoje)
            return (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-semibold">{c.codigo}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_CLS[status]}>{STATUS_LABEL[status]}</Badge>
                  {status === 'cancelado' && c.motivoCancelamento && (
                    <p className="text-xs text-slate-400 mt-0.5">{c.motivoCancelamento}</p>
                  )}
                </TableCell>
                <TableCell>
                  <p>{c.clienteNome ?? '—'}</p>
                  {c.chassi && <p className="text-xs font-mono text-slate-400">{c.chassi}</p>}
                  {c.observacao && <p className="text-xs text-slate-400">{c.observacao}</p>}
                </TableCell>
                <TableCell className="text-slate-500">{c.lojaNome}</TableCell>
                <TableCell className={status === 'vencido' ? 'text-amber-700' : ''}>{fmtData(c.validoAte)}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {status === 'usado'
                    ? <>OS #{c.osNumero ?? '—'} · {fmtDataHora(c.usadoEm)}</>
                    : <span className="text-slate-300">—</span>}
                </TableCell>
                <TableCell className="text-xs text-slate-400">
                  {fmtDataHora(c.emitidoEm)}
                  {c.emitidoPorNome ? ` · ${c.emitidoPorNome}` : ''}
                </TableCell>
                <TableCell className="text-right">
                  {/* Cupom já resgatado não cancela: apagaria o registro do desconto
                      que uma OS concedeu. A action recusa também. */}
                  {podeCancelar && status !== 'usado' && status !== 'cancelado' && (
                    <button
                      onClick={() => cancelar(c.id, c.codigo)}
                      disabled={pending}
                      title="Cancelar cupom"
                      className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                    >
                      <Ban size={15} />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {cupons.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                Nenhum cupom neste recorte.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
