// Lista única das Novidades da versão: um arquivo por versão em ./versoes, só para versão com algo
// que a loja percebe. A regra e o teste de formato leem daqui. Passo da release no CONTRIBUTING.md.
import type { NovidadeDaVersao } from './tipos'
import v1_36_0 from './versoes/1.36.0'

export const NOVIDADES_DA_VERSAO: readonly NovidadeDaVersao[] = [v1_36_0]
