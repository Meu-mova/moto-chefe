'use client'

import { useRef, useState } from 'react'
import type { ResultadoAction } from '@/lib/resultado-action'
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

/**
 * Envio do último passo: uma chamada só, mesmo com duplo clique (o state só muda no próximo render,
 * então o segundo clique ainda veria enviando = false). Recusa do servidor vira `erro`; sem resposta,
 * a frase pede para conferir antes de tentar de novo.
 */
export function useEnvioDoLote<T>(semResposta: string) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<T | null>(null)
  const enviou = useRef(false)

  async function enviar(chamada: () => Promise<ResultadoAction<T>>) {
    if (enviou.current) return
    enviou.current = true
    setEnviando(true)
    setErro(null)
    try {
      const r = await chamada()
      if (r.ok) setFeito(r.dados)
      else setErro(r.erro)
    } catch {
      setErro(semResposta)
    } finally {
      enviou.current = false
      setEnviando(false)
    }
  }

  return { enviando, erro, setErro, feito, enviar }
}
