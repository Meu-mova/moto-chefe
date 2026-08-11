'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos, vendas, lojas, grupos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { buscarVenda } from '@/lib/queries/vendas'
import {
  montarHtmlDocumento, dadosVendedoraCompletos, LABEL_TIPO,
  type TipoDocumento, type DadosDocumento,
} from '@/lib/assinatura/documento'
import { sha256 } from '@/lib/assinatura/hash'
import { normalizarCelular, msgConvite } from '@/lib/assinatura/mensagens'
import { enviarWhatsappPara } from '@/lib/whatsapp/client'
import { motivoBloqueioNf } from '@/lib/assinatura/nf'
import { situacaoNfDaVenda } from '@/lib/assinatura/consulta'

const DIAS_VALIDADE = 7
const PAPEIS_ENVIO = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string; url?: string }

export async function baseUrl(): Promise<string> {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    ?? 'https://mova.motochefesuldeminas.com.br'
}

async function registrarEvento(documentoId: string, tipo: string, detalhe?: unknown) {
  await db.insert(assinaturaEventos).values({
    documentoId, tipo, detalhe: detalhe ? (detalhe as object) : null,
  })
}

// Monta o snapshot com tudo que o documento precisa. A vendedora vem do GRUPO
// (cada grupo é uma empresa distinta), não da loja nem de constante no código.
async function montarDados(vendaId: string): Promise<{ dados: DadosDocumento; grupoId: string; lojaId: string | null; celular: string | null } | null> {
  const venda = await buscarVenda(vendaId)
  if (!venda) return null

  const [extra] = await db
    .select({
      celular: vendas.clienteCelular,
      email: vendas.clienteEmail,
      cep: vendas.clienteCep,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      grupoId: grupos.id,
      razaoSocial: grupos.razaoSocial,
      cnpj: grupos.cnpj,
      enderecoSede: grupos.enderecoSede,
      comarcaForo: grupos.comarcaForo,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!extra) return null

  const endereco = [
    venda.clienteLogradouro,
    venda.clienteNumero && `nº ${venda.clienteNumero}`,
    venda.clienteComplemento,
    venda.clienteBairro,
    venda.clienteCidade && venda.clienteEstado
      ? `${venda.clienteCidade}/${venda.clienteEstado}`
      : venda.clienteCidade,
    extra.cep && `CEP ${extra.cep}`,
  ].filter(Boolean).join(', ')

  return {
    grupoId: extra.grupoId,
    lojaId: venda.lojaId ?? null,
    celular: extra.celular,
    dados: {
      vendaId,
      clienteNome: venda.clienteNome ?? '',
      clienteCpf: venda.clienteCpf ?? '',
      clienteEmail: extra.email ?? 'não informado',
      clienteEndereco: endereco,
      vendedoraRazaoSocial: extra.razaoSocial ?? '',
      vendedoraCnpj: extra.cnpj ?? '',
      vendedoraEndereco: extra.enderecoSede ?? '',
      comarcaForo: extra.comarcaForo ?? '',
      lojaNome: venda.lojaNome ?? '',
      lojaCidade: venda.lojaCidade ?? '',
      marca: venda.marca ?? '',
      modelo: venda.modelo ?? '',
      chassi: venda.chassi ?? '',
      cor: venda.cor ?? '',
      motor: venda.motor ?? '',
      valor: Number(extra.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      formaPagamento: extra.formaPagamento ?? '',
      dataVenda: new Date(venda.dataVenda).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    },
  }
}

export type DocumentoResumo = {
  id: string
  tipo: TipoDocumento
  status: string
  token: string
  expiraEm: string
  assinadoEm: string | null
}

// Documentos de uma venda, para o painel de assinatura. Carregado sob demanda
// (ao abrir o dialog), não na listagem — evita uma consulta por linha da tabela.
export async function listarDocumentosDaVendaAction(vendaId: string): Promise<{
  documentos: DocumentoResumo[]
  baseUrl: string
}> {
  await getUsuarioLogado()
  const linhas = await db
    .select({
      id: documentosAssinatura.id,
      tipo: documentosAssinatura.tipo,
      status: documentosAssinatura.status,
      token: documentosAssinatura.token,
      expiraEm: documentosAssinatura.expiraEm,
      assinadoEm: documentosAssinatura.assinadoEm,
    })
    .from(documentosAssinatura)
    .where(eq(documentosAssinatura.vendaId, vendaId))
    .orderBy(desc(documentosAssinatura.criadoEm))

  return {
    baseUrl: await baseUrl(),
    documentos: linhas.map(l => ({
      id: l.id,
      tipo: l.tipo as TipoDocumento,
      status: l.status,
      token: l.token,
      expiraEm: l.expiraEm.toISOString(),
      assinadoEm: l.assinadoEm?.toISOString() ?? null,
    })),
  }
}

// Estado da trava para a tela de NF. Resolvido pelo motoId porque é o que o
// botão de NF conhece — o mesmo caminho que as actions de emissão usam.
export async function verificarBloqueioNfAction(motoId: string): Promise<{
  vendaId: string | null
  bloqueio: string | null
  podeLiberar: boolean
}> {
  const usuario = await getUsuarioLogado()
  const [venda] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  const podeLiberar = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!venda) return { vendaId: null, bloqueio: null, podeLiberar }

  return {
    vendaId: venda.id,
    bloqueio: motivoBloqueioNf(await situacaoNfDaVenda(venda.id)),
    podeLiberar,
  }
}

export async function enviarDocumentoAssinaturaAction(
  vendaId: string,
  tipo: TipoDocumento,
): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ENVIO.includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão para enviar documento para assinatura' }
  }

  const montado = await montarDados(vendaId)
  if (!montado) return { ok: false, error: 'Venda não encontrada' }

  const numero = normalizarCelular(montado.celular ?? '')
  if (!numero) {
    return { ok: false, error: 'O celular do cliente está vazio ou incompleto no cadastro. Corrija o cadastro antes de enviar.' }
  }

  // Contrato exige a qualificação da empresa. Sem ela sairia com o CNPJ errado
  // ou em branco — melhor recusar e mandar cadastrar.
  if (tipo === 'contrato_venda' && !dadosVendedoraCompletos(montado.dados)) {
    return {
      ok: false,
      error: 'Este grupo ainda não tem razão social, endereço da sede e comarca do foro cadastrados. Preencha em Admin → Grupos antes de enviar o contrato.',
    }
  }

  // Um documento vivo por (venda, tipo) — há índice único parcial no banco.
  // Cancela o anterior antes, para reenvio de um tipo não travar.
  await db.update(documentosAssinatura)
    .set({ status: 'cancelado' })
    .where(and(
      eq(documentosAssinatura.vendaId, vendaId),
      eq(documentosAssinatura.tipo, tipo),
      inArray(documentosAssinatura.status, ['pendente', 'visualizado']),
    ))

  const html = montarHtmlDocumento(tipo, montado.dados)
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86400_000)

  const [doc] = await db.insert(documentosAssinatura).values({
    grupoId: montado.grupoId,
    lojaId: montado.lojaId,
    vendaId,
    tipo,
    token,
    status: 'pendente',
    htmlSnapshot: html,
    snapshotHash: sha256(html),
    celularDestino: numero,
    criadoPor: usuario.id,
    expiraEm,
  }).returning({ id: documentosAssinatura.id })

  const url = `${await baseUrl()}/assinar/${token}`
  const envio = await enviarWhatsappPara(numero, msgConvite(montado.dados.clienteNome || 'cliente', LABEL_TIPO[tipo], url))
  await registrarEvento(doc.id, 'enviado', { envio, numero })

  revalidatePath('/vendas')
  revalidatePath('/estoque')

  if (envio !== 'enviado') {
    // O documento existe e o link é válido — só a entrega falhou. Devolver o
    // link é melhor do que perder o documento: o vendedor manda por outro canal.
    return { ok: false, error: 'Documento criado, mas o WhatsApp falhou. Copie o link e envie ao cliente por outro canal.', url }
  }
  return { ok: true, url }
}

export async function reenviarDocumentoAction(documentoId: string): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ENVIO.includes(usuario.papel)) return { ok: false, error: 'Sem permissão' }

  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86400_000)
  await db.update(documentosAssinatura)
    .set({ status: 'pendente', expiraEm })
    .where(eq(documentosAssinatura.id, documentoId))

  const [venda] = await db.select({ nome: vendas.clienteNome }).from(vendas)
    .where(eq(vendas.id, doc.vendaId)).limit(1)

  const url = `${await baseUrl()}/assinar/${doc.token}`
  const envio = await enviarWhatsappPara(
    doc.celularDestino,
    msgConvite(venda?.nome ?? 'cliente', LABEL_TIPO[doc.tipo as TipoDocumento], url),
  )
  await registrarEvento(documentoId, 'reenviado', { envio })
  revalidatePath('/vendas')

  if (envio !== 'enviado') {
    return { ok: false, error: 'O WhatsApp falhou. Copie o link e envie ao cliente por outro canal.', url }
  }
  return { ok: true, url }
}

export async function cancelarDocumentoAction(documentoId: string): Promise<Resultado> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão' }
  }
  const [doc] = await db.select({ status: documentosAssinatura.status })
    .from(documentosAssinatura).where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento assinado não pode ser cancelado' }

  await db.update(documentosAssinatura).set({ status: 'cancelado' })
    .where(eq(documentosAssinatura.id, documentoId))
  await registrarEvento(documentoId, 'cancelado', { por: usuario.id })
  revalidatePath('/vendas')
  return { ok: true }
}

// Válvula de escape da trava de NF: só admin, e o motivo é obrigatório —
// é o que permite auditar depois por que aquela venda saiu sem contrato.
export async function liberarNfSemContratoAction(
  vendaId: string,
  motivo: string,
): Promise<Resultado> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    return { ok: false, error: 'Só administrador libera NF sem contrato assinado' }
  }
  const texto = motivo.trim()
  if (texto.length < 10) return { ok: false, error: 'Descreva o motivo da liberação (mínimo 10 caracteres)' }

  await db.update(vendas)
    .set({ nfLiberadaEm: new Date(), nfLiberadaPor: usuario.id, nfLiberacaoMotivo: texto })
    .where(eq(vendas.id, vendaId))

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  return { ok: true }
}
