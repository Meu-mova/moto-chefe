import { mock } from 'node:test'

/**
 * Mocka a fronteira de fora das actions de Vendas (`src/app/(dashboard)/vendas/actions.ts`) para
 * teste de banco: sessão, Supabase (as actions só o importam), next/cache, Kommo e WhatsApp. O
 * resto (banco, regras) roda de verdade. Chame antes de importar as actions; `sessao` é lida a
 * cada chamada, então o teste troca o usuário entre um passo e outro. Devolve o `restore`.
 */
export function mockarFronteiraDasVendas(sessao: () => Record<string, unknown>): () => void {
  const mocks = [
    mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => sessao() } }),
    mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => ({}) } }),
    mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
    mock.module('@/lib/kommo', { namedExports: { virarLeadKommo: async () => ({ resultado: 'sem_lead' }) } }),
    mock.module('@/lib/whatsapp/venda', { namedExports: { notificarVendaWhatsapp: async () => ({ resultado: 'desligado' }) } }),
  ]
  return () => { for (const m of mocks) m.restore() }
}
