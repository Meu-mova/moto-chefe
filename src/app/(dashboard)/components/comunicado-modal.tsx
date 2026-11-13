'use client'
import { useState } from 'react'
import { marcarComoLidoAction } from '@/app/(dashboard)/admin/comunicados/actions'
import { JanelaDeAviso } from './janela-de-aviso'

export type Comunicado = { id: string; titulo: string; conteudo: string }

export function ComunicadoModal({ comunicados }: { comunicados: Comunicado[] }) {
  const [indice, setIndice] = useState(0)
  const [aberto, setAberto] = useState(comunicados.length > 0)
  const [loading, setLoading] = useState(false)

  if (!aberto || comunicados.length === 0) return null

  const atual = comunicados[indice]

  async function handleLido() {
    setLoading(true)
    await marcarComoLidoAction(atual.id)
    if (indice + 1 < comunicados.length) {
      setIndice(i => i + 1)
    } else {
      setAberto(false)
    }
    setLoading(false)
  }

  return (
    <JanelaDeAviso
      titulo={atual.titulo}
      subtitulo={comunicados.length > 1 ? `${indice + 1} de ${comunicados.length}` : undefined}
      textoDoBotao={loading ? 'Registrando...' : 'LIDO'}
      ocupado={loading}
      aoConfirmar={handleLido}
    >
      <div className="whitespace-pre-wrap">{atual.conteudo}</div>
    </JanelaDeAviso>
  )
}
