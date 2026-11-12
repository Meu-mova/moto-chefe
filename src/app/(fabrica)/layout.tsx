// Área da fábrica MotoChefe: sem menu, sem seletor de grupo e sem Server Action. O login
// da fábrica só chega aqui (middleware, @/lib/painel-fabrica); o admin_geral também abre,
// para ver o que a fábrica vê, e ganha o link de volta ao MOVA.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { getUsuarioLogado } from '@/lib/auth'
import { MARCA_PAINEL_FABRICA, PAPEL_FABRICA, ROTA_SAIR, podeVerPainelFabrica } from '@/lib/painel-fabrica'

export default async function FabricaLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!podeVerPainelFabrica(usuario)) redirect('/dashboard')

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">MOVA · Fábrica {MARCA_PAINEL_FABRICA}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline text-muted-foreground truncate max-w-48">{usuario.nome}</span>
            {usuario.papel !== PAPEL_FABRICA && (
              <Link href="/dashboard" className="h-8 px-3 inline-flex items-center rounded-md hover:bg-muted">Voltar ao MOVA</Link>
            )}
            {/* POST para uma rota, não Server Action: o login da fábrica não chama action nenhuma. */}
            <form action={ROTA_SAIR} method="post">
              <button type="submit" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md hover:bg-muted">
                <LogOut size={14} /> Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
