import { somenteDigitos } from '@/lib/grupo-cnpj'

export function certificateMatchesGroup(certificateCnpj: string, groupCnpj: string, accountGroupCnpjs: readonly string[]): boolean {
  const certificado = somenteDigitos(certificateCnpj)
  const grupo = somenteDigitos(groupCnpj)
  if (certificado.length !== 14 || grupo.length !== 14) return false
  const titularNaConta = accountGroupCnpjs.some(cnpj => somenteDigitos(cnpj) === certificado)
  return titularNaConta && certificado.slice(0, 8) === grupo.slice(0, 8)
}
