import { enviarAlertaWhatsapp, type ResultadoEnvioWhatsapp } from './client'

export type NotaParaAviso = { emitenteNome: string; valor: string; chave: string }

// Acima disso, listar nota a nota vira mensagem gigante no WhatsApp — um
// backlog de centenas de notas resumidas numa rodada só (ver avisado_em em
// sincronizar.ts) pode facilmente passar de 10.
const LIMITE_PARA_RESUMIR = 10

// toLocaleString separa "R$" do número com espaço não-quebrável (U+00A0),
// invisível na tela e ruim em log e comparação — normalizado, como no aviso de
// pedidos da fábrica.
const brl = (v: string) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

/** String vazia = não há o que avisar. Quem chama não manda mensagem vazia. */
export function montarAvisoNfe(grupo: string, notas: NotaParaAviso[]): string {
  if (notas.length === 0) return ''

  // A mesma nota pode aparecer duas vezes no mesmo lote da SEFAZ — o resumo
  // (NSU N) e, logo depois, a nota completa (NSU N+2), ambos no lote da
  // mesma rodada. Sem deduplicar por chave aqui, a mensagem lista a nota
  // duas vezes e soma o valor em dobro. Mantém a última ocorrência (o dado
  // mais recente da mesma chave, normalmente o mais completo).
  const porChave = new Map<string, NotaParaAviso>()
  for (const n of notas) porChave.set(n.chave, n)
  const unicas = [...porChave.values()]

  const total = unicas.reduce((s, n) => s + Number(n.valor || 0), 0)
  const cabecalho = unicas.length === 1
    ? `MOVA INFORMA: chegou 1 nota nova contra o CNPJ de ${grupo}.`
    : `MOVA INFORMA: chegaram ${unicas.length} notas novas contra o CNPJ de ${grupo}, somando ${brl(String(total))}.`

  // A partir do limite, o cabeçalho acima (que já traz quantidade e total) é
  // o resumo inteiro — não lista nota a nota. Abaixo do limite, lista.
  if (unicas.length >= LIMITE_PARA_RESUMIR) {
    return `${cabecalho}\n\nVeja em Estoque & Fábrica › Notas Recebidas.`
  }

  const linhas = unicas.map(n => `• ${n.emitenteNome} — ${brl(n.valor)}`).join('\n')
  return `${cabecalho}\n\n${linhas}\n\nVeja em Estoque & Fábrica › Notas Recebidas.`
}

export type ResultadoAviso = ResultadoEnvioWhatsapp | 'nada_a_avisar'

/**
 * Devolve o resultado do envio (e não só void): quem chama em sincronizar.ts
 * precisa saber se o WhatsApp confirmou o envio antes de marcar as notas como
 * avisadas — nota não avisada por WhatsApp fora do ar tem que continuar
 * pendente para a próxima rodada, não sumir da fila silenciosamente.
 */
export async function avisarNotasNovas(grupo: string, notas: NotaParaAviso[]): Promise<ResultadoAviso> {
  const texto = montarAvisoNfe(grupo, notas)
  if (!texto) return 'nada_a_avisar'
  return enviarAlertaWhatsapp(texto)
}
