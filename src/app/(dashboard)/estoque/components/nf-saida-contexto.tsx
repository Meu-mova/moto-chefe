'use client'
import { createContext, useContext, useState } from 'react'
import { NfSaidaButton, NfSaidaGatilho } from './nf-saida-button'

/**
 * Qual moto abriu a NF de saída no Showroom. O diálogo fica aqui, fora das linhas:
 * na produção a nota autorizada fatura a venda, o revalidatePath tira a moto vendida
 * da lista, e o diálogo precisa continuar para mostrar a nota.
 *
 * Pequeno de propósito: a tabela continua Server Component e só os botões e este
 * estado vão ao navegador (as demandas com dados de cliente não passam por aqui).
 */
type MotoDaNf = { motoId: string; descricao: string; blingNfeId: string | null }

const AbrirNf = createContext<((m: MotoDaNf) => void) | null>(null)

export function NfSaidaProvider({ children }: { children: React.ReactNode }) {
  const [nf, setNf] = useState<MotoDaNf | null>(null)
  return (
    <AbrirNf.Provider value={setNf}>
      {children}
      {nf && (
        <NfSaidaButton
          key={nf.motoId}
          motoId={nf.motoId}
          descricao={nf.descricao}
          blingNfeId={nf.blingNfeId}
          gatilho={() => null}
          abrirAoMontar
          onFechado={() => setNf(null)}
        />
      )}
    </AbrirNf.Provider>
  )
}

/** O botão da linha: só avisa o provider qual moto abriu. */
export function NfSaidaGatilhoLinha(m: MotoDaNf) {
  const abrir = useContext(AbrirNf)
  if (!abrir) throw new Error('NfSaidaGatilhoLinha precisa do NfSaidaProvider')
  return <NfSaidaGatilho blingNfeId={m.blingNfeId} onClick={() => abrir(m)} />
}
