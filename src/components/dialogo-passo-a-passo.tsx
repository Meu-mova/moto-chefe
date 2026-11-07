'use client'

import { DialogoTelaCheia } from '@/components/dialogo-tela-cheia'
import { MarcadorDePassos } from '@/components/marcador-de-passos'

type Props = {
  aberto: boolean
  onFechar: () => void
  titulo: string
  descricao?: React.ReactNode
  passos: string[]
  /** Índice do passo atual; null esconde o marcador (ex.: tela de concluído). */
  atual: number | null
  /** Enquanto envia, nada fecha o diálogo: voltar, X e Escape ficam sem efeito. */
  enviando: boolean
  /** Botões de baixo; quem chama troca a cada passo. */
  rodape: React.ReactNode
  children: React.ReactNode
}

/** Diálogo em passos do Arquivar moto (#688), feito para o Remover moto (#692) reusar com outro conteúdo. */
export function DialogoPassoAPasso({ aberto, onFechar, titulo, descricao, passos, atual, enviando, rodape, children }: Props) {
  return (
    <DialogoTelaCheia aberto={aberto} onFechar={() => { if (!enviando) onFechar() }} titulo={titulo} descricao={descricao} travado={enviando} className="sm:max-w-lg">
      {atual !== null && <div className="px-4 pt-3"><MarcadorDePassos nomes={passos} atual={atual} /></div>}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
      <div className="space-y-1 border-t border-border p-3">
        {rodape}
        {enviando && <p className="text-center text-xs text-muted-foreground">Enviando. Não feche esta tela.</p>}
      </div>
    </DialogoTelaCheia>
  )
}
