// Loja sugerida a partir do endereço da sede na adesão (#292, passo "Loja").
// Endereço é texto livre ("Rua X, 100, Centro, CEP 37550-000, Pouso Alegre – MG"):
// a leitura é só ponto de partida, o admin confere e corrige na tela.

const RE_CEP = /\b(\d{5})-?(\d{3})\b/
// "Cidade – UF" ou "Cidade/UF" no fim. Separa por vírgula ou por traço entre
// espaços (" - "): o traço colado é do nome ("São João del-Rei").
const RE_CIDADE_UF = /(?:^|,|\s[–-]\s)\s*((?:(?!\s[–-]\s)[^,])+?)\s*(?:\s[–-]\s|[–-]|\/)\s*[A-Za-z]{2}\.?\s*$/

export type LojaSugerida = { nome: string; cidade: string; endereco: string; cep: string }

export function lojaSugerida(nomeLoja: string, enderecoSede: string | null): LojaSugerida {
  let resto = (enderecoSede ?? '').trim()
  const cep = resto.match(RE_CEP)
  resto = resto.replace(/,?\s*(?:CEP:?\s*)?\d{5}-?\d{3}\b/i, '')
  const cidade = resto.match(RE_CIDADE_UF)
  if (cidade) resto = resto.slice(0, cidade.index).trim()
  return {
    nome: nomeLoja.trim(),
    cidade: cidade?.[1].trim() ?? '',
    endereco: resto.replace(/[,\s–-]+$/, ''),
    cep: cep ? `${cep[1]}-${cep[2]}` : '',
  }
}
