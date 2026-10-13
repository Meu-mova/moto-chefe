'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Seta de voltar ao lado do título, em toda tela. Volta no histórico (preserva filtros da
 * lista) quando já houve navegação dentro do app; se a pessoa abriu o link direto, sobe um
 * nível na URL até o início. Fica montado no layout, então conta as navegações da sessão.
 *
 * Flutua à esquerda: a linha do título (um bloco flex) fica ao lado dela, e o resto da
 * página continua com a largura toda por baixo.
 */
export function BotaoVoltar() {
  const pathname = usePathname()
  const router = useRouter()
  const navegacoes = useRef(0)
  const [temHistorico, setTemHistorico] = useState(false)
  useEffect(() => {
    navegacoes.current += 1
    setTemHistorico(navegacoes.current > 1)
  }, [pathname])

  // No início, só faz sentido se veio de outra tela do app.
  if (pathname === '/dashboard' && !temHistorico) return null

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
      aria-label="Voltar"
      title="Voltar"
      className="float-left mr-2 -ml-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-5" />
    </button>
  )
}
