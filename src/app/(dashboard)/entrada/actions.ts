'use server'

import { db } from '@/lib/db'
import { motos, lojas, historicoEstoque, modelos } from '@/lib/db/schema'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { normalizarCor } from '@/lib/cores-moto'
import { precosParaCadastrar } from '@/lib/entrada-preco'
import { fiscaisParaCadastrar, type FichaFiscal } from '@/lib/nfe-fiscal'

type Usuario = Awaited<ReturnType<typeof getUsuarioLogado>>

// Resolve a loja de destino garantindo que ela existe e que o usuário pode usá-la.
// Admin escolhe qualquer loja (o seletor já é filtrado pelo grupo ativo do cookie);
// quem entra pela exceção nominal fica restrito ao grupo da própria loja, para que
// um lojaId forjado no payload não jogue moto no estoque de outro grupo.
async function resolverLojaDestino(usuario: Usuario, lojaId: string) {
  const [loja] = await db
    .select({ id: lojas.id, grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, lojaId))
    .limit(1)

  if (!loja) return { error: 'Loja não encontrada' as const }

  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    if (!usuario.lojaId) return { error: 'Usuário sem loja associada' as const }
    const grupoUsuario = await getGrupoIdDaLoja(usuario.lojaId)
    if (grupoUsuario !== loja.grupoId) return { error: 'Loja fora do seu grupo' as const }
  }

  return { loja }
}

/**
 * Preenche o preço padrão dos modelos que entraram sem ter um. O cadastro do
 * catálogo nunca foi preenchido por completo, então o valor digitado na entrada
 * vira o padrão do modelo e a próxima importação já vem sugerida.
 *
 * A condição de "ainda não tem preço" vive no WHERE, não em um select antes:
 * duas entradas simultâneas do mesmo modelo não se atropelam, e preço já
 * cadastrado nunca é sobrescrito por aqui — isso continua sendo mexida no
 * cadastro do modelo, feita de propósito na tela de Modelos.
 */
async function cadastrarPrecoPadraoFaltante(inseridas: { modeloId: string; preco: string }[]) {
  const porModelo = precosParaCadastrar(inseridas)
  let gravados = 0

  for (const [modeloId, preco] of porModelo) {
    const alterados = await db
      .update(modelos)
      .set({ precoCompraPadrao: preco })
      .where(and(
        eq(modelos.id, modeloId),
        or(isNull(modelos.precoCompraPadrao), lte(modelos.precoCompraPadrao, '0')),
      ))
      .returning({ id: modelos.id })

    gravados += alterados.length
  }

  return gravados
}

/**
 * Preenche a ficha fiscal (NCM, CEST, origem, CST…) dos modelos que ainda não
 * têm, a partir dos itens do XML que acabou de ser importado.
 *
 * É o primeiro passo para emitir nota própria e sair do Bling: a tributação de
 * cada modelo mora hoje lá dentro, alcançada pelo `blingCodigo`, e a fonte para
 * trazê-la é o XML da nota que a fábrica nos emitiu — foi ela quem classificou
 * o produto.
 *
 * Só os campos FISCAIS vêm do XML. O valor não: a nota da fábrica sai com um
 * valor diferente do que se paga a ela, então o preço de compra continua sendo
 * o digitado na tela. Não troque isso por `vUnCom` do XML.
 *
 * Mesma disciplina do preço padrão: a condição de "ainda não tem" vive no WHERE.
 * Ficha já preenchida nunca é sobrescrita por aqui, porque reimportar uma nota
 * antiga não pode desfazer uma correção que o contador fez no cadastro. O NCM é
 * o que marca a ficha como existente — sem ele não se emite nota.
 */
async function cadastrarFichaFiscalFaltante(
  itens: { modeloId: string; nota: string; ficha: FichaFiscal }[],
) {
  const porModelo = fiscaisParaCadastrar(itens)
  const notaPorModelo = new Map(itens.map(i => [i.modeloId, i.nota]))
  let gravados = 0

  for (const [modeloId, ficha] of porModelo) {
    const alterados = await db
      .update(modelos)
      .set({
        ncm: ficha.ncm,
        cest: ficha.cest || null,
        unidade: ficha.unidade || null,
        origem: ficha.origem || null,
        cstIcmsEntrada: ficha.cstIcmsEntrada || null,
        cstPis: ficha.cstPis || null,
        cstCofins: ficha.cstCofins || null,
        classTribIbsCbs: ficha.classTribIbsCbs || null,
        fiscalNota: notaPorModelo.get(modeloId) || null,
        fiscalAtualizadoEm: new Date(),
      })
      .where(and(eq(modelos.id, modeloId), isNull(modelos.ncm)))
      .returning({ id: modelos.id })

    gravados += alterados.length
  }

  return gravados
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

  const cadastrados = inseridos > 0
    ? await cadastrarPrecoPadraoFaltante([{ modeloId: formData.modeloId, preco: precoCompra }])
    : 0

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')
  if (cadastrados > 0) revalidatePath('/admin/modelos')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  const avisoCadastro = cadastrados > 0
    ? `\nPreço padrão cadastrado para ${cadastrados} modelo(s) que ainda não tinha.`
    : ''

  if (erros.length) {
    return { success: `${inseridos} moto(s) inserida(s). Erros:\n${erros.join('\n')}${avisoCadastro}` }
  }

  return { success: `${inseridos} moto(s) inserida(s) com sucesso!${avisoCadastro}` }
}

type MotoEntradaLote = {
  chassi: string
  cor: string
  motor?: string
  modeloId: string
  precoCompra: string
  notaFiscal: string
}

export async function registrarEntradaLote(formData: {
  lojaId: string
  motos: MotoEntradaLote[]
  // Fichas fiscais lidas dos XMLs importados. Opcional: entrada por
  // planilha e entrada manual não têm XML.
  fiscais?: { modeloId: string; nota: string; ficha: FichaFiscal }[]
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
  // cadastro para que um modeloId forjado não crie moto apontando pra lugar nenhum.
  const allModelos = await db
    .select({ id: modelos.id })
    .from(modelos)

  const idsValidos = new Set(allModelos.map(m => m.id))

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
  const entraram: { modeloId: string; preco: string }[] = []

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

    const nf = moto.notaFiscal.trim()

    try {
      const [novaMoto] = await db.insert(motos).values({
        chassi,
        modeloId: moto.modeloId,
        lojaId: loja.id,
        status: 'caixa',
        cor: normalizarCor(moto.cor),
        notaFiscalEntrada: nf,
        motor: moto.motor?.trim() || null,
        precoCompra,
      }).returning({ id: motos.id })

      await db.insert(historicoEstoque).values({
        motoId: novaMoto.id,
        lojaDestinoId: loja.id,
        usuarioId: usuario.id,
        tipo: 'entrada',
        statusNovo: 'caixa',
        observacao: `Entrada NF ${nf}`,
      })

      entraram.push({ modeloId: moto.modeloId, preco: precoCompra })
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

  const cadastrados = await cadastrarPrecoPadraoFaltante(entraram)
  // Só as fichas dos modelos que de fato entraram: item de XML que não virou
  // moto (frete, brinde) não deve mexer no cadastro.
  const idsQueEntraram = new Set(entraram.map(e => e.modeloId))
  const fichasGravadas = await cadastrarFichaFiscalFaltante(
    (formData.fiscais ?? []).filter(f => idsQueEntraram.has(f.modeloId)),
  )

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')
  if (cadastrados > 0 || fichasGravadas > 0) revalidatePath('/admin/modelos')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  const avisoCadastro = (cadastrados > 0
    ? `\nPreço padrão cadastrado para ${cadastrados} modelo(s) que ainda não tinha.`
    : '') + (fichasGravadas > 0
    ? `\nFicha fiscal (NCM, CEST, origem) cadastrada para ${fichasGravadas} modelo(s) que ainda não tinha.`
    : '')

  if (erros.length) {
    return { success: `${inseridos} moto(s) inserida(s). Erros:\n${erros.join('\n')}${avisoCadastro}` }
  }

  return { success: `${inseridos} moto(s) inserida(s) com sucesso!${avisoCadastro}` }
}
