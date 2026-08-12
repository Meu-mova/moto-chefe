'use server'

import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaCodigos, assinaturaEventos, vendas } from '@/lib/db/schema'
import { gerarCodigo, hashCodigo, validarCodigo, codigoAindaVale, VALIDADE_MINUTOS } from '@/lib/assinatura/codigo'
import { emailCodigo, msgAssinado } from '@/lib/assinatura/mensagens'
import {
  LABEL_TIPO, montarHtmlDocumento, checklistCompleto,
  type TipoDocumento, type DadosDocumento, type RespostasChecklist,
} from '@/lib/assinatura/documento'
import { docHash, sha256, type Evidencias } from '@/lib/assinatura/hash'
import { enviarEmail } from '@/lib/email'
import { urlBase } from '@/lib/assinatura/url'

type Resposta = { ok: boolean; error?: string }

// IP e user-agent de quem está assinando. Na Vercel o IP real vem no
// x-forwarded-for; o primeiro da lista é o cliente, o resto são proxies.
async function contextoRequisicao() {
  const h = await headers()
  return {
    ip: (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim(),
    userAgent: h.get('user-agent') ?? '',
  }
}

async function docPorToken(token: string) {
  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.token, token)).limit(1)
  return doc ?? null
}

export async function solicitarCodigoAction(token: string, forcarNovo = false): Promise<Resposta> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }
  if (doc.status === 'cancelado') return { ok: false, error: 'Documento cancelado' }
  if (new Date() > doc.expiraEm) return { ok: false, error: 'Link expirado. Peça um novo à loja.' }

  // Já existe código válido? Não gera outro. O cliente PRECISA sair para o
  // e-mail e voltar — e voltar recarrega a página. Gerar um código novo aí
  // invalidaria justamente o que ele acabou de copiar, e o fluxo se sabotava
  // no movimento que ele mesmo obriga a fazer. Só o botão "Reenviar" força.
  if (!forcarNovo) {
    const [vigente] = await db.select().from(assinaturaCodigos)
      .where(eq(assinaturaCodigos.documentoId, doc.id))
      .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
    if (codigoAindaVale(vigente, new Date())) return { ok: true }
  }

  const codigo = gerarCodigo()
  await db.insert(assinaturaCodigos).values({
    documentoId: doc.id,
    codigoHash: hashCodigo(codigo, doc.id),
    expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
  })

  // O código vai por E-MAIL, para a caixa pessoal do cliente — é o que prova
  // que foi ele (e não um atendente) que assinou. O atendente pode ver o link,
  // nunca o código.
  const { assunto, texto, html } = emailCodigo(codigo, (doc.dadosJson as DadosDocumento | null)?.lojaNome || 'MotoChefe')
  const envio = await enviarEmail({ para: doc.emailDestino ?? '', assunto, texto, html })
  const { ip, userAgent } = await contextoRequisicao()
  await db.insert(assinaturaEventos).values({
    documentoId: doc.id, tipo: 'codigo_enviado', ip, userAgent, detalhe: { envio, canal: 'email' },
  })

  // O código NUNCA volta na resposta — nem em erro, nem em log.
  if (envio === 'sem_email') {
    return { ok: false, error: 'Não há e-mail cadastrado para este cliente. A loja precisa completar o e-mail no cadastro da venda.' }
  }
  if (envio !== 'enviado') {
    return { ok: false, error: 'Não conseguimos enviar o código por e-mail agora. Tente novamente em instantes.' }
  }
  return { ok: true }
}

export async function conferirCodigoAction(token: string, digitado: string): Promise<Resposta> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const [codigo] = await db.select().from(assinaturaCodigos)
    .where(eq(assinaturaCodigos.documentoId, doc.id))
    .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
  if (!codigo) return { ok: false, error: 'Peça o código primeiro' }

  const resultado = validarCodigo(
    {
      codigoHash: codigo.codigoHash,
      expiraEm: codigo.expiraEm,
      tentativas: codigo.tentativas,
      usadoEm: codigo.usadoEm,
    },
    digitado.trim(), doc.id, new Date(),
  )

  const { ip, userAgent } = await contextoRequisicao()

  if (resultado !== 'ok') {
    await db.update(assinaturaCodigos)
      .set({ tentativas: codigo.tentativas + 1 })
      .where(eq(assinaturaCodigos.id, codigo.id))
    await db.insert(assinaturaEventos).values({
      documentoId: doc.id, tipo: 'codigo_errado', ip, userAgent, detalhe: { resultado },
    })
    const mensagens: Record<string, string> = {
      incorreto: 'Código incorreto.',
      expirado: 'Código expirado. Peça um novo.',
      usado: 'Este código já foi usado.',
      excedeu: 'Muitas tentativas. Peça um novo código.',
    }
    return { ok: false, error: mensagens[resultado] ?? 'Código inválido' }
  }

  await db.update(assinaturaCodigos).set({ usadoEm: new Date() })
    .where(eq(assinaturaCodigos.id, codigo.id))
  await db.insert(assinaturaEventos).values({ documentoId: doc.id, tipo: 'codigo_ok', ip, userAgent })
  return { ok: true }
}

function bufferDeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl ?? '')
  if (!m) return null
  return { buffer: Buffer.from(m[2], 'base64'), contentType: m[1] }
}

export async function selarAssinaturaAction(
  token: string,
  selfieDataUrl: string,
  tracoDataUrl: string,
  geo: { lat: number; lon: number; precisao: number } | null,
  respostas?: RespostasChecklist | null,
): Promise<Resposta> {
  const doc = await docPorToken(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  // Idempotência: duplo clique não gera segunda assinatura.
  if (doc.status === 'assinado') return { ok: true }
  // Cancelado no meio do caminho: a loja cancela enquanto o cliente está na
  // tela da selfie, com o código já validado. Sem esta checagem ele selaria um
  // documento que a loja já tinha invalidado.
  if (doc.status === 'cancelado') return { ok: false, error: 'Documento cancelado pela loja' }
  if (new Date() > doc.expiraEm) return { ok: false, error: 'Link expirado' }

  // O código precisa ter sido validado antes — selfie sozinha não sela.
  const [codigo] = await db.select().from(assinaturaCodigos)
    .where(eq(assinaturaCodigos.documentoId, doc.id))
    .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
  if (!codigo?.usadoEm) {
    return { ok: false, error: 'Confirme o código enviado no WhatsApp antes de assinar' }
  }

  const selfie = bufferDeDataUrl(selfieDataUrl)
  const traco = bufferDeDataUrl(tracoDataUrl)
  if (!selfie || !traco) return { ok: false, error: 'Imagem inválida' }

  // Checklist: o documento definitivo é remontado AQUI, com as marcações do
  // comprador. É essa versão que ele assina e cujo hash entra nas evidências —
  // o HTML congelado no envio é só o formulário em branco.
  let html = doc.htmlSnapshot
  if (doc.tipo === 'checklist_entrega') {
    if (!checklistCompleto(respostas)) {
      return { ok: false, error: 'Marque OK, NÃO ou NA em todos os itens antes de assinar' }
    }
    const dados = doc.dadosJson as DadosDocumento | null
    if (!dados) {
      return { ok: false, error: 'Este checklist é anterior à conferência por item. Peça um novo à loja.' }
    }
    html = montarHtmlDocumento('checklist_entrega', dados, respostas)
  }
  const snapshotHash = sha256(html)

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const base = `${doc.grupoId}/${doc.id}`
  const selfiePath = `${base}/selfie.jpg`
  const tracoPath = `${base}/assinatura.png`

  const up1 = await admin.storage.from('assinaturas')
    .upload(selfiePath, selfie.buffer, { contentType: selfie.contentType, upsert: true })
  if (up1.error) return { ok: false, error: 'Falha ao enviar a foto. Tente novamente.' }

  const up2 = await admin.storage.from('assinaturas')
    .upload(tracoPath, traco.buffer, { contentType: traco.contentType, upsert: true })
  if (up2.error) return { ok: false, error: 'Falha ao gravar a assinatura. Tente novamente.' }

  const { ip, userAgent } = await contextoRequisicao()
  const assinadoEm = new Date()
  const evidencias: Evidencias = {
    documentoId: doc.id,
    vendaId: doc.vendaId,
    tipo: doc.tipo,
    snapshotHash,
    selfieHash: sha256(selfie.buffer),
    assinaturaHash: sha256(traco.buffer),
    celularDestino: doc.celularDestino,
    ipAssinatura: ip,
    userAgent,
    codigoVerificadoEm: codigo.usadoEm.toISOString(),
    assinadoEm: assinadoEm.toISOString(),
  }

  await db.update(documentosAssinatura).set({
    status: 'assinado',
    assinadoEm,
    // Para o checklist, html/hash mudam aqui: passam a ser a versão preenchida.
    htmlSnapshot: html,
    snapshotHash,
    respostasJson: respostas ?? null,
    selfiePath, selfieHash: evidencias.selfieHash,
    assinaturaPath: tracoPath, assinaturaHash: evidencias.assinaturaHash,
    ipAssinatura: ip, userAgent,
    geoLat: geo ? String(geo.lat) : null,
    geoLon: geo ? String(geo.lon) : null,
    geoPrecisao: geo ? String(geo.precisao) : null,
    evidenciasJson: evidencias,
    docHash: docHash(evidencias),
  }).where(eq(documentosAssinatura.id, doc.id))

  await db.insert(assinaturaEventos).values([
    { documentoId: doc.id, tipo: 'selfie_enviada', ip, userAgent },
    { documentoId: doc.id, tipo: 'assinado', ip, userAgent },
  ])

  // Envio do link final por e-mail: falhar aqui NÃO desfaz a assinatura — ela
  // já está selada. O vendedor reenvia o link depois.
  const [venda] = await db.select({ nome: vendas.clienteNome }).from(vendas)
    .where(eq(vendas.id, doc.vendaId)).limit(1)
  await enviarEmail({
    para: doc.emailDestino ?? '',
    assunto: 'MOVA INFORMA — documento assinado',
    texto: msgAssinado(venda?.nome ?? 'cliente', LABEL_TIPO[doc.tipo as TipoDocumento], `${urlBase()}/assinar/${token}`),
  })

  return { ok: true }
}
