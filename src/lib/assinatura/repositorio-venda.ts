import { and, count, desc, eq, max, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaCodigos, assinaturaEventos, vendas } from '@/lib/db/schema'
import { msgAssinado } from '@/lib/assinatura/mensagens'
import {
  LABEL_TIPO, montarHtmlDocumento, checklistCompleto,
  type TipoDocumento, type DadosDocumento, type RespostasChecklist,
} from '@/lib/assinatura/documento'
import { docHash, type Evidencias } from '@/lib/assinatura/hash'
import { MAX_CODIGOS } from '@/lib/assinatura/codigo'
import { enviarEmail } from '@/lib/email'
import { urlBase } from '@/lib/assinatura/url'
import { criarInfra } from '@/lib/assinatura/infra'
import { nomeRemetenteDoGrupo } from '@/lib/email-remetente-grupo'
import type { Repositorio, DocumentoAssinavel } from '@/lib/assinatura/fluxo'

// Documentos de venda (contrato, checklist, certificado): tabelas
// documentos_assinatura / assinatura_codigos / assinatura_eventos.

type LinhaDoc = typeof documentosAssinatura.$inferSelect
export type DocVenda = DocumentoAssinavel & { linha: LinhaDoc }

export const repositorioVenda: Repositorio<DocVenda, RespostasChecklist> = {
  mensagens: {
    linkExpirado: 'Link expirado. Peça um novo à loja.',
    linkExpiradoAoSelar: 'Link expirado',
    codigosEsgotados: `Este documento já enviou ${MAX_CODIGOS} códigos e nenhum funcionou. Fale com a loja para receber um link novo.`,
    semEmail: 'Não há e-mail cadastrado para este cliente. A loja precisa completar o e-mail no cadastro da venda.',
    canceladoNoMeio: 'Documento cancelado pela loja',
  },

  async buscar(token) {
    const [linha] = await db.select().from(documentosAssinatura)
      .where(eq(documentosAssinatura.token, token)).limit(1)
    if (!linha) return null
    return {
      id: linha.id,
      status: linha.status,
      expiraEm: linha.expiraEm,
      emailDestino: linha.emailDestino,
      remetente: (linha.dadosJson as DadosDocumento | null)?.lojaNome || 'MotoChefe',
      nomeRemetenteEmail: await nomeRemetenteDoGrupo(linha.grupoId),
      linha,
    }
  },

  async historicoEnvios(documentoId) {
    const [linha] = await db
      .select({ enviados: count(), ultimo: max(assinaturaEventos.criadoEm) })
      .from(assinaturaEventos)
      .where(and(
        eq(assinaturaEventos.documentoId, documentoId),
        eq(assinaturaEventos.tipo, 'codigo_enviado'),
        // Só envio que deu certo consome a cota — falha não gastou reputação do
        // domínio nem entregou código nenhum ao cliente.
        sql`${assinaturaEventos.detalhe}->>'envio' = 'enviado'`,
      ))
    return {
      enviados: Number(linha?.enviados ?? 0),
      ultimoEnvioEm: linha?.ultimo ? new Date(linha.ultimo) : null,
    }
  },

  async ultimoCodigo(documentoId) {
    const [c] = await db.select().from(assinaturaCodigos)
      .where(eq(assinaturaCodigos.documentoId, documentoId))
      .orderBy(desc(assinaturaCodigos.criadoEm)).limit(1)
    return c ?? null
  },

  async gravarCodigo(documentoId, codigoHash, expiraEm) {
    await db.insert(assinaturaCodigos).values({ documentoId, codigoHash, expiraEm })
  },

  async registrarTentativa(codigoId, tentativas) {
    await db.update(assinaturaCodigos).set({ tentativas }).where(eq(assinaturaCodigos.id, codigoId))
  },

  async marcarCodigoUsado(codigoId, usadoEm) {
    await db.update(assinaturaCodigos).set({ usadoEm }).where(eq(assinaturaCodigos.id, codigoId))
  },

  async registrarEventos(documentoId, ctx, eventos) {
    await db.insert(assinaturaEventos).values(eventos.map(e => ({
      documentoId, tipo: e.tipo, ip: ctx.ip, userAgent: ctx.userAgent,
      ...(e.detalhe === undefined ? {} : { detalhe: e.detalhe }),
    })))
  },

  // Checklist: o documento definitivo é remontado AQUI, com as marcações do
  // comprador. É essa versão que ele assina e cujo hash entra nas evidências —
  // o HTML congelado no envio é só o formulário em branco.
  htmlFinal(doc, respostas) {
    if (doc.linha.tipo !== 'checklist_entrega') return { ok: true, html: doc.linha.htmlSnapshot }
    if (!checklistCompleto(respostas)) {
      return { ok: false, error: 'Marque OK, NÃO ou NA em todos os itens antes de assinar' }
    }
    const dados = doc.linha.dadosJson as DadosDocumento | null
    if (!dados) {
      return { ok: false, error: 'Este checklist é anterior à conferência por item. Peça um novo à loja.' }
    }
    return { ok: true, html: montarHtmlDocumento('checklist_entrega', dados, respostas) }
  },

  pastaArquivos(doc) {
    return `${doc.linha.grupoId}/${doc.id}`
  },

  async selar(doc, s) {
    const e = s.evidencias
    const evidencias: Evidencias = {
      documentoId: e.documentoId,
      vendaId: doc.linha.vendaId,
      tipo: doc.linha.tipo,
      snapshotHash: e.snapshotHash,
      selfieHash: e.selfieHash,
      assinaturaHash: e.assinaturaHash,
      celularDestino: doc.linha.celularDestino,
      ipAssinatura: e.ipAssinatura,
      userAgent: e.userAgent,
      codigoVerificadoEm: e.codigoVerificadoEm,
      assinadoEm: e.assinadoEm,
    }
    await db.update(documentosAssinatura).set({
      status: 'assinado',
      assinadoEm: s.assinadoEm,
      // Para o checklist, html/hash mudam aqui: passam a ser a versão preenchida.
      htmlSnapshot: s.html,
      snapshotHash: e.snapshotHash,
      respostasJson: s.respostas,
      selfiePath: s.selfiePath, selfieHash: e.selfieHash,
      assinaturaPath: s.assinaturaPath, assinaturaHash: e.assinaturaHash,
      ipAssinatura: e.ipAssinatura, userAgent: e.userAgent,
      geoLat: s.geo ? String(s.geo.lat) : null,
      geoLon: s.geo ? String(s.geo.lon) : null,
      geoPrecisao: s.geo ? String(s.geo.precisao) : null,
      evidenciasJson: evidencias,
      docHash: docHash(evidencias),
    }).where(eq(documentosAssinatura.id, doc.id))
  },

  async avisarAssinado(doc, token) {
    const [venda] = await db.select({ nome: vendas.clienteNome }).from(vendas)
      .where(eq(vendas.id, doc.linha.vendaId)).limit(1)
    await enviarEmail({
      para: doc.emailDestino ?? '',
      nomeRemetente: doc.nomeRemetenteEmail,
      assunto: 'MOVA INFORMA — documento assinado',
      texto: msgAssinado(venda?.nome ?? 'cliente', LABEL_TIPO[doc.linha.tipo as TipoDocumento], `${urlBase()}/assinar/${token}`),
    })
  },
}

export const infraVenda = criarInfra('assinaturas')
