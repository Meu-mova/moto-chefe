import { db } from '@/lib/db'
import { notagatewayConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decifrar } from '@/lib/cripto'

/**
 * Cliente HTTP da Nota Gateway (API v2). A credencial é do GRUPO — cada CNPJ
 * tem a sua, e o MOVA vai ser vendido para outros lojistas.
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

async function chamar(cfg: ConfigNotaGateway, method: 'GET' | 'POST', caminho: string, corpo?: unknown) {
  const res = await fetch(`${API}${caminho}`, {
    method,
    headers: {
      Authorization: `Basic ${cfg.token}`,
      Accept: 'application/json',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
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
}

/** null = a API ainda não conhece esse id (acabou de ser enviado). */
export async function consultarNfe(cfg: ConfigNotaGateway, idExterno: string): Promise<NfeConsultada | null> {
  const r = await chamar(cfg, 'GET', `/empresas/${cfg.empresaId}/nf-e/${encodeURIComponent(idExterno)}`)
  // "Não encontrada" vem como 400 com o código NFe0001, não como 404.
  const naoEncontrada = Array.isArray(r.json) && r.json.some((e: { codigo?: string }) => e?.codigo === 'NFe0001')
  if (r.status === 404 || naoEncontrada) return null
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
