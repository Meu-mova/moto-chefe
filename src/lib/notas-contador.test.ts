import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, unzipSync } from 'fflate'
import { emailAoContador, enviarAoContador, tamanhoEstimado } from './notas-contador'

test('emailAoContador: assunto com grupo e período; texto com as contagens', () => {
  const e = emailAoContador({ grupo: 'Grupo Sul', de: '2026-10-01', ate: '2026-10-31', autorizadas: 3, canceladas: 1, faltaram: 0 })
  assert.equal(e.assunto, 'Notas fiscais Grupo Sul 01/10/2026 a 31/10/2026')
  assert.match(e.texto, /3 autorizadas e 1 cancelada/)
  assert.match(e.texto, /anexo/)
  assert.doesNotMatch(e.texto, /faltaram/i)
})

test('emailAoContador: com link, o texto leva o link e a validade; avisa arquivo que faltou', () => {
  const e = emailAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-01', autorizadas: 1, canceladas: 0, faltaram: 2, link: 'https://x/z.zip' })
  assert.equal(e.assunto, 'Notas fiscais G 01/10/2026')
  assert.match(e.texto, /https:\/\/x\/z\.zip/)
  assert.match(e.texto, /7 dias/)
  assert.match(e.texto, /2 arquivos/)
})

const nota = (id: string, categoria: 'autorizada' | 'cancelada') =>
  ({ id, numero: id, serie: '1', categoria, linkXml: `https://x/${id}.xml`, linkDanfe: `https://x/${id}.pdf` })

function dependencias(o: { quebrado?: string } = {}) {
  const enviados: { assunto: string; texto: string; anexo?: { nome: string; conteudo: Uint8Array } }[] = []
  const publicados: Uint8Array[] = []
  return {
    enviados, publicados,
    baixar: async (url: string) => (o.quebrado && url.includes(o.quebrado) ? null : strToU8('x'.repeat(10))),
    enviar: async (e: (typeof enviados)[number]) => { enviados.push(e); return true },
    publicar: async (zip: Uint8Array) => { publicados.push(zip); return 'https://link/assinado' },
  }
}

test('enviarAoContador: zip pequeno vai anexo, com XML e PDF de cada nota', async () => {
  const d = dependencias()
  const r = await enviarAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-31', notas: [nota('1', 'autorizada'), nota('2', 'cancelada')] }, d)
  assert.deepEqual(r, { ok: true, modo: 'anexo', notas: 2, faltaram: 0 })
  assert.equal(d.publicados.length, 0)
  const [e] = d.enviados
  assert.match(e.texto, /1 autorizada e 1 cancelada/)
  assert.deepEqual(Object.keys(unzipSync(e.anexo!.conteudo)).sort(), ['NF-1-serie-1.pdf', 'NF-1-serie-1.xml', 'NF-2-serie-1.pdf', 'NF-2-serie-1.xml'])
})

test('enviarAoContador: zip acima do limite vira link, sem anexo', async () => {
  const d = dependencias()
  const r = await enviarAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-31', notas: [nota('1', 'autorizada')], limiteAnexo: 10 }, d)
  assert.equal(r.ok && r.modo, 'link')
  assert.equal(d.publicados.length, 1)
  assert.equal(d.enviados[0].anexo, undefined)
  assert.match(d.enviados[0].texto, /https:\/\/link\/assinado/)
})

test('enviarAoContador: conta o arquivo que faltou e avisa no texto', async () => {
  const d = dependencias({ quebrado: '2.pdf' })
  const r = await enviarAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-01', notas: [nota('1', 'autorizada'), nota('2', 'autorizada')] }, d)
  assert.equal(r.ok && r.faltaram, 1)
  assert.match(d.enviados[0].texto, /1 arquivo não estava disponível/)
})

test('enviarAoContador: sem nota não envia nada', async () => {
  const d = dependencias()
  assert.deepEqual(await enviarAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-01', notas: [] }, d), { ok: false, erro: 'sem_notas' })
  assert.equal(d.enviados.length, 0)
})

test('enviarAoContador: falha do e-mail volta como erro', async () => {
  const d = { ...dependencias(), enviar: async () => false }
  assert.deepEqual(await enviarAoContador({ grupo: 'G', de: '2026-10-01', ate: '2026-10-01', notas: [nota('1', 'autorizada')] }, d), { ok: false, erro: 'email' })
})

test('tamanhoEstimado: menos de 1 MB, MB arredondado, e se passa do anexo', () => {
  assert.deepEqual(tamanhoEstimado(10), { texto: 'menos de 1 MB', porLink: false })
  assert.deepEqual(tamanhoEstimado(300), { texto: 'cerca de 9 MB', porLink: false })
  assert.equal(tamanhoEstimado(1000).porLink, true)
})
