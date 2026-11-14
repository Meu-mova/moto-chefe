import { notFound, redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { buscarTransferenciaDoGrupo } from '@/lib/queries/transferencias'
import { comprovanteDaTransferencia } from '@/lib/transferencia-tela'
import { ehUuid } from '@/lib/uuid'
import { PrintTrigger } from '@/components/print-trigger'
import { Comprovante } from './comprovante'

export default async function ImprimirTransferenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado()
  // Rota de impressão sem gate é rota aberta: mesma permissão da tela de Transferências.
  if (!usuarioPodeAcessar(usuario, '/transferencias')) redirect('/dashboard')

  const { id } = await params
  // Id malformado, inexistente ou de fora do grupo ativo: a mesma "não encontrada".
  if (!ehUuid(id)) notFound()
  const transferencia = await buscarTransferenciaDoGrupo(id, await listarLojaIdsDoGrupoAtivo(usuario))
  if (!transferencia) notFound()

  return (
    <>
      <PrintTrigger />
      <Comprovante c={comprovanteDaTransferencia(transferencia)} />
    </>
  )
}
