import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado } from '@/lib/auth'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  const comunicadosNaoLidos = await buscarComunicadosNaoLidosAction()

  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar papel={usuario.papel} />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6 bg-slate-50">
            {children}
          </main>
        </div>
      </div>
      <ComunicadoModal comunicados={comunicadosNaoLidos} />
    </Providers>
  )
}
