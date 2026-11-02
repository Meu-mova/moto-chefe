// O agente local manda o CNPJ do grupo com a pontuação que está escrita no
// próprio script ("57.113.017/0001-72"). Comparar isso como string exata com
// `grupos.cnpj` faz o grupo inteiro deixar de funcionar se o cadastro tiver sido
// digitado com máscara diferente (só dígitos, espaço sobrando, ponto a menos) —
// e o sintoma seria um 400 mudo do lado do PC. Por isso a comparação é sempre
// pelos 14 caracteres sem pontuação, dos dois lados. Letra fica, em maiúscula:
// o CNPJ alfanumérico (#534) tem letra nas 12 primeiras posições.

import { limparDocumento } from '@/lib/documento'

/** "57.113.017/0001-72" → "57113017000172"; "12.abc.345/01de-35" → "12ABC34501DE35". */
export function chaveDoCnpj(cnpj: string): string {
  return limparDocumento(cnpj)
}
