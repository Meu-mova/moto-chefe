'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Printer } from 'lucide-react'

/**
 * Mês e aba vivem na URL, não em estado: assim o botão Imprimir carrega o mesmo
 * recorte que está na tela, e o link do DRE de um mês específico pode ser colado
 * num e-mail.
 */
export function DreFiltros({ mes, aba }: { mes: string; aba: 'lojas' | 'evolucao' }) {
  const router = useRouter()
  const params = useSearchParams()

  function ir(chave: string, valor: string) {
    const p = new URLSearchParams(params.toString())
    p.set(chave, valor)
    router.push(`/admin/dre?${p.toString()}`)
  }

  const abaCls = (v: string) =>
    `rounded-full px-3 py-1 text-sm transition-colors ${
      aba === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted'
    }`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="month"
        value={mes}
        onChange={e => ir('mes', e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
      />
      <div className="flex gap-1">
        <button onClick={() => ir('aba', 'lojas')} className={abaCls('lojas')}>Por loja</button>
        <button onClick={() => ir('aba', 'evolucao')} className={abaCls('evolucao')}>Evolução</button>
      </div>
      <Link
        href={`/dre/imprimir?mes=${mes}&aba=${aba}`}
        target="_blank"
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm text-muted-foreground hover:bg-muted"
      >
        <Printer size={14} /> Imprimir
      </Link>
    </div>
  )
}
