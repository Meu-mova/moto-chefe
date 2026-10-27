import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'

type Usuario = Parameters<typeof listarLojaIdsDoGrupoAtivo>[0]

const ADMINS = ['admin_geral', 'admin_socio']

// Lojas que a pessoa enxerga em Garantias (#328): admin, as do grupo ativo (ou a escolhida,
// se for dele); os demais, só a própria loja. Sem loja = lista vazia, nunca a base toda.
export async function lojasDoEscopoDeGarantias(usuario: Usuario, lojaPedida?: string): Promise<string[]> {
  if (!ADMINS.includes(usuario.papel)) return usuario.lojaId ? [usuario.lojaId] : []
  const doGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  return lojaPedida && doGrupo.includes(lojaPedida) ? [lojaPedida] : doGrupo
}
