import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = { pendente?: boolean } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })

const CLASSE = 'inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground disabled:opacity-60'

/** Pílula "Atualizar" do celular (só o ícone gira enquanto sincroniza), para ficar acima do fio do `ResumoFaixa` (prop `acaoMobile`). */
export function BotaoAtualizar({ pendente, onClick, href }: Props) {
  const conteudo = (
    <>
      <RefreshCw className={cn('size-3', pendente && 'animate-spin')} /> Atualizar
    </>
  )
  if (href) return <Link href={href} className={CLASSE}>{conteudo}</Link>
  return <button type="button" onClick={onClick} disabled={pendente} className={CLASSE}>{conteudo}</button>
}
