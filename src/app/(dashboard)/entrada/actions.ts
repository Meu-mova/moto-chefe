'use server'

import { db } from '@/lib/db'
import { motos, lojas, historicoEstoque, modelos, motosFiscal } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { normalizarCor } from '@/lib/cores-moto'
import { type FichaFiscal, type EmitenteNfe } from '@/lib/nfe-fiscal'

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
async function gravarFichaFiscalDasMotos(
  fichas: { motoId: string; emitente: EmitenteNfe; ficha: FichaFiscal }[],
) {
  if (!fichas.length) return 0

  const gravadas = await db
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
    })))
    .onConflictDoNothing()
    .returning({ motoId: motosFiscal.motoId })

  return gravadas.length
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

      idPorChassi.set(chassi, novaMoto.id)
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
    (formData.fiscais ?? [])
      .map(f => ({ ...f, motoId: idPorChassi.get(f.chassi.trim().toUpperCase()) }))
      .filter((f): f is typeof f & { motoId: string } => !!f.motoId),
  )

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
