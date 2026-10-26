/**
 * Regras do teste de navegação (#393): combinações, que PR dispara o teste e quando um
 * elemento conta como "fundo claro grande" no tema escuro. O navegador fica em
 * scripts/navegacao-ci.ts; as regras de falha da tela vêm do smoke (scripts/lib/smoke.ts).
 */

export const LARGURAS = [390, 768, 1280] as const
export type Largura = (typeof LARGURAS)[number]
export const TEMAS = ['claro', 'escuro'] as const
export type Tema = (typeof TEMAS)[number]

export const ALTURA_POR_LARGURA: Record<Largura, number> = { 390: 844, 768: 1024, 1280: 800 }
// Abaixo do lg (1024 px) a barra lateral some e o menu abre pelo hambúrguer (sidebar.tsx).
export const menuNoHamburguer = (largura: number) => largura < 1024

/** O teste só roda em PR que mexe em tela. */
export const tocaTelas = (arquivos: readonly string[]) =>
  arquivos.some(a => a.startsWith('src/app/') || a.startsWith('src/components/'))

export type CaixaComFundo = {
  html: string
  /** Cor de fundo já convertida para RGBA 0–255 pelo navegador (oklch incluso). */
  r: number
  g: number
  b: number
  a: number
  largura: number
  altura: number
}

// Fundo com luminância acima disso é "claro": separa o card escuro do branco e do cinza-claro.
const LUMINANCIA_CLARA = 0.6
// "Grande": pelo menos 10% da tela. Ícone, badge e botão claros no escuro são decisão de desenho.
const FRACAO_GRANDE = 0.1

export const luminancia = ({ r, g, b }: Pick<CaixaComFundo, 'r' | 'g' | 'b'>) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/** Elementos com fundo claro e grandes na tela (falha no tema escuro). */
export function fundosClarosGrandes(caixas: readonly CaixaComFundo[], tela: { largura: number; altura: number }) {
  const areaTela = tela.largura * tela.altura
  return caixas.filter(c =>
    c.a / 255 >= 0.5 &&
    luminancia(c) > LUMINANCIA_CLARA &&
    Math.min(c.largura, tela.largura) * Math.min(c.altura, tela.altura) >= FRACAO_GRANDE * areaTela,
  )
}

/** Nome do print de um passo: `escuro-390-03-vendas-esqueleto.png`. */
export function nomePrint(tema: Tema, largura: number, passo: number, href: string, momento: 'esqueleto' | 'carregada') {
  const tela = href.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '_') || 'inicio'
  return `${tema}-${largura}-${String(passo).padStart(2, '0')}-${tela}-${momento}.png`
}
