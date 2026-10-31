/**
 * Gravação das motos de uma nota de entrada, comum ao lote (parcial, direto no banco)
 * e à nota com peças (#429, tudo ou nada numa transação). Quem chama confere a loja
 * com lojaDestinoDaEntrada.
 */
import { db } from '@/lib/db'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { historicoEstoque, motos, motosFiscal } from '@/lib/db/schema'
import { normalizarCor } from '@/lib/cores-moto'
import { type FichaFiscal, type EmitenteNfe } from '@/lib/nfe-fiscal'

type Executor = Pick<typeof db, 'insert'>

/**
 * Loja de destino que o usuário pode usar, pela mesma regra da entrada de peças. Loja de
 * outra Conta e loja inexistente recebem a mesma frase, para um lojaId forjado no payload
 * não revelar que a loja existe.
 */
export async function lojaDestinoDaEntrada(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  lojaId: string,
  exec: Pick<typeof db, 'select'> = db,
) {
  if (!(await podeAbrirRegistroDaLoja(usuario, lojaId, exec))) return { error: 'Loja não encontrada' as const }
  return { loja: { id: lojaId } }
}

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
 * diferente do que se paga a ela, então o `vUnCom` só pré-preenche o preço de
 * compra na tela (#513), e o que se grava é o que a pessoa confirmou ali.
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
