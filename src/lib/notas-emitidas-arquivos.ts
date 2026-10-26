import { strToU8, Zip, ZipDeflate } from 'fflate'
import { nomeDoArquivo, type TipoArquivo } from '@/lib/notas-emitidas'

type NotaComLinks = { id: string; numero: string | null; serie: string | null; linkXml: string | null; linkDanfe: string | null }

/** Devolve o conteúdo do link, ou null se não veio. Nunca loga a URL: o link da Nota Gateway abre a nota sem login. */
export type Baixar = (url: string) => Promise<Uint8Array | null>

// Poucas de cada vez: um mês inteiro de uma vez seria dezenas de pedidos simultâneos à Nota Gateway.
const SIMULTANEOS = 5

/**
 * Zip, em stream, com os arquivos pedidos de cada nota; o que não veio fica listado num .txt no fim.
 * Stream porque a Vercel recusa resposta acima de 4,5 MB que não seja em stream.
 */
export function zipDasNotas(notas: NotaComLinks[], tipos: TipoArquivo[], baixar: Baixar): ReadableStream<Uint8Array> {
  const pedidos = notas.flatMap(n => tipos.map(tipo => ({ nome: nomeDoArquivo(n, tipo), url: tipo === 'xml' ? n.linkXml : n.linkDanfe })))
  const usados = new Map<string, number>()
  for (const p of pedidos) {
    const vez = (usados.get(p.nome) ?? 0) + 1
    usados.set(p.nome, vez)
    if (vez > 1) p.nome = p.nome.replace(/(\.\w+)$/, `-${vez}$1`)
  }

  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((erro, pedaco, fim) => {
        if (erro) return controller.error(erro)
        controller.enqueue(pedaco)
        if (fim) controller.close()
      })
      const adicionar = (nome: string, conteudo: Uint8Array) => {
        const arquivo = new ZipDeflate(nome, { level: 6 })
        zip.add(arquivo)
        arquivo.push(conteudo, true)
      }
      const faltando: string[] = []
      for (let i = 0; i < pedidos.length; i += SIMULTANEOS) {
        const lote = pedidos.slice(i, i + SIMULTANEOS)
        const conteudos = await Promise.all(lote.map(p => (p.url ? baixar(p.url).catch(() => null) : null)))
        lote.forEach((p, j) => { const c = conteudos[j]; if (c) adicionar(p.nome, c); else faltando.push(p.nome) })
      }
      if (faltando.length > 0) {
        adicionar('ARQUIVOS-QUE-FALTARAM.txt', strToU8(
          `Estes arquivos não estavam disponíveis na hora do download. Tente baixar de novo mais tarde.\r\n\r\n${faltando.sort().join('\r\n')}\r\n`))
      }
      zip.end()
    },
  })
}
