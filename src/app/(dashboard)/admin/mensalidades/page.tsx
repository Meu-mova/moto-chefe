import { SuperAdminGuard } from '../components/admin-guard'
import { listarMensalidadesAction } from './actions'
import { MensalidadesPainel } from './components/mensalidades-painel'
import { hojeBrt } from '@/lib/data-venda'

export default function MensalidadesPage() {
  return (
    <SuperAdminGuard href="/admin/mensalidades">
      <Conteudo />
    </SuperAdminGuard>
  )
}

async function Conteudo() {
  const grupos = await listarMensalidadesAction()
  return <MensalidadesPainel grupos={grupos} hoje={hojeBrt()} />
}
