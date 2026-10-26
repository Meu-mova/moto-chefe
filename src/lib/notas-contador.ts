// Envio das notas ao contador (#402): regras sem banco nem rede.
import type { CategoriaNota } from '@/lib/notas-emitidas'
import { zipDasNotas, type Baixar } from '@/lib/notas-emitidas-arquivos'

// O Resend aceita até 40 MB por e-mail já em base64, que cresce 4/3; a folga cobre o texto e os cabeçalhos.
export const LIMITE_ANEXO_BYTES = 28 * 1024 * 1024

export const VALIDADE_LINK_DIAS = 7

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

export function periodoBr(de: string, ate: string): string {
  return de === ate ? dataBr(de) : `${dataBr(de)} a ${dataBr(ate)}`
}

const plural = (n: number, singular: string, pluralTxt: string) => `${n} ${n === 1 ? singular : pluralTxt}`

export function emailAoContador(p: {
  grupo: string
  de: string
  ate: string
  autorizadas: number
  canceladas: number
  faltaram: number
  link?: string
}): { assunto: string; texto: string } {
  const periodo = periodoBr(p.de, p.ate)
  const linhas = [
    'Olá,',
    '',
    `Seguem o XML e o PDF (DANFE) das notas fiscais de saída de ${p.grupo}, emitidas em ${periodo}: `
      + `${plural(p.autorizadas, 'autorizada', 'autorizadas')} e ${plural(p.canceladas, 'cancelada', 'canceladas')}.`,
    '',
    p.link
      ? `O arquivo passou do tamanho de anexo. Baixe pelo link abaixo, válido por ${VALIDADE_LINK_DIAS} dias:\n${p.link}`
      : 'Os arquivos estão no zip em anexo.',
  ]
  if (p.faltaram > 0) {
    linhas.push('', `${plural(p.faltaram, 'arquivo não estava disponível', 'arquivos não estavam disponíveis')} na hora do envio; a lista está no zip.`)
  }
  linhas.push('', 'Enviado pelo MOVA.')
  return { assunto: `Notas fiscais ${p.grupo} ${periodo}`, texto: linhas.join('\n') }
}

type NotaDoEnvio = { id: string; numero: string | null; serie: string | null; categoria: CategoriaNota; linkXml: string | null; linkDanfe: string | null }

export type ResultadoEnvio =
  | { ok: true; modo: 'anexo' | 'link'; notas: number; faltaram: number }
  | { ok: false; erro: 'sem_notas' | 'link' | 'email' }

/** Monta o zip (XML + PDF), escolhe anexo ou link e manda. Rede e Storage entram por parâmetro. */
export async function enviarAoContador(
  p: { grupo: string; de: string; ate: string; notas: NotaDoEnvio[]; limiteAnexo?: number; tempoEsgotado?: () => boolean },
  d: {
    baixar: Baixar
    enviar: (e: { assunto: string; texto: string; anexo?: { nome: string; conteudo: Uint8Array } }) => Promise<boolean>
    /** Guarda o zip e devolve o link assinado, ou null se não deu. */
    publicar: (zip: Uint8Array) => Promise<string | null>
  },
): Promise<ResultadoEnvio> {
  if (p.notas.length === 0) return { ok: false, erro: 'sem_notas' }
  let baixados = 0
  const contando: Baixar = async url => { const c = await d.baixar(url); if (c) baixados++; return c }
  const zip = new Uint8Array(await new Response(zipDasNotas(p.notas, ['xml', 'pdf'], contando, p.tempoEsgotado)).arrayBuffer())
  const faltaram = p.notas.length * 2 - baixados

  const modo = zip.length <= (p.limiteAnexo ?? LIMITE_ANEXO_BYTES) ? 'anexo' : 'link'
  const link = modo === 'link' ? await d.publicar(zip) : undefined
  if (link === null) return { ok: false, erro: 'link' }

  const email = emailAoContador({
    grupo: p.grupo, de: p.de, ate: p.ate, faltaram, link,
    autorizadas: p.notas.filter(n => n.categoria === 'autorizada').length,
    canceladas: p.notas.filter(n => n.categoria === 'cancelada').length,
  })
  const anexo = modo === 'anexo' ? { nome: `notas-${p.de}-a-${p.ate}.zip`, conteudo: zip } : undefined
  if (!(await d.enviar({ ...email, anexo }))) return { ok: false, erro: 'email' }
  return { ok: true, modo, notas: p.notas.length, faltaram }
}
