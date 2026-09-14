import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// getUsuarioLogado roda PRIMEIRO em toda página (layout e página). Se a query de
// usuário fica esperando uma conexão do pool (instância do Fluid com conexões
// presas), sem timeout ela pendura a requisição inteira até os 300s da Vercel —
// era a peça do caminho crítico que faltava blindar. Timeout curto que ESTOURA
// (não desloga): cai no error boundary com "Tentar novamente", em vez de travar.
//
// `etapa` existe porque as duas chamadas abaixo (auth do Supabase e banco) davam
// a MESMA mensagem: no incidente de 19/08 os logs só diziam "Timeout 8000ms na
// autenticação", sem dizer qual das duas travou — e as duas respondiam em ~150ms
// quando medidas por fora. Sem o nome da etapa não dá para fechar o diagnóstico.
function withTimeout<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  const inicio = Date.now()
  return Promise.race([
    p.then((v) => {
      const gasto = Date.now() - inicio
      if (gasto > 2000) console.warn(`[auth] ${etapa} lento: ${gasto}ms`)
      return v
    }),
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Timeout ${ms}ms na autenticação (${etapa})`)), ms)
    ),
  ])
}

export const getUsuarioLogado = cache(async () => {
  const supabase = await createClient()
  // getClaims() valida a assinatura ES256 do JWT localmente (WebCrypto + JWKS
  // cacheado), sem ida ao servidor de auth — a garantia é criptográfica, não é
  // confiar no cookie. Era getUser(), uma chamada HTTP por página: em 19/08 ela
  // passou a estourar os 8s aqui e os 10s do middleware, com o auth do Supabase
  // respondendo em 150ms quando medido de fora. Ver memória project-auth-getclaims.
  const { data } = await withTimeout(supabase.auth.getClaims(), 8000, 'getClaims do Supabase')
  const userId = data?.claims.sub

  if (!userId) redirect('/login')

  const [usuario] = await withTimeout(
    db.select().from(usuarios).where(eq(usuarios.id, userId)).limit(1),
    8000,
    'consulta do usuário no banco',
  )

  if (!usuario) redirect('/login')

  // Conta desativada (funcionário desligado, conta de teste) não pode
  // continuar usando o sistema, mesmo com a sessão do Supabase ainda válida.
  // Antes desta checagem, `usuarios.ativo` só filtrava relatório de vendedor —
  // a pessoa continuava entrando e navegando normalmente em qualquer tela.
  //
  // Redireciona para /conta-desativada, não para /login: o middleware só olha
  // a sessão do Supabase (não o `ativo` do banco), então mandar pro /login com
  // sessão válida viraria loop (middleware manda de volta pro /dashboard).
  //
  // Sem válvula de segurança aqui de propósito: diferente da trava de
  // /completar-cadastro, estar desativado é uma decisão explícita de um
  // admin_geral, não um estado em que alguém cai sozinho. Se um admin_geral
  // for desativado por engano, a saída é pelo banco (UPDATE usuarios SET
  // ativo = true), não por uma exceção de papel no código.
  if (!usuario.ativo) redirect('/conta-desativada')

  return usuario
})

export function isAdmin(papel: string) {
  return papel === 'admin_geral'
}

// ─── Papéis acumulados ────────────────────────────────────────────────────────
// Uma pessoa pode exercer mais de uma função (ex.: Tiago é aux_adm em Lavras e
// também vende). `papel` continua sendo o papel principal e governa todo o
// sistema; `papeisExtras` só acrescenta.
//
// A migração dos gates de `papel === 'x'` para cá é incremental e proposital:
// existem centenas de leituras de `.papel`, quase todas gate de admin, que não
// têm nada a ver com papel duplo. Um gate ainda não migrado faz a pessoa deixar
// de ver algo que poderia ver — nunca o contrário.
export function temPapel(
  usuario: { papel: string; papeisExtras?: string[] | null },
  papel: string,
) {
  return usuario.papel === papel || (usuario.papeisExtras ?? []).includes(papel)
}

// ─── Exceção pontual: entrada/importação de motos ─────────────────────────────
// Liberado nominalmente para o adm da loja de Pouso Alegre, por decisão
// explícita — NÃO é uma permissão do papel aux_adm, os demais aux_adm continuam
// de fora. Mesmo padrão de podeTransferirEntreGrupos em @/lib/grupo.
const EMAIL_ENTRADA_MOTOS = 'pedro.henrique@motochefesuldeminas.com.br'

export function podeRegistrarEntradaMotos(usuario: { papel: string; email: string }) {
  if (['admin_geral', 'admin_socio'].includes(usuario.papel)) return true
  return usuario.email === EMAIL_ENTRADA_MOTOS
}

// ─── Exceção pontual: categorizar saída do banco (/despesas) ──────────────────
// Decisão do Cesar (12/08/2026): lançar, editar e cancelar a categorização das
// saídas do Open Finance é só dele e do Mateus. Os demais sócios (João Brito,
// Luiz Paulo, Marina) continuam vendo a aba inteira — só não mexem.
//
// É nominal porque o Mateus é admin_socio igual aos outros: não existe papel que
// separe os dois grupos. Mesmo padrão de podeRegistrarEntradaMotos acima.
const EMAIL_CATEGORIZA_DESPESA_BANCO = 'mateus@motochefesuldeminas.com.br'

export function podeCategorizarDespesaBanco(usuario: { papel: string; email: string }) {
  if (usuario.papel === 'admin_geral') return true
  return usuario.email === EMAIL_CATEGORIZA_DESPESA_BANCO
}

export function canEditLoja(usuarioLojaId: string | null, targetLojaId: string, papel: string) {
  if (papel === 'admin_geral') return true
  return usuarioLojaId === targetLojaId
}
