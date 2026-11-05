// Eventos de teste de tela: disparam o que o navegador dispara, para o onChange/onClick do React rodar.
import { act } from 'react'

export async function clicar(el: Element | null | undefined) {
  await act(async () => { el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

// Troca o `value` pelo setter do protótipo: o React ignora a atribuição direta.
async function trocarValor(el: HTMLInputElement | HTMLSelectElement, prototipo: object, valor: string, evento: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new window.Event(evento, { bubbles: true }))
  })
}

export const digitar = (input: HTMLInputElement, valor: string) => trocarValor(input, window.HTMLInputElement.prototype, valor, 'input')
export const escolher = (select: HTMLSelectElement, valor: string) => trocarValor(select, window.HTMLSelectElement.prototype, valor, 'change')
