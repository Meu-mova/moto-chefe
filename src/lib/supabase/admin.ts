import { createClient } from '@supabase/supabase-js'

// Cliente do Supabase com a service role (ignora RLS, cria e muda login). Só no servidor,
// só depois de conferir quem pede. As actions antigas ainda têm a cópia local
// `getAdminClient`; código novo usa este.
export function clienteSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
