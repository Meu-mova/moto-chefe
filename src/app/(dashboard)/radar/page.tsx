import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { listarMotos } from '@/lib/queries/motos'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Eye, Search } from 'lucide-react'
import Link from 'next/link'
import { statusLabel_legado, disponibilidadeLabel } from '@/lib/estado-moto'

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
    ? await listarMotos({ chassiBusca: busca, contaId })
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">RADAR</h1>
        <p className="text-muted-foreground text-sm">Localize qualquer moto da sua rede pelo chassi — incluindo vendidas</p>
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
        <div className="bg-card rounded-lg border">
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
                  <TableCell className="font-mono text-xs">{moto.chassi}</TableCell>
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
                    <Link
                      href={`/estoque/${moto.id}`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Eye size={14} className="mr-1" /> Ver
                    </Link>
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
