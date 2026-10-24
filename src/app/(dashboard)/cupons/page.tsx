import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { statusCupom } from '@/lib/cupom-revisao'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listarCuponsAction } from './actions'
import { podeEmitirCupom } from './papeis'
import { CuponsTable } from './components/cupons-table'
import { CuponsFiltros } from './components/cupons-filtros'
import { EmitirCupomDialog } from './components/emitir-cupom-dialog'

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/cupons')) redirect('/dashboard')

  const params = await searchParams
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const podeEmitir = podeEmitirCupom(usuario.papel)
  const hoje = hojeBrt()

  const [cupons, lojasOpts] = await Promise.all([
    listarCuponsAction({ status: params.status, q: params.q }),
    listarLojasDoGrupoAtivo(usuario),
  ])

  // Contadores do recorte carregado. Com filtro de status ligado a lista já vem
  // recortada e os outros cards ficam em zero — é o comportamento esperado: os
  // cards descrevem o que está na tela.
  const porStatus = cupons.map(c => statusCupom({ status: c.status, validoAte: c.validoAte, osId: c.osId }, hoje))
  const ativos = porStatus.filter(s => s === 'ativo').length
  const usados = porStatus.filter(s => s === 'usado').length
  const vencidos = porStatus.filter(s => s === 'vencido').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cupons de Revisão</h1>
        <p className="text-muted-foreground text-sm">
          Revisão gratuita de cortesia. O cupom cobre a mão de obra da OS — peças e óleo continuam sendo cobrados.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Ativos</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-success">{ativos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Utilizados</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{usados}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Vencidos</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-warning">{vencidos}</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CuponsFiltros />
        {podeEmitir && (
          <EmitirCupomDialog lojas={lojasOpts} lojaUsuarioId={usuario.lojaId} isAdmin={isAdmin} />
        )}
      </div>

      <CuponsTable cupons={cupons} hoje={hoje} podeCancelar={podeEmitir} />
    </div>
  )
}
