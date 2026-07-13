const FATOR_CORRECAO_ESTRADA = 1.3
const NOMINATIM_USER_AGENT = 'MotoChefe-Simulador/1.0 (contato@motochefesuldeminas.com.br)'

export type Coordenada = { latitude: number; longitude: number }

type EnderecoViaCep = {
  erro?: boolean
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

type ResultadoNominatim = { lat: string; lon: string }

export async function geocodificarCep(cep: string): Promise<Coordenada | null> {
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return null

  let endereco: EnderecoViaCep
  try {
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
    if (!viaCepRes.ok) return null
    endereco = await viaCepRes.json() as EnderecoViaCep
  } catch {
    return null
  }
  if (endereco.erro) return null

  const partes = [endereco.logradouro, endereco.bairro, endereco.localidade, endereco.uf, 'Brasil'].filter(Boolean)
  if (partes.length === 0) return null
  const query = partes.join(', ')

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    const nominatimRes = await fetch(nominatimUrl, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } })
    if (!nominatimRes.ok) return null
    const resultados = await nominatimRes.json() as ResultadoNominatim[]
    if (resultados.length === 0) return null
    const lat = parseFloat(resultados[0].lat)
    const lon = parseFloat(resultados[0].lon)
    if (isNaN(lat) || isNaN(lon)) return null
    return { latitude: lat, longitude: lon }
  } catch {
    return null
  }
}

function toRad(graus: number): number {
  return (graus * Math.PI) / 180
}

export function calcularDistanciaKm(origem: Coordenada, destino: Coordenada): number {
  const raioTerraKm = 6371
  const dLat = toRad(destino.latitude - origem.latitude)
  const dLon = toRad(destino.longitude - origem.longitude)
  const lat1 = toRad(origem.latitude)
  const lat2 = toRad(destino.latitude)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const distanciaLinhaReta = raioTerraKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))

  return distanciaLinhaReta * FATOR_CORRECAO_ESTRADA
}

export function calcularCustoFrete(
  distanciaKmIda: number,
  valorPorKm: number,
  kmGratis: number,
): { kmIdaEVolta: number; custo: number } {
  const kmIdaEVolta = distanciaKmIda * 2
  const kmCobravel = Math.max(0, kmIdaEVolta - kmGratis)
  const custo = kmCobravel * valorPorKm
  return { kmIdaEVolta, custo }
}
