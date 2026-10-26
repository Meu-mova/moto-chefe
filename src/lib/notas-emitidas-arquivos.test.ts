import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, strToU8, unzipSync } from 'fflate'
import { zipDasNotas } from './notas-emitidas-arquivos'

async function zipCompleto(...args: Parameters<typeof zipDasNotas>) {
  return { zip: new Uint8Array(await new Response(zipDasNotas(...args)).arrayBuffer()) }
}

const nota = (id: string, numero: string | null, linkXml: string | null, linkDanfe: string | null) => ({ id, numero, serie: '1', linkXml, linkDanfe })

const baixar = async (url: string) => (url.includes('quebrado') ? null : strToU8(`conteudo de ${url}`))

test('zipCompleto põe no zip o XML e o PDF de cada nota, com o nome da nota', async () => {
  const r = await zipCompleto([nota('a', '10', 'https://x/10.xml', 'https://x/10.pdf')], ['xml', 'pdf'], baixar)
  const zip = unzipSync(r.zip)
  assert.deepEqual(Object.keys(zip).sort(), ['NF-10-serie-1.pdf', 'NF-10-serie-1.xml'])
  assert.equal(strFromU8(zip['NF-10-serie-1.xml']), 'conteudo de https://x/10.xml')
})

test('zipCompleto avisa no zip o arquivo que não veio, sem derrubar o lote', async () => {
  const r = await zipCompleto([
    nota('a', '10', 'https://x/10.xml', null),
    nota('b', '11', 'https://x/quebrado.xml', null),
  ], ['xml', 'pdf'], baixar)
  const zip = unzipSync(r.zip)
  assert.deepEqual(Object.keys(zip).sort(), ['ARQUIVOS-QUE-FALTARAM.txt', 'NF-10-serie-1.xml'])
  assert.deepEqual(strFromU8(zip['ARQUIVOS-QUE-FALTARAM.txt']).split('\r\n').filter(l => l.startsWith('NF-')),
    ['NF-10-serie-1.pdf', 'NF-11-serie-1.pdf', 'NF-11-serie-1.xml'])
})

test('zipCompleto não sobrescreve duas tentativas com o mesmo número', async () => {
  const r = await zipCompleto([nota('a', '10', 'https://x/a.xml', null), nota('b', '10', 'https://x/b.xml', null)], ['xml'], baixar)
  assert.deepEqual(Object.keys(unzipSync(r.zip)).sort(), ['NF-10-serie-1-2.xml', 'NF-10-serie-1.xml'])
})

test('zipDasNotas fecha o zip quando o tempo acaba e lista no .txt o que não deu tempo de baixar', async () => {
  const notas = [nota('a', '10', 'https://x/10.xml', null), nota('b', '11', 'https://x/11.xml', null)]
  const r = await zipCompleto(notas, ['xml'], baixar, () => true)
  const zip = unzipSync(r.zip)
  assert.deepEqual(Object.keys(zip), ['ARQUIVOS-QUE-FALTARAM.txt'])
  assert.deepEqual(strFromU8(zip['ARQUIVOS-QUE-FALTARAM.txt']).split('\r\n').filter(l => l.startsWith('NF-')), ['NF-10-serie-1.xml', 'NF-11-serie-1.xml'])
})
