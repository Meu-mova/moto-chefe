'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos, assinaturaCodigos, vendas, lojas, grupos, usuarios } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { buscarVenda } from '@/lib/queries/vendas'
import {
  montarHtmlDocumento, dadosVendedoraCompletos, LABEL_TIPO,
  type TipoDocumento, type DadosDocumento, type PagamentoVenda,
} from '@/lib/assinatura/documento'
import { sha256 } from '@/lib/assinatura/hash'
import { normalizarCelular, emailConvite } from '@/lib/assinatura/mensagens'
import { emailValido, enviarEmail } from '@/lib/email'
import { motivoBloqueioNf } from '@/lib/assinatura/nf'
import { situacaoNfDaVenda } from '@/lib/assinatura/consulta'
import { urlBase } from '@/lib/assinatura/url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const DIAS_VALIDADE = 7
const PAPEIS_ENVIO = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string; url?: string }

export async function baseUrl(): Promise<string> {
  return urlBase()
}

// Escopo de loja — mesmo padrão das páginas de impressão: admin_geral e
// admin_socio enxergam tudo; os demais só a própria loja. Sem isso, um vendedor
// de outra loja listaria o TOKEN dos documentos alheios, e o token é a
// credencial que assina o documento.
async function vendaNoEscopo(vendaId: string): Promise<{ id: string; lojaId: string | null } | null> {
  const usuario = await getUsuarioLogado()
  const [venda] = await db
    .select({ id: vendas.id, lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!venda) return null
  if (['admin_geral', 'admin_socio'].includes(usuario.papel)) return venda
  return venda.lojaId === usuario.lojaId ? venda : null
}

async function registrarEvento(documentoId: string, tipo: string, detalhe?: unknown) {
  await db.insert(assinaturaEventos).values({
    documentoId, tipo, detalhe: detalhe ? (detalhe as object) : null,
  })
}

// Monta o snapshot com tudo que o documento precisa. A vendedora vem do GRUPO
// (cada grupo é uma empresa distinta), não da loja nem de constante no código.
async function montarDados(vendaId: string): Promise<{ dados: DadosDocumento; grupoId: string; lojaId: string | null; celular: string | null; email: string | null } | null> {
  const venda = await buscarVenda(vendaId)
  if (!venda) return null

  const [extra] = await db
    .select({
      celular: vendas.clienteCelular,
      email: vendas.clienteEmail,
      cep: vendas.clienteCep,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos: vendas.pagamentos,
      grupoId: grupos.id,
      razaoSocial: grupos.razaoSocial,
      cnpj: grupos.cnpj,
      enderecoSede: grupos.enderecoSede,
      cidadeSede: grupos.cidadeSede,
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
    email: extra.email,
    dados: {
      vendaId,
      clienteNome: venda.clienteNome ?? '',
      clienteCpf: venda.clienteCpf ?? '',
      clienteEmail: extra.email ?? 'não informado',
      clienteEndereco: endereco,
      vendedoraRazaoSocial: extra.razaoSocial ?? '',
      vendedoraCnpj: extra.cnpj ?? '',
      vendedoraEndereco: extra.enderecoSede ?? '',
      cidadeSede: extra.cidadeSede ?? '',
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
      pagamentos: (extra.pagamentos ?? []) as PagamentoVenda[],
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
export type LiberacaoNf = {
  liberadaEm: string | null
  motivo: string | null
  por: string | null
}

export async function listarDocumentosDaVendaAction(vendaId: string): Promise<{
  documentos: DocumentoResumo[]
  baseUrl: string
  liberacao: LiberacaoNf
}> {
  const vazio = { liberadaEm: null, motivo: null, por: null }
  if (!await vendaNoEscopo(vendaId)) {
    return { baseUrl: await baseUrl(), documentos: [], liberacao: vazio }
  }

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

  // Quem autorizou emitir NF sem assinatura, e por quê. Vai para o painel da
  // venda: o gestor precisa enxergar a exceção onde já está olhando o status,
  // não escondida dentro do dialog de emissão.
  const [lib] = await db
    .select({
      liberadaEm: vendas.nfLiberadaEm,
      motivo: vendas.nfLiberacaoMotivo,
      por: usuarios.nome,
    })
    .from(vendas)
    .leftJoin(usuarios, eq(usuarios.id, vendas.nfLiberadaPor))
    .where(eq(vendas.id, vendaId))
    .limit(1)

  return {
    baseUrl: await baseUrl(),
    liberacao: {
      liberadaEm: lib?.liberadaEm?.toISOString() ?? null,
      motivo: lib?.motivo ?? null,
      por: lib?.por ?? null,
    },
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
  // Moto de outra loja: responde como se não houvesse venda pendente.
  if (!await vendaNoEscopo(venda.id)) return { vendaId: null, bloqueio: null, podeLiberar }

  return {
    vendaId: venda.id,
    bloqueio: motivoBloqueioNf(await situacaoNfDaVenda(venda.id)),
    podeLiberar,
  }
}

/**
 * Cria o documento e devolve o link.
 *
 * `enviarWhatsapp = false` gera o link sem disparar nada — é o caminho para
 * quando o vendedor quer mandar por outro canal, ou entregar presencialmente.
 * O código de 6 dígitos continua indo por WhatsApp quando o cliente abrir o
 * link: o que muda aqui é só a entrega do convite.
 */
export async function enviarDocumentoAssinaturaAction(
  vendaId: string,
  tipo: TipoDocumento,
  // Padrão: cria o documento e manda o convite (com o link) por e-mail para o
  // cliente. Passar false só cria e devolve o link, para o adm copiar e enviar
  // à mão (cliente sem e-mail, e-mail errado, ou outro canal).
  enviarConviteEmail = true,
): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ENVIO.includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão para enviar documento para assinatura' }
  }

  if (!await vendaNoEscopo(vendaId)) return { ok: false, error: 'Venda não encontrada' }

  const montado = await montarDados(vendaId)
  if (!montado) return { ok: false, error: 'Venda não encontrada' }

  // O código de assinatura vai por E-MAIL, então o e-mail é obrigatório aqui.
  // O celular passa a ser opcional (guardado só para registro).
  const email = (montado.email ?? '').trim()
  if (!emailValido(email)) {
    return { ok: false, error: 'O e-mail do cliente está vazio ou inválido no cadastro. O código de assinatura é enviado por e-mail — corrija o cadastro antes de enviar (ou use a via em papel).' }
  }
  const numero = normalizarCelular(montado.celular ?? '')

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
    // Dados estruturados: o checklist é remontado na assinatura com as
    // marcações do comprador, e para isso o HTML em branco não basta.
    dadosJson: montado.dados,
    celularDestino: numero ?? 'não informado',
    emailDestino: email,
    criadoPor: usuario.id,
    expiraEm,
  }).returning({ id: documentosAssinatura.id })

  const url = `${await baseUrl()}/assinar/${token}`

  if (!enviarConviteEmail) {
    await registrarEvento(doc.id, 'enviado', { envio: 'link_manual', numero })
    revalidatePath('/vendas')
    revalidatePath('/estoque')
    return { ok: true, url }
  }

  // Convite por e-mail: leva o cliente ao link para conferir e assinar.
  const convite = emailConvite(montado.dados.clienteNome || 'cliente', LABEL_TIPO[tipo], url, montado.dados.lojaNome || 'MotoChefe')
  const envio = await enviarEmail({ para: email, assunto: convite.assunto, texto: convite.texto, html: convite.html })
  await registrarEvento(doc.id, 'enviado', { envio, canal: 'email' })

  revalidatePath('/vendas')
  revalidatePath('/estoque')

  if (envio !== 'enviado') {
    // O documento existe e o link é válido — só a entrega falhou. Devolver o
    // link é melhor do que perder o documento: o vendedor manda por outro canal.
    return { ok: false, error: 'Documento criado, mas o e-mail do convite falhou. Copie o link e envie ao cliente por outro canal.', url }
  }
  return { ok: true, url }
}

const TAMANHO_MAX_VIA = 10 * 1024 * 1024
const TIPOS_VIA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/**
 * Cliente sem acesso digital: assinou o papel na loja e o vendedor anexa a via
 * digitalizada. O documento entra como assinado, modo 'papel' — daí em diante a
 * trava da NF, os ícones e o dossiê tratam igual ao digital.
 *
 * O anexo é obrigatório: sem a via, a única prova seria a palavra de quem
 * clicou, e aí a trava não valeria nada.
 */
export async function registrarAssinaturaPapelAction(
  vendaId: string,
  tipo: TipoDocumento,
  form: FormData,
): Promise<Resultado> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ENVIO.includes(usuario.papel)) return { ok: false, error: 'Sem permissão' }
  if (!await vendaNoEscopo(vendaId)) return { ok: false, error: 'Venda não encontrada' }

  const arquivo = form.get('via') as File | null
  if (!arquivo || arquivo.size === 0) {
    return { ok: false, error: 'Anexe a foto ou o PDF do documento assinado' }
  }
  if (arquivo.size > TAMANHO_MAX_VIA) {
    return { ok: false, error: 'Arquivo acima de 10 MB. Tire a foto em resolução menor.' }
  }
  if (!TIPOS_VIA.includes(arquivo.type)) {
    return { ok: false, error: 'Envie uma imagem (JPG, PNG, WEBP) ou um PDF' }
  }

  const montado = await montarDados(vendaId)
  if (!montado) return { ok: false, error: 'Venda não encontrada' }
  if (tipo === 'contrato_venda' && !dadosVendedoraCompletos(montado.dados)) {
    return {
      ok: false,
      error: 'Este grupo ainda não tem razão social, endereço da sede, cidade e comarca cadastrados. Preencha em Admin → Grupos.',
    }
  }

  // Documento vivo do mesmo tipo perde a vez: a venda tem uma assinatura só.
  await db.update(documentosAssinatura)
    .set({ status: 'cancelado' })
    .where(and(
      eq(documentosAssinatura.vendaId, vendaId),
      eq(documentosAssinatura.tipo, tipo),
      inArray(documentosAssinatura.status, ['pendente', 'visualizado']),
    ))

  const html = montarHtmlDocumento(tipo, montado.dados)
  const token = randomBytes(32).toString('base64url')
  const agora = new Date()

  const [doc] = await db.insert(documentosAssinatura).values({
    grupoId: montado.grupoId,
    lojaId: montado.lojaId,
    vendaId,
    tipo,
    token,
    status: 'assinado',
    assinaturaModo: 'papel',
    htmlSnapshot: html,
    snapshotHash: sha256(html),
    celularDestino: montado.celular ?? 'não informado',
    emailDestino: montado.email,
    dadosJson: montado.dados,
    criadoPor: usuario.id,
    registradoPor: usuario.id,
    assinadoEm: agora,
    // Expira junto: em papel o link não é usado, mas a coluna é obrigatória.
    expiraEm: agora,
  }).returning({ id: documentosAssinatura.id })

  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const ext = arquivo.type === 'application/pdf' ? 'pdf' : arquivo.type.split('/')[1]
  const caminho = `${montado.grupoId}/${doc.id}/via-assinada.${ext}`

  const storage = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await storage.storage.from('assinaturas')
    .upload(caminho, buffer, { contentType: arquivo.type, upsert: true })
  if (error) {
    // Sem a via anexada o registro não vale — desfaz para não deixar um
    // documento "assinado" sem prova nenhuma por trás.
    await db.delete(documentosAssinatura).where(eq(documentosAssinatura.id, doc.id))
    return { ok: false, error: 'Falha ao enviar o arquivo. Tente novamente.' }
  }

  const viaHash = sha256(buffer)
  await db.update(documentosAssinatura)
    .set({
      viaFisicaPath: caminho,
      viaFisicaHash: viaHash,
      docHash: sha256(`${sha256(html)}:${viaHash}:${usuario.id}:${agora.toISOString()}`),
    })
    .where(eq(documentosAssinatura.id, doc.id))

  await registrarEvento(doc.id, 'assinado_em_papel', {
    registradoPor: usuario.id,
    arquivo: arquivo.name,
    viaHash,
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  return { ok: true }
}

export async function reenviarDocumentoAction(documentoId: string): Promise<Resultado<{ url: string }>> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ENVIO.includes(usuario.papel)) return { ok: false, error: 'Sem permissão' }

  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (!await vendaNoEscopo(doc.vendaId)) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento já assinado' }

  const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86400_000)
  await db.update(documentosAssinatura)
    .set({ status: 'pendente', expiraEm })
    .where(eq(documentosAssinatura.id, documentoId))

  // Reativa e devolve o link para o adm copiar e mandar ao cliente. O código
  // de assinatura em si vai por e-mail quando o cliente abrir o link.
  const url = `${await baseUrl()}/assinar/${doc.token}`
  await registrarEvento(documentoId, 'reenviado', { envio: 'link_manual' })
  revalidatePath('/vendas')
  return { ok: true, url }
}

export async function cancelarDocumentoAction(documentoId: string): Promise<Resultado> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão' }
  }
  const [doc] = await db
    .select({ status: documentosAssinatura.status, vendaId: documentosAssinatura.vendaId })
    .from(documentosAssinatura).where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return { ok: false, error: 'Documento não encontrado' }
  if (!await vendaNoEscopo(doc.vendaId)) return { ok: false, error: 'Documento não encontrado' }
  if (doc.status === 'assinado') return { ok: false, error: 'Documento assinado não pode ser cancelado' }

  await db.update(documentosAssinatura).set({ status: 'cancelado' })
    .where(eq(documentosAssinatura.id, documentoId))
  // Queima os códigos ainda válidos: um código já entregue no WhatsApp não pode
  // continuar valendo depois do cancelamento.
  await db.update(assinaturaCodigos)
    .set({ usadoEm: new Date() })
    .where(and(
      eq(assinaturaCodigos.documentoId, documentoId),
      isNull(assinaturaCodigos.usadoEm),
    ))
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
  if (!await vendaNoEscopo(vendaId)) return { ok: false, error: 'Venda não encontrada' }

  const texto = motivo.trim()
  if (texto.length < 10) return { ok: false, error: 'Descreva o motivo da liberação (mínimo 10 caracteres)' }

  await db.update(vendas)
    .set({ nfLiberadaEm: new Date(), nfLiberadaPor: usuario.id, nfLiberacaoMotivo: texto })
    .where(eq(vendas.id, vendaId))

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  return { ok: true }
}
