import { enviarAlertaWhatsapp } from './client'

export type NotaParaAviso = { emitenteNome: string; valor: string; chave: string }

// toLocaleString separa "R$" do número com espaço não-quebrável (U+00A0),
// invisível na tela e ruim em log e comparação — normalizado, como no aviso de
// pedidos da fábrica.
const brl = (v: string) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

/** String vazia = não há o que avisar. Quem chama não manda mensagem vazia. */
export function montarAvisoNfe(grupo: string, notas: NotaParaAviso[]): string {
  if (notas.length === 0) return ''
  const total = notas.reduce((s, n) => s + Number(n.valor || 0), 0)
  const linhas = notas.map(n => `• ${n.emitenteNome} — ${brl(n.valor)}`).join('\n')
  const cabecalho = notas.length === 1
    ? `MOVA INFORMA: chegou 1 nota nova contra o CNPJ de ${grupo}.`
    : `MOVA INFORMA: chegaram ${notas.length} notas novas contra o CNPJ de ${grupo}, somando ${brl(String(total))}.`
  return `${cabecalho}\n\n${linhas}\n\nVeja em Estoque & Fábrica › Notas Recebidas.`
}

export async function avisarNotasNovas(grupo: string, notas: NotaParaAviso[]): Promise<void> {
  const texto = montarAvisoNfe(grupo, notas)
  if (!texto) return
  await enviarAlertaWhatsapp(texto)
}
