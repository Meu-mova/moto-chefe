/**
 * Nota de entrada com peças (#429). Decisão do Luis (27/10): se a nota tem peças, ela
 * entra inteira ou não entra; qualquer erro de moto ou de peça desfaz tudo. Nota só de
 * motos continua parcial, pelo registrarEntradaLote. Roda dentro da transação de quem
 * chama.
 */
import { inArray } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { contaDaLoja } from '@/lib/conta'
import { modelosUsaveisPelaConta } from '@/lib/modelos-da-conta'
import { gravarFichaFiscalDasMotos, inserirMotoDaEntrada, type MotoEntradaLote } from '@/lib/entrada-motos'
import { conferirLinhasPecas, gravarEntradaPecas, type EntradaPecas, type LinhaEntradaPeca } from '@/lib/entrada-pecas'
import type { EmitenteNfe, FichaFiscal } from '@/lib/nfe-fiscal'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

/** Nota recusada: nada foi gravado. `erros` lista tudo o que a tela precisa corrigir. */
export class NotaRecusada extends Error {
  constructor(readonly erros: string[]) {
    super(erros.join('\n'))
  }
}

export type NotaComPecas = {
  usuario: EntradaPecas['usuario']
  lojaId: string
  nota: EntradaPecas['nota']
  motos: MotoEntradaLote[]
  fiscais?: { chassi: string; emitente: EmitenteNfe; ficha: FichaFiscal }[]
  pecas: LinhaEntradaPeca[]
}

export async function registrarNotaComPecas(exec: Executor, e: NotaComPecas): Promise<{ motos: number; pecas: number }> {
  // Mesma frase da gravação de peças: loja de outra Conta e loja inexistente não se distinguem.
  if (!(await podeAbrirRegistroDaLoja(e.usuario, e.lojaId, exec))) {
    throw new NotaRecusada(['Loja de destino não encontrada'])
  }

  const erros: string[] = []
  const modelosValidos = await modelosUsaveisPelaConta(
    await contaDaLoja(e.lojaId, exec),
    [...new Set(e.motos.map(m => m.modeloId).filter(Boolean))],
    exec,
  )
  const vistos = new Set<string>()
  const prontas: { chassi: string; moto: MotoEntradaLote; precoCompra: string }[] = []
  for (const moto of e.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    if (!chassi) continue
    const precoCompra = (moto.precoCompra || '').replace(',', '.').trim()
    if (vistos.has(chassi)) erros.push(`${chassi}: chassi repetido na nota`)
    else if (!moto.modeloId || !modelosValidos.has(moto.modeloId)) erros.push(`${chassi}: selecione o modelo antes de registrar`)
    else if (!precoCompra) erros.push(`${chassi}: informe o preço de compra`)
    else prontas.push({ chassi, moto, precoCompra })
    vistos.add(chassi)
  }
  // Conferido antes de gravar: um insert que falha dentro da transação a invalida inteira.
  if (prontas.length) {
    const existentes = await exec.select({ chassi: motos.chassi }).from(motos)
      .where(inArray(motos.chassi, prontas.map(p => p.chassi)))
    for (const { chassi } of existentes) erros.push(`${chassi}: chassi já existe no sistema`)
  }
  erros.push(...await conferirLinhasPecas(exec, e.lojaId, e.pecas))
  if (erros.length) throw new NotaRecusada(erros)

  const idPorChassi = new Map<string, string>()
  for (const p of prontas) {
    idPorChassi.set(p.chassi, await inserirMotoDaEntrada(exec, { lojaId: e.lojaId, usuarioId: e.usuario.id, ...p }))
  }
  await gravarFichaFiscalDasMotos(exec, (e.fiscais ?? [])
    .map(f => ({ ...f, motoId: idPorChassi.get(f.chassi.trim().toUpperCase()) }))
    .filter((f): f is typeof f & { motoId: string } => !!f.motoId))

  await gravarEntradaPecas(exec, { lojaId: e.lojaId, usuario: e.usuario, nota: e.nota, linhas: e.pecas })
  return { motos: prontas.length, pecas: e.pecas.length }
}
