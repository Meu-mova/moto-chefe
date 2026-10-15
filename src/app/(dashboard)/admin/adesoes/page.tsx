import { SuperAdminGuard } from '../components/admin-guard'
import { listarAdesoesAction } from './actions'
import { AdesoesPainel } from './components/adesoes-painel'

export default function AdesoesPage() {
  return (
    <SuperAdminGuard href="/admin/adesoes">
      <Conteudo />
    </SuperAdminGuard>
  )
}

// Separado para a lista só ser buscada depois do guard: quem não é admin_geral
// é redirecionado em vez de ver o erro da action.
async function Conteudo() {
  const lista = await listarAdesoesAction()
  return <AdesoesPainel adesoes={lista} />
}
