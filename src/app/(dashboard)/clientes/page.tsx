import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarClientesAction, listarCidadesAction } from './actions'
import { ClientesTable } from './components/clientes-table'
import { ClienteForm } from './components/cliente-form'
import { ClientesFiltros } from './components/clientes-filtros'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function buildUrl(params: Record<string, string | undefined>, overrides: Record<string, string>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v) p.set(k, v)
  }
  return `/clientes?${p.toString()}`
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/clientes')) redirect('/dashboard')

  const isAdmin = usuario.papel === 'admin_geral'
  const pagina = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const [resultado, cidades] = await Promise.all([
    listarClientesAction({
      busca: params.busca,
      tipoPessoa: params.tipoPessoa,
      sexo: params.sexo,
      cidade: params.cidade,
      page: pagina,
    }),
    listarCidadesAction(),
  ])

  const { clientes: lista, total, pageSize } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const inicio = (pagina - 1) * pageSize + 1
  const fim = Math.min(pagina * pageSize, total)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro e histórico de clientes</p>
        </div>
        <ClienteForm trigger={<Button>Novo Cliente</Button>} />
      </div>

      <ClientesFiltros
        valores={{ busca: params.busca, tipoPessoa: params.tipoPessoa, sexo: params.sexo, cidade: params.cidade }}
        cidades={cidades}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {total === 0
              ? 'Nenhum cliente encontrado'
              : `${inicio}–${fim} de ${total} cliente${total !== 1 ? 's' : ''}`}
          </CardTitle>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              {pagina <= 1 ? (
                <Button variant="outline" size="sm" disabled>Anterior</Button>
              ) : (
                <Link href={buildUrl(params, { page: String(pagina - 1) })} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Anterior</Link>
              )}
              <span className="text-sm text-muted-foreground">
                Página {pagina} de {totalPaginas}
              </span>
              {pagina >= totalPaginas ? (
                <Button variant="outline" size="sm" disabled>Próxima</Button>
              ) : (
                <Link href={buildUrl(params, { page: String(pagina + 1) })} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Próxima</Link>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <ClientesTable clientes={lista} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
