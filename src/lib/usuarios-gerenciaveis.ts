import { db } from '@/lib/db'
import { usuarios, lojas, grupos } from '@/lib/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { ehGestorDeUsuarios, podeGerenciar, type CadastroGestao, type Gestor } from '@/lib/gestao-usuarios'

type Exec = Pick<typeof db, 'select'>

// Lista de /admin/usuarios recortada pela regra de @/lib/gestao-usuarios (#322). Filtra
// em memória para não ter uma segunda cópia da regra em SQL: são dezenas de usuários.
export async function listarUsuariosGerenciaveis(
  gestor: Pick<Gestor, 'papel' | 'gruposVisiveis'>,
  exec: Exec = db,
) {
  if (!ehGestorDeUsuarios(gestor)) return []
  const todos = await exec
    .select({
      id:       usuarios.id,
      nome:     usuarios.nome,
      email:    usuarios.email,
      papel:    usuarios.papel,
      papeisExtras: usuarios.papeisExtras,
      lojaId:   usuarios.lojaId,
      lojaNome: lojas.nome,
      conecta:  usuarios.conecta,
      gruposAprovacao:         usuarios.gruposAprovacao,
      aprovaPagamentoSensivel: usuarios.aprovaPagamentoSensivel,
      gruposAcesso:            usuarios.gruposAcesso,
      ativo:                   usuarios.ativo,
      modulosExtras:           usuarios.modulosExtras,
      modulosBloqueados:       usuarios.modulosBloqueados,
      // Grupo da loja fixa: já aprova nele por padrão, então o formulário
      // mostra esse grupo como fixo em vez de oferecê-lo como opção.
      grupoDaLojaId:           lojas.grupoId,
    })
    .from(usuarios)
    .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
    .orderBy(asc(usuarios.nome))
  return todos.filter(u => podeGerenciar(gestor, {
    papel: u.papel, grupoDaLoja: u.grupoDaLojaId, gruposAcesso: u.gruposAcesso ?? [], gruposAprovacao: u.gruposAprovacao ?? [],
  }))
}

// Estado gravado do alvo, lido no servidor: a tela não decide quem está no alcance.
export async function cadastroAtual(id: string, exec: Exec = db): Promise<(CadastroGestao & { id: string }) | null> {
  const [u] = await exec
    .select({
      id: usuarios.id, papel: usuarios.papel, grupoDaLoja: lojas.grupoId, ativo: usuarios.ativo,
      gruposAcesso: usuarios.gruposAcesso, gruposAprovacao: usuarios.gruposAprovacao, modulosExtras: usuarios.modulosExtras, modulosBloqueados: usuarios.modulosBloqueados,
      aprovaPagamentoSensivel: usuarios.aprovaPagamentoSensivel,
    })
    .from(usuarios).leftJoin(lojas, eq(usuarios.lojaId, lojas.id)).where(eq(usuarios.id, id)).limit(1)
  if (!u) return null
  return { ...u, gruposAcesso: u.gruposAcesso ?? [], gruposAprovacao: u.gruposAprovacao ?? [], modulosExtras: u.modulosExtras ?? [], modulosBloqueados: u.modulosBloqueados ?? [] }
}

// O que o formulário pede, com o grupo da loja escolhida resolvido no banco.
export async function cadastroPedido(
  dados: { papel: string; lojaId: string | null; gruposAcesso: string[]; gruposAprovacao: string[]; modulosExtras: string[]; modulosBloqueados: string[]; aprovaPagamentoSensivel: boolean },
  ativo: boolean,
  exec: Exec = db,
): Promise<CadastroGestao> {
  const [loja] = dados.lojaId
    ? await exec.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, dados.lojaId)).limit(1)
    : []
  return {
    papel: dados.papel, grupoDaLoja: loja?.grupoId ?? null, ativo,
    gruposAcesso: dados.gruposAcesso, gruposAprovacao: dados.gruposAprovacao, modulosExtras: dados.modulosExtras, modulosBloqueados: dados.modulosBloqueados,
    aprovaPagamentoSensivel: dados.aprovaPagamentoSensivel,
  }
}

// Lojas que o sócio pode escolher: as ativas de todos os grupos que ele vê, não só do grupo
// ativo. Com mais de um grupo, o nome leva o grupo, porque lojas de grupos diferentes podem
// ter nomes parecidos.
export async function lojasDosGruposVisiveis(gruposVisiveis: string[], exec: Exec = db) {
  if (gruposVisiveis.length === 0) return []
  const linhas = await exec
    .select({ id: lojas.id, nome: lojas.nome, grupo: grupos.nome })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(and(inArray(lojas.grupoId, gruposVisiveis), eq(lojas.ativa, true)))
    .orderBy(asc(grupos.nome), asc(lojas.nome))
  const variosGrupos = new Set(linhas.map(l => l.grupo)).size > 1
  return linhas.map(l => ({ id: l.id, nome: variosGrupos ? `${l.nome} (${l.grupo})` : l.nome }))
}
