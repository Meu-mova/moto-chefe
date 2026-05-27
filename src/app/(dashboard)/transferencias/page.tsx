import { getUsuarioLogado } from '@/lib/auth'
import { listarTransferenciasPorLoja, listarTodasTransferencias } from '@/lib/queries/transferencias'
import { db } from '@/lib/db'
import { lojas, motos, modelos } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { TransferenciaCard, type TransferenciaCardData } from './components/transferencia-card'
import { SolicitarDialog } from './components/solicitar-dialog'

export default async function TransferenciasPage() {
  const usuario = await getUsuarioLogado()

  const [todasLojas, motosTransferiveis] = await Promise.all([
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(eq(lojas.ativa, true)),
    db
      .select({
        id: motos.id,
        chassi: motos.chassi,
        lojaId: motos.lojaId,
        marca: modelos.marca,
        modelo: modelos.modelo,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(inArray(motos.status, ['disponivel', 'montada'])),
  ])

  const lojaMap = Object.fromEntries(todasLojas.map(l => [l.id, l.nome]))

  // Normalise both query shapes into TransferenciaCardData
  let lista: TransferenciaCardData[]

  if (usuario.papel === 'admin_geral') {
    const rows = await listarTodasTransferencias()
    lista = rows.map(r => ({
      id: r.id,
      status: r.status,
      dataSolicitacao: r.dataSolicitacao,
      observacao: r.observacao,
      chassi: r.chassi,
      marca: r.marca,
      modelo: r.modelo,
      lojaOrigemNome: r.lojaOrigemNome,
      lojaDestinoId: r.lojaDestinoId,
      solicitadoPorNome: r.solicitadoPorNome,
      // fields not present in listarTodasTransferencias
      cor: null,
      lojaOrigemId: null,
    }))
  } else {
    const rows = await listarTransferenciasPorLoja(usuario.lojaId!)
    lista = rows.map(r => ({
      id: r.id,
      status: r.status,
      dataSolicitacao: r.dataSolicitacao,
      observacao: r.observacao,
      chassi: r.chassi,
      marca: r.marca,
      modelo: r.modelo,
      lojaOrigemNome: r.lojaOrigemNome,
      lojaDestinoId: r.lojaDestinoId,
      solicitadoPorNome: r.solicitadoPorNome,
      cor: r.cor,
      lojaOrigemId: r.lojaOrigemId,
    }))
  }

  // For admins: split into pending / historical only (no lojaOrigemId available from listarTodasTransferencias)
  // For others: further split pending by direction (incoming vs outgoing)
  const isAdmin = usuario.papel === 'admin_geral'

  const pendentes = lista.filter(t => t.status === 'pendente')
  const historico = lista.filter(t => t.status !== 'pendente')

  const paraAceitar = isAdmin
    ? pendentes
    : pendentes.filter(t => t.lojaDestinoId === usuario.lojaId)

  const aguardando = isAdmin
    ? []
    : pendentes.filter(t => t.lojaOrigemId === usuario.lojaId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências</h1>
          <p className="text-slate-500 text-sm">Movimentações entre lojas</p>
        </div>
        <SolicitarDialog
          lojas={todasLojas}
          motos={motosTransferiveis}
          lojaUsuarioId={usuario.lojaId ?? null}
          papel={usuario.papel}
        />
      </div>

      {paraAceitar.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            {isAdmin ? `Pendentes (${paraAceitar.length})` : `Para aceitar (${paraAceitar.length})`}
          </h2>
          {paraAceitar.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {aguardando.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            Aguardando resposta ({aguardando.length})
          </h2>
          {aguardando.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Histórico</h2>
          {historico.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">
          Nenhuma transferência registrada.
        </p>
      )}
    </div>
  )
}
