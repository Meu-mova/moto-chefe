import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, notagatewayConfig, usuarios } from '@/lib/db/schema'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { ajustarLogo } from '@/lib/notagateway/logo'
import type { ConfigNotaGateway } from '@/lib/notagateway/client'

/**
 * Logo do DANFE por grupo (#428). Só admin_geral (todos os grupos) e admin_socio
 * (grupos da Conta dele). A NG é a fonte da verdade: a cópia no Storage serve só
 * para a tela mostrar a logo atual, porque a NG não tem como consultá-la.
 */

type Executor = Pick<typeof db, 'select' | 'update' | 'insert' | 'delete'>
export type UsuarioLogo = { id: string; papel: string; contaId: string | null }

export type DependenciasLogo = {
  configNg: (grupoId: string) => Promise<ConfigNotaGateway | null>
  vincularNaNg: (cfg: ConfigNotaGateway, png: Buffer) => Promise<void>
  salvarCopia: (grupoId: string, png: Buffer) => Promise<void>
}

export type ResultadoLogo = { ok: true; kb: number } | { ok: false; erro: string }

const PAPEIS = ['admin_geral', 'admin_socio']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Caminho no bucket privado `logos-danfe`: sempre do grupoId, nunca de entrada do usuário. */
export const caminhoLogoDanfe = (grupoId: string) => `${grupoId}/logo.png`

/** Filtro de Conta para o where; null quando o usuário não vê grupo nenhum. */
function filtroDaConta(usuario: UsuarioLogo): SQL | undefined | null {
  if (usuario.papel === 'admin_geral') return undefined
  if (usuario.papel !== 'admin_socio' || !usuario.contaId) return null
  return eq(grupos.contaId, usuario.contaId)
}

export async function gruposParaLogo(usuario: UsuarioLogo, exec: Executor = db) {
  const daConta = filtroDaConta(usuario)
  if (daConta === null) return []
  return exec
    .select({
      id: grupos.id,
      nome: grupos.nome,
      temNg: sql<boolean>`${notagatewayConfig.empresaId} is not null`,
      logoEnviadaEm: notagatewayConfig.logoEnviadaEm,
      logoEnviadaPor: usuarios.nome,
    })
    .from(grupos)
    .leftJoin(notagatewayConfig, eq(notagatewayConfig.grupoId, grupos.id))
    .leftJoin(usuarios, eq(usuarios.id, notagatewayConfig.logoEnviadaPor))
    .where(daConta)
    .orderBy(asc(grupos.nome))
}

/** Grupo que o usuário pode configurar, ou null (outra Conta e inexistente dão o mesmo null). */
async function grupoDoUsuario(usuario: UsuarioLogo, grupoId: string, exec: Executor) {
  const daConta = filtroDaConta(usuario)
  // Id que não é uuid faria o Postgres lançar; responde como grupo inexistente.
  if (daConta === null || !UUID.test(grupoId)) return null
  const [g] = await exec.select({ id: grupos.id }).from(grupos).where(and(eq(grupos.id, grupoId), daConta)).limit(1)
  return g ?? null
}

/** Confere permissão e devolve a logo ajustada para a prévia, sem enviar nada. */
export async function previaLogoDanfe(usuario: UsuarioLogo, grupoId: string, arquivo: Buffer, exec: Executor = db) {
  if (!PAPEIS.includes(usuario.papel)) return { ok: false as const, erro: 'Acesso restrito a Admin Geral e Sócio' }
  if (!(await grupoDoUsuario(usuario, grupoId, exec))) return { ok: false as const, erro: 'Grupo não encontrado' }
  return ajustarLogo(arquivo)
}

export async function enviarLogoDanfe(
  usuario: UsuarioLogo,
  grupoId: string,
  arquivo: Buffer,
  deps: DependenciasLogo,
  exec: Executor = db,
): Promise<ResultadoLogo> {
  const logo = await previaLogoDanfe(usuario, grupoId, arquivo, exec)
  if (!logo.ok) return logo
  try {
    const cfg = await deps.configNg(grupoId)
    if (!cfg) return { ok: false, erro: 'Configure a Nota Gateway deste grupo antes de enviar a logo.' }
    await deps.vincularNaNg(cfg, logo.png)
  } catch (e) {
    // Só a mensagem, que nunca leva token nem empresaId (logo-ng.ts põe só o status HTTP).
    console.error('[logo-danfe] envio à NG falhou:', e instanceof Error ? e.message : 'erro desconhecido')
    return { ok: false, erro: 'Não deu para enviar a logo à Nota Gateway agora. Tente de novo em alguns minutos.' }
  }
  // Daqui em diante a NG já imprime a logo nova: o log registra mesmo se a cópia falhar.
  try {
    await registrarAcaoSensivel({ tipo: 'logo_danfe_enviada', usuarioId: usuario.id, grupoId, detalhe: { kb: logo.kb } }, exec)
  } catch (e) {
    console.error('[logo-danfe] falha ao registrar no log:', e instanceof Error ? e.message : e)
  }

  try {
    await deps.salvarCopia(grupoId, logo.png)
    await exec
      .update(notagatewayConfig)
      .set({ logoEnviadaEm: new Date(), logoEnviadaPor: usuario.id })
      .where(eq(notagatewayConfig.grupoId, grupoId))
  } catch {
    return { ok: false, erro: 'A logo já vale nas próximas notas, mas a cópia do MOVA não foi salva. Envie de novo para ela aparecer aqui.' }
  }
  return { ok: true, kb: logo.kb }
}
