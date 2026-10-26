// src/app/conta-desativada/page.tsx
//
// Destino de quem tem sessão válida no Supabase mas `usuarios.ativo = false`
// (ver getUsuarioLogado em @/lib/auth). De propósito, esta página NÃO chama
// getUsuarioLogado — ela É o redirecionamento que essa função faz, então
// chamá-la de novo aqui recairia no mesmo redirect (não é loop infinito, mas
// não serve pra nada: mostraria a mesma página de novo).
import { logoutAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'

export default function ContaDesativadaPage() {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-lg border p-6 shadow-sm text-center space-y-4">
        <h1 className="text-xl font-bold">Conta desativada</h1>
        <p className="text-sm text-muted-foreground">
          Esta conta foi desativada e não tem mais acesso ao sistema. Se isso for um engano,
          fale com o administrador.
        </p>
        <form action={logoutAction}>
          <Button type="submit" className="w-full">Sair</Button>
        </form>
      </div>
    </div>
  )
}
