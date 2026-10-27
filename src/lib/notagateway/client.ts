import { db } from '@/lib/db'
import { notagatewayConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decifrar } from '@/lib/cripto'
import { ambienteLiberado } from './ambiente'

/**
 * Cliente HTTP da Nota Gateway (API v2). A credencial é do GRUPO, porque o MOVA
 * vai ser vendido para outros lojistas; hoje os nossos grupos usam a chave da
 * mesma conta.
 *
 * A emissão é assíncrona: o POST devolve 200 sem corpo útil e a SEFAZ responde
 * segundos depois, lida pelo GET com o NOSSO id.
 */

const API = 'https://api.notagateway.com.br/v2'

export type ConfigNotaGateway = {
  token: string
  empresaId: string
  ambiente: 'Homologacao' | 'Producao'
}

export async function configNotaGateway(grupoId: string): Promise<ConfigNotaGateway | null> {
  const [cfg] = await db.select().from(notagatewayConfig).where(eq(notagatewayConfig.grupoId, grupoId)).limit(1)
  if (!cfg?.token || !cfg.empresaId) return null
  return {
    token: decifrar(cfg.token).toString('utf8'),
    empresaId: cfg.empresaId,
    ambiente: cfg.ambiente === 'Producao' ? 'Producao' : 'Homologacao',
  }
}

async function chamar(cfg: ConfigNotaGateway, method: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown) {
  if (!ambienteLiberado(cfg.ambiente, process.env.VERCEL_ENV)) {
    throw new Error('Fora da produção, a Nota Gateway só roda em homologação — troque o ambiente do grupo em Admin → Notas fiscais')
  }
  const res = await fetch(`${API}${caminho}`, {
    method,
    headers: {
      Authorization: `Basic ${cfg.token}`,
      Accept: 'application/json',
      // A doc do cancelamento (DELETE) pede Content-Type mesmo sem corpo.
      ...(corpo || method === 'DELETE' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
  })
  const texto = await res.text()
  let json: unknown = null
  try { json = texto ? JSON.parse(texto) : null } catch { /* corpo não-JSON */ }
  return { status: res.status, json, texto }
}

/** A API responde erro de validação como `[{ codigo, mensagem }]`. */
function mensagensDeErro(json: unknown, texto: string): string {
  if (Array.isArray(json)) {
    const msgs = json.map((e: { mensagem?: string }) => e?.mensagem).filter(Boolean)
    if (msgs.length) return msgs.join('; ')
  }
  return texto.slice(0, 300) || 'sem detalhe'
}

/** 4xx: a API recusou e a nota não existe — pode tentar de novo com id novo. */
export class NfeRecusada extends Error {}

export async function enviarNfe(cfg: ConfigNotaGateway, payload: unknown): Promise<void> {
  const r = await chamar(cfg, 'POST', `/empresas/${cfg.empresaId}/nf-e`, payload)
  if (r.status >= 400 && r.status < 500) throw new NfeRecusada(`Nota Gateway recusou a nota: ${mensagensDeErro(r.json, r.texto)}`)
  // 5xx não diz se a nota foi recebida: quem chama mantém "Enviando" e consulta.
  if (r.status >= 500) throw new Error(`Nota Gateway com erro interno (${r.status}): ${mensagensDeErro(r.json, r.texto)}`)
}

/** 4xx no pedido de cancelamento: a API não aceitou. A consulta diz em que pé a nota ficou. */
export class CancelamentoRecusado extends Error {}

/**
 * Pede o cancelamento. Assíncrono como a emissão: 200 só diz que o pedido
 * entrou; Cancelada ou CancelamentoNegado chegam pela consulta. Pode ser
 * reenviado depois de recusa ou timeout (resposta da Nota Gateway, #66).
 */
export async function cancelarNfe(cfg: ConfigNotaGateway, idExterno: string): Promise<void> {
  const r = await chamar(cfg, 'DELETE', `/empresas/${cfg.empresaId}/nf-e/${encodeURIComponent(idExterno)}`)
  if (r.status >= 400 && r.status < 500) throw new CancelamentoRecusado(mensagensDeErro(r.json, r.texto))
  if (r.status >= 500) throw new Error(`Nota Gateway com erro interno (${r.status}): ${mensagensDeErro(r.json, r.texto)}`)
}

export type NfeConsultada = {
  status: string
  motivoStatus: string | null
  statusSefaz: string | null
  numero: string | null
  serie: string | null
  chave: string | null
  protocolo: string | null
  linkDanfe: string | null
  linkXml: string | null
  /** ISO; vazio na nota negada, inclusive depois do cancelamento lógico. */
  dataAutorizacao: string | null
  dataUltimaAlteracao: string | null
}

// A doc traz ISO com Z; formato que não vira data conta como ausente, para não
// derrubar a gravação do resto do retorno.
function dataIso(valor: unknown): string | null {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor)) ? valor : null
}

/**
 * null = a API ainda não conhece esse id (acabou de ser enviado). No modo
 * estrito, só o "não encontrada" da Nota Gateway conta: para descartar uma
 * tentativa (#88), um 404 sem o código não prova que a nota não existe.
 */
export async function consultarNfe(cfg: ConfigNotaGateway, idExterno: string, { estrito = false }: { estrito?: boolean } = {}): Promise<NfeConsultada | null> {
  const r = await chamar(cfg, 'GET', `/empresas/${cfg.empresaId}/nf-e/${encodeURIComponent(idExterno)}`)
  // "Não encontrada" vem como 400 com o código NFe0001, não como 404.
  const naoEncontrada = Array.isArray(r.json) && r.json.some((e: { codigo?: string }) => e?.codigo === 'NFe0001')
  if (naoEncontrada || (r.status === 404 && !estrito)) return null
  if (r.status >= 400) throw new Error(`Falha ao consultar a nota: ${mensagensDeErro(r.json, r.texto)}`)
  const n = r.json as Record<string, any>
  return {
    status: String(n?.status ?? 'Processando'),
    motivoStatus: n?.motivoStatus ?? null,
    statusSefaz: n?.statusSefaz ?? null,
    numero: n?.numero != null ? String(n.numero) : null,
    serie: n?.serie != null ? String(n.serie) : null,
    chave: n?.chaveAcesso ?? null,
    protocolo: n?.protocolo?.numero ?? null,
    linkDanfe: n?.linkDanfe || null,
    linkXml: n?.linkDownloadXml || null,
    dataAutorizacao: dataIso(n?.dataAutorizacao),
    dataUltimaAlteracao: dataIso(n?.dataUltimaAlteracao),
  }
}

/** UF do emitente como a API tem cadastrada — decide operação interna x interestadual. */
export async function ufDaEmpresa(cfg: ConfigNotaGateway): Promise<string> {
  const r = await chamar(cfg, 'GET', `/empresas/${cfg.empresaId}`)
  if (r.status >= 400) throw new Error(`Falha ao ler a empresa na Nota Gateway: ${mensagensDeErro(r.json, r.texto)}`)
  const uf = (r.json as any)?.endereco?.uf
  if (!uf) throw new Error('A empresa na Nota Gateway está sem UF no endereço')
  return String(uf)
}

/** CNPJ da empresa como a NG tem cadastrado (#446). Erro só com o status: a resposta pode trazer o empresaId. */
export async function cnpjDaEmpresaNaNg(cfg: ConfigNotaGateway): Promise<string> {
  const r = await chamar(cfg, 'GET', `/empresas/${encodeURIComponent(cfg.empresaId)}`)
  if (r.status >= 400) throw new Error(`Consultar Empresa respondeu HTTP ${r.status}`)
  const cnpj = (r.json as { cnpj?: unknown } | null)?.cnpj
  if (typeof cnpj !== 'string' || !cnpj) throw new Error('Consultar Empresa sem CNPJ na resposta')
  return cnpj
}

/** 4xx no envio da carta de correção: a API não aceitou e a carta não existe lá. */
export class CartaRecusada extends Error {}

/**
 * Envia a carta de correção (#187). A doc devolve 200 com `{}`: o resultado da
 * SEFAZ chega pela consulta, como na emissão. Quem chama garante que o ambiente
 * do grupo é o da nota.
 */
export async function enviarCartaCorrecao(
  cfg: ConfigNotaGateway,
  carta: { idExterno: string; numero: number; correcao: string; chaveNfe: string },
): Promise<void> {
  const r = await chamar(cfg, 'POST', `/empresas/${cfg.empresaId}/nf-e/cartaCorrecao`, {
    id: carta.idExterno,
    ambienteEmissao: cfg.ambiente,
    numero: carta.numero,
    correcao: carta.correcao,
    nfe: { chaveAcesso: carta.chaveNfe },
  })
  if (r.status >= 400 && r.status < 500) throw new CartaRecusada(mensagensDeErro(r.json, r.texto))
  if (r.status >= 500) throw new Error(`Nota Gateway com erro interno (${r.status}): ${mensagensDeErro(r.json, r.texto)}`)
}

export type CartaConsultada = { status: string; motivoStatus: string | null; protocolo: string | null }

/** null = a API ainda não conhece esse id. */
export async function consultarCartaCorrecao(cfg: ConfigNotaGateway, idExterno: string): Promise<CartaConsultada | null> {
  const r = await chamar(cfg, 'GET', `/empresas/${cfg.empresaId}/nf-e/cartaCorrecao/${encodeURIComponent(idExterno)}`)
  if (r.status === 404) return null
  if (r.status >= 400) throw new Error(`Falha ao consultar a carta de correção: ${mensagensDeErro(r.json, r.texto)}`)
  const c = r.json as Record<string, any>
  return {
    status: String(c?.status ?? 'Processando'),
    motivoStatus: c?.motivoStatus ?? null,
    protocolo: c?.protocoloAutorizacao ?? null,
  }
}

/** XML do evento registrado na SEFAZ; a API não dá link público nem PDF da carta. */
export async function xmlCartaCorrecao(cfg: ConfigNotaGateway, idExterno: string): Promise<string> {
  const r = await chamar(cfg, 'GET', `/empresas/${cfg.empresaId}/nf-e/cartaCorrecao/${encodeURIComponent(idExterno)}/xml`)
  if (r.status >= 400) throw new Error(`Falha ao baixar o XML da carta de correção: ${mensagensDeErro(r.json, r.texto)}`)
  return r.texto
}
