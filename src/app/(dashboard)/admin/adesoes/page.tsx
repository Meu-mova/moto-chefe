import { SuperAdminGuard } from '../components/admin-guard'
import { listarAdesoesAction, listarGruposAction } from './actions'
import { AdesoesPainel } from './components/adesoes-painel'
import { envioTravadoNaProducao } from '@/lib/assinatura/contrato-adesao'

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
  const [lista, gruposOpcoes] = await Promise.all([listarAdesoesAction(), listarGruposAction()])
  return <AdesoesPainel adesoes={lista} grupos={gruposOpcoes} envioTravado={envioTravadoNaProducao()} />
}
