import { db } from '@/lib/db'
import { blingConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const AUTH_URL   = 'https://www.bling.com.br/Api/v3/oauth/authorize'
const TOKEN_URL  = 'https://www.bling.com.br/Api/v3/oauth/token'
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
    redirect_uri: process.env.BLING_REDIRECT_URI!,
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
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.BLING_REDIRECT_URI! }),
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

async function buscarVendedorBlingId(nome: string): Promise<number | null> {
  try {
    const res = await blingRequest('GET', `/vendedores?nomeContato=${encodeURIComponent(nome)}&limite=10`, undefined)
    const lista: { id?: number; contato?: { nome?: string } }[] = Array.isArray(res?.data) ? res.data : []
    const normalizar = (s: string) => s.toLowerCase().trim()
    const nomeNorm = normalizar(nome)
    const match = lista.find(v => {
      const blingNome = normalizar(v.contato?.nome ?? '')
      return blingNome === nomeNorm ||
             blingNome.startsWith(nomeNorm + ' ') ||
             nomeNorm.startsWith(blingNome + ' ')
    })
    return match?.id ?? null
  } catch {
    return null
  }
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
  marca: string
  modeloNome: string
  cor: string
  motor: string | null
  tipoMotor: string
  categoria: string
  potencia: string
  vendedorNome: string
}

const tipoLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

function montarPayloadNFe(dados: DadosNFe, vendedorBlingId?: number | null) {
  const dataHoje = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const valorTotal = parseFloat(dados.valor)

  const parcelas = dados.pagamentos.length > 0
    ? dados.pagamentos.map(p => ({
        dias: 0,
        data: dataHoje,
        valor: p.valor,
        observacoes: tipoLabel[p.tipo] ?? p.tipo,
      }))
    : [{ dias: 0, data: dataHoje, valor: valorTotal, observacoes: 'À vista' }]

  const motorDesc = dados.motor || dados.tipoMotor || 'N/I'

  const garantia =
    'GARANTIA DE 90 DIAS CONFORME CDC + 9 MESES PARA MOTOR, BATERIA E MODULO ' +
    '(TOTALIZANDO 1 ANO) MANTENDO AS REVISÕES EM DIA. AS REVISÕES DEVERÃO SER ' +
    'REALIZADAS NO PERÍODO DE 3 MESES OU 2000KM RODADOS. OS DEMAIS COMPONENTES ' +
    'A GARANTIA É DE 90 DIAS CONFORME CDC. Garantia não cobre danos causados por ' +
    'mau uso da parte do cliente.'

  const dadosVeiculo = [
    `Marca: ${dados.marca || 'N/I'}`,
    `Modelo: ${dados.modeloNome || 'N/I'}`,
    `Chassi: ${dados.chassi || 'N/I'}`,
    `Motor: ${motorDesc}`,
    `Categoria: ${dados.categoria || 'N/I'}`,
    `Potência: ${dados.potencia || 'N/I'}`,
    `Cor: ${dados.cor || 'N/I'}`,
  ].join('\n')

  const observacoes = `${garantia}\n\n${dadosVeiculo}`

  return {
    tipo: 1,
    dataOperacao: dataHoje,
    naturezaOperacao: process.env.BLING_NATUREZA_OPERACAO ?? 'VENDA',
    observacoes,
    ...(vendedorBlingId ? { vendedor: { id: vendedorBlingId } } : {}),
    contato: {
      nome: dados.clienteNome.toUpperCase(),
      tipoPessoa: 'F',
      numeroDocumento: dados.clienteCpf.replace(/\D/g, ''),
      email: dados.clienteEmail ?? '',
      telefone: (dados.clienteCelular ?? '').replace(/\D/g, ''),
      endereco: {
        endereco: dados.clienteLogradouro ?? '',
        numero: dados.clienteNumero ?? '',
        complemento: dados.clienteComplemento ?? '',
        bairro: dados.clienteBairro ?? '',
        municipio: dados.clienteCidade ?? '',
        uf: dados.clienteEstado ?? '',
        cep: (dados.clienteCep ?? '').replace(/\D/g, ''),
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
}

export async function criarRascunhoNFe(dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado. Edite a venda e adicione o CPF antes de emitir a NF-e.')
  }
  const vendedorBlingId = dados.vendedorNome ? await buscarVendedorBlingId(dados.vendedorNome) : null
  const payload = montarPayloadNFe(dados, vendedorBlingId)
  const criacao = await blingRequest('POST', '/nfe', payload)
  const blingId: number = criacao?.data?.id
  if (!blingId) throw new Error('Bling não retornou ID da NF-e criada.')
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function atualizarRascunhoNFe(blingId: number, dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado.')
  }
  const nfeAtual = await blingRequest('GET', `/nfe/${blingId}`, undefined)
  const numero: number = nfeAtual?.data?.numero ?? 0

  // PUT /nfe não aceita o campo vendedor — só é definido na criação (POST)
  const payload = { ...montarPayloadNFe(dados, null), numero }
  await blingRequest('PUT', `/nfe/${blingId}`, payload)
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function buscarNfeIdPorNumero(numero: string): Promise<string | null> {
  try {
    const res = await blingRequest('GET', `/nfe?numero=${encodeURIComponent(numero)}&limite=1`, undefined)
    const item = Array.isArray(res?.data) ? res.data[0] : null
    return item?.id ? String(item.id) : null
  } catch {
    return null
  }
}

export async function buscarLinksDanfe(blingNfeId: string): Promise<{ linkDanfe: string | null; linkPDF: string | null }> {
  const res = await blingRequest('GET', `/nfe/${blingNfeId}`, undefined)
  return {
    linkDanfe: res?.data?.linkDanfe ?? null,
    linkPDF:   res?.data?.linkPDF   ?? null,
  }
}

export async function emitirNFe(dados: DadosNFe): Promise<string> {
  const payload = montarPayloadNFe(dados)
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
