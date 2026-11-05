/**
 * Lista "Motos importadas" da Entrada (#686): só existe na tela até o "Registrar entrada".
 * A moto é identificada pela posição na lista, porque a planilha pode trazer chassi repetido.
 */

// `modelo` é o nome cru do XML/planilha (chave de agrupamento); `modeloId` e `preco` vão ao banco.
export type MotoImportada = {
  chassi: string
  cor: string
  motor: string
  modelo: string
  nf: string
  modeloId: string
  preco: string
}

export type MotoNaLista = { moto: MotoImportada; idx: number }
export type GrupoDaNf = { nf: string; total: number; modelos: { modelo: string; motos: MotoNaLista[] }[] }

const chaveDoChassi = (chassi: string) => chassi.trim().toUpperCase()

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

export function tirarMarcadas(linhas: readonly MotoImportada[], marcadas: ReadonlySet<number>) {
  const comIdx = linhas.map((moto, idx) => ({ moto, idx }))
  return {
    ficam: comIdx.filter(m => !marcadas.has(m.idx)).map(m => m.moto),
    tiradas: comIdx.filter(m => marcadas.has(m.idx)),
  }
}

/**
 * Desfazer: cada tirada volta à posição que tinha. O que entrou depois (outro XML) vai para o fim
 * da lista, então as posições antigas continuam valendo. Chassi que já voltou por outro XML
 * não se duplica, e as seguintes sobem uma casa para manter a ordem.
 */
export function devolverTiradas(linhas: readonly MotoImportada[], tiradas: readonly MotoNaLista[]): MotoImportada[] {
  const presentes = new Set(linhas.map(m => chaveDoChassi(m.chassi)))
  const aDevolver = [...tiradas].sort((a, b) => a.idx - b.idx)
  return aDevolver.reduce<{ lista: MotoImportada[]; puladas: number }>(({ lista, puladas }, { moto, idx }) => {
    if (presentes.has(chaveDoChassi(moto.chassi))) return { lista, puladas: puladas + 1 }
    const pos = idx - puladas
    return { lista: [...lista.slice(0, pos), moto, ...lista.slice(pos)], puladas }
  }, { lista: [...linhas], puladas: 0 }).lista
}
