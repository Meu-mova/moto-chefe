import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { GroupSelector } from '@/components/layout/group-selector'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()

  // Ninguém usa o sistema sem CPF, chave PIX e nascimento preenchidos.
  // admin_geral fica de fora de propósito: esta trava roda em toda página para
  // todo usuário, então precisa sobrar alguém que consiga entrar e corrigir se
  // ela tiver defeito.
  if (usuario.papel !== 'admin_geral') {
    const [dados] = await db
      .select({ usuarioId: usuariosDados.usuarioId })
      .from(usuariosDados)
      .where(eq(usuariosDados.usuarioId, usuario.id))
      .limit(1)
    if (!dados) redirect('/completar-cadastro')
  }

  const comunicadosNaoLidos = await buscarComunicadosNaoLidosAction()

  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar
          papel={usuario.papel}
          conecta={usuario.conecta}
          mostrarEntrada={podeRegistrarEntradaMotos(usuario)}
        />
        <div className="flex-1 flex flex-col">
          <Header />
          <GroupSelector usuario={usuario} />
          <main className="flex-1 p-6 bg-slate-50">
            {children}
          </main>
        </div>
      </div>
      <ComunicadoModal comunicados={comunicadosNaoLidos} />
    </Providers>
  )
}
