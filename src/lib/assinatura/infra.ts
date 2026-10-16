import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { emailCodigo } from '@/lib/assinatura/mensagens'
import { enviarEmail } from '@/lib/email'
import type { Infra } from '@/lib/assinatura/fluxo'

/** Infra real do fluxo de assinatura. O bucket é de quem chama: cada tipo de documento guarda selfie e traço no seu. */
export function criarInfra(bucket: string): Infra {
  return {
    enviarEmail,
    emailCodigo,
    async upload(caminho, conteudo, contentType) {
      const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const r = await admin.storage.from(bucket).upload(caminho, conteudo, { contentType, upsert: true })
      return { ok: !r.error }
    },
    agora: () => new Date(),
  }
}
