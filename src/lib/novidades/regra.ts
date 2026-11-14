import type { PapelDoBanco } from '@/lib/rotulo-do-papel'
import { compararSemVer, ehSemVer } from '@/lib/semver'
import type { NovidadeDaVersao } from './tipos'

/** Papéis cadastrados que veem as Novidades da versão; cargo e função extra não contam (#881). */
export const PAPEIS_QUE_VEEM_NOVIDADES: readonly PapelDoBanco[] = ['admin_geral', 'admin_socio', 'admin_rede', 'aux_adm']

function maisNova(lista: readonly NovidadeDaVersao[]): NovidadeDaVersao | null {
  return lista.reduce<NovidadeDaVersao | null>((atual, n) => (!atual || compararSemVer(n.versao, atual.versao) > 0 ? n : atual), null)
}

/**
 * A novidade que a pessoa vê ao entrar, ou null. `papelCadastrado` é o papel gravado
 * (`papelReal` da sessão), não o efetivo; `versaoVista` é a que o cookie dela marca.
 * Mostra só a mais nova da lista, e só se for maior que a vista: quem já viu uma versão tirada
 * do ar depois não volta a ver a anterior. Valor que não é versão conta como nada visto.
 */
export function novidadeParaMostrar(
  lista: readonly NovidadeDaVersao[],
  papelCadastrado: string,
  versaoVista: string | null,
): NovidadeDaVersao | null {
  if (!(PAPEIS_QUE_VEEM_NOVIDADES as readonly string[]).includes(papelCadastrado)) return null
  const novidade = maisNova(lista)
  if (!novidade) return null
  const jaViu = versaoVista !== null && ehSemVer(versaoVista) && compararSemVer(novidade.versao, versaoVista) <= 0
  return jaViu ? null : novidade
}
