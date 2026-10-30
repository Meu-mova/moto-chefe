'use server'

import { db } from '@/lib/db'
import { motos, lojas, historicoEstoque } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { contaDaLoja } from '@/lib/conta'
import { lembrarApelidosDaEntrada, modeloUsavelNaLoja, modelosUsaveisPelaConta } from '@/lib/modelos-da-conta'
import { revalidatePath } from 'next/cache'
import { normalizarCor } from '@/lib/cores-moto'
import { type FichaFiscal, type EmitenteNfe } from '@/lib/nfe-fiscal'
import { gravarFichaFiscalDasMotos, inserirMotoDaEntrada, paresDaNota, type MotoEntradaLote } from '@/lib/entrada-motos'
import { registrarNotaComPecas, NotaRecusada, type NotaComPecas } from '@/lib/entrada-nota'
import {
  EntradaPecasRecusada, carregarConferencia, carregarConferenciaPlanilha, gravarEntradaPlanilhaPecas,
  type EntradaPlanilhaPecas,
} from '@/lib/entrada-pecas'

type Usuario = Awaited<ReturnType<typeof getUsuarioLogado>>

// Resolve a loja de destino garantindo que ela existe e que o usuário pode usá-la:
// admin só no grupo que vê; quem entra pela exceção nominal, no grupo da própria loja.
// Assim um lojaId forjado no payload não joga moto no estoque de outro grupo.
async function resolverLojaDestino(usuario: Usuario, lojaId: string) {
  const [loja] = await db
    .select({ id: lojas.id, grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, lojaId))
    .limit(1)

  if (!loja) return { error: 'Loja não encontrada' as const }

  if (['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    if (!(await podeAbrirRegistroDaLoja(usuario, loja.id))) return { error: 'Loja fora do seu grupo' as const }
  } else {
    if (!usuario.lojaId) return { error: 'Usuário sem loja associada' as const }
    const grupoUsuario = await getGrupoIdDaLoja(usuario.lojaId)
    if (grupoUsuario !== loja.grupoId) return { error: 'Loja fora do seu grupo' as const }
  }

  return { loja }
}

type MotoEntrada = {
  chassi: string
  cor: string
  motor?: string
}

export async function registrarEntrada(formData: {
  notaFiscal: string
  modeloId: string
  precoCompra: string
  lojaId: string
  motos: MotoEntrada[]
}) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) {
    return { error: 'Sem permissão' }
  }

  if (!formData.notaFiscal || !formData.modeloId || !formData.precoCompra || !formData.lojaId || !formData.motos.length) {
    return { error: 'Preencha todos os campos obrigatórios' }
  }

  const precoCompra = formData.precoCompra.replace(',', '.')

  const destino = await resolverLojaDestino(usuario, formData.lojaId)
  if ('error' in destino) return { error: destino.error }
  const { loja } = destino
  if (!(await modeloUsavelNaLoja(loja.id, formData.modeloId))) return { error: 'Modelo não encontrado' }

  const chassisExistentes = new Set<string>()
  const duplicados: string[] = []

  for (const moto of formData.motos) {
    const chassiNorm = moto.chassi.trim().toUpperCase()
    if (!chassiNorm) {
      return { error: 'Chassi não pode ser vazio' }
    }
    if (chassisExistentes.has(chassiNorm)) {
      duplicados.push(chassiNorm)
    }
    chassisExistentes.add(chassiNorm)
  }

  if (duplicados.length) {
    return { error: `Chassis duplicados na lista: ${duplicados.join(', ')}` }
  }

  let inseridos = 0
  const erros: string[] = []

  for (const moto of formData.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    try {
      const [novaMoto] = await db.insert(motos).values({
        chassi,
        modeloId: formData.modeloId,
        lojaId: loja.id,
        status: 'caixa',
        cor: normalizarCor(moto.cor),
        notaFiscalEntrada: formData.notaFiscal.trim(),
        motor: moto.motor?.trim() || null,
        precoCompra,
      }).returning({ id: motos.id })

      await db.insert(historicoEstoque).values({
        motoId: novaMoto.id,
        lojaDestinoId: loja.id,
        usuarioId: usuario.id,
        tipo: 'entrada',
        statusNovo: 'caixa',
        observacao: `Entrada NF ${formData.notaFiscal.trim()}`,
      })

      inseridos++
    } catch (e: any) {
      const isDup = e.code === '23505' || e.cause?.code === '23505' ||
        e.message?.includes('unique') || e.message?.includes('duplicate key')
      if (isDup) {
        erros.push(`${chassi}: chassi já existe no sistema`)
      } else {
        erros.push(`${chassi}: ${e.message}`)
      }
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  if (erros.length) {
    return { success: `${inseridos} moto(s) inserida(s). Erros:\n${erros.join('\n')}` }
  }

  return { success: `${inseridos} moto(s) inserida(s) com sucesso!` }
}


export async function registrarEntradaLote(formData: {
  lojaId: string
  motos: MotoEntradaLote[]
  // Fichas fiscais lidas dos XMLs, uma por CHASSI. Opcional: entrada por
  // planilha e entrada manual não têm XML.
  fiscais?: { chassi: string; emitente: EmitenteNfe; ficha: FichaFiscal }[]
}) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) {
    return { error: 'Sem permissão' }
  }

  if (!formData.lojaId) {
    return { error: 'Selecione a loja de destino' }
  }

  if (!formData.motos.length) {
    return { error: 'Importe as motos da planilha' }
  }

  const destino = await resolverLojaDestino(usuario, formData.lojaId)
  if ('error' in destino) return { error: destino.error }
  const { loja } = destino

  // O modelo e o preço de cada moto chegam já revisados na tela (o de-para do XML
  // é só a sugestão inicial). Aqui o id vindo do payload é conferido contra o
  // cadastro para que um modeloId forjado não crie moto apontando pra lugar nenhum
  // nem para o modelo de outra Conta.
  const contaId = await contaDaLoja(loja.id)
  const idsValidos = await modelosUsaveisPelaConta(
    contaId,
    [...new Set(formData.motos.map(m => m.modeloId).filter(Boolean))],
  )

  const chassisExistentes = new Set<string>()
  const duplicados: string[] = []

  for (const moto of formData.motos) {
    const chassiNorm = moto.chassi.trim().toUpperCase()
    if (!chassiNorm) continue
    if (chassisExistentes.has(chassiNorm)) {
      duplicados.push(chassiNorm)
    }
    chassisExistentes.add(chassiNorm)
  }

  if (duplicados.length) {
    return { error: `Chassis duplicados na planilha: ${duplicados.join(', ')}` }
  }

  let inseridos = 0
  const erros: string[] = []
  // chassi -> id da moto recém-inserida, para casar com a ficha fiscal do XML
  const idPorChassi = new Map<string, string>()

  for (const moto of formData.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    if (!chassi) continue

    if (!moto.modeloId || !idsValidos.has(moto.modeloId)) {
      erros.push(`${chassi}: selecione o modelo antes de registrar`)
      continue
    }

    const precoCompra = (moto.precoCompra || '').replace(',', '.').trim()
    if (!precoCompra) {
      erros.push(`${chassi}: informe o preço de compra`)
      continue
    }

    try {
      const motoId = await inserirMotoDaEntrada(db, { lojaId: loja.id, usuarioId: usuario.id, chassi, moto, precoCompra })
      idPorChassi.set(chassi, motoId)
      inseridos++
    } catch (e: any) {
      const isDup = e.code === '23505' || e.cause?.code === '23505' ||
        e.message?.includes('unique') || e.message?.includes('duplicate key')
      if (isDup) {
        erros.push(`${chassi}: chassi já existe no sistema`)
      } else {
        erros.push(`${chassi}: ${e.message}`)
      }
    }
  }

  // Só as motos que de fato entraram: chassi recusado (duplicado, sem modelo)
  // não deixa ficha órfã para trás.
  const fichasGravadas = await gravarFichaFiscalDasMotos(
    db,
    (formData.fiscais ?? [])
      .map(f => ({ ...f, motoId: idPorChassi.get(f.chassi.trim().toUpperCase()) }))
      .filter((f): f is typeof f & { motoId: string } => !!f.motoId),
  )

  const avisosApelido = await lembrarApelidosDaEntrada(
    contaId,
    paresDaNota(formData.motos.filter(m => idPorChassi.has(m.chassi.trim().toUpperCase()))),
  )

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  const avisoCadastro = (fichasGravadas > 0
    ? `\nFicha fiscal da nota de entrada gravada para ${fichasGravadas} moto(s).`
    : '') + avisosApelido.map(a => `\n${a}`).join('')

  if (erros.length) {
    return { success: `${inseridos} moto(s) inserida(s). Erros:\n${erros.join('\n')}${avisoCadastro}` }
  }

  return { success: `${inseridos} moto(s) inserida(s) com sucesso!${avisoCadastro}` }
}

/**
 * Nota com peças (#429): motos e peças numa transação só; qualquer erro desfaz tudo e
 * volta a lista para a tela corrigir. Nota só de motos segue pelo registrarEntradaLote.
 */
export async function registrarEntradaNota(dados: Omit<NotaComPecas, 'usuario'>) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) return { error: 'Sem permissão' }

  let total: Awaited<ReturnType<typeof registrarNotaComPecas>>
  try {
    total = await db.transaction(tx => registrarNotaComPecas(tx, { ...dados, usuario }))
  } catch (e) {
    if (e instanceof NotaRecusada) return { error: `Nada foi gravado. Corrija:\n${e.erros.join('\n')}` }
    if (e instanceof EntradaPecasRecusada) return { error: `Nada foi gravado. ${e.message}` }
    throw e
  }

  revalidatePath('/estoque')
  revalidatePath('/pecas')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')
  return { success: `Nota lançada: ${total.motos} moto(s) e ${total.pecas} item(ns) de peça.${total.avisos.map(a => `\n${a}`).join('')}` }
}

/**
 * Dados da conferência das peças (#427), só da Conta da loja de destino. Loja que o
 * usuário não pode usar e loja inexistente recebem a mesma frase (#452).
 */
export async function carregarConferenciaPecas(
  lojaId: string,
  nota: Parameters<typeof carregarConferencia>[3],
) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) return { error: 'Sem permissão' as const }
  const conferencia = await carregarConferencia(db, usuario, lojaId, nota)
  return conferencia ? { conferencia } : { error: 'Loja de destino não encontrada' as const }
}

/** Conferência da planilha de peças (#519), com o aviso de planilha já lançada na loja. */
export async function carregarConferenciaPlanilhaPecas(
  lojaId: string,
  planilha: Parameters<typeof carregarConferenciaPlanilha>[3],
) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) return { error: 'Sem permissão' as const }
  const conferencia = await carregarConferenciaPlanilha(db, usuario, lojaId, planilha)
  return conferencia ? { conferencia } : { error: 'Loja de destino não encontrada' as const }
}

/** Planilha de peças (#519): tudo ou nada, como a nota com peças. */
export async function registrarEntradaPlanilhaPecas(dados: Omit<EntradaPlanilhaPecas, 'usuario'>) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) return { error: 'Sem permissão' }
  try {
    await db.transaction(tx => gravarEntradaPlanilhaPecas(tx, { ...dados, usuario }))
  } catch (e) {
    if (e instanceof EntradaPecasRecusada) return { error: `Nada foi gravado. ${e.message}` }
    throw e
  }
  revalidatePath('/pecas')
  revalidatePath('/entrada')
  return { success: `Planilha lançada: ${dados.linhas.length} item(ns) de peça.` }
}
