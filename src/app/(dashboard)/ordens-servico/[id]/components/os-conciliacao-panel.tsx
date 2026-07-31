'use client'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TIPOS_CARTAO, type PgtoOS } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'

type Props = { osId: string; osNumero: number | null; pagamentos: PgtoOS[]; papel: string }

export function OSConciliacaoPanel({ osId, osNumero, pagamentos, papel }: Props) {
  const temCartao = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix    = pagamentos.some(p => p.tipo === 'pix')

  const dados = useConciliacaoAlvo({ tipo: 'os', id: osId }, temCartao || temPix)

  if (!temCartao && !temPix) return null // dinheiro/transferência/cortesia/gratuita — não precisa conciliar

  const pixPendente = pagamentos.some(
    p => p.tipo === 'pix' && !p.conciliadoManual && dados.pixRecs.length === 0,
  )

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Conciliação</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <PagamentosConciliacao
          alvo={{ tipo: 'os', id: osId }}
          pagamentos={pagamentos}
          dados={dados}
          papel={papel}
          somenteConciliaveis
        />

        {!dados.loading && pixPendente && (
          <p className="text-xs text-slate-500">
            PIX conciliado à parte — vá em <Link href="/pix-mcp" className="text-blue-600 hover:underline">PIX</Link>,
            busque a OS #{osNumero ?? '—'} e lance a correspondência.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
