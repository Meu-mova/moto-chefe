'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { voltarMotoVendidaSemVendaAoEstoqueAction } from '../actions'
import type { MotoVendidaSemVenda } from '@/lib/motos-vendidas-sem-venda'

function Linha({ moto }: { moto: MotoVendidaSemVenda }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function voltar(depois: 'ficar' | 'vender') {
    setOcupado(true)
    const r = await voltarMotoVendidaSemVendaAoEstoqueAction(moto.id)
    if (!r.ok) { toast.error(r.erro); setOcupado(false); return }
    if (depois === 'vender') { router.push(`/estoque/${moto.id}?vender=1`); return }
    toast.success('Moto de volta ao estoque')
    setOcupado(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="min-w-0">
        <Link href={`/estoque/${moto.id}`} className="font-medium text-foreground hover:underline">
          {moto.modelo} · {moto.cor}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">{moto.chassi} · {moto.lojaNome}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => voltar('ficar')}>Voltar ao estoque</Button>
        <Button size="sm" disabled={ocupado} onClick={() => voltar('vender')}>Registrar venda</Button>
      </div>
    </div>
  )
}

/** Motos marcadas como vendida no Editar moto sem venda registrada (#544). */
export function VendidasSemVendaPanel({ motos }: { motos: MotoVendidaSemVenda[] }) {
  if (motos.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
          <AlertTriangle size={15} className="text-warning" />
          Marcadas como vendida sem venda registrada ({motos.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Foram marcadas como vendidas no Editar moto, mas nenhuma venda foi registrada. Por isso não aparecem no Showroom nem nas Vendas.
        </p>
      </div>
      <div className="space-y-2">
        {motos.map(m => <Linha key={m.id} moto={m} />)}
      </div>
    </section>
  )
}
