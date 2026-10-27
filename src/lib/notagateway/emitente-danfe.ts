// Texto do emitente desenhado dentro da imagem da logo (#428): com logo, a NG não escreve
// razão social nem endereço no DANFE. Puro, sem banco, para testar sem Postgres.

export type EmitenteDanfe = {
  razaoSocial: string
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  cidade: string | null
  uf: string | null
  cnpj: string
  telefone: string | null
  email: string | null
  /** A NG não tem site: vem do grupo (`notagateway_config.site_danfe`). */
  site: string | null
}

const limpo = (s: string | null | undefined) => (s ?? '').trim()
const digitos = (s: string | null | undefined) => limpo(s).replace(/\D/g, '')

const cnpjFormatado = (c: string) => digitos(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const cepFormatado = (c: string) => digitos(c).replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3')

function foneFormatado(f: string): string {
  const d = digitos(f)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return limpo(f)
}

/** Uma informação por linha, na ordem do DANFE do Sul de Minas; linha sem dado não aparece. */
export function linhasDoEmitente(e: EmitenteDanfe): { titulo: string; linhas: string[] } {
  const endereco = [limpo(e.logradouro), limpo(e.numero), limpo(e.complemento)].filter(Boolean).join(', ')
  const cidade = [e.cep && digitos(e.cep) ? cepFormatado(e.cep) : '', limpo(e.cidade), limpo(e.uf)].filter(Boolean).join(' - ')
  const linhas = [
    endereco,
    limpo(e.bairro),
    cidade,
    `CNPJ ${cnpjFormatado(e.cnpj)}`,
    digitos(e.telefone) ? `Fone ${foneFormatado(e.telefone!)}` : '',
    limpo(e.site),
    limpo(e.email),
  ]
  return { titulo: limpo(e.razaoSocial), linhas: linhas.filter(Boolean) }
}
