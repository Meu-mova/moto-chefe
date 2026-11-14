/** Um item do texto: título curto e uma ou duas frases do que muda para a loja. */
export type ItemDaNovidade = { readonly titulo: string; readonly texto: string }

/**
 * Novidades da versão (CONTEXT.md): o texto para as lojas sobre uma versão do MOVA, igual para
 * todas as Contas. `versao` é o `version` do package.json daquela release; `data`, 'AAAA-MM-DD'.
 */
export type NovidadeDaVersao = {
  readonly versao: string
  readonly data: string
  readonly novidades?: readonly ItemDaNovidade[]
  readonly correcoes?: readonly ItemDaNovidade[]
}
