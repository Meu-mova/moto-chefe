'use server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { adesoesMova, contratosAdesao, contratosAdesaoEventos } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import {
  lerDadosContrato, statusDaAdesao, type EntradaContrato,
} from '@/lib/adesao-contrato'
import type { CampoContrato, StatusAdesao } from '@/lib/adesao-campos'
import {
  montarContratoAdesao, motivoBloqueioEnvio, TERMOS_CONFIRMADOS, DIAS_VALIDADE_CONTRATO,
  type DadosContratoAdesao,
} from '@/lib/assinatura/contrato-adesao'
import { sha256 } from '@/lib/assinatura/hash'
import { emailConvite } from '@/lib/assinatura/mensagens'
import { urlBase } from '@/lib/assinatura/url'
import { enviarEmail } from '@/lib/email'

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
  const linhas = await db.select({
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
    taxaImplantacao: adesoesMova.taxaImplantacao,
    franqueadoMotochefe: adesoesMova.franqueadoMotochefe,
    motivoRecusa: adesoesMova.motivoRecusa,
    recusadaEm: adesoesMova.recusadaEm,
    avisoRecusa: adesoesMova.avisoRecusa,
  }).from(adesoesMova).orderBy(desc(adesoesMova.criadoEm))

  // Só o contrato mais recente de cada adesão importa para a lista. Token e HTML
  // ficam de fora: esta lista vai para o navegador.
  const contratos = await db.selectDistinctOn([contratosAdesao.adesaoId], {
    adesaoId: contratosAdesao.adesaoId,
    status: contratosAdesao.status,
    expiraEm: contratosAdesao.expiraEm,
    criadoEm: contratosAdesao.criadoEm,
    assinadoEm: contratosAdesao.assinadoEm,
  }).from(contratosAdesao).orderBy(contratosAdesao.adesaoId, desc(contratosAdesao.criadoEm))
  const porAdesao = new Map(contratos.map(c => [c.adesaoId, c]))
  return linhas.map(a => ({ ...a, contrato: porAdesao.get(a.id) ?? null }))
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
  if (atual.status === 'recusada' || atual.status === 'processada') return { ok: false, erro: 'Adesão recusada ou processada não pode ser alterada' }

  const status = statusDaAdesao(lido.dados)
  await db.update(adesoesMova)
    .set({ ...lido.dados, status, atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))
  revalidatePath('/admin/adesoes')
  return { ok: true, status }
}

// O aviso ao lojista é manual por enquanto (decisão de 16/10/2026, #165): a
// tela lembra quem recusou de avisar. Envio automático fica para depois.
export async function recusarAdesaoAction(
  id: string,
  motivo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const u = await assertAdmin()
  const m = motivo.trim()
  if (m.length < 3) return { ok: false, erro: 'Informe o motivo da recusa' }

  const [atual] = await db.select({ status: adesoesMova.status })
    .from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!atual) return { ok: false, erro: 'Adesão não encontrada' }
  if (atual.status === 'recusada' || atual.status === 'processada') return { ok: false, erro: 'Adesão já recusada ou processada' }

  await db.update(adesoesMova)
    .set({ status: 'recusada', motivoRecusa: m, recusadaEm: new Date(), atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))
  revalidatePath('/admin/adesoes')
  return { ok: true }
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

/**
 * Congela o contrato com os dados salvos e manda o convite por e-mail ao lojista.
 * Reenviar cancela o link anterior (há um contrato vivo por adesão no banco).
 */
export async function enviarContratoAction(id: string): Promise<{ ok: true } | { ok: false; erro: string; url?: string }> {
  const u = await assertAdmin()
  const [a] = await db.select().from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }

  const dados: DadosContratoAdesao = {
    razaoSocial: a.razaoSocial,
    cnpj: a.cnpj,
    enderecoSede: a.enderecoSede,
    email: a.email,
    responsavelNome: a.responsavel,
    responsavelCpf: a.responsavelCpf,
    taxaImplantacao: a.taxaImplantacao,
    valorMensal: a.valorMensal,
  }
  const [assinado] = await db.select({ id: contratosAdesao.id }).from(contratosAdesao)
    .where(and(eq(contratosAdesao.adesaoId, id), eq(contratosAdesao.status, 'assinado'))).limit(1)
  const bloqueio = motivoBloqueioEnvio({
    statusAdesao: a.status,
    dados,
    jaAssinado: !!assinado,
    producao: process.env.VERCEL_ENV === 'production',
    termosConfirmados: TERMOS_CONFIRMADOS,
  })
  if (bloqueio) return { ok: false, erro: bloqueio }

  const html = montarContratoAdesao(dados)
  const token = randomBytes(32).toString('base64url')
  const email = a.email!

  const criado = await db.transaction(async tx => {
    const cancelados = await tx.update(contratosAdesao).set({ status: 'cancelado' })
      .where(and(eq(contratosAdesao.adesaoId, id), inArray(contratosAdesao.status, ['pendente', 'visualizado'])))
      .returning({ id: contratosAdesao.id })
    if (cancelados.length) {
      await tx.insert(contratosAdesaoEventos).values(cancelados.map(c => ({ contratoId: c.id, tipo: 'cancelado', detalhe: { motivo: 'reenvio', por: u.id } })))
    }
    const [novo] = await tx.insert(contratosAdesao).values({
      adesaoId: id,
      token,
      htmlSnapshot: html,
      snapshotHash: sha256(html),
      emailDestino: email,
      criadoPor: u.id,
      expiraEm: new Date(Date.now() + DIAS_VALIDADE_CONTRATO * 86400_000),
    }).returning({ id: contratosAdesao.id })
    return { id: novo.id, reenvio: cancelados.length > 0 }
  })

  const url = `${urlBase()}/assinar/adesao/${token}`
  const convite = emailConvite(a.responsavel, 'Contrato de licença de uso do MOVA', url, 'Equipe MOVA')
  const envio = await enviarEmail({ para: email, assunto: convite.assunto, texto: convite.texto, html: convite.html })
  await db.insert(contratosAdesaoEventos).values({
    contratoId: criado.id,
    tipo: criado.reenvio ? 'reenviado' : 'enviado',
    detalhe: { envio: envio.status, canal: 'email', resendId: envio.id },
  })
  revalidatePath('/admin/adesoes')

  // O contrato existe e o link vale: só a entrega falhou. O link volta para a
  // equipe mandar por outro canal.
  if (envio.status !== 'enviado') return { ok: false, erro: 'Contrato criado, mas o e-mail falhou. Copie o link e envie por outro canal.', url }
  return { ok: true }
}
