import { esc } from '@/lib/assinatura/documento'
import { formatarNumeroBR } from '@/lib/numero-br'

function dataBR(aaaaMmDd: string): string {
  const [a, m, d] = aaaaMmDd.split('-')
  return `${d}/${m}/${a}`
}

export function emailCobranca(p: { responsavel: string | null; grupo: string; valor: number; vencimento: string; link: string }) {
  const saudacao = p.responsavel ? `Olá, ${p.responsavel}.` : 'Olá.'
  const valor = `R$ ${formatarNumeroBR(p.valor)}`
  const assunto = `Mensalidade do MOVA: ${valor}, vence em ${dataBR(p.vencimento)}`
  const texto = [
    saudacao,
    `A mensalidade do MOVA de ${p.grupo}, no valor de ${valor}, vence em ${dataBR(p.vencimento)}.`,
    `Pague por PIX, boleto ou cartão neste link: ${p.link}`,
    'Equipe MOVA',
  ].join('\n\n')
  const html = `<p>${esc(saudacao)}</p>
<p>A mensalidade do MOVA de <strong>${esc(p.grupo)}</strong>, no valor de <strong>${esc(valor)}</strong>, vence em <strong>${dataBR(p.vencimento)}</strong>.</p>
<p><a href="${esc(p.link)}">Pagar por PIX, boleto ou cartão</a></p>
<p>Equipe MOVA</p>`
  return { assunto, texto, html }
}

export function emailVencimento(p: { responsavel: string | null; grupo: string; valor: number; vencimento: string }) {
  const saudacao = p.responsavel ? `Olá, ${p.responsavel}.` : 'Olá.'
  const valor = `R$ ${formatarNumeroBR(p.valor)}`
  const assunto = `A mensalidade do MOVA vence hoje (${dataBR(p.vencimento)})`
  const texto = [
    saudacao,
    `A mensalidade do MOVA de ${p.grupo}, de ${valor}, vence hoje. Sem pagamento, o acesso é suspenso no 6º dia após o vencimento.`,
    'Para pagar, entre no MOVA e clique em "Pagar" no aviso do topo, ou use o link do e-mail da cobrança.',
    'Equipe MOVA',
  ].join('\n\n')
  const html = texto.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n')
  return { assunto, texto, html }
}
