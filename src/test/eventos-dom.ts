// Eventos de teste de tela: disparam o que o navegador dispara, para o onChange/onClick do React rodar.
import { act } from 'react'

export async function clicar(el: Element | null | undefined) {
  await act(async () => { el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

// Troca o `value` pelo setter do protótipo: o React ignora a atribuição direta.
async function trocarValor(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, prototipo: object, valor: string, evento: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new window.Event(evento, { bubbles: true }))
  })
}

export const digitar = (input: HTMLInputElement, valor: string) => trocarValor(input, window.HTMLInputElement.prototype, valor, 'input')
export const escolher = (select: HTMLSelectElement, valor: string) => trocarValor(select, window.HTMLSelectElement.prototype, valor, 'change')
export const digitarTexto = (caixa: HTMLTextAreaElement, valor: string) => trocarValor(caixa, window.HTMLTextAreaElement.prototype, valor, 'input')

/**
 * Escolhe uma opção do `<Select>` do @base-ui: abre pelo gatilho e escolhe pelo ciclo do ponteiro,
 * que é onde ele seleciona (só o `click` não basta).
 */
export async function escolherOpcao(gatilho: Element | null | undefined, rotulo: string) {
  await clicar(gatilho)
  const opcao = [...document.querySelectorAll('[role="option"]')].find(o => o.textContent?.trim() === rotulo)
  if (!opcao) throw new Error(`opção "${rotulo}" não encontrada`)
  await act(async () => {
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) opcao.dispatchEvent(new window.MouseEvent(tipo, { bubbles: true }))
  })
}
