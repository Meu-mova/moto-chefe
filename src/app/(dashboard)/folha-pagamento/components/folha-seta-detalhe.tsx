import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Seta que abre o detalhe de uma linha da folha (celular e tablet). `aria-controls` só aponta para o
// detalhe quando ele existe no DOM: sempre, se `detalheSempreNoDom` (só escondido); senão, aberto. Alvo de toque de 44 px; a partir de 960 px de conteúdo as telas
// escondem a seta (a linha já mostra tudo), e o tamanho menor vale onde ela ainda aparece.
export function SetaDetalhe({ nome, aberta, alternar, idDetalhe, detalheSempreNoDom = false }: {
  nome: string; aberta: boolean; alternar: () => void; idDetalhe: string; detalheSempreNoDom?: boolean
}) {
  return (
    <Button variant="ghost" size="icon" className="size-11 text-muted-foreground @[960px]/folha:size-8" aria-expanded={aberta}
      aria-controls={aberta || detalheSempreNoDom ? idDetalhe : undefined} aria-label={`Ver detalhes de ${nome}`} onClick={alternar}>
      <ChevronDown aria-hidden className={aberta ? 'rotate-180' : ''} />
    </Button>
  )
}
