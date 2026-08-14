import { db } from '@/lib/db'
import { hojeBrt } from './data-venda'
import { blingConfig, grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const AUTH_URL   = 'https://www.bling.com.br/Api/v3/oauth/authorize'
const TOKEN_URL  = 'https://www.bling.com.br/Api/v3/oauth/token'
const API_BASE   = 'https://api.bling.com.br/Api/v3'

async function getCredenciaisGrupo(grupoId: string): Promise<{ clientId: string; clientSecret: string }> {
  const [grupo] = await db
    .select({ blingClientId: grupos.blingClientId, blingClientSecret: grupos.blingClientSecret })
    .from(grupos)
    .where(eq(grupos.id, grupoId))
    .limit(1)
  if (!grupo?.blingClientId || !grupo?.blingClientSecret) {
    throw new Error('Client ID/Secret do Bling não configurados para este grupo. Configure em Admin → Grupos.')
  }
  return { clientId: grupo.blingClientId, clientSecret: grupo.blingClientSecret }
}

function basicHeader(clientId: string, clientSecret: string) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export function blingAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  })
  return `${AUTH_URL}?${params}`
}

export async function trocarCodePorTokens(clientId: string, clientSecret: string, redirectUri: string, code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  if (!res.ok) throw new Error(`Bling token error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Bling refresh error: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function salvarTokens(grupoId: string, access: string, refresh: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  await db.insert(blingConfig)
    .values({ grupoId, accessToken: access, refreshToken: refresh, expiresAt, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: blingConfig.grupoId,
      set: { accessToken: access, refreshToken: refresh, expiresAt, atualizadoEm: new Date() },
    })
}

export async function getBlingStatus(grupoId: string) {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.grupoId, grupoId)).limit(1)
  return { conectado: !!cfg?.refreshToken, atualizadoEm: cfg?.atualizadoEm ?? null }
}

async function getToken(grupoId: string): Promise<string> {
  const [cfg] = await db.select().from(blingConfig).where(eq(blingConfig.grupoId, grupoId)).limit(1)
  if (!cfg?.refreshToken) throw new Error('Bling não conectado. Configure em Admin → Bling NF-e.')

  const { clientId, clientSecret } = await getCredenciaisGrupo(grupoId)

  const agora = new Date()
  // Refresh se o access token expirar nos próximos 5 minutos
  if (!cfg.accessToken || !cfg.expiresAt || cfg.expiresAt <= new Date(agora.getTime() + 5 * 60 * 1000)) {
    const tokens = await refreshAccessToken(clientId, clientSecret, cfg.refreshToken)
    await salvarTokens(grupoId, tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return tokens.access_token
  }
  return cfg.accessToken
}

async function blingRequest(grupoId: string, method: string, path: string, body?: unknown) {
  const token = await getToken(grupoId)
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
    try {
      const json = JSON.parse(texto)
      const fields: { msg: string }[] = json?.error?.fields ?? []
      if (fields.length > 0) {
        const msgs = fields.map((f) => f.msg).join('; ')
        const municipioErro = fields.some((f) => /municipio|munic/i.test(f.msg ?? ''))
        if (municipioErro) {
          throw new Error(
            `${msgs}. Para corrigir: edite a venda, ajuste o campo Cidade para o nome exato do município (ex: "Poços de Caldas") e tente novamente. Se persistir, deixe o campo Cidade em branco.`
          )
        }
        throw new Error(msgs)
      }
      if (json?.error?.message) {
        throw new Error(json.error.message)
      }
    } catch (e) {
      if (e instanceof Error && e.message && !e.message.startsWith('Bling API')) throw e
    }
    throw new Error(`Bling API ${method} ${path} → ${res.status}: ${texto}`)
  }
  return res.json()
}

async function buscarVendedorBlingId(grupoId: string, nome: string): Promise<number | null> {
  try {
    const res = await blingRequest(grupoId, 'GET', `/vendedores?nomeContato=${encodeURIComponent(nome)}&limite=10`, undefined)
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
  const dataHoje = hojeBrt() // YYYY-MM-DD
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

export async function criarRascunhoNFe(grupoId: string, dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado. Edite a venda e adicione o CPF antes de emitir a NF-e.')
  }
  const vendedorBlingId = dados.vendedorNome ? await buscarVendedorBlingId(grupoId, dados.vendedorNome) : null
  const payload = montarPayloadNFe(dados, vendedorBlingId)
  const criacao = await blingRequest(grupoId, 'POST', '/nfe', payload)
  const blingId: number = criacao?.data?.id
  if (!blingId) throw new Error('Bling não retornou ID da NF-e criada.')
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function atualizarRascunhoNFe(grupoId: string, blingId: number, dados: DadosNFe): Promise<{ blingId: number; url: string }> {
  if (!dados.clienteCpf?.replace(/\D/g, '')) {
    throw new Error('CPF do cliente não informado.')
  }
  const nfeAtual = await blingRequest(grupoId, 'GET', `/nfe/${blingId}`, undefined)
  const numero: number = nfeAtual?.data?.numero ?? 0

  // PUT /nfe não aceita o campo vendedor — só é definido na criação (POST)
  const payload = { ...montarPayloadNFe(dados, null), numero }
  await blingRequest(grupoId, 'PUT', `/nfe/${blingId}`, payload)
  return {
    blingId,
    url: `https://www.bling.com.br/notas.fiscais.php#edit/${blingId}`,
  }
}

export async function buscarNfeIdPorNumero(grupoId: string, numero: string): Promise<string | null> {
  try {
    const res = await blingRequest(grupoId, 'GET', `/nfe?numero=${encodeURIComponent(numero)}&limite=1`, undefined)
    const item = Array.isArray(res?.data) ? res.data[0] : null
    return item?.id ? String(item.id) : null
  } catch {
    return null
  }
}

export async function buscarLinksDanfe(grupoId: string, blingNfeId: string): Promise<{ linkDanfe: string | null; linkPDF: string | null }> {
  const res = await blingRequest(grupoId, 'GET', `/nfe/${blingNfeId}`, undefined)
  return {
    linkDanfe: res?.data?.linkDanfe ?? null,
    linkPDF:   res?.data?.linkPDF   ?? null,
  }
}

export async function emitirNFe(grupoId: string, dados: DadosNFe): Promise<string> {
  const payload = montarPayloadNFe(dados)
  const criacao = await blingRequest(grupoId, 'POST', '/nfe', payload)
  const nfeId: number = criacao?.data?.id
  if (!nfeId) throw new Error('Bling não retornou ID da NF-e criada.')

  // Transmite a NF-e
  const transmissao = await blingRequest(grupoId, 'POST', `/nfe/${nfeId}/transmitir`, {})

  // Número da NF pode vir na transmissão ou já estava na criação
  const numero: string | number =
    transmissao?.data?.numero ??
    criacao?.data?.numero ??
    nfeId

  return String(numero)
}
