import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarTransferencias, listarMotosTransferiveis } from '@/lib/queries/transferencias'
import { listarLojasAtivasDaConta, lojasDaConta } from '@/lib/conta'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeTransferirEntreGrupos, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
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
  if (!usuarioPodeAcessar(usuario, '/transferencias')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)

  // Todos os papéis enxergam a movimentação entre todas as lojas do grupo ativo —
  // permissão pra aceitar/recusar continua restrita à loja de destino (ver actions.ts).
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const acessoMultiGrupo = isAdmin && podeTransferirEntreGrupos(usuario)

  // Valida origem/destino informados na URL contra o grupo ativo — um id
  // fora do grupo (estranho ou de outro tenant) é descartado, nunca vaza como filtro.
  const origemValida  = parseParam(params.origem).filter(id => lojaIdsGrupo.includes(id))
  const destinoValida = parseParam(params.destino).filter(id => lojaIdsGrupo.includes(id))

  const [lista, todasLojas, lojasParaSolicitar, motosTransferiveis, modelosOpts] = await Promise.all([
    listarTransferencias({
      lojaOrigemId:  origemValida.length  ? origemValida  : undefined,
      lojaDestinoId: destinoValida.length ? destinoValida : undefined,
      // Sem filtro explícito: mostra o que toca o grupo ativo (origem OU destino),
      // não só o que está inteiramente dentro dele — senão transferências entre
      // grupos nunca aparecem para aceitar, de nenhum dos dois lados.
      lojaOrigemOuDestinoId: !origemValida.length && !destinoValida.length ? lojaIdsGrupo : undefined,
      modeloId:      parseParam(params.modelo),
      status:        parseParam(params.status),
      chassiBusca:   params.q,
    }),
    listarLojasDoGrupoAtivo(usuario),
    acessoMultiGrupo ? listarLojasAtivasDaConta(usuario) : listarLojasDoGrupoAtivo(usuario),
    // Quem não é admin só solicita da própria loja; o admin, do grupo ativo; a
    // exceção entre grupos, das lojas da Conta.
    (acessoMultiGrupo
      ? contaDoGrupoAtivo(usuario).then(c => lojasDaConta(c)).then(rs => rs.map(r => r.id))
      : Promise.resolve(isAdmin ? lojaIdsGrupo : usuario.lojaId ? [usuario.lojaId] : [])
    ).then(ids => listarMotosTransferiveis(ids)),
    contaDoGrupoAtivo(usuario).then(c => listarModelosDaConta(c)),
  ])

  const pendentes = lista.filter(t => t.status === 'pendente')
  const historico = lista.filter(t => t.status !== 'pendente')

  const paraAceitar = isAdmin
    ? pendentes
    : pendentes.filter(t => t.lojaDestinoId === usuario.lojaId)

  const aguardando = isAdmin
    ? []
    : pendentes.filter(t => t.lojaOrigemId === usuario.lojaId)

  // Pendentes que não são nem da loja de origem nem de destino do usuário —
  // visíveis pra todos (movimentação do grupo), mas sem ação: o card já
  // esconde os botões de aceitar/recusar pra quem não é da loja de destino.
  const outrasLojas = isAdmin
    ? []
    : pendentes.filter(t => t.lojaDestinoId !== usuario.lojaId && t.lojaOrigemId !== usuario.lojaId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências</h1>
          <p className="text-muted-foreground text-sm">Movimentações entre lojas</p>
        </div>
        <SolicitarDialog
          lojas={lojasParaSolicitar}
          motos={motosTransferiveis}
          lojaUsuarioId={usuario.lojaId ?? null}
          papel={usuario.papel}
        />
      </div>

      <TransferenciasFiltros lojas={todasLojas} modelos={modelosOpts} isAdmin={isAdmin} />

      {paraAceitar.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-foreground">
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
          <h2 className="font-semibold text-sm text-foreground">
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

      {outrasLojas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-foreground">
            Em andamento em outras lojas ({outrasLojas.length})
          </h2>
          {outrasLojas.map(t => (
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
          <h2 className="font-semibold text-sm text-foreground">Histórico ({historico.length})</h2>
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
        <p className="text-sm text-muted-foreground text-center py-12">
          Nenhuma transferência encontrada.
        </p>
      )}
    </div>
  )
}
