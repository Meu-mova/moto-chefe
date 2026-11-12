'use client'
import { useRef, useState } from 'react'
import { buscarEnderecoPorCep, type EnderecoCep } from '@/lib/mascaras'

export type SituacaoDaBuscaCep = 'buscando' | 'nao_achou' | null

/** Busca o endereço quando o CEP fica completo; a resposta de um CEP já trocado é descartada. */
export function useBuscaCep(aoAchar: (endereco: EnderecoCep) => void, aoNaoAchar?: () => void) {
  const [busca, setBusca] = useState<SituacaoDaBuscaCep>(null)
  const ultimoCep = useRef('')

  async function buscar(cep: string) {
    ultimoCep.current = cep
    if (cep.replace(/\D/g, '').length !== 8) { setBusca(null); return }
    setBusca('buscando')
    const endereco = await buscarEnderecoPorCep(cep)
    if (ultimoCep.current !== cep) return
    setBusca(endereco ? null : 'nao_achou')
    if (endereco) aoAchar(endereco)
    else aoNaoAchar?.()
  }

  return { busca, buscar }
}
