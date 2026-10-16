'use server'
import { headers } from 'next/headers'
import { solicitarCodigo, conferirCodigo, selarAssinatura, type RespostaCodigo, type Contexto } from '@/lib/assinatura/fluxo'
import { repositorioVenda, infraPadrao } from '@/lib/assinatura/repositorio-venda'
import type { RespostasChecklist } from '@/lib/assinatura/documento'

// As regras da assinatura moram em @/lib/assinatura/fluxo; aqui só se liga o
// fluxo aos documentos de venda.

export type { RespostaCodigo }

// IP e user-agent de quem está assinando. Na Vercel o IP real vem no
// x-forwarded-for; o primeiro da lista é o cliente, o resto são proxies.
async function contextoRequisicao(): Promise<Contexto> {
  const h = await headers()
  return {
    ip: (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim(),
    userAgent: h.get('user-agent') ?? '',
  }
}

export async function solicitarCodigoAction(token: string, forcarNovo = false): Promise<RespostaCodigo> {
  return solicitarCodigo(repositorioVenda, infraPadrao, await contextoRequisicao(), token, forcarNovo)
}

export async function conferirCodigoAction(token: string, digitado: string): Promise<{ ok: boolean; error?: string }> {
  return conferirCodigo(repositorioVenda, infraPadrao, await contextoRequisicao(), token, digitado)
}

export async function selarAssinaturaAction(
  token: string,
  selfieDataUrl: string,
  tracoDataUrl: string,
  geo: { lat: number; lon: number; precisao: number } | null,
  respostas?: RespostasChecklist | null,
): Promise<{ ok: boolean; error?: string }> {
  return selarAssinatura(repositorioVenda, infraPadrao, await contextoRequisicao(), token, selfieDataUrl, tracoDataUrl, geo, respostas)
}
