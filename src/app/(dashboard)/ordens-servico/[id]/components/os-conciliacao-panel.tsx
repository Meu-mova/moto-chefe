'use client'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TIPOS_CARTAO, matchPagamentos, type PgtoOS } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'

type Props = { osId: string; osNumero: number | null; pagamentos: PgtoOS[]; papel: string }

export function OSConciliacaoPanel({ osId, osNumero, pagamentos, papel }: Props) {
  const temCartao = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix    = pagamentos.some(p => p.tipo === 'pix')

  const dados = useConciliacaoAlvo({ tipo: 'os', id: osId }, temCartao || temPix)

  if (!temCartao && !temPix) return null // dinheiro/transferência/cortesia/gratuita — não precisa conciliar

  // Mesma conta do painel, para a dica não sumir quando o PIX entrou só em parte.
  const cobertura   = matchPagamentos(pagamentos, dados.concs, dados.pixRecs)
  const pixPendente = pagamentos.some((p, i) => p.tipo === 'pix' && !cobertura[i].conciliado)

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
          <p className="text-xs text-muted-foreground">
            PIX conciliado à parte — vá em <Link href="/pix-mcp" className="text-primary-text hover:underline">PIX</Link>,
            busque a OS #{osNumero ?? '—'} e lance a correspondência.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
