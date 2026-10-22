import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { ehGestorDeUsuarios, podeGerenciar, type Gestor } from '@/lib/gestao-usuarios'

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
