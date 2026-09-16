/**
 * Sugestão de modelo e preço para as motos que entram por XML de NF-e ou planilha.
 *
 * O preço de compra tem duas fontes e uma vale mais que a outra: o que está no
 * cadastro do modelo (`preco_compra_padrao`) manda, porque é o valor combinado
 * com a fábrica. Só que boa parte do catálogo nunca teve esse campo preenchido
 * — FANTOM, DOT e TITAN entram às dezenas com o cadastro vazio — e aí o valor
 * fiel é o da última entrada daquele modelo. Sem nenhum dos dois, vem vazio e
 * quem está importando digita.
 *
 * Em todos os casos a sugestão é só o ponto de partida: o campo fica editável na
 * tela e o que vale é o que a pessoa confirmar.
 */

export type ModeloSugestao = {
  id: string
  modelo: string
  precoCompraPadrao: string | null
  ultimoPrecoCompra: string | null
}

export const normalizarNomeModelo = (s: string) =>
  s.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

// Numeric do Postgres chega como string ("5400.00"); "0.00" é preço não informado,
// não preço zero, então não interrompe a cascata.
function temValor(preco: string | null): preco is string {
  return !!preco && Number(preco) > 0
}

/**
 * Preço a gravar como padrão de cada modelo que acabou de entrar, para o cadastro
 * ir se preenchendo sozinho: modelo estreante entra sem sugestão uma vez só.
 * Quando o mesmo modelo vem com preços diferentes no lote, o primeiro vale — quem
 * conferir o cadastro depois ajusta.
 */
export function precosParaCadastrar(inseridas: { modeloId: string; preco: string }[]) {
  const porModelo = new Map<string, string>()

  for (const { modeloId, preco } of inseridas) {
    if (!modeloId || !temValor(preco) || porModelo.has(modeloId)) continue
    porModelo.set(modeloId, preco)
  }

  return porModelo
}

export function sugerirModeloEPreco(nomeDoArquivo: string, modelos: ModeloSugestao[]) {
  const alvo = normalizarNomeModelo(nomeDoArquivo)
  const cadastrado = modelos.find(m => normalizarNomeModelo(m.modelo) === alvo)

  if (!cadastrado) return { modeloId: '', preco: '' }

  const preco = [cadastrado.precoCompraPadrao, cadastrado.ultimoPrecoCompra].find(temValor) ?? ''

  return { modeloId: cadastrado.id, preco }
}
