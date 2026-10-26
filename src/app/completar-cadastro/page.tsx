import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { logoutAction } from '@/app/(auth)/login/actions'
import { CompletarCadastroForm } from './form'
import type { TipoChavePix } from '@/lib/dados-funcionario'

export default async function CompletarCadastroPage() {
  const usuario = await getUsuarioLogado()

  const [existente] = await db
    .select()
    .from(usuariosDados)
    .where(eq(usuariosDados.usuarioId, usuario.id))
    .limit(1)

  const inicial = existente
    ? {
        cpf: existente.cpf,
        pixTipo: existente.pixTipo as TipoChavePix,
        pixChave: existente.pixChave,
        dataNascimento: existente.dataNascimento,
      }
    : null

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-lg border p-6 shadow-sm">
        <h1 className="text-xl font-bold">
          {inicial ? 'Meus dados' : `Bem-vindo, ${usuario.nome.split(' ')[0]}`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          {inicial
            ? 'Atualize seus dados quando precisar.'
            : 'Antes de continuar, precisamos de três informações suas. Leva um minuto.'}
        </p>
        <CompletarCadastroForm inicial={inicial} />

        {/* Saída da tela. O layout do dashboard manda pra cá todo usuário sem
            dados preenchidos, e esta página fica FORA do (dashboard) — ou seja,
            sem o Header, que é onde mora o botão "Sair". Sem isto, quem chega
            aqui sem ter os próprios dados em mãos (o Cesar testando o acesso de
            um funcionário, por exemplo) fica preso: o logout é server action,
            não tem URL pra digitar, e a única saída era limpar cookie no
            navegador. */}
        <form action={logoutAction} className="mt-5 pt-4 border-t">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Sair desta conta
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Nada do que estiver preenchido acima é salvo ao sair.
          </p>
        </form>
      </div>
    </div>
  )
}
