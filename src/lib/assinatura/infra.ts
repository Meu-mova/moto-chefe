import { clienteSupabaseAdmin } from '@/lib/supabase/admin'
import { emailCodigo } from '@/lib/assinatura/mensagens'
import { enviarEmail } from '@/lib/email'
import type { Infra } from '@/lib/assinatura/fluxo'

/** Infra real do fluxo de assinatura. O bucket é de quem chama: cada tipo de documento guarda selfie e traço no seu. */
export function criarInfra(bucket: string): Infra {
  return {
    enviarEmail,
    emailCodigo,
    async upload(caminho, conteudo, contentType) {
      const r = await clienteSupabaseAdmin().storage.from(bucket).upload(caminho, conteudo, { contentType, upsert: true })
      return { ok: !r.error }
    },
    agora: () => new Date(),
  }
}

/**
 * Apaga selfies e traços de assinatura de venda do bucket `assinaturas`. Chame DEPOIS do commit:
 * o Storage é outro serviço e não volta no rollback. Best-effort: a venda já saiu, e uma falha aqui
 * só deixa arquivo órfão, nunca derruba quem chamou.
 */
export async function apagarArquivosAssinatura(caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return
  try {
    const { error } = await clienteSupabaseAdmin().storage.from('assinaturas').remove(caminhos)
    if (error) console.error('[assinatura] falha ao apagar arquivos do bucket:', error.message)
  } catch (e) {
    console.error('[assinatura] falha ao apagar arquivos do bucket:', e)
  }
}
