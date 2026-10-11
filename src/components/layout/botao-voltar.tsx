'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ITENS } from '@/lib/navegacao'

const RAIZES = new Set(ITENS.map(i => i.href))

/**
 * "Voltar" nas telas que não são item do menu (detalhe, formulário, hub). Volta no histórico
 * (preserva filtros da lista) quando já houve navegação dentro do app; se a pessoa abriu o link
 * direto, sobe um nível na URL. Fica montado no layout, então conta as navegações da sessão.
 */
export function BotaoVoltar() {
  const pathname = usePathname()
  const router = useRouter()
  const navegacoes = useRef(0)
  useEffect(() => { navegacoes.current += 1 }, [pathname])
  if (RAIZES.has(pathname)) return null

  function voltar() {
    if (navegacoes.current > 1) return router.back()
    const pai = pathname.split('/').slice(0, -1).join('/')
    // "/areas" não é tela; o hub sobe para o início.
    router.push(pai && pai !== '/areas' ? pai : '/dashboard')
  }

  return (
    <button
      type="button"
      onClick={voltar}
      className="mb-3 -ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Voltar
    </button>
  )
}
