'use server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { adesoesMova, contratosAdesao, contratosAdesaoEventos, grupos } from '@/lib/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import {
  lerDadosContrato, statusDaAdesao, type EntradaContrato,
} from '@/lib/adesao-contrato'
import type { CampoContrato, StatusAdesao } from '@/lib/adesao-campos'
import {
  montarContratoAdesao, motivoBloqueioEnvio, TERMOS_CONFIRMADOS, DIAS_VALIDADE_CONTRATO,
  type DadosContratoAdesao,
} from '@/lib/assinatura/contrato-adesao'
import { sha256 } from '@/lib/assinatura/hash'
import { emailConvite } from '@/lib/assinatura/mensagens'
import { urlBase } from '@/lib/assinatura/url'
import { enviarEmail } from '@/lib/email'
import { avisoCnpjDoGrupo, motivoBloqueioVinculo } from '@/lib/adesao-grupo'
import { colunasSede } from '@/lib/sede-colunas'
import { aplicarCertificadoDaAdesao, aplicarPortalDaAdesao, criarLojaDaAdesao, dadosDaAtivacao } from '@/lib/ativacao-cliente'
import { criarUsuariosDaAdesao } from '@/lib/ativacao-usuarios'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

/**
 * Esta lista vai para um componente de cliente: tudo o que ela devolve chega ao
 * navegador. Certificado A1, senha do certificado e senha do motochefe.store
 * ficam de fora de propósito (estão cifrados no banco e não são assunto desta tela).
 */
export async function listarAdesoesAction() {
  await assertAdmin()
  const linhas = await db.select({
    id: adesoesMova.id,
    loja: adesoesMova.loja,
    responsavel: adesoesMova.responsavel,
    celular: adesoesMova.celular,
    usuarios: adesoesMova.usuarios,
    status: adesoesMova.status,
    criadoEm: adesoesMova.criadoEm,
    razaoSocial: adesoesMova.razaoSocial,
    cnpj: adesoesMova.cnpj,
    enderecoSede: adesoesMova.enderecoSede,
    sede: colunasSede,
    email: adesoesMova.email,
    responsavelCpf: adesoesMova.responsavelCpf,
    valorMensal: adesoesMova.valorMensal,
    taxaImplantacao: adesoesMova.taxaImplantacao,
    franqueadoMotochefe: adesoesMova.franqueadoMotochefe,
    motivoRecusa: adesoesMova.motivoRecusa,
    recusadaEm: adesoesMova.recusadaEm,
    avisoRecusa: adesoesMova.avisoRecusa,
    grupoId: adesoesMova.grupoId,
  }).from(adesoesMova).orderBy(desc(adesoesMova.criadoEm))

  // Só o contrato mais recente de cada adesão importa para a lista. Token e HTML
  // ficam de fora: esta lista vai para o navegador.
  const contratos = await db.selectDistinctOn([contratosAdesao.adesaoId], {
    id: contratosAdesao.id,
    adesaoId: contratosAdesao.adesaoId,
    status: contratosAdesao.status,
    expiraEm: contratosAdesao.expiraEm,
    criadoEm: contratosAdesao.criadoEm,
    assinadoEm: contratosAdesao.assinadoEm,
  }).from(contratosAdesao).orderBy(contratosAdesao.adesaoId, desc(contratosAdesao.criadoEm))
  // Resultado do último convite de cada contrato: e-mail que falhou não pode
  // aparecer como "Contrato enviado" (#183).
  const ids = contratos.map(c => c.id)
  const envios = ids.length === 0 ? [] : await db.selectDistinctOn([contratosAdesaoEventos.contratoId], {
    contratoId: contratosAdesaoEventos.contratoId,
    envio: sql<string | null>`${contratosAdesaoEventos.detalhe}->>'envio'`,
  }).from(contratosAdesaoEventos)
    .where(and(inArray(contratosAdesaoEventos.contratoId, ids), inArray(contratosAdesaoEventos.tipo, ['enviado', 'reenviado'])))
    .orderBy(contratosAdesaoEventos.contratoId, desc(contratosAdesaoEventos.criadoEm))
  const envioPorContrato = new Map(envios.map(e => [e.contratoId, e.envio]))
  const porAdesao = new Map(contratos.map(c => [c.adesaoId, { ...c, ultimoEnvio: envioPorContrato.get(c.id) ?? null }]))
  return linhas.map(a => ({ ...a, contrato: porAdesao.get(a.id) ?? null }))
}

export type AdesaoLinha = Awaited<ReturnType<typeof listarAdesoesAction>>[number]

export async function salvarDadosContratoAction(
  id: string,
  entrada: EntradaContrato,
): Promise<{ ok: true; status: StatusAdesao } | { ok: false; erro?: string; erros?: Partial<Record<CampoContrato, string>> }> {
  const u = await assertAdmin()
  const lido = lerDadosContrato(entrada)
  if (!lido.ok) return { ok: false, erros: lido.erros }

  const [atual] = await db.select({ status: adesoesMova.status }).from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!atual) return { ok: false, erro: 'Adesão não encontrada' }
  if (atual.status === 'recusada' || atual.status === 'processada') return { ok: false, erro: 'Adesão recusada ou processada não pode ser alterada' }

  const status = statusDaAdesao(lido.dados)
  const { sede, ...dados } = lido.dados
  await db.update(adesoesMova)
    .set({ ...dados, ...sede, status, atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))
  revalidatePath('/admin/adesoes')
  return { ok: true, status }
}

// O aviso ao lojista é manual por enquanto (decisão de 16/10/2026, #165): a
// tela lembra quem recusou de avisar. Envio automático fica para depois.
export async function recusarAdesaoAction(
  id: string,
  motivo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const u = await assertAdmin()
  const m = motivo.trim()
  if (m.length < 3) return { ok: false, erro: 'Informe o motivo da recusa' }

  const [atual] = await db.select({ status: adesoesMova.status })
    .from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!atual) return { ok: false, erro: 'Adesão não encontrada' }
  if (atual.status === 'recusada' || atual.status === 'processada') return { ok: false, erro: 'Adesão já recusada ou processada' }

  await db.update(adesoesMova)
    .set({ status: 'recusada', motivoRecusa: m, recusadaEm: new Date(), atualizadoPor: u.id, atualizadoEm: new Date() })
    .where(eq(adesoesMova.id, id))
  revalidatePath('/admin/adesoes')
  return { ok: true }
}

/** Link temporário (10 min) para o cartão CNPJ no bucket privado `adesoes`. */
export async function linkCartaoCnpjAction(id: string): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await assertAdmin()
  const [a] = await db.select({ caminho: adesoesMova.cnpjArquivoPath }).from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await admin.storage.from('adesoes').createSignedUrl(a.caminho, 600)
  if (error || !data) return { ok: false, erro: 'Não deu para abrir o arquivo agora' }
  return { ok: true, url: data.signedUrl }
}

/**
 * Congela o contrato com os dados salvos e manda o convite por e-mail ao lojista.
 * Reenviar cancela o link anterior (há um contrato vivo por adesão no banco).
 */
export async function enviarContratoAction(id: string): Promise<{ ok: true } | { ok: false; erro: string; url?: string }> {
  const u = await assertAdmin()
  const [a] = await db.select().from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }

  const dados: DadosContratoAdesao = {
    razaoSocial: a.razaoSocial,
    cnpj: a.cnpj,
    enderecoSede: a.enderecoSede,
    email: a.email,
    responsavelNome: a.responsavel,
    responsavelCpf: a.responsavelCpf,
    taxaImplantacao: a.taxaImplantacao,
    valorMensal: a.valorMensal,
  }
  const [assinado] = await db.select({ id: contratosAdesao.id }).from(contratosAdesao)
    .where(and(eq(contratosAdesao.adesaoId, id), eq(contratosAdesao.status, 'assinado'))).limit(1)
  const bloqueio = motivoBloqueioEnvio({
    statusAdesao: a.status,
    dados,
    jaAssinado: !!assinado,
    producao: process.env.VERCEL_ENV === 'production',
    termosConfirmados: TERMOS_CONFIRMADOS,
  })
  if (bloqueio) return { ok: false, erro: bloqueio }

  const html = montarContratoAdesao(dados)
  const token = randomBytes(32).toString('base64url')
  const email = a.email!

  const criado = await db.transaction(async tx => {
    const cancelados = await tx.update(contratosAdesao).set({ status: 'cancelado' })
      .where(and(eq(contratosAdesao.adesaoId, id), inArray(contratosAdesao.status, ['pendente', 'visualizado'])))
      .returning({ id: contratosAdesao.id })
    if (cancelados.length) {
      await tx.insert(contratosAdesaoEventos).values(cancelados.map(c => ({ contratoId: c.id, tipo: 'cancelado', detalhe: { motivo: 'reenvio', por: u.id } })))
    }
    const [novo] = await tx.insert(contratosAdesao).values({
      adesaoId: id,
      token,
      htmlSnapshot: html,
      snapshotHash: sha256(html),
      emailDestino: email,
      criadoPor: u.id,
      expiraEm: new Date(Date.now() + DIAS_VALIDADE_CONTRATO * 86400_000),
    }).returning({ id: contratosAdesao.id })
    return { id: novo.id, reenvio: cancelados.length > 0 }
  })

  const url = `${urlBase()}/assinar/adesao/${token}`
  const convite = emailConvite(a.responsavel, 'Contrato de licença de uso do MOVA', url, 'Equipe MOVA')
  const envio = await enviarEmail({ para: email, assunto: convite.assunto, texto: convite.texto, html: convite.html })
  await db.insert(contratosAdesaoEventos).values({
    contratoId: criado.id,
    tipo: criado.reenvio ? 'reenviado' : 'enviado',
    detalhe: { envio: envio.status, canal: 'email', resendId: envio.id },
  })
  revalidatePath('/admin/adesoes')

  // O contrato existe e o link vale: só a entrega falhou. O link volta para a
  // equipe mandar por outro canal.
  if (envio.status !== 'enviado') return { ok: false, erro: 'Contrato criado, mas o e-mail falhou. Copie o link e envie por outro canal.', url }
  return { ok: true }
}

export async function listarGruposAction() {
  await assertAdmin()
  return db.select({ id: grupos.id, nome: grupos.nome, cnpj: grupos.cnpj, ativo: grupos.ativo }).from(grupos).orderBy(grupos.nome)
}

export type GrupoOpcao = Awaited<ReturnType<typeof listarGruposAction>>[number]

/** Liga a adesão ao grupo que ela gerou (ou desliga, com null). CNPJ diferente só avisa. */
export async function vincularGrupoAction(
  id: string,
  grupoId: string | null,
): Promise<{ ok: true; aviso: string | null } | { ok: false; erro: string }> {
  const u = await assertAdmin()
  const [a] = await db.select({ cnpj: adesoesMova.cnpj, status: adesoesMova.status }).from(adesoesMova).where(eq(adesoesMova.id, id))
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  const [assinado] = await db.select({ id: contratosAdesao.id }).from(contratosAdesao)
    .where(and(eq(contratosAdesao.adesaoId, id), eq(contratosAdesao.status, 'assinado'))).limit(1)
  const bloqueio = motivoBloqueioVinculo({ grupoId, statusAdesao: a.status, contratoAssinado: !!assinado })
  if (bloqueio) return { ok: false, erro: bloqueio }

  let aviso: string | null = null
  if (grupoId) {
    const [g] = await db.select({ cnpj: grupos.cnpj, ativo: grupos.ativo }).from(grupos).where(eq(grupos.id, grupoId))
    if (!g) return { ok: false, erro: 'Grupo não encontrado' }
    if (!g.ativo) return { ok: false, erro: 'Grupo inativo não gera mensalidade' }
    const [adesaoJaLigada] = await db.select({ loja: adesoesMova.loja }).from(adesoesMova)
      .where(and(eq(adesoesMova.grupoId, grupoId), sql`${adesoesMova.id} <> ${id}`)).limit(1)
    if (adesaoJaLigada) return { ok: false, erro: `Este grupo já está ligado à adesão de ${adesaoJaLigada.loja}` }
    aviso = avisoCnpjDoGrupo(a.cnpj, g.cnpj)
  }

  try {
    await db.update(adesoesMova)
      .set({ grupoId, atualizadoPor: u.id, atualizadoEm: new Date() })
      .where(eq(adesoesMova.id, id))
  } catch (e) {
    // Duas gravações ao mesmo tempo: a checagem acima passou nas duas, e o índice único
    // da 0127 barrou a segunda. A mensagem é a mesma da checagem.
    const codigo = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code
    if (codigo === '23505') return { ok: false, erro: 'Este grupo já está ligado a outra adesão' }
    throw e
  }
  revalidatePath('/admin/adesoes')
  return { ok: true, aviso }
}

// ─── Ativar cliente (#292) ───────────────────────────────────────────────────
// Só com contrato assinado e grupo vinculado. Os segredos são lidos e gravados
// no servidor; nenhuma destas actions devolve senha ou certificado.

async function contratoAssinado(adesaoId: string) {
  const [c] = await db.select({ id: contratosAdesao.id }).from(contratosAdesao)
    .where(and(eq(contratosAdesao.adesaoId, adesaoId), eq(contratosAdesao.status, 'assinado'))).limit(1)
  return !!c
}

export async function dadosAtivacaoAction(adesaoId: string) {
  await assertAdmin()
  if (!(await contratoAssinado(adesaoId))) return null
  return dadosDaAtivacao(adesaoId)
}

export async function aplicarCertificadoAction(adesaoId: string, uf: string) {
  const u = await assertAdmin()
  if (!(await contratoAssinado(adesaoId))) return { ok: false as const, erro: 'O contrato desta adesão ainda não foi assinado' }
  const r = await aplicarCertificadoDaAdesao({ adesaoId, uf, usuarioId: u.id })
  if (r.ok) { revalidatePath('/admin/adesoes'); revalidatePath('/admin/certificados') }
  return r
}

export async function aplicarPortalAction(adesaoId: string, dados: { lojaId: string; email: string; senha?: string }) {
  const u = await assertAdmin()
  if (!(await contratoAssinado(adesaoId))) return { ok: false as const, erro: 'O contrato desta adesão ainda não foi assinado' }
  const r = await aplicarPortalDaAdesao({ adesaoId, ...dados, usuarioId: u.id })
  if (r.ok) { revalidatePath('/admin/adesoes'); revalidatePath('/admin/lojas') }
  return r
}

export async function criarLojaAtivacaoAction(adesaoId: string, dados: { nome: string; cidade: string; endereco: string; cep: string }) {
  await assertAdmin()
  if (!(await contratoAssinado(adesaoId))) return { ok: false as const, erro: 'O contrato desta adesão ainda não foi assinado' }
  const r = await criarLojaDaAdesao({ adesaoId, ...dados })
  if (r.ok) { revalidatePath('/admin/adesoes'); revalidatePath('/admin/lojas') }
  return r
}

export async function criarUsuariosAtivacaoAction(adesaoId: string, lojaId: string) {
  const u = await assertAdmin()
  if (!(await contratoAssinado(adesaoId))) return { ok: false as const, erro: 'O contrato desta adesão ainda não foi assinado' }
  const auth = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).auth.admin
  const r = await criarUsuariosDaAdesao({ adesaoId, lojaId, adminId: u.id }, {
    criarNoAuth: async (email, senha) => {
      // must_change_password: o middleware leva a pessoa a /trocar-senha no 1º login.
      const { data, error } = await auth.createUser({ email, password: senha, email_confirm: true, user_metadata: { must_change_password: true } })
      if (error) throw new Error(error.message)
      return data.user.id
    },
    apagarDoAuth: async id => { await auth.deleteUser(id) },
    enviar: enviarEmail,
    urlLogin: `${urlBase()}/login`,
  })
  if (r.ok) { revalidatePath('/admin/adesoes'); revalidatePath('/admin/usuarios') }
  return r
}
