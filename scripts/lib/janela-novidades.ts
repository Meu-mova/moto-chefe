import type { Page } from 'playwright'

/**
 * Depois do login, fecha a janela "Novidades do MOVA" se ela abrir (#883). admin_geral,
 * admin_socio, admin_rede e aux_adm a veem uma vez por navegador; ela cobre a tela e só sai pelo
 * Entendi, então o clique seguinte do teste cairia no fundo da janela. Sem novidade (outro papel,
 * versão já vista), segue depois da espera.
 */
export async function fecharNovidadesSeAbrir(pagina: Page, esperaMs = 5_000) {
  const entendi = pagina.getByRole('button', { name: 'Entendi', exact: true })
  const abriu = await entendi.waitFor({ state: 'visible', timeout: esperaMs }).then(() => true, () => false)
  if (!abriu) return
  await entendi.click()
  await entendi.waitFor({ state: 'hidden' })
}
