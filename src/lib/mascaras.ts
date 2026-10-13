/** Celular brasileiro enquanto digita: só dígitos, até 11, no formato (35) 99999-9999. */
export function mascaraCelular(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

/** CEP enquanto digita: só dígitos, até 8, no formato 37500-000. */
export function mascaraCep(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}

export type EnderecoCep = { logradouro: string; bairro: string; cidade: string; uf: string }

/** Endereço do CEP pelo ViaCEP. null quando o CEP está incompleto, não existe ou a busca falha. */
export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoCep | null> {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    const data = await res.json()
    if (data.erro) return null
    return { logradouro: data.logradouro ?? '', bairro: data.bairro ?? '', cidade: data.localidade ?? '', uf: data.uf ?? '' }
  } catch {
    return null
  }
}
