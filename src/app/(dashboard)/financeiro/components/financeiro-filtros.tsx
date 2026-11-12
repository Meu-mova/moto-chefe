'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { hrefComFiltro } from '@/lib/folha-tela'

type Loja = { id: string; nome: string }

export function FinanceiroFiltros({ lojas, de, ate, lojaAtual }: {
  lojas: Loja[]
  /** Período já normalizado pelo servidor (padrão: mês corrente inteiro). */
  de: string
  ate: string
  lojaAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(chave: 'de' | 'ate' | 'loja', valor: string) {
    // Grava sempre os dois lados do período: a URL mostra o que a tela está
    // somando, e o `mes` dos links antigos sai para não competir com eles.
    const p = new URLSearchParams(searchParams.toString())
    p.delete('mes')
    p.set('de', de)
    p.set('ate', ate)
    router.push(hrefComFiltro(pathname, p.toString(), chave, valor))
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        De
        <Input
          type="date"
          value={de}
          max={ate}
          onChange={e => update('de', e.target.value)}
          className="w-40"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Até
        <Input
          type="date"
          value={ate}
          min={de}
          onChange={e => update('ate', e.target.value)}
          className="w-40"
        />
      </label>
      <select
        value={lojaAtual}
        onChange={e => update('loja', e.target.value)}
        aria-label="Loja"
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none w-48"
      >
        <option value="">Todas as lojas</option>
        {/* O balde da empresa: despesas sem loja atribuída. Não é uma loja, mas é
            um recorte de dinheiro — e este seletor é onde se escolhe o recorte. */}
        <option value="geral">Geral (Empresa)</option>
        {lojas.map(l => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>
    </div>
  )
}
