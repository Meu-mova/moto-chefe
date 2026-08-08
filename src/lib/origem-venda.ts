// Origem da venda — a regra de aceitar ou recusar, num lugar só.
// Ver docs/superpowers/specs/2026-08-08-origem-venda-design.md
//
// Formulário e as três actions que criam venda (direta, aprovada e pedido
// efetivado) chamam daqui. Regra de obrigatoriedade duplicada entre action e
// tela já produziu bug neste repo — foi o que liberou o cancelamento de OS para
// um papel na action e outro na página.

export const TIPOS_ORIGEM = [
  'Digital',
  'Presencial',
  'Relacional',
  'Parceria',
  'Ativo',
  'Outro',
] as const

export type TipoOrigem = (typeof TIPOS_ORIGEM)[number]

export type OrigemParaValidar = {
  id: string
  ativo: boolean
  grupoId: string
  pedeDetalhe: boolean
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string }

/**
 * A origem serve para esta venda?
 *
 * `origem` é o que veio do banco pelo id que o formulário mandou — undefined
 * quando o id não existe. `grupoIdEsperado` é o grupo da loja da MOTO, não o
 * grupo ativo do usuário: é o que impede um payload forjado gravar venda de BH
 * com origem do Sul de Minas.
 */
export function validarOrigemVenda(
  origem: OrigemParaValidar | undefined,
  detalhe: string | null | undefined,
  grupoIdEsperado: string,
): ResultadoValidacao {
  if (!origem) return { ok: false, erro: 'Informe por onde o cliente chegou.' }
  if (!origem.ativo) return { ok: false, erro: 'Essa origem foi desativada — escolha outra.' }
  if (origem.grupoId !== grupoIdEsperado) {
    return { ok: false, erro: 'Essa origem não pertence ao grupo da loja da moto.' }
  }
  if (origem.pedeDetalhe && !detalhe?.trim()) {
    return { ok: false, erro: 'Essa origem exige detalhe (quem indicou, qual evento, etc).' }
  }
  return { ok: true }
}

/** Detalhe só faz sentido quando a origem pede; em branco vira NULL no banco. */
export function normalizarDetalhe(
  detalhe: string | null | undefined,
  pedeDetalhe: boolean,
): string | null {
  if (!pedeDetalhe) return null
  const limpo = detalhe?.trim()
  return limpo ? limpo : null
}
