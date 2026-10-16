import {
  gerarCodigo, hashCodigo, validarCodigo, codigoAindaVale, podeEnviarCodigo,
  VALIDADE_MINUTOS, MAX_CODIGOS, COOLDOWN_SEGUNDOS,
  type EstadoCodigo, type HistoricoEnvio,
} from '@/lib/assinatura/codigo'
import { sha256 } from '@/lib/assinatura/hash'
import type { ResultadoEmail } from '@/lib/email'

// Regras da assinatura por link (código por e-mail → selfie → traço), sem saber
// em que tabela o documento mora. A venda e o contrato de adesão (#165) guardam
// seus documentos em tabelas separadas: dado da loja e dado da plataforma não se
// misturam. Cada um entra com o seu Repositorio; as regras ficam num lugar só.

export type DocumentoAssinavel = {
  id: string
  status: string
  expiraEm: Date
  emailDestino: string | null
  /** Nome que vai no e-mail do código ("MotoChefe", nome da loja, "MOVA"). */
  remetente: string
}

export type CodigoGravado = EstadoCodigo & { id: string }

export type Contexto = { ip: string; userAgent: string }

export type EvidenciasBase = {
  documentoId: string
  snapshotHash: string
  selfieHash: string
  assinaturaHash: string
  ipAssinatura: string
  userAgent: string
  codigoVerificadoEm: string
  assinadoEm: string
}

export type Selagem = {
  html: string
  snapshotHash: string
  respostas: unknown
  selfiePath: string
  selfieHash: string
  assinaturaPath: string
  assinaturaHash: string
  ip: string
  userAgent: string
  geo: { lat: number; lon: number; precisao: number } | null
  assinadoEm: Date
  evidenciasBase: EvidenciasBase
}

/** Textos que mudam de quem emite o documento (a loja ou a MOVA). */
export type Mensagens = {
  linkExpirado: string
  codigosEsgotados: string
  semEmail: string
  canceladoNoMeio: string
}

export type Repositorio<D extends DocumentoAssinavel> = {
  mensagens: Mensagens
  buscar(token: string): Promise<D | null>
  historicoEnvios(documentoId: string): Promise<HistoricoEnvio>
  ultimoCodigo(documentoId: string): Promise<CodigoGravado | null>
  gravarCodigo(documentoId: string, codigoHash: string, expiraEm: Date): Promise<void>
  registrarTentativa(codigoId: string, tentativas: number): Promise<void>
  marcarCodigoUsado(codigoId: string, usadoEm: Date): Promise<void>
  registrarEvento(documentoId: string, tipo: string, ctx: Contexto, detalhe?: unknown): Promise<void>
  /**
   * HTML que o signatário assina. Normalmente o congelado no envio; o checklist
   * da venda é remontado com as marcações. Devolve erro para recusar a selagem.
   */
  htmlFinal(doc: D, respostas: unknown): { ok: true; html: string } | { ok: false; error: string }
  /** Pasta no bucket `assinaturas` onde vão selfie e traço. */
  pastaArquivos(doc: D): string
  selar(doc: D, s: Selagem): Promise<void>
  /** E-mail com o link da via assinada. Falhar aqui não desfaz a assinatura. */
  avisarAssinado(doc: D, token: string): Promise<void>
}

export type Infra = {
  enviarEmail(m: { para: string; assunto: string; texto: string; html?: string }): Promise<{ status: ResultadoEmail; id: string | null }>
  emailCodigo(codigo: string, remetente: string): { assunto: string; texto: string; html: string }
  upload(caminho: string, conteudo: Buffer, contentType: string): Promise<{ ok: boolean }>
  agora(): Date
}

type Resposta = { ok: boolean; error?: string }

export type RespostaCodigo = Resposta & {
  enviados?: number
  restantes?: number
  esperarSegundos?: number
}

export async function solicitarCodigo<D extends DocumentoAssinavel>(
  repo: Repositorio<D>, infra: Infra, ctx: Contexto, token: string, forcarNovo = false,
): Promise<RespostaCodigo> {
  const doc = await repo.buscar(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }
  if (doc.status === 'cancelado') return { ok: false, error: 'Documento cancelado' }
  if (infra.agora() > doc.expiraEm) return { ok: false, error: repo.mensagens.linkExpirado }

  // Já existe código válido? Não gera outro. O cliente PRECISA sair para o
  // e-mail e voltar — e voltar recarrega a página. Gerar um código novo aí
  // invalidaria justamente o que ele acabou de copiar, e o fluxo se sabotava
  // no movimento que ele mesmo obriga a fazer. Só o botão "Reenviar" força.
  const historico = await repo.historicoEnvios(doc.id)
  const restantes = Math.max(0, MAX_CODIGOS - historico.enviados)
  if (!forcarNovo) {
    const vigente = await repo.ultimoCodigo(doc.id)
    if (codigoAindaVale(vigente, infra.agora())) {
      return { ok: true, enviados: historico.enviados, restantes }
    }
  }

  // Trava de rajada. Vale para os dois caminhos: a tela recarrega e o botão dá
  // pra burlar, e o que se protege aqui é a reputação do domínio de envio.
  const permissao = podeEnviarCodigo(historico, infra.agora())
  if (!permissao.ok) {
    if (permissao.motivo === 'excedeu') {
      return { ok: false, error: repo.mensagens.codigosEsgotados, enviados: historico.enviados, restantes: 0 }
    }
    return {
      ok: false,
      error: `Aguarde ${permissao.segundos}s para pedir outro código.`,
      enviados: historico.enviados,
      restantes,
      esperarSegundos: permissao.segundos,
    }
  }

  const codigo = gerarCodigo()
  await repo.gravarCodigo(doc.id, hashCodigo(codigo, doc.id), new Date(infra.agora().getTime() + VALIDADE_MINUTOS * 60_000))

  // O código vai por E-MAIL, para a caixa pessoal do signatário — é o que prova
  // que foi ele (e não um atendente) que assinou. O atendente pode ver o link,
  // nunca o código.
  const { assunto, texto, html } = infra.emailCodigo(codigo, doc.remetente)
  const envio = await infra.enviarEmail({ para: doc.emailDestino ?? '', assunto, texto, html })
  await repo.registrarEvento(doc.id, 'codigo_enviado', ctx, { envio: envio.status, canal: 'email', resendId: envio.id })

  // O código NUNCA volta na resposta — nem em erro, nem em log.
  if (envio.status === 'sem_email') return { ok: false, error: repo.mensagens.semEmail }
  if (envio.status !== 'enviado') {
    // Falha de envio não consome a cota, então dá para tentar de novo assim que
    // o cooldown passar.
    return {
      ok: false,
      error: 'Não conseguimos enviar o código por e-mail agora. Tente novamente em instantes.',
      enviados: historico.enviados,
      restantes,
      esperarSegundos: COOLDOWN_SEGUNDOS,
    }
  }
  return { ok: true, enviados: historico.enviados + 1, restantes: restantes - 1, esperarSegundos: COOLDOWN_SEGUNDOS }
}

const MENSAGENS_CODIGO: Record<string, string> = {
  incorreto: 'Código incorreto.',
  expirado: 'Código expirado. Peça um novo.',
  usado: 'Este código já foi usado.',
  excedeu: 'Muitas tentativas. Peça um novo código.',
}

export async function conferirCodigo<D extends DocumentoAssinavel>(
  repo: Repositorio<D>, infra: Infra, ctx: Contexto, token: string, digitado: string,
): Promise<Resposta> {
  const doc = await repo.buscar(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const codigo = await repo.ultimoCodigo(doc.id)
  if (!codigo) return { ok: false, error: 'Peça o código primeiro' }

  const resultado = validarCodigo(codigo, digitado.trim(), doc.id, infra.agora())
  if (resultado !== 'ok') {
    await repo.registrarTentativa(codigo.id, codigo.tentativas + 1)
    await repo.registrarEvento(doc.id, 'codigo_errado', ctx, { resultado })
    return { ok: false, error: MENSAGENS_CODIGO[resultado] ?? 'Código inválido' }
  }

  await repo.marcarCodigoUsado(codigo.id, infra.agora())
  await repo.registrarEvento(doc.id, 'codigo_ok', ctx)
  return { ok: true }
}

function bufferDeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl ?? '')
  if (!m) return null
  return { buffer: Buffer.from(m[2], 'base64'), contentType: m[1] }
}

export async function selarAssinatura<D extends DocumentoAssinavel>(
  repo: Repositorio<D>, infra: Infra, ctx: Contexto, token: string,
  selfieDataUrl: string,
  tracoDataUrl: string,
  geo: { lat: number; lon: number; precisao: number } | null,
  respostas?: unknown,
): Promise<Resposta> {
  const doc = await repo.buscar(token)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  // Idempotência: duplo clique não gera segunda assinatura.
  if (doc.status === 'assinado') return { ok: true }
  // Cancelado no meio do caminho: quem emitiu cancela enquanto o signatário
  // está na tela da selfie, com o código já validado. Sem esta checagem ele
  // selaria um documento já invalidado.
  if (doc.status === 'cancelado') return { ok: false, error: repo.mensagens.canceladoNoMeio }
  if (infra.agora() > doc.expiraEm) return { ok: false, error: 'Link expirado' }

  // O código precisa ter sido validado antes — selfie sozinha não sela.
  const codigo = await repo.ultimoCodigo(doc.id)
  if (!codigo?.usadoEm) {
    return { ok: false, error: 'Confirme o código enviado no WhatsApp antes de assinar' }
  }

  const selfie = bufferDeDataUrl(selfieDataUrl)
  const traco = bufferDeDataUrl(tracoDataUrl)
  if (!selfie || !traco) return { ok: false, error: 'Imagem inválida' }

  const final = repo.htmlFinal(doc, respostas ?? null)
  if (!final.ok) return { ok: false, error: final.error }
  const snapshotHash = sha256(final.html)

  const base = repo.pastaArquivos(doc)
  const selfiePath = `${base}/selfie.jpg`
  const assinaturaPath = `${base}/assinatura.png`
  const up1 = await infra.upload(selfiePath, selfie.buffer, selfie.contentType)
  if (!up1.ok) return { ok: false, error: 'Falha ao enviar a foto. Tente novamente.' }
  const up2 = await infra.upload(assinaturaPath, traco.buffer, traco.contentType)
  if (!up2.ok) return { ok: false, error: 'Falha ao gravar a assinatura. Tente novamente.' }

  const assinadoEm = infra.agora()
  const selfieHash = sha256(selfie.buffer)
  const assinaturaHash = sha256(traco.buffer)
  await repo.selar(doc, {
    html: final.html,
    snapshotHash,
    respostas: respostas ?? null,
    selfiePath, selfieHash,
    assinaturaPath, assinaturaHash,
    ip: ctx.ip, userAgent: ctx.userAgent,
    geo,
    assinadoEm,
    evidenciasBase: {
      documentoId: doc.id,
      snapshotHash,
      selfieHash,
      assinaturaHash,
      ipAssinatura: ctx.ip,
      userAgent: ctx.userAgent,
      codigoVerificadoEm: codigo.usadoEm.toISOString(),
      assinadoEm: assinadoEm.toISOString(),
    },
  })
  await repo.registrarEvento(doc.id, 'selfie_enviada', ctx)
  await repo.registrarEvento(doc.id, 'assinado', ctx)

  await repo.avisarAssinado(doc, token)
  return { ok: true }
}
