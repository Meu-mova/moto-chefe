import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg border p-6 shadow-sm">
        <h1 className="text-xl font-bold">
          {inicial ? 'Meus dados' : `Bem-vindo, ${usuario.nome.split(' ')[0]}`}
        </h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          {inicial
            ? 'Atualize seus dados quando precisar.'
            : 'Antes de continuar, precisamos de três informações suas. Leva um minuto.'}
        </p>
        <CompletarCadastroForm inicial={inicial} />
      </div>
    </div>
  )
}
