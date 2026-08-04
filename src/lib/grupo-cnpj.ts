// O agente local manda o CNPJ do grupo com a pontuação que está escrita no
// próprio script ("57.113.017/0001-72"). Comparar isso como string exata com
// `grupos.cnpj` faz o grupo inteiro deixar de funcionar se o cadastro tiver sido
// digitado com máscara diferente (só dígitos, espaço sobrando, ponto a menos) —
// e o sintoma seria um 400 mudo do lado do PC. Por isso a comparação é sempre
// pelos 14 dígitos, dos dois lados.

/** Tira tudo que não é dígito — "57.113.017/0001-72" → "57113017000172". */
export function somenteDigitos(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}
