'use server'
// Logins da fábrica MotoChefe (papel `fabrica`): só o admin_geral cria, desativa e troca a
// senha. O papel vai também no app_metadata do Supabase (só a service role grava), que é
// o que o middleware lê para prender o login em /fabrica (@/lib/painel-fabrica).
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { clienteSupabaseAdmin } from '@/lib/supabase/admin'
import { acao, RecusaUsuario, type ResultadoAction } from '@/lib/resultado-action'
import { registrarAcaoSensivelSemFalhar } from '@/lib/log-acoes'
import { validarAcessoFabrica, validarSenhaFabrica, type DadosAcessoFabrica } from '@/lib/acessos-fabrica'
import { PAPEL_FABRICA } from '@/lib/painel-fabrica'

const NAO_ENCONTRADO = 'Acesso não encontrado'

async function adminGeral() {
  const usuario = await getUsuarioLogado()
  // Papel principal, como os outros itens soAdminGeral: papel extra não abre.
  if (usuario.papel !== 'admin_geral') throw new RecusaUsuario('Sem permissão')
  return usuario
}

/** Só um login da fábrica: id de outro papel recebe a mesma frase de id inexistente. */
async function acessoDaFabrica(id: string) {
  const [u] = await db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email })
    .from(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.papel, PAPEL_FABRICA))).limit(1)
  if (!u) throw new RecusaUsuario(NAO_ENCONTRADO)
  return u
}

const registrar = (adminId: string, alvo: { id: string; nome: string }, acao: string) =>
  registrarAcaoSensivelSemFalhar({
    tipo: 'permissao_alterada', usuarioId: adminId, contaId: null,
    detalhe: { alvoId: alvo.id, alvoNome: alvo.nome, papel: PAPEL_FABRICA, acao },
  })

export async function criarAcessoFabricaAction(entrada: DadosAcessoFabrica): Promise<ResultadoAction> {
  return acao(async () => {
    const admin = await adminGeral()
    const v = validarAcessoFabrica(entrada)
    if (!v.ok) throw new RecusaUsuario(v.erro)
    const { nome, email, senha } = v.dados

    const supabase = clienteSupabaseAdmin()
    const { data, error } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      app_metadata: { papel: PAPEL_FABRICA },
    })
    // E-mail já usado ou recusado pelo Auth: frase neutra, como em /admin/usuarios.
    if (error || !data.user) throw new RecusaUsuario('Não foi possível criar o login com este e-mail. Confira o endereço ou use outro.')

    try {
      // Sem loja e sem Conta: o login da fábrica é da plataforma, não de um cliente.
      await db.insert(usuarios).values({ id: data.user.id, nome, email, papel: PAPEL_FABRICA, lojaId: null, contaId: null })
    } catch (e) {
      // Não deixa login órfão no Auth, que entraria sem linha em `usuarios`.
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {})
      throw e
    }
    await registrar(admin.id, { id: data.user.id, nome }, 'criado')
    revalidatePath('/admin/acessos-fabrica')
  })
}

export async function alternarAcessoFabricaAction(id: string, ativo: boolean): Promise<ResultadoAction> {
  return acao(async () => {
    const admin = await adminGeral()
    const alvo = await acessoDaFabrica(id)
    // Desativado cai em /conta-desativada (getUsuarioLogado) e não loga mais (loginAction).
    await db.update(usuarios).set({ ativo }).where(and(eq(usuarios.id, id), eq(usuarios.papel, PAPEL_FABRICA)))
    await registrar(admin.id, alvo, ativo ? 'ativado' : 'desativado')
    revalidatePath('/admin/acessos-fabrica')
  })
}

export async function redefinirSenhaFabricaAction(id: string, senha: string): Promise<ResultadoAction> {
  return acao(async () => {
    const admin = await adminGeral()
    const erro = validarSenhaFabrica(senha)
    if (erro) throw new RecusaUsuario(erro)
    const alvo = await acessoDaFabrica(id)
    const { error } = await clienteSupabaseAdmin().auth.admin.updateUserById(id, { password: senha })
    if (error) throw new RecusaUsuario('Não foi possível trocar a senha agora. Tente de novo.')
    await registrar(admin.id, alvo, 'senha_redefinida')
  })
}
