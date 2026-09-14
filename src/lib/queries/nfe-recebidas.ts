import { execRows } from '@/lib/db'
import { sql, type SQL } from 'drizzle-orm'

export type NotaRecebida = {
  chave: string
  // Posições 26–34 da chave, sem zero à esquerda — o número que aparece no
  // documento, no e-mail do fornecedor e em `motos.nota_fiscal_entrada`. É o
  // que a tela mostra; a chave de 44 dígitos vira só o `title` da célula.
  numeroNota: string
  emitenteNome: string
  emitenteCnpj: string
  valor: string | null
  dataEmissao: Date
  situacao: string
  jaLancada: boolean
  // 4 das notas capturadas chegaram só como resumo da SEFAZ (sem nota completa
  // ainda distribuída) — `xml` fica nulo pra elas, e os botões de XML/DANFE na
  // tela precisam saber disso pra ficar desabilitados em vez de dar erro.
  temXml: boolean
}

export type FiltrosNotas = {
  // Período (AAAA-MM-DD, fuso America/Sao_Paulo). Sem os dois, mantém o
  // comportamento antigo: últimos `dias` dias a partir de agora.
  de?: string
  ate?: string
  dias?: number
  // Parte do nome do emitente, sem diferenciar maiúscula/minúscula (ILIKE).
  emitente?: string
  // Chave completa (44 dígitos) ou número da nota (curto). Ver classificarBusca.
  busca?: string
  // Só o que ainda não virou entrada no estoque e não está cancelada.
  soNaoLancadas?: boolean
}

// Início/fim do dia em BRT, como string ISO pro driver — mesmo padrão usado
// em queries/marketing.ts (`janela`). Brasil não tem mais horário de verão,
// então o offset fixo -03:00 não erra.
function janela(de: string, ate: string) {
  return { ini: `${de}T00:00:00-03:00`, fim: `${ate}T23:59:59-03:00` }
}

/**
 * Classifica o texto do campo "chave ou número": 44 dígitos é chave inteira;
 * qualquer outra quantidade de dígitos é o número da nota. Caracteres que não
 * são dígito são descartados antes de contar (cola com espaço/ponto sem
 * problema). Texto sem nenhum dígito não filtra nada (retorna null).
 */
export function classificarBusca(texto: string): { tipo: 'chave' | 'numero'; valor: string } | null {
  const digitos = texto.replace(/\D/g, '')
  if (!digitos) return null
  if (digitos.length === 44) return { tipo: 'chave', valor: digitos }
  // Mesma normalização do ltrim(..., '0') usado do lado do banco (abaixo e em
  // "já lançada"): sem isso "0000123" e "123" não bateriam com a mesma nota.
  return { tipo: 'numero', valor: digitos.replace(/^0+/, '') || '0' }
}

/**
 * As notas recebidas do grupo, já dizendo se a entrada foi registrada.
 *
 * "Já lançada" sai de uma junção com `motos.nota_fiscal_entrada`, não de uma
 * coluna: guardar como campo criaria uma segunda verdade que envelhece sozinha
 * quando a moto for registrada depois. O número da NF está nas posições 26–34
 * da chave de 44 dígitos — é assim que a nota do extrato encontra a moto, e é
 * a mesma aritmética usada no filtro de busca por número e no número exibido
 * na tela (reaproveitada, não reescrita, nas três).
 */
export async function listarNotasRecebidas(grupoId: string, filtros: FiltrosNotas = {}): Promise<NotaRecebida[]> {
  const condicoes: SQL[] = [sql`n.grupo_id = ${grupoId}`]

  if (filtros.de && filtros.ate) {
    const { ini, fim } = janela(filtros.de, filtros.ate)
    condicoes.push(sql`n.data_emissao >= ${ini}::timestamptz AND n.data_emissao <= ${fim}::timestamptz`)
  } else {
    const dias = filtros.dias ?? 90
    condicoes.push(sql`n.data_emissao >= now() - ${`${dias} days`}::interval`)
  }

  if (filtros.emitente?.trim()) {
    condicoes.push(sql`n.emitente_nome ILIKE ${'%' + filtros.emitente.trim() + '%'}`)
  }

  const busca = filtros.busca?.trim() ? classificarBusca(filtros.busca) : null
  if (busca?.tipo === 'chave') {
    condicoes.push(sql`n.chave = ${busca.valor}`)
  } else if (busca?.tipo === 'numero') {
    condicoes.push(sql`ltrim(substring(n.chave from 26 for 9), '0') = ${busca.valor}`)
  }

  // Reaproveitada tanto no SELECT (coluna ja_lancada) quanto no filtro
  // "só não lançadas" abaixo — a mesma junção, montada uma vez só.
  const jaLancadaExiste = sql`
    EXISTS (
      SELECT 1 FROM motos m
        JOIN lojas l ON l.id = m.loja_id
       WHERE l.grupo_id = ${grupoId}
         AND regexp_replace(COALESCE(m.nota_fiscal_entrada, ''), '[^0-9]', '', 'g')
             = ltrim(substring(n.chave from 26 for 9), '0')
    )`

  if (filtros.soNaoLancadas) {
    condicoes.push(sql`NOT (${jaLancadaExiste})`)
    condicoes.push(sql`n.situacao != 'cancelada'`)
  }

  const linhas = await execRows(sql`
    SELECT n.chave, n.emitente_nome, n.emitente_cnpj, n.valor, n.data_emissao, n.situacao,
           n.xml IS NOT NULL AS tem_xml,
           ${jaLancadaExiste} AS ja_lancada
      FROM nfe_recebidas n
     WHERE ${sql.join(condicoes, sql` AND `)}
     ORDER BY n.data_emissao DESC`)

  return linhas.map(l => ({
    chave: String(l.chave),
    numeroNota: numeroDaChave(String(l.chave)),
    emitenteNome: String(l.emitente_nome),
    emitenteCnpj: String(l.emitente_cnpj),
    valor: l.valor == null ? null : String(l.valor),
    dataEmissao: new Date(l.data_emissao),
    situacao: String(l.situacao),
    jaLancada: Boolean(l.ja_lancada),
    temXml: Boolean(l.tem_xml),
  }))
}

/**
 * Número da nota a partir da chave de 44 dígitos: posições 26–34 (1-indexed,
 * como no `substring(... from 26 for 9)` do SQL acima e de "já lançada"),
 * sem zero à esquerda. Mesma aritmética, só que em JS — pra não ir ao banco
 * de novo só pra formatar o que a query já trouxe.
 */
export function numeroDaChave(chave: string): string {
  const bloco = chave.substring(25, 34)
  return bloco.replace(/^0+/, '') || '0'
}

/**
 * XML de uma nota específica, para as rotas de download (XML e DANFE).
 *
 * `grupoId` entra no WHERE, não é conferido depois em JS: assim uma chave de
 * outro grupo nem aparece no resultado (linhas.length === 0), e quem chama
 * responde 404 sem conseguir distinguir "não existe" de "é de outro CNPJ".
 * Nulo também quando a nota existe mas só chegou como resumo da SEFAZ (sem
 * XML completo ainda distribuído) — mesmo 404 do lado de quem chama, não tem
 * o que baixar.
 */
export async function buscarXmlDaNota(grupoId: string, chave: string): Promise<string | null> {
  const linhas = await execRows(sql`
    SELECT xml FROM nfe_recebidas
     WHERE grupo_id = ${grupoId} AND chave = ${chave}
     LIMIT 1`)
  if (linhas.length === 0) return null
  const xml = linhas[0].xml
  return xml == null ? null : String(xml)
}
