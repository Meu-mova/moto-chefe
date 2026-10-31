// Filtros da lista de /admin/usuarios (#557). Roda só sobre a lista que o servidor já recortou
// (listarUsuariosGerenciaveis): nunca alcança usuário fora dela. Regra pura.

export type Situacao = 'ativos' | 'inativos' | 'todos'
export type FiltrosUsuarios = { busca: string; papel: string; contaId: string; situacao: Situacao }
type UsuarioFiltravel = { nome: string; email: string; papel: string; lojaNome: string | null; contaId: string | null; ativo: boolean }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarUsuarios<U extends UsuarioFiltravel>(lista: U[], f: FiltrosUsuarios): U[] {
  const q = semAcento(f.busca.trim())
  return lista.filter(u =>
    (!q || semAcento([u.nome, u.email, u.lojaNome ?? ''].join(' ')).includes(q))
    && (!f.papel || u.papel === f.papel)
    && (!f.contaId || u.contaId === f.contaId)
    && (f.situacao === 'todos' || (f.situacao === 'ativos') === u.ativo))
}
