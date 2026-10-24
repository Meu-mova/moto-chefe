import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarMeusHoleritesAction } from '../folha-pagamento/holerites-actions'
import { MeusHolerites } from './components/meus-holerites'

// Página pessoal: cada um vê os próprios documentos, qualquer que seja o papel.
// O recorte é por usuarioId dentro das actions — aqui não há filtro de loja nem de
// grupo, porque o documento é da pessoa, não da operação.
export default async function MeusDocumentosPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/meus-documentos')) redirect('/dashboard')

  const holerites = await listarMeusHoleritesAction()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meus Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Seus holerites de adiantamento e de pagamento do salário. Só você e o escritório enxergam estes arquivos.
        </p>
      </div>

      <MeusHolerites holerites={holerites} />
    </div>
  )
}
