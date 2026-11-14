// Tela do DIFAL por UF (#904-b): o que aparece e o que cada ação manda ao servidor.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

const salvas: unknown[] = []
const voltas: unknown[] = []
let respostaSalvar: { ok: true } | { ok: false; erro: string } = { ok: true }
let segurar: Promise<void> = Promise.resolve()
const salvar = async (d: unknown) => { salvas.push(d); await segurar; return respostaSalvar }
const voltar = async (d: unknown) => { voltas.push(d); return { ok: true } }
mock.module('../actions', { namedExports: { salvarCorrecaoUfAction: salvar, voltarAoPadraoUfAction: voltar } })
const toasts: string[] = []
mock.module('sonner', { namedExports: { toast: { error: (m: string) => toasts.push(m), success: () => {} } } })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  salvas.length = 0; voltas.length = 0; toasts.length = 0
  respostaSalvar = { ok: true }; segurar = Promise.resolve()
})

const RJ = { uf: 'RJ', aliquotaInterna: 20, fcp: 2, base: 'unica' as const }

async function montar(o: { importado?: string; onImportado?: (v: string) => void } = {}) {
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { DifalUfs } = await import('./difal-ufs')
  const el = document.createElement('div'); document.body.appendChild(el)
  const raiz = createRoot(el); raizes.push(raiz)
  await act(async () => raiz.render(createElement(DifalUfs, {
    grupoId: 'g1', ufEmitente: 'MG', correcoes: [RJ], importado: o.importado ?? '', onImportado: o.onImportado ?? (() => {}),
  })))
  return el
}

const texto = () => document.body.textContent ?? ''
const botao = (rotulo: string | RegExp) => {
  const b = [...document.querySelectorAll('button')].find(x => typeof rotulo === 'string' ? x.getAttribute('aria-label') === rotulo || x.textContent?.trim() === rotulo : rotulo.test(x.getAttribute('aria-label') ?? x.textContent ?? ''))
  assert.ok(b, `botão ${rotulo}`); return b as HTMLButtonElement
}
async function clicar(b: HTMLElement) { const { act } = await import('react'); await act(async () => { b.click() }) }
async function digitar(input: HTMLInputElement | HTMLSelectElement, v: string) {
  const { act } = await import('react')
  const proto = input instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, v)
    input.dispatchEvent(new dom.window.Event(input instanceof dom.window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const campo = (rotulo: string) => {
  const l = [...document.querySelectorAll('label')].find(x => x.textContent?.trim() === rotulo)
  assert.ok(l, `campo ${rotulo}`)
  return document.getElementById(l.getAttribute('for')!) as HTMLInputElement
}

test('T1: corrigida no cartão com o padrão, SP com o padrão do MOVA, BA sem padrão, MG como sua UF', async () => {
  await montar()
  const cartoes = document.querySelector('[data-corrigidas]')
  assert.match(cartoes?.textContent ?? '', /RJ.*Corrigido pelo seu contador/)
  assert.match(cartoes?.textContent ?? '', /Padrão do MOVA: sem valor padrão/)
  const sp = document.querySelector('[data-uf="SP"]')?.textContent ?? ''
  assert.match(sp, /18%/); assert.match(sp, /Única/)
  assert.match(sp, /Alíquota geral; a de moto elétrica não foi conferida\./)
  assert.match(document.querySelector('[data-uf="BA"]')?.textContent ?? '', /Sem valor padrão\. Preencha com o seu contador\./)
  assert.match(document.querySelector('[data-uf="MG"]')?.textContent ?? '', /sua UF/)
  assert.doesNotMatch(texto(), /—/)
})

test('T2: corrigir SP pelo diálogo manda grupo, UF, números com vírgula e base', async () => {
  await montar()
  await clicar(botao('Corrigir SP'))
  assert.match(texto(), /RICMS\/SP/)
  await digitar(campo('Alíquota interna (%)'), '18,5')
  // Sem FCP no padrão, o campo vem vazio: o número tem que vir do contador.
  assert.equal(campo('FCP (%)').value, '')
  await digitar(campo('FCP (%)'), '2')
  await digitar(campo('Base'), 'dupla')
  await clicar(botao('Salvar correção'))
  assert.deepEqual(salvas, [{ grupoId: 'g1', uf: 'SP', aliquotaInterna: 18.5, fcp: 2, base: 'dupla' }])
})

test('T3: voltar ao padrão em RJ manda grupo e UF', async () => {
  await montar()
  await clicar(botao('Voltar ao padrão RJ'))
  assert.deepEqual(voltas, [{ grupoId: 'g1', uf: 'RJ' }])
})

test('T4: valor inválido mostra o erro e não chama a action', async () => {
  await montar()
  await clicar(botao('Corrigir BA'))
  await digitar(campo('Alíquota interna (%)'), '120')
  await clicar(botao('Salvar correção'))
  assert.deepEqual(salvas, [])
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? '', /0 a 100/)
})

test('T5: enquanto salva, os botões do diálogo ficam desabilitados', async () => {
  await montar()
  let soltar!: () => void
  segurar = new Promise(r => { soltar = r })
  await clicar(botao('Corrigir SP'))
  await digitar(campo('FCP (%)'), '0')
  const salvarBtn = botao('Salvar correção')
  await clicar(salvarBtn)
  assert.ok(botao('Salvando...').disabled)
  assert.ok(botao('Cancelar').disabled)
  const { act: agir } = await import('react')
  await agir(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  assert.ok(document.querySelector('[role="dialog"]'), 'Escape não fecha enquanto salva')
  const { act } = await import('react'); await act(async () => { soltar() })
})

test('T6: no celular, o botão abre a folha com Fechar, busca e linhas compactas; a busca filtra', async () => {
  await montar()
  await clicar(botao(/Ver tabela do MOVA/))
  const folha = document.querySelector('[data-folha-ufs]')
  assert.ok(folha)
  assert.match(folha.textContent ?? '', /SP São Paulo · 18% · FCP sem valor · Única/)
  await digitar(folha.querySelector('input[type="search"]') as HTMLInputElement, 'paulo')
  assert.equal(folha.querySelectorAll('[data-linha-uf]').length, 1)
  await clicar(botao('Fechar'))
  assert.equal(document.querySelector('[data-folha-ufs]'), null)
  // Reabrir começa sem a busca anterior.
  await clicar(botao(/Ver tabela do MOVA/))
  assert.equal((document.querySelector('[data-folha-ufs] input[type="search"]') as HTMLInputElement).value, '')
})

test('T6b: o lápis dentro da folha fecha a folha e abre só o diálogo de corrigir', async () => {
  await montar()
  await clicar(botao(/Ver tabela do MOVA/))
  const folha = document.querySelector('[data-folha-ufs]')!
  await clicar(folha.querySelector('[aria-label="Corrigir SP"]') as HTMLElement)
  assert.equal(document.querySelector('[data-folha-ufs]'), null)
  assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /Corrigir SP/)
})

test('T9: FCP vazio não grava', async () => {
  await montar()
  await clicar(botao('Corrigir SP'))
  await clicar(botao('Salvar correção'))
  assert.deepEqual(salvas, [])
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? '', /FCP/)
})

test('T7: o campo do importado repassa o que foi digitado', async () => {
  const visto: string[] = []
  await montar({ onImportado: v => visto.push(v) })
  await digitar(campo('Alíquota ICMS para moto importada (%)'), '4,00')
  assert.deepEqual(visto, ['4,00'])
  assert.match(texto(), /Ainda vazio/)
})

test('T8: erro da action aparece na tela', async () => {
  respostaSalvar = { ok: false, erro: 'Grupo não encontrado' }
  await montar()
  await clicar(botao('Corrigir SP'))
  await digitar(campo('Alíquota interna (%)'), '18')
  await digitar(campo('FCP (%)'), '0')
  await clicar(botao('Salvar correção'))
  assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? '', /Grupo não encontrado/)
})
