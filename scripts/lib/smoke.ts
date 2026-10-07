/**
 * Regras do smoke (D17 do plano de staging/CI): que telas cada usuário sintético
 * visita e quando uma visita conta como falha. O navegador fica em scripts/smoke.ts.
 */
import { DOMINIO_TESTE } from './seed-dados'

export type UsuarioSmoke = { email: string; telas: string[] }

// aux_adm não tem permissão nas três últimas (src/lib/navegacao.ts: ADMINS), por isso
// elas ficam só com o admin_geral.
const TELAS_DA_LOJA = ['/dashboard', '/estoque', '/vendas', '/ordens-servico', '/conciliacao']
const TELAS_DE_ADMIN = ['/folha-pagamento', '/financeiro', '/admin/notas-fiscais']

export const USUARIOS_SMOKE: UsuarioSmoke[] = [
  { email: `aux.sul@${DOMINIO_TESTE}`, telas: TELAS_DA_LOJA },
  { email: `geral@${DOMINIO_TESTE}`, telas: [...TELAS_DA_LOJA, ...TELAS_DE_ADMIN] },
]

export type Visita = {
  tela: string
  /** Status do documento principal; null se a navegação nem respondeu. */
  status: number | null
  caminhoFinal: string
  /** Respostas >= 500 do próprio app durante a visita (RSC, Server Action, API). */
  respostas5xx: string[]
  errosConsole: string[]
  errosPagina: string[]
}

/** Motivos de falha da visita; vazio quando a tela passou. */
export function motivosDeFalha(v: Visita): string[] {
  const motivos: string[] = []
  if (v.status === null) motivos.push('sem resposta')
  else if (v.status >= 500) motivos.push(`status ${v.status}`)
  if (v.caminhoFinal.startsWith('/login')) motivos.push('caiu no /login')
  else if (v.caminhoFinal !== v.tela) motivos.push(`redirecionou para ${v.caminhoFinal}`)
  for (const r of v.respostas5xx) motivos.push(`resposta 5xx: ${r}`)
  for (const e of v.errosConsole) motivos.push(`console: ${e}`)
  for (const e of v.errosPagina) motivos.push(`exceção: ${e}`)
  return motivos
}
