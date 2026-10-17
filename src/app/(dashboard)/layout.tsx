import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { cookies } from 'next/headers'
import { Sidebar, MenuMobile } from '@/components/layout/sidebar'
import { COOKIE_SIDEBAR_RECOLHIDA } from '@/components/layout/sidebar-cookie'
import { BotaoVoltar } from '@/components/layout/botao-voltar'
import { GroupSelector } from '@/components/layout/group-selector'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado } from '@/lib/auth'
import { registrarPrimeiroAcesso } from '@/lib/primeiro-acesso'
import { itensDoUsuario } from '@/lib/navegacao-servidor'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

// Timeout defensivo para as consultas do layout. O layout roda em TODA página;
// sem isso, uma consulta que engasga no banco pendura qualquer tela até o limite
// de 300s da Vercel (era a query de comunicados, presa em ClientRead, derrubando
// páginas inteiras com 504). Falha rápido em vez de pendurar.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms no layout`)), ms)),
  ])
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()

  // Ninguém usa o sistema sem CPF, chave PIX e nascimento preenchidos.
  // admin_geral fica de fora de propósito: esta trava roda em toda página para
  // todo usuário, então precisa sobrar alguém que consiga entrar e corrigir se
  // ela tiver defeito.
  if (usuario.papel !== 'admin_geral') {
    // Fail-open: se a consulta estourar o timeout, deixa passar (dados = null) em
    // vez de travar a tela — a obrigatoriedade real vive nas escritas, não aqui.
    const dados = await withTimeout(
      db.select({ usuarioId: usuariosDados.usuarioId }).from(usuariosDados).where(eq(usuariosDados.usuarioId, usuario.id)).limit(1),
      8000,
    ).catch(() => null)
    if (dados && dados.length === 0) redirect('/completar-cadastro')
  }

  // A cobrança depende disto, mas a página não: se falhar, tenta de novo no próximo acesso.
  await withTimeout(registrarPrimeiroAcesso(usuario), 3000).catch(() => {})

  // Comunicados são acessórios: se demorar/falhar, o app abre sem o modal em vez
  // de pendurar. É a consulta que estava travando o layout inteiro.
  const comunicadosNaoLidos = await withTimeout(buscarComunicadosNaoLidosAction(), 8000).catch(() => [])

  const recolhida = (await cookies()).get(COOKIE_SIDEBAR_RECOLHIDA)?.value === '1'
  const itensIds = itensDoUsuario(usuario).map(i => i.id)
  const usuarioMenu = { nome: usuario.nome, email: usuario.email, papel: usuario.papel }

  return (
    <Providers>
      <div className="flex min-h-screen bg-background">
        <Sidebar itensIds={itensIds} conecta={usuario.conecta} usuario={usuarioMenu} recolhidaInicial={recolhida} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MenuMobile itensIds={itensIds} conecta={usuario.conecta} usuario={usuarioMenu} />
          <GroupSelector usuario={usuario} />
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <BotaoVoltar />
            {children}
          </main>
        </div>
      </div>
      <ComunicadoModal comunicados={comunicadosNaoLidos} />
    </Providers>
  )
}
