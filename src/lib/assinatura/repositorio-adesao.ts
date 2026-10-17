import { and, count, desc, eq, max, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contratosAdesao, contratosAdesaoCodigos, contratosAdesaoEventos } from '@/lib/db/schema'
import { MAX_CODIGOS } from '@/lib/assinatura/codigo'
import { docHashAdesao, type EvidenciasAdesao } from '@/lib/assinatura/hash'
import { criarInfra } from '@/lib/assinatura/infra'
import { enviarEmail } from '@/lib/email'
import { urlBase } from '@/lib/assinatura/url'
import type { Repositorio, DocumentoAssinavel } from '@/lib/assinatura/fluxo'

// Contrato de adesão ao MOVA (#165): tabelas contratos_adesao*, separadas das da
// venda. Sem checklist: o lojista assina o HTML congelado no envio.

type LinhaContrato = typeof contratosAdesao.$inferSelect
export type DocAdesao = DocumentoAssinavel & { linha: LinhaContrato }

export const repositorioAdesao: Repositorio<DocAdesao, null> = {
  mensagens: {
    linkExpirado: 'Link expirado. Peça um novo à equipe MOVA.',
    linkExpiradoAoSelar: 'Link expirado',
    codigosEsgotados: `Este contrato já enviou ${MAX_CODIGOS} códigos e nenhum funcionou. Fale com a equipe MOVA para receber um link novo.`,
    semEmail: 'Não há e-mail cadastrado para este contrato. Fale com a equipe MOVA.',
    canceladoNoMeio: 'Contrato cancelado pela equipe MOVA',
  },

  async buscar(token) {
    const [linha] = await db.select().from(contratosAdesao).where(eq(contratosAdesao.token, token)).limit(1)
    if (!linha) return null
    return { id: linha.id, status: linha.status, expiraEm: linha.expiraEm, emailDestino: linha.emailDestino, remetente: 'MOVA', linha }
  },

  async historicoEnvios(contratoId) {
    const [linha] = await db
      .select({ enviados: count(), ultimo: max(contratosAdesaoEventos.criadoEm) })
      .from(contratosAdesaoEventos)
      .where(and(
        eq(contratosAdesaoEventos.contratoId, contratoId),
        eq(contratosAdesaoEventos.tipo, 'codigo_enviado'),
        // Só envio que deu certo consome a cota (mesma regra da venda).
        sql`${contratosAdesaoEventos.detalhe}->>'envio' = 'enviado'`,
      ))
    return { enviados: Number(linha?.enviados ?? 0), ultimoEnvioEm: linha?.ultimo ? new Date(linha.ultimo) : null }
  },

  async ultimoCodigo(contratoId) {
    const [c] = await db.select().from(contratosAdesaoCodigos)
      .where(eq(contratosAdesaoCodigos.contratoId, contratoId))
      .orderBy(desc(contratosAdesaoCodigos.criadoEm)).limit(1)
    return c ?? null
  },

  async gravarCodigo(contratoId, codigoHash, expiraEm) {
    await db.insert(contratosAdesaoCodigos).values({ contratoId, codigoHash, expiraEm })
  },

  async registrarTentativa(codigoId, tentativas) {
    await db.update(contratosAdesaoCodigos).set({ tentativas }).where(eq(contratosAdesaoCodigos.id, codigoId))
  },

  async marcarCodigoUsado(codigoId, usadoEm) {
    await db.update(contratosAdesaoCodigos).set({ usadoEm }).where(eq(contratosAdesaoCodigos.id, codigoId))
  },

  async registrarEventos(contratoId, ctx, eventos) {
    await db.insert(contratosAdesaoEventos).values(eventos.map(e => ({
      contratoId, tipo: e.tipo, ip: ctx.ip, userAgent: ctx.userAgent,
      ...(e.detalhe === undefined ? {} : { detalhe: e.detalhe }),
    })))
  },

  htmlFinal(doc) {
    return { ok: true, html: doc.linha.htmlSnapshot }
  },

  pastaArquivos(doc) {
    return `${doc.linha.adesaoId}/${doc.id}`
  },

  async selar(doc, s) {
    const e = s.evidencias
    const evidencias: EvidenciasAdesao = {
      contratoId: e.documentoId,
      adesaoId: doc.linha.adesaoId,
      snapshotHash: e.snapshotHash,
      selfieHash: e.selfieHash,
      assinaturaHash: e.assinaturaHash,
      emailDestino: doc.linha.emailDestino,
      ipAssinatura: e.ipAssinatura,
      userAgent: e.userAgent,
      codigoVerificadoEm: e.codigoVerificadoEm,
      assinadoEm: e.assinadoEm,
    }
    await db.update(contratosAdesao).set({
      status: 'assinado',
      assinadoEm: s.assinadoEm,
      htmlSnapshot: s.html,
      snapshotHash: e.snapshotHash,
      selfiePath: s.selfiePath, selfieHash: e.selfieHash,
      assinaturaPath: s.assinaturaPath, assinaturaHash: e.assinaturaHash,
      ipAssinatura: e.ipAssinatura, userAgent: e.userAgent,
      geoLat: s.geo ? String(s.geo.lat) : null,
      geoLon: s.geo ? String(s.geo.lon) : null,
      geoPrecisao: s.geo ? String(s.geo.precisao) : null,
      evidenciasJson: evidencias,
      docHash: docHashAdesao(evidencias),
    }).where(eq(contratosAdesao.id, doc.id))
  },

  async avisarAssinado(doc, token) {
    const url = `${urlBase()}/assinar/adesao/${token}`
    await enviarEmail({
      para: doc.linha.emailDestino,
      assunto: 'MOVA — contrato de licença assinado',
      texto: `Seu contrato de licença de uso do MOVA foi assinado com sucesso.\n\nGuarde este link — é a sua via do contrato:\n${url}`,
    })
  },
}

export const infraAdesao = criarInfra('contratos-adesao')
