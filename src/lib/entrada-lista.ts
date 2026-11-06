/**
 * Lista "Motos importadas" da Entrada (#686): só existe na tela até o "Registrar entrada".
 * A moto é identificada pela posição na lista, porque a planilha pode trazer chassi repetido.
 */

import type { EmitenteNfe, FichaFiscal } from './nfe-fiscal'

// `modelo` é o nome cru do XML/planilha (chave de agrupamento); `modeloId` e `preco` vão ao banco.
// `fiscal` é a ficha lida de um XML com o chassi desta moto: viaja com a linha para sair junto
// quando ela é tirada da lista. Separada, a ficha de um XML excluído ia junto e vencia a da NF certa (#686).
export type MotoImportada = {
  chassi: string
  cor: string
  motor: string
  modelo: string
  nf: string
  modeloId: string
  preco: string
  fiscal?: { emitente: EmitenteNfe; ficha: FichaFiscal }
}

export type MotoNaLista = { moto: MotoImportada; idx: number }
export type GrupoDaNf = { nf: string; total: number; modelos: { modelo: string; motos: MotoNaLista[] }[] }

/** Mesmo chassi na lista: a mesma regra no Desfazer e na leitura de outro XML. */
export const chaveDoChassi = (chassi: string) => chassi.trim().toUpperCase()

/**
 * NF > modelo, com o índice de cada moto: a chave do grupo é o nome cru, então trocar o modelo
 * escolhido de um bloco não o faz saltar de lugar embaixo do clique.
 */
export function agruparPorNfEModelo(linhas: readonly MotoImportada[]): GrupoDaNf[] {
  const porNf = linhas.reduce<Record<string, Record<string, MotoNaLista[]>>>((acc, moto, idx) => {
    const nf = moto.nf || 'SEM NF'
    const modelo = moto.modelo.toUpperCase()
    const daNf = acc[nf] ?? {}
    return { ...acc, [nf]: { ...daNf, [modelo]: [...(daNf[modelo] ?? []), { moto, idx }] } }
  }, {})
  return Object.entries(porNf).map(([nf, modelos]) => {
    const lista = Object.entries(modelos).map(([modelo, motos]) => ({ modelo, motos }))
    return { nf, total: lista.reduce((s, m) => s + m.motos.length, 0), modelos: lista }
  })
}

/** O que uma exclusão tirou, com o que precisa para desfazer. */
export type Exclusao = {
  tiradas: MotoNaLista[]
  /** Chassis que continuaram na lista: a planilha pode trazer o mesmo chassi duas vezes. */
  chassisQueFicaram: ReadonlySet<string>
}

export function tirarMarcadas(linhas: readonly MotoImportada[], marcadas: ReadonlySet<number>): { ficam: MotoImportada[]; exclusao: Exclusao } {
  const comIdx = linhas.map((moto, idx) => ({ moto, idx }))
  const ficam = comIdx.filter(m => !marcadas.has(m.idx)).map(m => m.moto)
  return {
    ficam,
    exclusao: { tiradas: comIdx.filter(m => marcadas.has(m.idx)), chassisQueFicaram: new Set(ficam.map(m => chaveDoChassi(m.chassi))) },
  }
}

/**
 * Desfazer: cada tirada volta à posição que tinha. O que entrou depois (outro XML) vai para o fim
 * da lista, então as posições antigas continuam valendo. Chassi que voltou por outro XML depois
 * da exclusão não se duplica, e as seguintes sobem uma casa para manter a ordem; cópia que já
 * estava na lista (planilha com chassi repetido) não impede a devolução.
 */
export function devolverTiradas(linhas: readonly MotoImportada[], { tiradas, chassisQueFicaram }: Exclusao): MotoImportada[] {
  const voltouDepois = new Set(linhas.map(m => chaveDoChassi(m.chassi)).filter(c => !chassisQueFicaram.has(c)))
  const aDevolver = [...tiradas].sort((a, b) => a.idx - b.idx)
  return aDevolver.reduce<{ lista: MotoImportada[]; puladas: number }>(({ lista, puladas }, { moto, idx }) => {
    if (voltouDepois.has(chaveDoChassi(moto.chassi))) return { lista, puladas: puladas + 1 }
    const pos = idx - puladas
    return { lista: [...lista.slice(0, pos), moto, ...lista.slice(pos)], puladas }
  }, { lista: [...linhas], puladas: 0 }).lista
}

/** Fichas fiscais que vão no "Registrar entrada": só as das motos que estão na lista. */
export function fichasDoEnvio(linhas: readonly MotoImportada[]) {
  return linhas.flatMap(({ chassi, fiscal }) => (fiscal ? [{ chassi, ...fiscal }] : []))
}

/**
 * Motos lidas de XMLs entram no fim da lista. Chassi que já está nela não se repete; se a linha
 * não tem ficha fiscal (veio da planilha, ou de um XML sem ficha para ela), ganha a do XML novo
 * e o resto da linha fica como estava.
 */
export function acrescentarDoXml(linhas: readonly MotoImportada[], novas: readonly MotoImportada[]): MotoImportada[] {
  // A primeira ficha de cada chassi vence, como na gravação (onConflictDoNothing).
  const fichaDoXml = novas.reduce((mapa, n) => {
    const chave = chaveDoChassi(n.chassi)
    return n.fiscal && !mapa.has(chave) ? new Map([...mapa, [chave, n.fiscal]]) : mapa
  }, new Map<string, NonNullable<MotoImportada['fiscal']>>())
  const presentes = new Set(linhas.map(l => chaveDoChassi(l.chassi)))
  const completadas = linhas.map(l => {
    const fiscal = l.fiscal ? undefined : fichaDoXml.get(chaveDoChassi(l.chassi))
    return fiscal ? { ...l, fiscal } : l
  })
  return [...completadas, ...novas.filter(n => n.chassi && !presentes.has(chaveDoChassi(n.chassi)))]
}
