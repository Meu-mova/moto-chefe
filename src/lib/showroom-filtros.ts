// Filtros do Showroom (/estoque) a partir da URL. A tela e a impressão (#512) usam os
// mesmos, para o papel sair igual ao que está filtrado na tela.

const ADMINS = ['admin_geral', 'admin_socio']

export type ParamsShowroom = {
  status?: string; disponibilidade?: string; loja?: string; modelo?: string; cor?: string
  ord?: string; dir?: string; q?: string; transf?: string
}

const ORDENS = ['modelo', 'cor', 'loja', 'status', 'disponibilidade'] as const
type Ord = typeof ORDENS[number]

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export function filtrosDoShowroom(params: ParamsShowroom, quem: { papel: string; lojaId: string | null }, lojaIdsGrupo: string[]) {
  const isAdmin = ADMINS.includes(quem.papel)
  const dispValues = parseParam(params.disponibilidade)

  // params.loja é validado contra as lojas do grupo ativo (nunca vaza loja de
  // outro grupo/CNPJ). Se a seleção for válida, vale tanto pra admin quanto
  // pra não-admin — vendedor/mecânico/aux_adm podem consultar o estoque de
  // outra loja da MESMA rede (filtro "Loja" já é exibido pra todo mundo).
  // Sem seleção válida: admin cai pro grupo inteiro, não-admin cai pra própria loja.
  const validos = parseParam(params.loja).filter(id => lojaIdsGrupo.includes(id))
  const lojaId = validos.length > 0 ? validos : isAdmin ? lojaIdsGrupo : (quem.lojaId ? [quem.lojaId] : [])

  return {
    status:          parseParam(params.status),
    // Vendidas nunca aparecem no estoque — sempre excluídas
    disponibilidade: dispValues.length ? dispValues : undefined,
    excluirVendidas: true,
    chassiBusca:     params.q,
    lojaId,
    modeloId:        parseParam(params.modelo),
    cor:             parseParam(params.cor),
    apenasTransferencia: params.transf === '1',
    ord: ORDENS.includes(params.ord as Ord) ? (params.ord as Ord) : 'modelo',
    dir: params.dir === 'desc' ? 'desc' as const : 'asc' as const,
  }
}

// Filtros que os links de ordenação da tabela repassam.
export function paramsDoShowroom(params: ParamsShowroom): string {
  const p = new URLSearchParams()
  if (params.q)               p.set('q', params.q)
  if (params.status)          p.set('status', params.status)
  if (params.disponibilidade) p.set('disponibilidade', params.disponibilidade)
  if (params.loja)            p.set('loja', params.loja)
  if (params.modelo)          p.set('modelo', params.modelo)
  if (params.cor)             p.set('cor', params.cor)
  return p.toString()
}
