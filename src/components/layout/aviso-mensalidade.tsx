import Link from 'next/link'
import { formatarNumeroBR } from '@/lib/numero-br'
import type { SituacaoMensalidade } from '@/lib/mensalidade/bloqueio'

const dataBR = (d: string) => d.split('-').reverse().join('/')

/**
 * Faixa no topo para quem paga a mensalidade: a do grupo ativo e, embaixo, os outros
 * grupos da empresa com mensalidade em aberto (variante B escolhida em 19/10/2026).
 */
export function AvisoMensalidade({ situacao, grupoAtivo, hoje }: { situacao: SituacaoMensalidade; grupoAtivo: string; hoje: string }) {
  const { aberta, outros } = situacao
  if (!aberta && outros.length === 0) return null
  return (
    <>
      {aberta && (
        <div className={`border-b px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2 ${aberta.vencimento < hoje ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
          <span>
            Mensalidade do MOVA de {grupoAtivo}:{' '}
            <span className="whitespace-nowrap font-medium">R$ {formatarNumeroBR(aberta.total)}</span>
            {aberta.vencimento < hoje ? `, venceu em ${dataBR(aberta.vencimento)}` : `, vence em ${dataBR(aberta.vencimento)}`}.
          </span>
          <Link href="/mensalidade" className="font-medium underline">Pagar</Link>
        </div>
      )}
      {outros.length > 0 && (
        <div className="border-b px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 bg-warning/10 text-warning">
          <span>
            Outros grupos da sua empresa com mensalidade em aberto:{' '}
            {outros.map(o => `${o.nome}${o.bloqueado ? ' (bloqueado)' : ''}`).join(', ')}
          </span>
          <Link href="/mensalidade" className="font-medium underline">Ver</Link>
        </div>
      )}
    </>
  )
}
