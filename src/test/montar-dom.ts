import { JSDOM } from 'jsdom'

// União do que as telas testadas leem direto do global; sobra não atrapalha, falta quebra o React.
const GLOBAIS_DA_JANELA = [
  'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLAnchorElement',
  'Element', 'Node', 'NodeList', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
] as const

const g = globalThis as Record<string, unknown>

type Instalado = { nome: string; antes: PropertyDescriptor | undefined }

function instalar(nome: string, valor: unknown): Instalado {
  const antes = Object.getOwnPropertyDescriptor(globalThis, nome)
  Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true })
  return { nome, antes }
}

function restaurar({ nome, antes }: Instalado) {
  if (antes) Object.defineProperty(globalThis, nome, antes)
  else delete g[nome]
}

/**
 * Monta o JSDOM de um teste de tela e instala os globais que o React espera.
 * Chame uma vez no topo do arquivo, antes de importar o componente. `desmontar` devolve os globais
 * ao que eram e fecha a janela; use em `after(desmontar)`.
 */
export function montarDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'http://localhost', pretendToBeVisual: true })
  const janela = dom.window as unknown as Record<string, unknown>
  const instalados = [
    instalar('window', dom.window),
    instalar('document', dom.window.document),
    instalar('navigator', dom.window.navigator),
    ...GLOBAIS_DA_JANELA.map(nome => instalar(nome, janela[nome])),
    instalar('IS_REACT_ACT_ENVIRONMENT', true),
  ]
  const desmontar = () => {
    [...instalados].reverse().forEach(restaurar)
    dom.window.close()
  }
  return { dom, desmontar }
}
