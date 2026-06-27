import { db } from '@/lib/db'
import { blingConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const AUTH_URL   = 'https://www.bling.com.br/OAuth2/Authorization'
const TOKEN_URL  = 'https://www.bling.com.br/OAuth2/token'
const API_BASE   = 'https://api.bling.com.br/Api/v3'

function basicHeader() {
  const id     = process.env.BLING_CLIENT_ID!
  const secret = process.env.BLING_CLIENT_SECRET!
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

export function blingAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.BLING_CLIENT_ID!,
    state,
  })
  return `${AUTH_URL}?${params}`
}

export async function trocarCodePorTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  })
  if (!res.ok) throw new Error(`Bling token error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Bling refresh error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function salvarTokens(access: string, refresh: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  await db.update(blingConfig).set({
    accessToken: access,
    refreshToken: refresh,
    expiresAt,
    atualizadoEm: new Date(),
  }).where(eq(blingConfig.id, 1))
}

export async function getBlingStatus() {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.id, 1)).limit(1)
  return { conectado: !!cfg?.refreshToken, atualizadoEm: cfg?.atualizadoEm ?? null }
}

async function getToken(): Promise<string> {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.id, 1)).limit(1)
  if (!cfg?.refreshToken) throw new Error('Bling não conectado. Configure em Admin → Bling NF-e.')

  const agora = new Date()
  // Refresh se o access token expirar nos próximos 5 minutos
  if (!cfg.accessToken || !cfg.expiresAt || cfg.expiresAt <= new Date(agora.getTime() + 5 * 60 * 1000)) {
    const tokens = await refreshAccessToken(cfg.refreshToken)
    await salvarTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return tokens.access_token
  }
  return cfg.accessToken
}

async function blingRequest(method: string, path: string, body?: unknown) {
  const token = await getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`Bling API ${method} ${path} → ${res.status}: ${texto}`)
  }
  return res.json()
}

export type DadosNFe = {
  clienteNome: string
  clienteCpf: string
  clienteCelular: string | null
  clienteEmail: string | null
  clienteCep: string | null
  clienteLogradouro: string | null
  clienteNumero: string | null
  clienteComplemento: string | null
  clienteBairro: string | null
  clienteCidade: string | null
  clienteEstado: string | null
  valor: string
  pagamentos: { tipo: string; valor: number; parcelas?: number }[]
  blingCodigo: string
  descricaoProduto: string
  chassi: string
}

const tipoLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

export async function emitirNFe(dados: DadosNFe): Promise<string> {
  const dataHoje = new Date().toISOString().slice(0, 10)
  const valorTotal = parseFloat(dados.valor)

  const parcelas = dados.pagamentos.length > 0
    ? dados.pagamentos.map(p => ({
        dias: 0,
        data: dataHoje,
        valor: p.valor,
        observacoes: tipoLabel[p.tipo] ?? p.tipo,
      }))
    : [{ dias: 0, data: dataHoje, valor: valorTotal, observacoes: 'À vista' }]

  const payload = {
    tipo: 1,
    // Natureza de operação configurável via env var; padrão: VENDA
    naturezaOperacao: process.env.BLING_NATUREZA_OPERACAO ?? 'VENDA',
    contato: {
      id: 0,
      nome: dados.clienteNome.toUpperCase(),
      tipoPessoa: 'F',
      cpfCnpj: dados.clienteCpf.replace(/\D/g, ''),
      email: dados.clienteEmail ?? '',
      telefone: (dados.clienteCelular ?? '').replace(/\D/g, ''),
      endereco: {
        geral: {
          logradouro: dados.clienteLogradouro ?? '',
          numero: dados.clienteNumero ?? '',
          complemento: dados.clienteComplemento ?? '',
          bairro: dados.clienteBairro ?? '',
          municipio: dados.clienteCidade ?? '',
          uf: dados.clienteEstado ?? '',
          cep: (dados.clienteCep ?? '').replace(/\D/g, ''),
        },
      },
    },
    itens: [
      {
        codigo: dados.blingCodigo,
        descricao: `${dados.descricaoProduto} - Chassi ${dados.chassi}`,
        quantidade: 1,
        valor: valorTotal,
        tipo: 'P',
        unidade: 'UN',
        pesoBruto: 0,
        pesoLiquido: 0,
      },
    ],
    transporte: {
      transportadora: {},
      tipoFrete: 9,
      volume: { quantidade: 1, especie: 'UN', pesoBruto: 0, pesoLiquido: 0 },
    },
    parcelas,
  }

  const criacao = await blingRequest('POST', '/nfe', payload)
  const nfeId: number = criacao?.data?.id
  if (!nfeId) throw new Error('Bling não retornou ID da NF-e criada.')

  // Transmite a NF-e
  const transmissao = await blingRequest('POST', `/nfe/${nfeId}/transmitir`, {})

  // Número da NF pode vir na transmissão ou já estava na criação
  const numero: string | number =
    transmissao?.data?.numero ??
    criacao?.data?.numero ??
    nfeId

  return String(numero)
}
