import { getUsuarioLogado } from '@/lib/auth'
import { listarTransferencias } from '@/lib/queries/transferencias'
import { db } from '@/lib/db'
import { lojas, motos, modelos } from '@/lib/db/schema'
import { eq, inArray, asc } from 'drizzle-orm'
import { TransferenciaCard } from './components/transferencia-card'
import { SolicitarDialog } from './components/solicitar-dialog'
import { TransferenciasFiltros } from './components/transferencias-filtros'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; modelo?: string; origem?: string; destino?: string; q?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const [lista, todasLojas, motosTransferiveis, modelosOpts] = await Promise.all([
    listarTransferencias({
      lojaId:        !isAdmin ? (usuario.lojaId ?? undefined) : undefined,
      lojaOrigemId:  isAdmin ? parseParam(params.origem)  : undefined,
      lojaDestinoId: isAdmin ? parseParam(params.destino) : undefined,
      modeloId:      parseParam(params.modelo),
      status:        parseParam(params.status),
      chassiBusca:   params.q,
    }),
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(eq(lojas.ativa, true)).orderBy(asc(lojas.nome)),
    db
      .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo, lojaId: motos.lojaId })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(inArray(motos.status, ['disponivel', 'montada'])),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
  ])

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

      <TransferenciasFiltros lojas={todasLojas} modelos={modelosOpts} isAdmin={isAdmin} />

      {paraAceitar.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            {isAdmin ? `Pendentes (${paraAceitar.length})` : `Para aceitar (${paraAceitar.length})`}
          </h2>
          {paraAceitar.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
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
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          ))}
        </section>
      )}

      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Histórico ({historico.length})</h2>
          {historico.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">
          Nenhuma transferência encontrada.
        </p>
      )}
    </div>
  )
}
