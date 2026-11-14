import { after, test, mock } from 'node:test'
import assert from 'node:assert/strict'

// O supabase-js é a fronteira de fora: o teste confere o que o módulo pede a ele.
let chamadas: unknown[][] = []
const supabaseJs = mock.module('@supabase/supabase-js', {
  namedExports: { createClient: (...args: unknown[]) => { chamadas = [...chamadas, args]; return {} } },
})

const VARIAVEIS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const envAntes = VARIAVEIS.map(nome => [nome, process.env[nome]] as const)
after(() => {
  supabaseJs.restore()
  // Atribuir undefined ao process.env grava o texto "undefined": a variável que não existia é apagada.
  for (const [nome, valor] of envAntes) {
    if (valor === undefined) delete process.env[nome]
    else process.env[nome] = valor
  }
})

test('cliente com a chave de serviço, sem sessão persistida nem renovação automática', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exemplo.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa'
  const { clienteSupabaseAdmin } = await import('./admin')
  clienteSupabaseAdmin()
  assert.deepEqual(chamadas, [
    ['https://exemplo.invalid', 'chave-falsa', { auth: { persistSession: false, autoRefreshToken: false } }],
  ])
})
