import { useSyncExternalStore } from 'react'

const CONSULTA = '(min-width: 1024px)' // lg: mesmo ponto em que Vendas troca cartões por tabela + painel

/** Desktop = painel lateral; abaixo disso o detalhe abre em diálogo. No servidor vale false. */
export function useIsDesktop() {
  return useSyncExternalStore(
    aviso => {
      const mql = window.matchMedia(CONSULTA)
      mql.addEventListener('change', aviso)
      return () => mql.removeEventListener('change', aviso)
    },
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}
