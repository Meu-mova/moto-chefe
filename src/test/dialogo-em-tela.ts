// Ferramentas dos testes de tela dos diálogos em passos (Arquivar #688, Remover moto #692).
// React e react-dom entram por import dinâmico: os globais do JSDOM (montarDom) têm de existir antes.
import assert from 'node:assert/strict'
import type { ComponentType } from 'react'

export const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
/** O diálogo do base-ui só fecha depois da animação de saída. */
export const DEPOIS_DA_ANIMACAO_MS = 300

export const dialogoAberto = () => document.querySelector('[data-slot="dialog-content"]') !== null
export const textoDaTela = () => document.body.textContent ?? ''
export const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
export const caixa = (rotulo: string) => document.querySelector(`input[type="checkbox"][aria-label="${rotulo}"]`) as HTMLInputElement | null

export function clicar(el: Element | null | undefined) {
  assert.ok(el, 'elemento não encontrado')
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}

export const apertarEscape = () =>
  document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

/** Monta o diálogo aberto e devolve como mexer nele; `desmontar` é seguro de chamar mais de uma vez. */
export async function montarDialogo<P extends object>(Componente: ComponentType<P>, props: P) {
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(Componente, props)) })

  // Troca o `value` pelo setter do protótipo: o React ignora a atribuição direta.
  const preencher = (id: string, valor: string) => act(async () => {
    const campo = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
    assert.ok(campo, `campo ${id} não encontrado`)
    const proto = campo instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  const clique = (texto: string, ms = 50) => act(async () => { clicar(botao(texto)); await esperar(ms) })
  const marcar = (rotulo: string) => act(async () => { clicar(caixa(rotulo)) })
  /** Desenha de novo com outras props, como quando o servidor manda o layout recarregado. */
  const redesenhar = (novas: P) => act(async () => { root.render(createElement(Componente, novas)) })
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  return { act, preencher, clique, marcar, redesenhar, desmontar }
}
