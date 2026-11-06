'use server'

import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { acessaModulo } from '@/lib/navegacao'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { contaDaLoja } from '@/lib/conta'
import { modeloUsavelNaLoja, modelosUsaveisPelaConta } from '@/lib/modelos-da-conta'
import { revalidatePath } from 'next/cache'
import { type FichaDaMoto } from '@/lib/nfe-fiscal'
import { gravarFichaFiscalDasMotos, inserirMotosUmaAUma, lojaDestinoDaEntrada, type MotoConferida, type MotoEntradaLote } from '@/lib/entrada-motos'
import { registrarNotaComPecas, NotaRecusada, type NotaComPecas } from '@/lib/entrada-nota'
import { preencherGruposComPrecoPadrao } from '@/lib/tabela-preco-padrao'
import {
  EntradaPecasRecusada, carregarConferencia, carregarConferenciaPlanilha, gravarEntradaPlanilhaPecas,
  type EntradaPlanilhaPecas,
} from '@/lib/entrada-pecas'

// Modelo que entrou pela 1ª vez no grupo ganha o preço padrão da MotoChefe (#522). As motos já
// foram gravadas: falha aqui não desfaz a entrada, só deixa o preço para o próximo gatilho.
async function precoPadraoDepoisDaEntrada(loja: { grupoId: string } | { lojaId: string }) {
  try {
    const grupoId = 'grupoId' in loja ? loja.grupoId : await getGrupoIdDaLoja(loja.lojaId)
    if (await preencherGruposComPrecoPadrao([grupoId])) revalidatePath('/precificacao')
  } catch (e) {
    console.error('[entrada] preço padrão não preenchido', e)
  }
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
  if (!acessaModulo(usuario, 'entrada')) {
    return { error: 'Sem permissão' }
  }

  if (!formData.notaFiscal || !formData.modeloId || !formData.precoCompra || !formData.lojaId || !formData.motos.length) {
    return { error: 'Preencha todos os campos obrigatórios' }
  }

  const precoCompra = formData.precoCompra.replace(',', '.')

  const destino = await lojaDestinoDaEntrada(usuario, formData.lojaId)
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

  const { idPorChassi, erros } = await inserirMotosUmaAUma(db, {
    lojaId: loja.id, usuario,
    motos: formData.motos.map(m => {
      const chassi = m.chassi.trim().toUpperCase()
      return { chassi, precoCompra, moto: { ...m, chassi, modeloId: formData.modeloId, precoCompra, notaFiscal: formData.notaFiscal } }
    }),
  })
  const inseridos = idPorChassi.size

  if (inseridos > 0) await precoPadraoDepoisDaEntrada({ lojaId: loja.id })
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
  fiscais?: FichaDaMoto[]
}) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'entrada')) {
    return { error: 'Sem permissão' }
  }

  if (!formData.lojaId) {
    return { error: 'Selecione a loja de destino' }
  }

  if (!formData.motos.length) {
    return { error: 'Importe as motos da planilha' }
  }

  const destino = await lojaDestinoDaEntrada(usuario, formData.lojaId)
  if ('error' in destino) return { error: destino.error }
  const { loja } = destino

  // O modelo e o preço de cada moto chegam já revisados na tela (o de-para do XML
  // é só a sugestão inicial). Aqui o id vindo do payload é conferido contra o
  // cadastro para que um modeloId forjado não crie moto apontando pra lugar nenhum
  // nem para o modelo de outra Conta.
  const idsValidos = await modelosUsaveisPelaConta(
    await contaDaLoja(loja.id),
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

  const erros: string[] = []
  const validas: MotoConferida[] = []
  for (const moto of formData.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    if (!chassi) continue
    const precoCompra = (moto.precoCompra || '').replace(',', '.').trim()
    if (!moto.modeloId || !idsValidos.has(moto.modeloId)) erros.push(`${chassi}: selecione o modelo antes de registrar`)
    else if (!precoCompra) erros.push(`${chassi}: informe o preço de compra`)
    else validas.push({ chassi, moto, precoCompra })
  }
  // idPorChassi: id da moto recém-inserida, para casar com a ficha fiscal do XML
  const { idPorChassi, erros: recusadas } = await inserirMotosUmaAUma(db, { lojaId: loja.id, usuario, motos: validas })
  erros.push(...recusadas)
  const inseridos = idPorChassi.size

  // Só as motos que de fato entraram: chassi recusado (duplicado, sem modelo)
  // não deixa ficha órfã para trás.
  const fichasGravadas = await gravarFichaFiscalDasMotos(
    db,
    (formData.fiscais ?? [])
      .map(f => ({ ...f, motoId: idPorChassi.get(f.chassi.trim().toUpperCase()) }))
      .filter((f): f is typeof f & { motoId: string } => !!f.motoId),
  )

  if (inseridos > 0) await precoPadraoDepoisDaEntrada({ lojaId: loja.id })
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  const avisoCadastro = (fichasGravadas > 0
    ? `\nFicha fiscal da nota de entrada gravada para ${fichasGravadas} moto(s).`
    : '')

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
  if (!acessaModulo(usuario, 'entrada')) return { error: 'Sem permissão' }

  let total: { motos: number; pecas: number }
  try {
    total = await db.transaction(tx => registrarNotaComPecas(tx, { ...dados, usuario }))
  } catch (e) {
    if (e instanceof NotaRecusada) return { error: `Nada foi gravado. Corrija:\n${e.erros.join('\n')}` }
    if (e instanceof EntradaPecasRecusada) return { error: `Nada foi gravado. ${e.message}` }
    throw e
  }

  if (total.motos > 0) await precoPadraoDepoisDaEntrada({ lojaId: dados.lojaId })
  revalidatePath('/estoque')
  revalidatePath('/pecas')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')
  return { success: `Nota lançada: ${total.motos} moto(s) e ${total.pecas} item(ns) de peça.` }
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
  if (!acessaModulo(usuario, 'entrada')) return { error: 'Sem permissão' as const }
  const conferencia = await carregarConferencia(db, usuario, lojaId, nota)
  return conferencia ? { conferencia } : { error: 'Loja de destino não encontrada' as const }
}

/** Conferência da planilha de peças (#519), com o aviso de planilha já lançada na loja. */
export async function carregarConferenciaPlanilhaPecas(
  lojaId: string,
  planilha: Parameters<typeof carregarConferenciaPlanilha>[3],
) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'entrada')) return { error: 'Sem permissão' as const }
  const conferencia = await carregarConferenciaPlanilha(db, usuario, lojaId, planilha)
  return conferencia ? { conferencia } : { error: 'Loja de destino não encontrada' as const }
}

/** Planilha de peças (#519): tudo ou nada, como a nota com peças. */
export async function registrarEntradaPlanilhaPecas(dados: Omit<EntradaPlanilhaPecas, 'usuario'>) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'entrada')) return { error: 'Sem permissão' }
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
