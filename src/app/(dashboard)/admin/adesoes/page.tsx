import { SuperAdminGuard } from '../components/admin-guard'
import { listarAdesoesAction } from './actions'
import { AdesoesPainel } from './components/adesoes-painel'

export default async function AdesoesPage() {
  const lista = await listarAdesoesAction()

  return (
    <SuperAdminGuard href="/admin/adesoes">
      <AdesoesPainel adesoes={lista} />
    </SuperAdminGuard>
  )
}
