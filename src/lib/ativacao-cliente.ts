import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adesoesMova, certificadosDigitais, grupos, lojas, motos, notagatewayConfig, regrasFiscaisSaida } from '@/lib/db/schema'
import { decifrar } from '@/lib/cripto'
import { cifrarSenhaFabrica } from '@/lib/fabrica-senha'
import { loginFabrica } from '@/lib/fabrica-scraper'
import { lerDadosDoPfx, salvarCertificado } from '@/lib/sefaz/certificado'
import { ufDoEndereco, ufValida } from '@/lib/sefaz/uf'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { geoDaLoja } from '@/lib/frete'
import { lojaSugerida } from '@/lib/adesao-endereco'

// "Ativar cliente" a partir da adesão (#292): leva o certificado A1 e o login do
// portal da fábrica da adesão para o grupo e a loja, sem passar pelo navegador.
// O segredo sai da adesão assim que é aplicado (decisão do Luis, 21/10).
// Sem next/headers direto, para ser testado contra o banco.

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete' | 'transaction'>
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

async function adesaoComGrupo(adesaoId: string, exec: Executor) {
  const [a] = await exec.select({
    grupoId: adesoesMova.grupoId, certArquivo: adesoesMova.certArquivo, certSenha: adesoesMova.certSenha,
    storeLogin: adesoesMova.storeLogin, storeSenha: adesoesMova.storeSenha,
  }).from(adesoesMova).where(eq(adesoesMova.id, adesaoId)).limit(1)
  if (!a) return null
  if (!a.grupoId) return { ...a, grupoId: null }
  const [g] = await exec.select({ id: grupos.id, nome: grupos.nome, cnpj: grupos.cnpj })
    .from(grupos).where(eq(grupos.id, a.grupoId)).limit(1)
  return { ...a, grupo: g }
}

export async function aplicarCertificadoDaAdesao(
  p: { adesaoId: string; uf: string; usuarioId: string },
  exec: Executor = db,
): Promise<Resultado<{ titular: string }>> {
  if (!ufValida(p.uf)) return { ok: false, erro: 'Escolha a UF da empresa' }
  const a = await adesaoComGrupo(p.adesaoId, exec)
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  if (!('grupo' in a) || !a.grupo) return { ok: false, erro: 'Vincule a adesão a um grupo antes' }
  if (!a.certArquivo || !a.certSenha) return { ok: false, erro: 'O certificado desta adesão já foi aplicado' }

  let pfx: Buffer, senha: string, dados
  try {
    pfx = decifrar(a.certArquivo)
    senha = decifrar(a.certSenha).toString('utf8')
    dados = lerDadosDoPfx(pfx, senha)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler o certificado' }
  }
  // Mesma checagem de /admin/certificados: certificado de outro CNPJ não encosta no grupo.
  const cnpjDoGrupo = a.grupo.cnpj.replace(/\D/g, '')
  if (dados.cnpj !== cnpjDoGrupo) {
    return { ok: false, erro: `O certificado da adesão é de ${dados.titular} (CNPJ ${dados.cnpj}), e o grupo ${a.grupo.nome} é do CNPJ ${cnpjDoGrupo}.` }
  }

  const grupoId = a.grupo.id, uf = p.uf
  // Tudo ou nada: certificado no grupo, segredo fora da adesão e linha no log.
  await exec.transaction(async tx => {
    await salvarCertificado(grupoId, pfx, senha, uf, tx)
    await tx.update(adesoesMova)
      .set({ certArquivo: null, certSenha: null, certificadoAplicadoEm: new Date() })
      .where(eq(adesoesMova.id, p.adesaoId))
    await registrarAcaoSensivel({
      tipo: 'certificado_aplicado', usuarioId: p.usuarioId, grupoId,
      detalhe: { adesaoId: p.adesaoId, titular: dados.titular, validoAte: dados.validoAte.toISOString().slice(0, 10), uf },
    }, tx)
  })
  return { ok: true, titular: dados.titular }
}

/**
 * Testa o login no portal antes de gravar: credencial que a fábrica recusa não
 * vai para a loja. Senha em branco usa a que veio na adesão.
 */
export async function aplicarPortalDaAdesao(
  p: { adesaoId: string; lojaId: string; email: string; senha?: string; usuarioId: string },
  exec: Executor = db,
  login: (c: { email: string; senha: string }) => Promise<unknown> = loginFabrica,
): Promise<Resultado> {
  const a = await adesaoComGrupo(p.adesaoId, exec)
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  if (!('grupo' in a) || !a.grupo) return { ok: false, erro: 'Vincule a adesão a um grupo antes' }
  const [loja] = await exec.select({ id: lojas.id, nome: lojas.nome }).from(lojas)
    .where(and(eq(lojas.id, p.lojaId), eq(lojas.grupoId, a.grupo.id))).limit(1)
  if (!loja) return { ok: false, erro: 'Escolha uma loja do grupo desta adesão' }

  const email = p.email.trim()
  const senha = p.senha?.trim() || (a.storeSenha ? decifrar(a.storeSenha).toString('utf8') : '')
  if (!email || !senha) return { ok: false, erro: 'Informe o e-mail e a senha do portal' }

  try {
    await login({ email, senha })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'A fábrica recusou o login' }
  }

  const grupoId = a.grupo.id
  // O login na fábrica fica fora: é rede, e a transação só segura as gravações.
  await exec.transaction(async tx => {
    await tx.update(lojas).set({ fabricaEmail: email, fabricaSenha: cifrarSenhaFabrica(senha) }).where(eq(lojas.id, loja.id))
    await tx.update(adesoesMova)
      .set({ storeLogin: email, storeSenha: null, portalAplicadoEm: new Date() })
      .where(eq(adesoesMova.id, p.adesaoId))
    await registrarAcaoSensivel({
      tipo: 'portal_aplicado', usuarioId: p.usuarioId, grupoId,
      detalhe: { adesaoId: p.adesaoId, loja: loja.nome, email },
    }, tx)
  })
  return { ok: true }
}

/** Cria a loja do grupo da adesão; CEP informado é geocodificado para o frete, como em /admin/lojas. */
export async function criarLojaDaAdesao(
  p: { adesaoId: string; nome: string; cidade: string; endereco: string; cep: string },
  exec: Executor = db,
  geocodificar: typeof geoDaLoja = geoDaLoja,
): Promise<Resultado<{ lojaId: string; geocodificado: boolean }>> {
  const nome = p.nome.trim(), cidade = p.cidade.trim(), endereco = p.endereco.trim(), cep = p.cep.trim()
  if (!nome || !cidade || !endereco) return { ok: false, erro: 'Preencha nome, cidade e endereço da loja' }
  const a = await adesaoComGrupo(p.adesaoId, exec)
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  if (!('grupo' in a) || !a.grupo) return { ok: false, erro: 'Vincule a adesão a um grupo antes' }
  // O passo cria "a" loja do grupo: segunda loja (outra aba, reenvio) é em /admin/lojas.
  const [existente] = await exec.select({ nome: lojas.nome }).from(lojas).where(eq(lojas.grupoId, a.grupo.id)).limit(1)
  if (existente) return { ok: false, erro: `O grupo já tem a loja ${existente.nome}. Outras lojas: /admin/lojas.` }

  const geo = await geocodificar(cep)
  const [loja] = await exec.insert(lojas).values({ nome, cidade, endereco, grupoId: a.grupo.id, ...geo }).returning({ id: lojas.id })
  // Sem coordenadas (sem CEP ou não localizado) o frete não calcula: a tela avisa.
  return { ok: true, lojaId: loja.id, geocodificado: geo.latitude !== null }
}

/**
 * O que a tela "Ativar cliente" precisa, sem segredo nenhum: vai para o navegador.
 * O resumo diz o que ainda falta para o cliente operar.
 */
export async function dadosDaAtivacao(adesaoId: string, exec: Executor = db) {
  const [a] = await exec.select({
    grupoId: adesoesMova.grupoId, enderecoSede: adesoesMova.enderecoSede, storeLogin: adesoesMova.storeLogin,
    nomeLoja: adesoesMova.loja,
    temCertificado: sql<boolean>`${adesoesMova.certArquivo} is not null`,
    temSenhaPortal: sql<boolean>`${adesoesMova.storeSenha} is not null`,
    certificadoAplicadoEm: adesoesMova.certificadoAplicadoEm, portalAplicadoEm: adesoesMova.portalAplicadoEm,
  }).from(adesoesMova).where(eq(adesoesMova.id, adesaoId)).limit(1)
  if (!a?.grupoId) return null
  const grupoId = a.grupoId

  const [lojasDoGrupo, [cert], [ng], [regra], [motosDoGrupo]] = await Promise.all([
    exec.select({ id: lojas.id, nome: lojas.nome, temPortal: sql<boolean>`${lojas.fabricaEmail} is not null and ${lojas.fabricaSenha} is not null` })
      .from(lojas).where(and(eq(lojas.grupoId, grupoId), eq(lojas.ativa, true))).orderBy(lojas.nome),
    exec.select({ titular: certificadosDigitais.titular, validoAte: certificadosDigitais.validoAte })
      .from(certificadosDigitais).where(eq(certificadosDigitais.grupoId, grupoId)).limit(1),
    exec.select({ id: notagatewayConfig.grupoId }).from(notagatewayConfig).where(eq(notagatewayConfig.grupoId, grupoId)).limit(1),
    exec.select({ id: regrasFiscaisSaida.grupoId }).from(regrasFiscaisSaida).where(eq(regrasFiscaisSaida.grupoId, grupoId)).limit(1),
    exec.select({ n: sql<number>`count(*)::int` }).from(motos).innerJoin(lojas, eq(lojas.id, motos.lojaId)).where(eq(lojas.grupoId, grupoId)),
  ])

  return {
    ufSugerida: ufDoEndereco(a.enderecoSede),
    lojaSugerida: lojaSugerida(a.nomeLoja, a.enderecoSede),
    storeLogin: a.storeLogin,
    temCertificadoNaAdesao: a.temCertificado,
    temSenhaPortalNaAdesao: a.temSenhaPortal,
    certificadoAplicadoEm: a.certificadoAplicadoEm?.toISOString() ?? null,
    portalAplicadoEm: a.portalAplicadoEm?.toISOString() ?? null,
    lojas: lojasDoGrupo,
    resumo: {
      certificado: cert ? { titular: cert.titular, validoAte: cert.validoAte.toISOString().slice(0, 10) } : null,
      portal: lojasDoGrupo.some(l => l.temPortal),
      notaGateway: !!ng,
      regraFiscal: !!regra,
      motos: motosDoGrupo?.n ?? 0,
    },
  }
}
export type DadosAtivacao = NonNullable<Awaited<ReturnType<typeof dadosDaAtivacao>>>
