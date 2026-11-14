import { dataBrParaIso, dataPuraBr } from '@/lib/data-venda'
import { ehSemVer } from '@/lib/semver'
import type { ItemDaNovidade, NovidadeDaVersao } from './tipos'

// A loja não tem conta no GitHub nem lê link; travessão é proibido em texto de tela (en dash junto).
const LINK = /http|www\./i
const TRAVESSAO = /[—–]/

// Ida e volta pelo dd/mm/aaaa: só um 'AAAA-MM-DD' de dia que existe volta igual.
const ehDataIso = (data: string) => dataBrParaIso(dataPuraBr(data)) === data

function problemasDoItem(versao: string, { titulo, texto }: ItemDaNovidade): string[] {
  if (!titulo.trim()) return [`${versao}: item sem título`]
  const escrito = `${titulo} ${texto}`
  return [
    ...(texto.trim() ? [] : [`${versao}: item "${titulo}" sem texto`]),
    ...(LINK.test(escrito) ? [`${versao}: item "${titulo}" com link`] : []),
    ...(TRAVESSAO.test(escrito) ? [`${versao}: item "${titulo}" com travessão`] : []),
  ]
}

/** O que está fora do formato numa versão; vazio quando está tudo certo. */
export function problemasDaNovidade(novidade: NovidadeDaVersao): string[] {
  const { versao, data } = novidade
  if (!ehSemVer(versao)) return [`versão "${versao}" não é X.Y.Z`]
  const itens = [...(novidade.novidades ?? []), ...(novidade.correcoes ?? [])]
  return [
    ...(ehDataIso(data) ? [] : [`${versao}: data "${data}" não é AAAA-MM-DD`]),
    ...(itens.length ? itens.flatMap(item => problemasDoItem(versao, item)) : [`${versao}: sem nenhum item`]),
  ]
}

/** Versões que aparecem mais de uma vez na lista, cada uma uma vez. */
export function versoesRepetidas(lista: readonly NovidadeDaVersao[]): string[] {
  const versoes = lista.map(n => n.versao)
  return [...new Set(versoes.filter((v, i) => versoes.indexOf(v) !== i))]
}
