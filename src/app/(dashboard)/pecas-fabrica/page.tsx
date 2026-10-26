import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { PecasFabricaClient } from './components/pecas-fabrica-client'

export default async function PecasFabricaPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/pecas-fabrica')) redirect('/dashboard')

  // Só para o cabeçalho da folha que vai para a fábrica.
  const grupo = await getGrupoAtivo(usuario)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Retirada de Peças</h1>
        <p className="text-muted-foreground text-sm">
          Peças de troca já separadas ou conferidas na fábrica, prontas para retirar no galpão quando for buscar motos.
        </p>
      </div>
      <PecasFabricaClient grupo={grupo.nome} />
    </div>
  )
}
