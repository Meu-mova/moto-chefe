'use client'
import { useEffect } from 'react'

// Páginas de impressão em (print)/ abrem já com o diálogo de imprimir do navegador.
export function PrintTrigger() {
  useEffect(() => { window.print() }, [])
  return null
}
