import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { listarMotos } from '@/lib/queries/motos'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Archive, Eye, Search } from 'lucide-react'
import Link from 'next/link'
import { statusLabel_legado, disponibilidadeLabel } from '@/lib/estado-moto'
import { diaBrt } from '@/lib/data-venda'
import { idsQuePodeDesarquivar } from '@/lib/arquivar-motos'
import { DesarquivarMoto } from './components/desarquivar-moto'

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/radar')) redirect('/dashboard')
  const busca = q?.trim() ?? ''

  // Cada Conta acha só as próprias motos (#320); o admin_geral, da plataforma, acha todas.
  const contaId = usuario.papel === 'admin_geral' ? undefined : await contaDoGrupoAtivo(usuario)
  const motos = busca
    ? await listarMotos({ chassiBusca: busca, contaId, grupoLiberado: usuario.grupoLiberado, incluirArquivadas: true })
    : []
  // O botão sai da mesma regra do servidor: papel, Conta e grupos que a pessoa vê (#691).
  const desarquivaveis = new Set(await idsQuePodeDesarquivar(usuario, motos.filter(m => m.arquivadaEm).map(m => m.id)))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">RADAR</h1>
        <p className="text-muted-foreground text-sm">Localize qualquer moto da sua rede pelo chassi, inclusive vendidas e arquivadas</p>
      </div>

      <form method="GET" className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={busca}
            placeholder="Digite o chassi ou parte dele..."
            autoFocus
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className={buttonVariants({ variant: 'default', size: 'default' })}
        >
          Buscar
        </button>
      </form>

      {!busca && (
        <p className="text-muted-foreground text-sm">Digite um chassi acima para começar a busca.</p>
      )}

      {busca && motos.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhuma moto encontrada para o chassi <strong>{busca}</strong>.
        </p>
      )}

      {motos.length > 0 && (
        <p className="text-muted-foreground text-sm">{motos.length === 1 ? '1 moto encontrada' : `${motos.length} motos encontradas`}</p>
      )}

      {/* Celular: cartões, sem rolagem para o lado (#691, variante A2 do protótipo). */}
      {motos.length > 0 && (
        <ul className="space-y-3 sm:hidden">
          {motos.map((moto) => (
            <li key={moto.id} className="overflow-hidden rounded-lg border bg-card">
              {moto.arquivadaEm && (
                <p className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
                  <Archive size={14} aria-hidden /><span><strong className="font-semibold text-foreground">Arquivada</strong> em {diaBrt(moto.arquivadaEm.toISOString())}</span>
                </p>
              )}
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{moto.marca} {moto.modelo}</p>
                    <p className="font-mono text-xs break-all">{moto.chassi}</p>
                  </div>
                  <Link href={`/estoque/${moto.id}`} className={buttonVariants({ variant: 'ghost', className: 'h-11 shrink-0' })}>
                    <Eye size={14} aria-hidden /> Ver
                  </Link>
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">{[moto.cor, moto.lojaNome].filter(Boolean).join(' · ')}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{statusLabel_legado[moto.status] ?? moto.status}</Badge>
                  {moto.disponibilidade && <Badge variant="secondary">{disponibilidadeLabel[moto.disponibilidade] ?? moto.disponibilidade}</Badge>}
                </div>
              </div>
              {desarquivaveis.has(moto.id) && (
                <div className="px-4 pb-4"><DesarquivarMoto motoId={moto.id} chassi={moto.chassi} larguraTotal /></div>
              )}
            </li>
          ))}
        </ul>
      )}

      {motos.length > 0 && (
        <div className="hidden rounded-lg border bg-card sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chassi</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Disponibilidade</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {motos.map((moto) => (
                <TableRow key={moto.id}>
                  <TableCell>
                    {/* Arquivada (0174): só o RADAR mostra; some do resto do MOVA. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs">{moto.chassi}</span>
                      {moto.arquivadaEm && <Badge variant="outline" className="whitespace-nowrap">Arquivada</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{moto.marca} {moto.modelo}</TableCell>
                  <TableCell>{moto.cor}</TableCell>
                  <TableCell>{moto.lojaNome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {statusLabel_legado[moto.status] ?? moto.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {moto.disponibilidade && (
                      <Badge variant="secondary">
                        {disponibilidadeLabel[moto.disponibilidade] ?? moto.disponibilidade}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {desarquivaveis.has(moto.id) && <DesarquivarMoto motoId={moto.id} chassi={moto.chassi} />}
                      <Link
                        href={`/estoque/${moto.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        <Eye size={14} className="mr-1" /> Ver
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
