/**
 * Gravação das motos de uma nota de entrada, comum ao lote (parcial, direto no banco)
 * e à nota com peças (#429, tudo ou nada numa transação). Quem chama confere a loja.
 */
import type { db } from '@/lib/db'
import { historicoEstoque, motos, motosFiscal } from '@/lib/db/schema'
import { normalizarCor } from '@/lib/cores-moto'
import { type FichaFiscal, type EmitenteNfe } from '@/lib/nfe-fiscal'

type Executor = Pick<typeof db, 'insert'>

export type MotoEntradaLote = {
  chassi: string
  cor: string
  motor?: string
  modeloId: string
  precoCompra: string
  notaFiscal: string
}

export async function inserirMotoDaEntrada(
  exec: Executor,
  e: { lojaId: string; usuarioId: string; chassi: string; moto: MotoEntradaLote; precoCompra: string },
): Promise<string> {
  const nf = e.moto.notaFiscal.trim()
  const [novaMoto] = await exec.insert(motos).values({
    chassi: e.chassi,
    modeloId: e.moto.modeloId,
    lojaId: e.lojaId,
    status: 'caixa',
    cor: normalizarCor(e.moto.cor),
    notaFiscalEntrada: nf,
    motor: e.moto.motor?.trim() || null,
    precoCompra: e.precoCompra,
  }).returning({ id: motos.id })

  await exec.insert(historicoEstoque).values({
    motoId: novaMoto.id,
    lojaDestinoId: e.lojaId,
    usuarioId: e.usuarioId,
    tipo: 'entrada',
    statusNovo: 'caixa',
    observacao: `Entrada NF ${nf}`,
  })
  return novaMoto.id
}

/**
 * Grava a ficha fiscal das motos que acabaram de entrar, copiada do XML da nota
 * que as trouxe.
 *
 * É o primeiro passo para emitir nota própria e sair do Bling. A ficha é da
 * MOTO e não do modelo: o mesmo X12 vem da LAIOUNS como CEST 2600101 / origem 1
 * / CST 10 e da Q.P.A como 2600100 / origem 4 / CST 60, e a NF de saída espelha
 * a de entrada daquela moto — inclusive no nome fiscal (`xProd`), que sai
 * literal como veio.
 *
 * Só os campos FISCAIS vêm do XML. O valor não: a nota da fábrica sai com valor
 * diferente do que se paga a ela, então o preço de compra continua sendo o
 * digitado na tela. Não troque isso por `vUnCom` do XML.
 *
 * `onConflictDoNothing` porque a ficha é um snapshot da entrada: reimportar a
 * mesma nota não reescreve o que já está gravado, e uma correção feita depois
 * no cadastro não é desfeita por aqui.
 */
export async function gravarFichaFiscalDasMotos(
  exec: Executor,
  fichas: { motoId: string; emitente: EmitenteNfe; ficha: FichaFiscal }[],
) {
  if (!fichas.length) return 0

  const gravadas = await exec
    .insert(motosFiscal)
    .values(fichas.map(({ motoId, emitente, ficha }) => ({
      motoId,
      emitenteCnpj: emitente.cnpj,
      emitenteNome: emitente.nome || null,
      nfNumero: emitente.nfNumero || null,
      nfChave: emitente.nfChave || null,
      cProd: ficha.codigo || null,
      xProd: ficha.descricao || null,
      ncm: ficha.ncm,
      cest: ficha.cest || null,
      unidade: ficha.unidade || null,
      origem: ficha.origem || null,
      cfopEntrada: ficha.cfopEntrada || null,
      cstIcmsEntrada: ficha.cstIcmsEntrada || null,
      cstPis: ficha.cstPis || null,
      cstCofins: ficha.cstCofins || null,
      classTribIbsCbs: ficha.classTribIbsCbs || null,
      tpPint: ficha.tpPint || null,
    })))
    .onConflictDoNothing()
    .returning({ motoId: motosFiscal.motoId })

  return gravadas.length
}
