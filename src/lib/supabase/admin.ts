import { createClient } from '@supabase/supabase-js'

// Único lugar que cria o cliente com a chave de serviço: ela ignora RLS e mexe em
// login e Storage de qualquer Conta, então quem chama confere a permissão antes.
// A chave não vai ao navegador: sem NEXT_PUBLIC_, o Next a troca por vazio no pacote do
// cliente. Importado num Client Component, o módulo compila mas falha ao rodar. Sem
// `import 'server-only'`, que os testes em node não resolvem. O admin-varredura.test.ts
// trava nova cópia fora daqui.
// Opções da doc do Supabase para cliente de servidor ("Create server-side auth client").
export function clienteSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
