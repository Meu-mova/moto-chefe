'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'

type Loja = { id: string; nome: string }
type Modelo = { id: string; nome: string }

type Props = {
  lojas: Loja[]
  modelos: Modelo[]
  // Vendedor/mecânico só enxerga a própria loja — pra eles o filtro de loja não faz sentido.
  mostrarLoja: boolean
}

function parse(param: string | null): string[] {
  if (!param) return []
  return param.split(',').filter(Boolean)
}

export function DemandasFiltros({ lojas, modelos, mostrarLoja }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const lojasSel = parse(sp.get('loja'))
  const modelosSel = parse(sp.get('modelo'))

  function atualizar(chave: string, valores: string[]) {
    const params = new URLSearchParams(sp.toString())
    if (valores.length > 0) params.set(chave, valores.join(','))
    else params.delete(chave)
    router.push(`${pathname}?${params.toString()}`)
  }

  const temFiltro = lojasSel.length > 0 || modelosSel.length > 0

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <MultiSelectFiltro
        placeholder="Modelo"
        opcoes={modelos.map(m => ({ value: m.id, label: m.nome }))}
        selecionados={modelosSel}
        onChange={v => atualizar('modelo', v)}
        comBusca
      />

      {mostrarLoja && (
        <MultiSelectFiltro
          placeholder="Loja"
          opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
          selecionados={lojasSel}
          onChange={v => atualizar('loja', v)}
        />
      )}

      {temFiltro && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
