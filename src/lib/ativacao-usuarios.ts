import { randomInt } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adesoesMova, grupos, lojas, usuarios } from '@/lib/db/schema'
import { registrarAcaoSensivel } from '@/lib/log-acoes'

// Passo "Usuários" do Ativar cliente (#292): cria o acesso de cada pessoa da lista
// da adesão. Decisão do Luis (21/10): senha provisória por e-mail, com troca
// obrigatória no 1º login (must_change_password, ver src/middleware.ts). Se o
// e-mail falhar, a senha volta uma vez para o admin repassar.

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

export type DepsUsuarios = {
  /** Cria no Supabase Auth; devolve o id. */
  criarNoAuth: (email: string, senha: string) => Promise<string>
  apagarDoAuth: (id: string) => Promise<void>
  enviar: (e: { para: string; assunto: string; texto: string }) => Promise<{ status: string }>
  urlLogin: string
}

export type ResultadoUsuario =
  | { email: string; nome: string; situacao: 'ja_tinha' }
  | { email: string; nome: string; situacao: 'criado'; emailEnviado: true }
  | { email: string; nome: string; situacao: 'criado'; emailEnviado: false; senhaProvisoria: string }
  | { email: string; nome: string; situacao: 'erro'; erro: string }

// Sem caracteres que se confundem ao ditar (0/O, 1/l/I).
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function senhaProvisoria(tamanho = 12): string {
  return Array.from({ length: tamanho }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')
}

export function emailDeAcesso(nome: string, loja: string, email: string, senha: string, urlLogin: string) {
  return {
    assunto: 'Seu acesso ao MOVA',
    texto:
      `Olá, ${nome}!\n\nSeu acesso ao MOVA, sistema da ${loja}, foi criado.\n\n` +
      `Entre em ${urlLogin}\nE-mail: ${email}\nSenha provisória: ${senha}\n\n` +
      `No primeiro acesso o sistema pede para você criar a sua senha.\n\nMOVA`,
  }
}

/** E-mails da lista da adesão que já têm usuário no MOVA. */
export async function emailsComAcesso(emails: string[], exec: Pick<typeof db, 'select'> = db): Promise<Set<string>> {
  const normalizados = emails.map(e => e.trim().toLowerCase())
  if (!normalizados.length) return new Set()
  const linhas = await exec.select({ email: usuarios.email }).from(usuarios)
    .where(inArray(sql`lower(${usuarios.email})`, normalizados))
  return new Set(linhas.map(l => l.email.toLowerCase()))
}

export async function criarUsuariosDaAdesao(
  p: { adesaoId: string; lojaId: string; adminId: string },
  deps: DepsUsuarios,
  exec: Executor = db,
): Promise<{ ok: true; resultados: ResultadoUsuario[] } | { ok: false; erro: string }> {
  const [a] = await exec.select({ grupoId: adesoesMova.grupoId, lista: adesoesMova.usuarios })
    .from(adesoesMova).where(eq(adesoesMova.id, p.adesaoId)).limit(1)
  if (!a) return { ok: false, erro: 'Adesão não encontrada' }
  if (!a.grupoId) return { ok: false, erro: 'Vincule a adesão a um grupo antes' }
  const [loja] = await exec.select({ id: lojas.id, nome: lojas.nome, contaId: grupos.contaId })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(and(eq(lojas.id, p.lojaId), eq(lojas.grupoId, a.grupoId))).limit(1)
  if (!loja) return { ok: false, erro: 'Escolha uma loja do grupo desta adesão' }

  const jaTem = await emailsComAcesso(a.lista.map(u => u.email), exec)
  const resultados: ResultadoUsuario[] = []
  for (const u of a.lista) {
    const email = u.email.trim().toLowerCase()
    const base = { email, nome: u.nome }
    if (jaTem.has(email)) { resultados.push({ ...base, situacao: 'ja_tinha' }); continue }

    const senha = senhaProvisoria()
    let id: string
    try {
      id = await deps.criarNoAuth(email, senha)
    } catch (e) {
      resultados.push({ ...base, situacao: 'erro', erro: e instanceof Error ? e.message : 'Falha ao criar o acesso' })
      continue
    }
    try {
      await exec.insert(usuarios).values({ id, nome: u.nome.trim(), email, papel: u.papel as never, lojaId: loja.id, contaId: loja.contaId })
    } catch (e) {
      // Sem o perfil, o login no Auth não serve para nada: desfaz para dar para tentar de novo.
      await deps.apagarDoAuth(id).catch(() => {})
      resultados.push({ ...base, situacao: 'erro', erro: e instanceof Error ? e.message : 'Falha ao gravar o usuário' })
      continue
    }
    await registrarAcaoSensivel({
      tipo: 'permissao_alterada', usuarioId: p.adminId, lojaId: loja.id,
      detalhe: { alvoId: id, alvoNome: u.nome, acao: 'criado', papel: u.papel, origem: 'adesao' },
    }, exec)

    const envio = await deps.enviar({ para: email, ...emailDeAcesso(u.nome, loja.nome, email, senha, deps.urlLogin) })
    resultados.push(envio.status === 'enviado'
      ? { ...base, situacao: 'criado', emailEnviado: true }
      : { ...base, situacao: 'criado', emailEnviado: false, senhaProvisoria: senha })
  }
  return { ok: true, resultados }
}
