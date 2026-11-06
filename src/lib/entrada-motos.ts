/**
 * Gravação das motos de uma nota de entrada, comum a três caminhos: o lote da tela
 * (parcial, direto no banco), a nota com peças (#429) e o lote do onboarding
 * (scripts/importar-motos-xml.ts). Os dois últimos são tudo ou nada numa transação e
 * conferem as motos por conferirMotosDaEntrada. A tela confere a loja com
 * lojaDestinoDaEntrada.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { contaDaLoja } from '@/lib/conta'
import { modelosUsaveisPelaConta } from '@/lib/modelos-da-conta'
import { grupos, historicoEstoque, lojas, motos, motosFiscal } from '@/lib/db/schema'
import { normalizarCor } from '@/lib/cores-moto'
import { type FichaFiscal, type EmitenteNfe, type FichaDaMoto } from '@/lib/nfe-fiscal'

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

export type MotoConferida = { chassi: string; moto: MotoEntradaLote; precoCompra: string }

/**
 * Confere as motos de uma entrada tudo ou nada, sem gravar: chassi repetido, modelo que a
 * Conta da loja não usa, preço vazio e chassi já cadastrado viram erro. Conferido antes de
 * gravar porque um insert que falha dentro da transação a invalida inteira.
 */
export async function conferirMotosDaEntrada(
  exec: Pick<typeof db, 'select'>,
  lojaId: string,
  motosDaNota: MotoEntradaLote[],
): Promise<{ prontas: MotoConferida[]; erros: string[] }> {
  const contaId = await contaDaLoja(lojaId, exec)
  const modelosValidos = await modelosUsaveisPelaConta(
    contaId,
    [...new Set(motosDaNota.map(m => m.modeloId).filter(Boolean))],
    exec,
  )
  const vistos = new Set<string>()
  const erros: string[] = []
  const prontas: MotoConferida[] = []
  for (const moto of motosDaNota) {
    const chassi = moto.chassi.trim().toUpperCase()
    if (!chassi) continue
    const precoCompra = (moto.precoCompra || '').replace(',', '.').trim()
    if (vistos.has(chassi)) erros.push(`${chassi}: chassi repetido na nota`)
    else if (!moto.modeloId || !modelosValidos.has(moto.modeloId)) erros.push(`${chassi}: selecione o modelo antes de registrar`)
    else if (!precoCompra) erros.push(`${chassi}: informe o preço de compra`)
    else prontas.push({ chassi, moto, precoCompra })
    vistos.add(chassi)
  }
  if (!prontas.length) return { prontas, erros }

  const existentes = await exec.select({ chassi: motos.chassi, contaId: grupos.contaId }).from(motos)
    .innerJoin(lojas, eq(lojas.id, motos.lojaId)).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(inArray(motos.chassi, prontas.map(p => p.chassi)))
  // Chassi de outra Conta recusa sem dizer onde está (#456).
  const jaCadastrados = existentes.map(m => m.contaId === contaId
    ? `${m.chassi}: chassi já existe no sistema`
    : `${m.chassi}: não deu para registrar este chassi. Confira o número.`)
  return { prontas, erros: [...erros, ...jaCadastrados] }
}

/** Grava as motos já conferidas e a ficha fiscal de cada uma. Devolve quantas fichas entraram. */
export async function gravarMotosConferidas(
  exec: Executor,
  e: { lojaId: string; usuarioId: string; prontas: MotoConferida[]; fiscais: FichaDaMoto[] },
): Promise<number> {
  const idPorChassi = new Map<string, string>()
  for (const p of e.prontas) {
    idPorChassi.set(p.chassi, await inserirMotoDaEntrada(exec, { lojaId: e.lojaId, usuarioId: e.usuarioId, ...p }))
  }
  return gravarFichaFiscalDasMotos(exec, e.fiscais
    .map(f => ({ ...f, motoId: idPorChassi.get(f.chassi.trim().toUpperCase()) }))
    .filter((f): f is typeof f & { motoId: string } => !!f.motoId))
}

/**
 * Lote inteiro ou nada, para o onboarding de uma loja (scripts/importar-motos-xml.ts), com a
 * mesma conferência da nota com peças. Quem chama abre a transação. A loja precisa existir e
 * estar ativa; o usuário fica no histórico.
 */
export async function gravarLoteDeEntrada(
  exec: Pick<typeof db, 'select' | 'insert'>,
  e: {
    lojaId: string
    usuarioId: string
    motos: MotoEntradaLote[]
    fiscais: FichaDaMoto[]
  },
): Promise<{ motos: number; fichas: number }> {
  const [loja] = await exec.select({ id: lojas.id }).from(lojas)
    .where(and(eq(lojas.id, e.lojaId), eq(lojas.ativa, true))).limit(1)
  if (!loja) throw new Error('Loja não encontrada')
  if (!e.motos.length) return { motos: 0, fichas: 0 }

  const { prontas, erros } = await conferirMotosDaEntrada(exec, e.lojaId, e.motos)
  if (erros.length) throw new Error(`Nada foi gravado:\n${erros.join('\n')}`)
  const fichas = await gravarMotosConferidas(exec, { lojaId: e.lojaId, usuarioId: e.usuarioId, prontas, fiscais: e.fiscais })
  return { motos: prontas.length, fichas }
}
