import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, notagatewayConfig } from '@/lib/db/schema'
import { cifrar, decifrar } from '@/lib/cripto'
import type { ConfigNotaGateway } from './client'

/**
 * Credencial da Nota Gateway do grupo (#446). Só o admin_geral grava: o token
 * emite NF-e em nome do CNPJ e o ambiente decide se a nota vale. O sócio segue
 * com as regras fiscais e a logo do DANFE, mas vê a credencial só para leitura.
 * Token e empresaId são só de escrita: nunca voltam para a tela.
 */

type Executor = Pick<typeof db, 'select' | 'update' | 'insert'>

export type CredencialPayload = {
  grupoId: string
  /** Vazio = não mexer no token já gravado. */
  token: string
  /** Vazio = não mexer na empresa já gravada. */
  empresaId: string
  ambiente: 'Homologacao' | 'Producao'
}

export type DependenciasCredencial = {
  /** CNPJ cadastrado na NG para a empresa (Consultar Empresa). Lança se a NG não responder. */
  cnpjDaEmpresaNaNg: (cfg: ConfigNotaGateway) => Promise<string>
}

export const podeGravarCredencialNg = (papel: string) => papel === 'admin_geral'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A doc da NG diz só 'string': não depende de uuid, mas nada que mude o caminho da URL.
const ID_EMPRESA_NG = /^[A-Za-z0-9_-]{1,64}$/
const digitos = (s: string) => s.replace(/\D/g, '')

export async function salvarCredencial(
  usuario: { papel: string },
  data: CredencialPayload,
  deps: DependenciasCredencial,
  exec: Executor = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!podeGravarCredencialNg(usuario.papel)) return { ok: false, erro: 'Acesso restrito ao Admin Geral' }
  const [g] = UUID.test(data.grupoId)
    ? await exec.select({ id: grupos.id, cnpj: grupos.cnpj }).from(grupos).where(eq(grupos.id, data.grupoId)).limit(1)
    : []
  if (!g) return { ok: false, erro: 'Grupo não encontrado' }

  const [atual] = await exec
    .select({ token: notagatewayConfig.token, empresaId: notagatewayConfig.empresaId })
    .from(notagatewayConfig)
    .where(eq(notagatewayConfig.grupoId, data.grupoId))
    .limit(1)
  const token = data.token.trim()
  if (!atual && !token) return { ok: false, erro: 'Informe o token da Nota Gateway para configurar este grupo' }

  const empresaId = data.empresaId.trim()
  if (empresaId) {
    // O id vai no caminho da URL da NG: fora do formato (../, ?) nem chega lá.
    if (!ID_EMPRESA_NG.test(empresaId)) {
      return { ok: false, erro: 'O id da empresa na Nota Gateway não está no formato certo. Copie de novo do painel da Nota Gateway.' }
    }
    // Mesma frase para qualquer outro grupo: não diz de qual Conta ele é.
    const [outro] = await exec
      .select({ grupoId: notagatewayConfig.grupoId })
      .from(notagatewayConfig)
      .where(and(eq(notagatewayConfig.empresaId, empresaId), ne(notagatewayConfig.grupoId, data.grupoId)))
      .limit(1)
    if (outro) return { ok: false, erro: 'Essa empresa da Nota Gateway já está ligada a outro grupo.' }
  }

  // Token novo com a empresa já gravada também reconfere: um token de outra conta da NG
  // enxergaria outra empresa com o mesmo id.
  const empresaAConferir = empresaId || (token ? atual?.empresaId : null)
  if (empresaAConferir) {
    let cnpjNaNg: string
    try {
      const tokenNg = token || decifrar(atual!.token).toString('utf8')
      cnpjNaNg = await deps.cnpjDaEmpresaNaNg({ token: tokenNg, empresaId: empresaAConferir, ambiente: data.ambiente })
    } catch (e) {
      // Só a mensagem, que o client.ts monta com o status HTTP; nunca token nem empresaId.
      console.error('[credencial-ng] Consultar Empresa falhou:', e instanceof Error ? e.message : 'erro desconhecido')
      return { ok: false, erro: 'Não deu para confirmar a empresa na Nota Gateway agora. Confira o token e o id e tente de novo.' }
    }
    if (digitos(cnpjNaNg) !== digitos(g.cnpj)) {
      return { ok: false, erro: 'Essa empresa da Nota Gateway tem outro CNPJ, diferente do CNPJ deste grupo.' }
    }
  }

  const mudancas = {
    ambiente: data.ambiente,
    atualizadoEm: sql`NOW()` as unknown as Date,
    ...(token ? { token: cifrar(token) } : {}),
    ...(empresaId ? { empresaId } : {}),
  }
  if (atual) {
    await exec.update(notagatewayConfig).set(mudancas).where(eq(notagatewayConfig.grupoId, data.grupoId))
  } else {
    await exec.insert(notagatewayConfig).values({ grupoId: data.grupoId, token: cifrar(token), ...mudancas })
  }
  return { ok: true }
}
