import path from 'node:path'
import sharp from 'sharp'
import { linhasDoEmitente, type EmitenteDanfe } from './emitente-danfe'

/*
 * A NG desenha a logo numa caixa fixa de 244x79 pt (3,09:1) no quadro do emitente, esticando
 * sem manter a proporção, e com logo não escreve razão social nem endereço; fundo transparente
 * sai preto (medido nos DANFEs de homologação de 26/10, ver a spec da #428). Por isso a imagem
 * já vai com a proporção da caixa, fundo branco e os dados do emitente desenhados, como no
 * DANFE do Sul de Minas.
 */
const LARGURA = 976
const ALTURA = 316
const MARGEM = 30
const ALTURA_LOGO = 220
const FUNDO = '#ffffff' // cor-fixa-ok: fundo da imagem do DANFE, a NG pinta transparente de preto
const MAX_ENTRADA = 5 * 1024 * 1024
// Limite da doc v1 da NG (a v2 não cita): https://docs.notagateway.com.br/docs/como-inserir-a-logo-na-nota-fiscal
const MAX_SAIDA = 64 * 1024
// Fonte do repo (SIL OFL): a Vercel não tem fonte do sistema garantida. Vai no pacote pelo
// outputFileTracingIncludes do next.config.
const FONTE = path.join(process.cwd(), 'assets/fonts/Arimo.ttf')

export type ImagemDanfe = { ok: true; png: Buffer; kb: number } | { ok: false; erro: string }

/** O Pango lê marcação: texto vindo da NG ou digitado precisa sair literal. */
const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

async function textoDoEmitente(emitente: EmitenteDanfe, largura: number): Promise<Buffer> {
  const { titulo, linhas } = linhasDoEmitente(emitente)
  const marcacao = [`<span size="30pt" weight="bold">${escapar(titulo)}</span>`, ...linhas.map(l => `<span size="26pt">${escapar(l)}</span>`)].join('\n')
  const texto = await sharp({ text: { text: marcacao, fontfile: FONTE, font: 'Arimo', dpi: 72, rgba: true, width: largura, spacing: 6 } }).png().toBuffer()
  const meta = await sharp(texto).metadata()
  // Muitas linhas ou nome longo: encolhe para caber na altura, sem cortar.
  if (meta.height! > ALTURA - 2 * MARGEM) return sharp(texto).resize({ height: ALTURA - 2 * MARGEM }).toBuffer()
  return texto
}

/** Logo do arquivo (margem recortada) à esquerda e dados do emitente à direita, num PNG 976x316 branco. */
export async function montarImagemDanfe(arquivo: Buffer, emitente: EmitenteDanfe): Promise<ImagemDanfe> {
  if (arquivo.length > MAX_ENTRADA) return { ok: false, erro: 'A imagem passa de 5 MB. Envie um arquivo menor.' }
  // O formato vem do conteúdo, não do nome: um .png pode ser WebP renomeado.
  const formato = await sharp(arquivo).metadata().then((m) => m.format, () => null)
  if (formato !== 'png' && formato !== 'jpeg') return { ok: false, erro: 'Envie a logo em PNG ou JPG.' }

  let png: Buffer
  try {
    // De uma cor só não tem desenho para recortar; o trim devolveria a imagem inteira.
    const { channels } = await sharp(arquivo).stats()
    if (channels.every((c) => c.min === c.max)) throw new Error('imagem sem desenho')
    const logo = await sharp(arquivo)
      .flatten({ background: FUNDO })
      .trim({ threshold: 20 })
      .resize({ height: ALTURA_LOGO, width: Math.round(LARGURA * 0.36), fit: 'inside' })
      .toBuffer()
    const metaLogo = await sharp(logo).metadata()
    const xTexto = MARGEM + metaLogo.width! + 36
    const texto = await textoDoEmitente(emitente, LARGURA - xTexto - MARGEM)
    const metaTexto = await sharp(texto).metadata()
    const montada = sharp({ create: { width: LARGURA, height: ALTURA, channels: 3, background: FUNDO } }).composite([
      { input: logo, left: MARGEM, top: Math.round((ALTURA - metaLogo.height!) / 2) },
      { input: texto, left: xTexto, top: Math.round((ALTURA - metaTexto.height!) / 2) },
    ])
    png = await sharp(await montada.png().toBuffer()).png({ palette: true, colours: 64 }).toBuffer()
    // Logo com muitos detalhes: tenta de novo com menos cores antes de recusar.
    if (png.length > MAX_SAIDA) png = await sharp(png).png({ palette: true, colours: 16 }).toBuffer()
  } catch {
    return { ok: false, erro: 'Não deu para ler a imagem. Confira o arquivo e envie de novo.' }
  }
  // Defensiva: com o corte para 16 cores nem ruído aleatório passou de 64 KB nos testes; fica
  // para o caso de a montagem mudar (mais texto, outra medida).
  if (png.length > MAX_SAIDA) {
    return { ok: false, erro: 'A imagem montada passou de 64 KB. Use uma logo mais simples, com menos detalhes.' }
  }
  return { ok: true, png, kb: Math.round((png.length / 1024) * 10) / 10 }
}
