import { esc } from '@/lib/html'
import { formatarNumeroBR } from '@/lib/numero-br'
import { dataPuraBr } from '@/lib/data-venda'

export function emailCobranca(p: { responsavel: string | null; grupo: string; valor: number; vencimento: string; link: string }) {
  const saudacao = p.responsavel ? `Olá, ${p.responsavel}.` : 'Olá.'
  const valor = `R$ ${formatarNumeroBR(p.valor)}`
  const assunto = `Mensalidade do MOVA: ${valor}, vence em ${dataPuraBr(p.vencimento)}`
  const texto = [
    saudacao,
    `A mensalidade do MOVA de ${p.grupo}, no valor de ${valor}, vence em ${dataPuraBr(p.vencimento)}.`,
    `Pague por PIX ou boleto neste link: ${p.link}`,
    'Equipe MOVA',
  ].join('\n\n')
  const html = `<p>${esc(saudacao)}</p>
<p>A mensalidade do MOVA de <strong>${esc(p.grupo)}</strong>, no valor de <strong>${esc(valor)}</strong>, vence em <strong>${dataPuraBr(p.vencimento)}</strong>.</p>
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
