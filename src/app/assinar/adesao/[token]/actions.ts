'use server'
import { headers } from 'next/headers'
import { solicitarCodigo, conferirCodigo, selarAssinatura, type RespostaCodigo, type Contexto, type Geo } from '@/lib/assinatura/fluxo'
import { repositorioAdesao, infraAdesao } from '@/lib/assinatura/repositorio-adesao'
import { ipDoPedido } from '@/lib/ip-do-pedido'

// Mesmo fluxo da venda, ligado às tabelas contratos_adesao*. Sem checklist.

async function contextoRequisicao(): Promise<Contexto> {
  const h = await headers()
  return {
    ip: ipDoPedido(h),
    userAgent: h.get('user-agent') ?? '',
  }
}

export async function solicitarCodigoAdesaoAction(token: string, forcarNovo = false): Promise<RespostaCodigo> {
  return solicitarCodigo(repositorioAdesao, infraAdesao, await contextoRequisicao(), token, forcarNovo)
}

export async function conferirCodigoAdesaoAction(token: string, digitado: string): Promise<{ ok: boolean; error?: string }> {
  return conferirCodigo(repositorioAdesao, infraAdesao, await contextoRequisicao(), token, digitado)
}

export async function selarAssinaturaAdesaoAction(
  token: string,
  selfieDataUrl: string,
  tracoDataUrl: string,
  geo: Geo | null,
): Promise<{ ok: boolean; error?: string }> {
  return selarAssinatura(repositorioAdesao, infraAdesao, await contextoRequisicao(), token, selfieDataUrl, tracoDataUrl, geo, null)
}
