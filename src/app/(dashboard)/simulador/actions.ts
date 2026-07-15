'use server'
import { db } from '@/lib/db'
import { simuladorPrecos, lojas, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoIdDaLoja, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { geocodificarCep, calcularDistanciaKm, calcularCustoFrete } from '@/lib/frete'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']
const BLOQUEADOS_FRETE = ['mecanico']

export type ResultadoFrete =
  | { ok: true; distanciaKmIda: number; kmIdaEVolta: number; custo: number; gratis: boolean; endereco: string }
  | { ok: false; motivo: 'cep_invalido' | 'geocodificacao_falhou' }

export async function simularFreteAction(lojaId: string, cepDestino: string): Promise<ResultadoFrete> {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS_FRETE.includes(usuario.papel)) throw new Error('Sem permissão')

  if (ADMINS.includes(usuario.papel)) {
    const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
    if (!lojaIdsGrupo.includes(lojaId)) throw new Error('Sem permissão')
  } else if (lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão')
  }

  const cepLimpo = cepDestino.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return { ok: false, motivo: 'cep_invalido' }

  const [loja] = await db
    .select({ latitude: lojas.latitude, longitude: lojas.longitude })
    .from(lojas)
    .where(eq(lojas.id, lojaId))
    .limit(1)
  if (!loja || loja.latitude === null || loja.longitude === null) {
    return { ok: false, motivo: 'geocodificacao_falhou' }
  }

  const resultadoGeo = await geocodificarCep(cepLimpo)
  if (!resultadoGeo) return { ok: false, motivo: 'geocodificacao_falhou' }

  const distanciaKmIda = calcularDistanciaKm(
    { latitude: Number(loja.latitude), longitude: Number(loja.longitude) },
    resultadoGeo.coordenada,
  )

  const grupoId = await getGrupoIdDaLoja(lojaId)
  const [taxas] = await db
    .select({
      freteValorKm: configuracaoTaxas.freteValorKm,
      freteKmGratis: configuracaoTaxas.freteKmGratis,
      freteValorFixo: configuracaoTaxas.freteValorFixo,
    })
    .from(configuracaoTaxas)
    .where(eq(configuracaoTaxas.grupoId, grupoId))
    .limit(1)
  const valorPorKm = taxas ? Number(taxas.freteValorKm) : 3
  const kmGratis = taxas ? Number(taxas.freteKmGratis) : 40
  const valorFixo = taxas ? Number(taxas.freteValorFixo) : 0

  const { kmIdaEVolta, custo } = calcularCustoFrete(distanciaKmIda, valorPorKm, kmGratis, valorFixo)

  return { ok: true, distanciaKmIda, kmIdaEVolta, custo, gratis: custo === 0, endereco: resultadoGeo.enderecoFormatado }
}

export async function criarSimuladorAction(data: {
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.insert(simuladorPrecos).values({
    nome: data.nome.toUpperCase(),
    precoAvista: data.precoAvista,
    precoPix: data.precoPix,
    taxaCartaoFisico: data.taxaCartaoFisico,
    taxaLinkPagamento: data.taxaLinkPagamento,
  })

  revalidatePath('/simulador')
}

export async function editarSimuladorAction(id: string, data: {
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.update(simuladorPrecos).set({
    nome: data.nome.toUpperCase(),
    precoAvista: data.precoAvista,
    precoPix: data.precoPix,
    taxaCartaoFisico: data.taxaCartaoFisico,
    taxaLinkPagamento: data.taxaLinkPagamento,
  }).where(eq(simuladorPrecos.id, id))

  revalidatePath('/simulador')
}

export async function excluirSimuladorAction(id: string) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.delete(simuladorPrecos).where(eq(simuladorPrecos.id, id))
  revalidatePath('/simulador')
}
