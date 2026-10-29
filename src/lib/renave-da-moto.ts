import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lojas, modelos, motos, motosFiscal, motosRenave, vendas } from '@/lib/db/schema'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { sugestaoComOrigem, type DadosRenave, type OrigemRenave } from '@/lib/notagateway/veiculo'
import { vendaDoUsuarioParaNf } from '@/lib/venda-do-usuario'

/** Leitura e gravação do veículo (RENAVE) da moto, com o grupo e a Conta no where. */

type Executor = Pick<typeof db, 'select' | 'insert'>
type Usuario = Parameters<typeof vendaDoUsuarioParaNf>[0]

/** Mesma frase de quando a moto não tem venda: não revela venda de outra Conta. */
export const SEM_VENDA = 'Nenhuma venda encontrada para esta moto'

export function renaveDaLinha(r: typeof motosRenave.$inferSelect): DadosRenave {
  return {
    chassi: r.chassi,
    tipoOperacao: r.tipoOperacao,
    corCodigo: r.corCodigo,
    corDescricao: r.corDescricao,
    corDenatran: r.corDenatran,
    potenciaMotor: r.potenciaMotor,
    unidadePotencia: r.unidadePotencia,
    cilindradas: r.cilindradas,
    pesoLiquido: String(Number(r.pesoLiquido)),
    pesoBruto: String(Number(r.pesoBruto)),
    numeroSerie: r.numeroSerie,
    tipoCombustivel: r.tipoCombustivel,
    numeroMotor: r.numeroMotor,
    capacidadeMaximaTracao: String(Number(r.capacidadeMaximaTracao)),
    distanciaEixos: r.distanciaEixos,
    anoModelo: String(r.anoModelo),
    anoFabricacao: String(r.anoFabricacao),
    tipoPintura: r.tipoPintura,
    tipoVeiculo: r.tipoVeiculo,
    especie: r.especie,
    condicaoVin: r.condicaoVin,
    condicao: r.condicao,
    codigoMarcaModelo: r.codigoMarcaModelo,
    lotacao: String(r.lotacao),
    restricao: r.restricao,
  }
}

/**
 * O que abre o formulário: o que foi enviado da última vez para esta moto ou, na
 * primeira vez, a sugestão com o que é do modelo herdado da última moto do mesmo
 * modelo no mesmo grupo. `grupoId` é o da loja da venda, já conferido por quem chama.
 */
export async function renaveParaEmissao(m: Parameters<typeof renaveComOrigem>[0], exec: Executor = db): Promise<DadosRenave> {
  return (await renaveComOrigem(m, exec)).dados
}

/** Como renaveParaEmissao, com a origem de cada valor para a tela. */
export async function renaveComOrigem(
  m: { motoId: string; grupoId: string; modeloId: string; chassi: string; cor: string | null; motor: string | null; potenciaW: string | null; anoAtual: number },
  exec: Executor = db,
): Promise<{ dados: DadosRenave; origem: OrigemRenave }> {
  const [row] = await exec.select().from(motosRenave)
    .innerJoin(motos, eq(motos.id, motosRenave.motoId))
    .innerJoin(lojas, eq(lojas.id, motos.lojaId))
    .where(and(eq(motosRenave.motoId, m.motoId), eq(lojas.grupoId, m.grupoId)))
    .limit(1)
  if (row) {
    const dados = renaveDaLinha(row.motos_renave)
    const origem = Object.fromEntries(Object.keys(dados).map(k => [k, 'do último envio desta moto'])) as OrigemRenave
    return { dados, origem }
  }
  const [anterior] = await exec
    .select({ r: motosRenave })
    .from(motosRenave)
    .innerJoin(motos, eq(motos.id, motosRenave.motoId))
    .innerJoin(lojas, eq(lojas.id, motos.lojaId))
    .where(and(eq(motos.modeloId, m.modeloId), eq(lojas.grupoId, m.grupoId)))
    .orderBy(desc(motosRenave.atualizadoEm))
    .limit(1)
  const [ficha] = await exec.select({ tpPint: motosFiscal.tpPint }).from(motosFiscal).where(eq(motosFiscal.motoId, m.motoId)).limit(1)
  // O nome que a Conta da loja dá ao modelo (#476), não o do catálogo.
  const [nome] = await exec.select({ modelo: nomeDoModeloNaLoja(motos.lojaId) }).from(motos)
    .innerJoin(modelos, eq(modelos.id, motos.modeloId)).where(eq(motos.id, m.motoId)).limit(1)
  return sugestaoComOrigem({
    ...m,
    modeloNome: nome?.modelo ?? null,
    anterior: anterior ? renaveDaLinha(anterior.r) : null,
    tpPintEntrada: ficha?.tpPint ?? null,
  })
}

/**
 * Grava o veículo já validado. Roda no envio: o que fica gravado é o que foi para a
 * nota, e volta preenchido numa nova tentativa. A moto precisa ter venda que o
 * usuário vê (Conta no where); senão não grava e devolve a frase de moto sem venda.
 */
export async function gravarRenaveDaMoto(
  usuario: Usuario, motoId: string, r: DadosRenave, usuarioId: string, exec: Executor = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await vendaDoUsuarioParaNf(usuario, eq(vendas.motoId, motoId), exec))) return { ok: false, erro: SEM_VENDA }
  const valores = {
    ...r,
    anoModelo: Number(r.anoModelo),
    anoFabricacao: Number(r.anoFabricacao),
    lotacao: Number(r.lotacao),
    preenchidoPor: usuarioId,
    atualizadoEm: new Date(),
  }
  await exec.insert(motosRenave)
    .values({ motoId, ...valores })
    .onConflictDoUpdate({ target: motosRenave.motoId, set: valores })
  return { ok: true }
}
