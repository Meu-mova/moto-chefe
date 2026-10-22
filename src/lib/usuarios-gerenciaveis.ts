import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { asc, eq, inArray } from 'drizzle-orm'

type Exec = Pick<typeof db, 'select'>

// Lista de /admin/usuarios recortada pela mesma regra de @/lib/gestao-usuarios: o sócio
// recebe só quem é de loja de grupo que ele vê (#322).
export async function listarUsuariosGerenciaveis(
  gestor: { papel: string; gruposVisiveis: string[] },
  exec: Exec = db,
) {
  if (gestor.papel !== 'admin_geral' && (gestor.papel !== 'admin_socio' || gestor.gruposVisiveis.length === 0)) return []
  return exec
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
    .where(gestor.papel === 'admin_geral' ? undefined : inArray(lojas.grupoId, gestor.gruposVisiveis))
    .orderBy(asc(usuarios.nome))
}
