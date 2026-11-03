import type { papelEnum } from '@/lib/db/schema'

type PapelDoBanco = (typeof papelEnum.enumValues)[number]

// Única fonte do texto de cada papel nas telas internas: papel novo no enum quebra o type-check
// até ganhar rótulo aqui. O formulário público de adesão tem texto próprio (PAPEIS_ADESAO).
export const ROTULO_DO_PAPEL: Record<PapelDoBanco, string> = {
  admin_geral: 'Admin Geral',
  admin_rede: 'Admin de Rede',
  admin_socio: 'Admin Sócio',
  aux_adm: 'Aux. Administrativo',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
  cargo: 'Cargo da Conta',
}

/** Ordem em que select, filtro e lista mostram os papéis. */
export const ORDEM_DOS_PAPEIS: readonly PapelDoBanco[] = [
  'admin_geral', 'admin_rede', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo',
]

export const OPCOES_DE_PAPEL: { value: PapelDoBanco; label: string }[] =
  ORDEM_DOS_PAPEIS.map(value => ({ value, label: ROTULO_DO_PAPEL[value] }))

/** Rótulo do papel gravado; valor que não é papel (dado velho, entrada inválida) volta como veio. */
export function rotuloDoPapelGravado(papel: string): string {
  return Object.hasOwn(ROTULO_DO_PAPEL, papel) ? ROTULO_DO_PAPEL[papel as PapelDoBanco] : papel
}

/** O que o rodapé do menu mostra sob o nome: o cargo, se tem, senão o papel gravado. */
export function rotuloDoPapel(usuario: { papel: string; cargoNome?: string | null }): string {
  return usuario.cargoNome ?? rotuloDoPapelGravado(usuario.papel)
}
