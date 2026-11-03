import type { PapelBase } from '@/lib/gestao-usuarios'

export type CargoDoUsuario = { nome: string; papelBase: PapelBase }

/**
 * Quem tem cargo (#616) é, para toda regra de papel, o papel base do cargo; `papelReal`
 * ('cargo', posto por usuarioDaRede) e `cargoNome` ficam para exibição. Sem cargo achado, o
 * usuário continua 'cargo' e só vê o básico. Aplicar depois de usuarioDaRede: o admin_rede
 * já é sócio e não tem cargo.
 */
export function usuarioComCargo<U extends { papel: string }>(usuario: U, cargo: CargoDoUsuario | null): U & { cargoNome: string | null } {
  if (usuario.papel !== 'cargo' || !cargo) return { ...usuario, cargoNome: null }
  return { ...usuario, papel: cargo.papelBase as U['papel'], cargoNome: cargo.nome }
}
