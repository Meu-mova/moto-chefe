'use client'

import { useEffect, useState } from 'react'
import { maquininhasDoRegistroAction, type RegistroComLoja } from '@/app/(dashboard)/maquininhas-actions'
import type { Maquininha } from '@/lib/maquininhas'

/**
 * Maquininhas do grupo da loja do registro (#460). `null` enquanto carrega; sem registro, vazia.
 */
export function useMaquininhas(registro: RegistroComLoja | null): Maquininha[] | null {
  const chave = registro ? JSON.stringify(registro) : ''
  const [lista, setLista] = useState<{ chave: string; maquininhas: Maquininha[] } | null>(null)
  useEffect(() => {
    if (!chave) return
    let vivo = true
    maquininhasDoRegistroAction(JSON.parse(chave)).then(m => { if (vivo) setLista({ chave, maquininhas: m }) })
    return () => { vivo = false }
  }, [chave])
  if (!chave) return []
  return lista && lista.chave === chave ? lista.maquininhas : null
}
