// Matriz rota × papel (#579): toda rota da tabela de navegação, com cada papel do seed.
// Rota nova entra sozinha, porque a lista sai de ITENS.
import { ITENS, podeAcessar } from '../../src/lib/navegacao'
import { DOMINIO_TESTE } from './seed-dados'

export const USUARIOS_MATRIZ: { email: string; papel: string }[] = [
  { email: `geral@${DOMINIO_TESTE}`, papel: 'admin_geral' },
  ...['socio', 'aux', 'vendedor', 'mecanico', 'motorista'].map((prefixo, i) => ({
    email: `${prefixo}.sul@${DOMINIO_TESTE}`,
    papel: ['admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista'][i],
  })),
]

export const ROTAS_MATRIZ: string[] = [...new Set(ITENS.map(i => i.href))]

export type Esperado = 'abre' | 'volta'

/** O usuário do seed não tem módulo extra nem bloqueado: vale a regra do papel. */
export function esperado(papel: string, href: string): Esperado {
  return podeAcessar({ papel }, href, {}) ? 'abre' : 'volta'
}

export type VisitaMatriz = {
  href: string
  caminhoFinal: string
  status: number | null
  /** A tela de erro do (dashboard)/error.tsx apareceu. */
  telaDeErro: boolean
}

/** Sem acesso: volta ao /dashboard, sem tela de erro. Com acesso: abre a própria rota. */
export function falhaDaVisita(esperado: Esperado, v: VisitaMatriz): string | null {
  if (v.status === null) return 'sem resposta'
  if (v.status >= 500) return `status ${v.status}`
  if (v.caminhoFinal.startsWith('/login')) return 'caiu no /login'
  if (v.telaDeErro) return 'mostrou "Erro ao carregar a página"'
  if (esperado === 'volta' && v.caminhoFinal !== '/dashboard') return `sem permissão e ficou em ${v.caminhoFinal}`
  if (esperado === 'abre' && v.caminhoFinal !== v.href) return `com permissão e foi para ${v.caminhoFinal}`
  return null
}
