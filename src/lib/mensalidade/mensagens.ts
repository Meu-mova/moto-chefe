import { esc } from '@/lib/html'
import { formatarNumeroBR } from '@/lib/numero-br'
import { dataPuraBr } from '@/lib/data-venda'
import type { TipoCobranca } from './regras'

export function emailCobranca(p: { tipo: TipoCobranca; responsavel: string | null; grupo: string; valor: number; vencimento: string; link: string }) {
  const saudacao = p.responsavel ? `Olá, ${p.responsavel}.` : 'Olá.'
  const valor = `R$ ${formatarNumeroBR(p.valor)}`
  const adesao = p.tipo === 'adesao'
  const assunto = adesao
    ? `Adesão ao MOVA: ${valor}`
    : `Mensalidade do MOVA: ${valor}, vence em ${dataPuraBr(p.vencimento)}`
  // A adesão vence no 1º acesso e libera o sistema: o texto diz isso em vez do vencimento.
  const frase = (grupo: string, v: string, venc: string) => adesao
    ? `A adesão ao MOVA de ${grupo}, no valor de ${v}, libera o acesso ao sistema assim que o pagamento for confirmado.`
    : `A mensalidade do MOVA de ${grupo}, no valor de ${v}, vence em ${venc}.`
  const texto = [saudacao, frase(p.grupo, valor, dataPuraBr(p.vencimento)), `Pague por PIX ou boleto neste link: ${p.link}`, 'Equipe MOVA'].join('\n\n')
  const html = `<p>${esc(saudacao)}</p>
<p>${frase(`<strong>${esc(p.grupo)}</strong>`, `<strong>${esc(valor)}</strong>`, `<strong>${dataPuraBr(p.vencimento)}</strong>`)}</p>
<p><a href="${esc(p.link)}">Pagar por PIX ou boleto</a></p>
<p>Equipe MOVA</p>`
  return { assunto, texto, html }
}

export function emailVencimento(p: { responsavel: string | null; grupo: string; valor: number; vencimento: string; link: string | null }) {
  const saudacao = p.responsavel ? `Olá, ${p.responsavel}.` : 'Olá.'
  const valor = `R$ ${formatarNumeroBR(p.valor)}`
  const assunto = `A mensalidade do MOVA vence hoje (${dataPuraBr(p.vencimento)})`
  const texto = [
    saudacao,
    `A mensalidade do MOVA de ${p.grupo}, de ${valor}, vence hoje. Sem pagamento, o acesso é suspenso no 6º dia após o vencimento.`,
    // Sem link (o Mercado Pago falhou ao criar), o caminho é a tela do MOVA.
    p.link ? `Pague neste link: ${p.link}` : 'Para pagar, entre no MOVA e clique em "Pagar" no aviso do topo.',
    'Equipe MOVA',
  ].join('\n\n')
  const html = texto.split('\n\n')
    .map(t => p.link && t.endsWith(p.link) ? `<p><a href="${esc(p.link)}">Pagar a mensalidade</a></p>` : `<p>${esc(t)}</p>`)
    .join('\n')
  return { assunto, texto, html }
}
