/**
 * Registro local de qual maquininha pertence a qual grupo.
 *
 * O agente confia no `--grupo` da linha de comando, mas o login de cada
 * operadora é manual e o "perfil do grupo" é só um diretório: nada impede que o
 * perfil de BH esteja logado na conta do Sul de Minas. Se isso acontecer, todas
 * as vendas entram no grupo errado — o mesmo estrago que
 * src/lib/conciliacao-terminal.ts existe para barrar no caminho do CSV.
 *
 * O serial da maquininha vem no payload das três operadoras, então serve de
 * assinatura: a primeira execução apenas registra em quem viu cada serial; a
 * partir daí, serial já visto aparecendo sob outro grupo aborta *aquela*
 * operadora — as outras seguem normalmente.
 */
import fs from 'node:fs'
import path from 'node:path'
import { BASE_COLETOR } from './base'
import type { TransacaoCartao } from '../../src/lib/conciliacao-cartao'

export const ARQUIVO_TERMINAIS = path.join(BASE_COLETOR, 'terminais.json')

/** serial da maquininha → slug do grupo que a usa. */
export type RegistroTerminais = Record<string, string>

/**
 * O serial vem em `rawData`: `serial_number` na InfinitePay e na Stone,
 * `terminal` na PagueVeloz. Transação sem serial é ignorada — algumas vendas
 * (link de pagamento, por exemplo) não passam por maquininha nenhuma.
 */
export function seriaisDasTransacoes(transacoes: TransacaoCartao[]): string[] {
  const seriais = transacoes.map(t => {
    const bruto = t.rawData?.serial_number ?? t.rawData?.terminal
    return typeof bruto === 'string' ? bruto.trim() : ''
  })
  return [...new Set(seriais.filter(s => s.length > 0))]
}

export function conflitosDeTerminal(
  registro: RegistroTerminais,
  slugGrupo: string,
  seriais: string[],
): { serial: string; grupo: string }[] {
  return seriais
    .filter(s => registro[s] && registro[s] !== slugGrupo)
    .map(s => ({ serial: s, grupo: registro[s] }))
}

export function registrarTerminais(
  registro: RegistroTerminais,
  slugGrupo: string,
  seriais: string[],
): RegistroTerminais {
  const novo = { ...registro }
  for (const s of seriais) novo[s] = slugGrupo
  return novo
}

export function lerRegistro(): RegistroTerminais {
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO_TERMINAIS, 'utf8')) as unknown
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {}
    // Arquivo mexido à mão não pode derrubar o agente: só entra par de strings.
    return Object.fromEntries(
      Object.entries(bruto as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
    ) as RegistroTerminais
  } catch {
    return {}   // primeira execução, ou arquivo ilegível
  }
}

export function gravarRegistro(registro: RegistroTerminais): void {
  fs.mkdirSync(path.dirname(ARQUIVO_TERMINAIS), { recursive: true })
  fs.writeFileSync(ARQUIVO_TERMINAIS, JSON.stringify(registro, null, 2), 'utf8')
}

/**
 * Barra a coleta desta operadora se alguma maquininha dela já foi vista em
 * outro grupo. Lança — quem chama trata como falha isolada da operadora.
 */
export function conferirTerminais(
  slugGrupo: string,
  operadora: string,
  transacoes: TransacaoCartao[],
): void {
  const seriais = seriaisDasTransacoes(transacoes)
  if (seriais.length === 0) return

  const registro = lerRegistro()
  const conflitos = conflitosDeTerminal(registro, slugGrupo, seriais)

  if (conflitos.length > 0) {
    const lista = conflitos.map(c => `${c.serial} (grupo ${c.grupo})`).join(', ')
    throw new Error(
      `maquininha de outro grupo na coleta da ${operadora}: ${lista}. ` +
      `O agente está rodando como ${slugGrupo} — confira em qual conta o perfil do navegador está logado. ` +
      `Nada foi enviado desta operadora. Se a maquininha realmente mudou de grupo, apague ${ARQUIVO_TERMINAIS}.`,
    )
  }

  gravarRegistro(registrarTerminais(registro, slugGrupo, seriais))
}
