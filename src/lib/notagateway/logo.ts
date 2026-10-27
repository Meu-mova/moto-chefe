import sharp from 'sharp'

// Medida recomendada pela NG: https://docs.notagateway.com.br/v2/reference/vincular-logotipo
const LARGURA = 340
const ALTURA = 120
const MAX_ENTRADA = 5 * 1024 * 1024
// Limite da doc v1 da NG (a v2 não cita): https://docs.notagateway.com.br/docs/como-inserir-a-logo-na-nota-fiscal
const MAX_SAIDA = 64 * 1024

export type LogoAjustada = { ok: true; png: Buffer; kb: number } | { ok: false; erro: string }

/** Recorta a margem e encaixa o desenho no centro de um PNG 340x120 de fundo transparente. */
export async function ajustarLogo(arquivo: Buffer): Promise<LogoAjustada> {
  if (arquivo.length > MAX_ENTRADA) return { ok: false, erro: 'A imagem passa de 5 MB. Envie um arquivo menor.' }
  // O formato vem do conteúdo, não do nome: um .png pode ser WebP renomeado.
  const formato = await sharp(arquivo).metadata().then((m) => m.format, () => null)
  if (formato !== 'png' && formato !== 'jpeg') return { ok: false, erro: 'Envie a logo em PNG ou JPG.' }
  const recortada = await sharp(arquivo).ensureAlpha().trim().toBuffer()
  const png = await sharp(recortada)
    .resize(LARGURA, ALTURA, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  if (png.length > MAX_SAIDA) {
    return { ok: false, erro: 'A logo ajustada passou de 64 KB. Use uma imagem mais simples, com menos detalhes.' }
  }
  return { ok: true, png, kb: Math.round((png.length / 1024) * 10) / 10 }
}
