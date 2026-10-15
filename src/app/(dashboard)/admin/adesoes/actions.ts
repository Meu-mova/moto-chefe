'use server'
import { db } from '@/lib/db'
import { adesoesMova } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { enviarWhatsappPara } from '@/lib/whatsapp/client'
import { normalizarCelular } from '@/lib/assinatura/mensagens'
import {
  lerDadosContrato, statusDaAdesao, mensagemRecusa,
  type EntradaContrato, type CampoContrato, type StatusAdesao,
} from '@/lib/adesao-contrato'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

/**
 * Esta lista vai para um componente de cliente: tudo o que ela devolve chega ao
 * navegador. Certificado A1, senha do certificado e senha do motochefe.store
 * ficam de fora de propósito (estão cifrados no banco e não são assunto desta tela).
 */
export async function listarAdesoesAction() {
  await assertAdmin()
  return db.select({
    id: adesoesMova.id,
    loja: adesoesMova.loja,
    responsavel: adesoesMova.responsavel,
    celular: adesoesMova.celular,
    usuarios: adesoesMova.usuarios,
    status: adesoesMova.status,
    criadoEm: adesoesMova.criadoEm,
    razaoSocial: adesoesMova.razaoSocial,
    cnpj: adesoesMova.cnpj,
    enderecoSede: adesoesMova.enderecoSede,
    email: adesoesMova.email,
    responsavelCpf: adesoesMova.responsavelCpf,
    valorMensal: adesoesMova.valorMensal,
    diaVencimento: adesoesMova.diaVencimento,
    motivoRecusa: adesoesMova.motivoRecusa,
    recusadaEm: adesoesMova.recusadaEm,
  }).from(adesoesMova).orderBy(desc(adesoesMova.criadoEm))
}

export type AdesaoLinha = Awaited<ReturnType<typeof listarAdesoesAction>>[number]

export async function salvarDadosContratoAction(
  id: string,
  entrada: EntradaContrato,
): Promise<{ ok: true; status: StatusAdesao } | { ok: false; erro?: string; erros?: Partial<Record<CampoContrato, string>> }> {
  const u = await assertAdmin()
  const lido = lerDadosContrato(entrada)
  if (!lido.ok) return { ok: false, erros: lido.erros }

  const [atual] = await db.select({ status: adesoesMova.status }).from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!atual) return { ok: false, erro: 'Adesão não encontrada' }
  if (atual.status === 'recusada') return { ok: false, erro: 'Adesão recusada não pode ser alterada' }

  const status = statusDaAdesao(lido.dados)
  await db.update(adesoesMova)
    .set({ ...lido.dados, status, atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))
  revalidatePath('/admin/adesoes')
  return { ok: true, status }
}

/**
 * A recusa grava mesmo se o WhatsApp falhar: o aviso é efeito colateral, e quem
 * recusou precisa saber que ele não saiu para avisar por outro meio.
 */
export async function recusarAdesaoAction(
  id: string,
  motivo: string,
): Promise<{ ok: true; whatsapp: 'enviado' | 'sem_numero' | 'erro' } | { ok: false; erro: string }> {
  const u = await assertAdmin()
  const m = motivo.trim()
  if (m.length < 3) return { ok: false, erro: 'Informe o motivo da recusa' }

  const [atual] = await db.select({ status: adesoesMova.status, loja: adesoesMova.loja, celular: adesoesMova.celular })
    .from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!atual) return { ok: false, erro: 'Adesão não encontrada' }
  if (atual.status === 'recusada') return { ok: false, erro: 'Adesão já recusada' }

  await db.update(adesoesMova)
    .set({ status: 'recusada', motivoRecusa: m, recusadaEm: new Date(), atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))

  const whatsapp = await enviarWhatsappPara(normalizarCelular(atual.celular) ?? '', mensagemRecusa(atual.loja, m))
  if (whatsapp !== 'enviado') console.error('recusarAdesaoAction: aviso de recusa não saiu', { id, whatsapp })

  revalidatePath('/admin/adesoes')
  return { ok: true, whatsapp }
}

/** Link temporário (10 min) para o cartão CNPJ no bucket privado `adesoes`. */
export async function linkCartaoCnpjAction(id: string): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await assertAdmin()
  const [a] = await db.select({ caminho: adesoesMova.cnpjArquivoPath }).from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await admin.storage.from('adesoes').createSignedUrl(a.caminho, 600)
  if (error || !data) return { ok: false, erro: 'Não deu para abrir o arquivo agora' }
  return { ok: true, url: data.signedUrl }
}
