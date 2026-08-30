import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarClientesAction, listarCidadesAction } from './actions'
import { ClientesTable } from './components/clientes-table'
import { ClienteForm } from './components/cliente-form'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
          <p className="text-slate-500 text-sm">Cadastro e histórico de clientes</p>
        </div>
        <ClienteForm trigger={<Button>Novo Cliente</Button>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-slate-700 mb-1 block">Busca</label>
              <Input
                name="busca"
                placeholder="Nome, CPF/CNPJ ou celular..."
                defaultValue={params.busca ?? ''}
              />
            </div>

            <div className="w-44">
              <label className="text-sm font-medium text-slate-700 mb-1 block">Tipo</label>
              <Select name="tipoPessoa" defaultValue={params.tipoPessoa ?? 'todos'}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="fisica">Pessoa Física</SelectItem>
                  <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-44">
              <label className="text-sm font-medium text-slate-700 mb-1 block">Sexo</label>
              <Select name="sexo" defaultValue={params.sexo ?? 'todos'}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="nao_identificado">Não identificado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cidades.length > 0 && (
              <div className="w-44">
                <label className="text-sm font-medium text-slate-700 mb-1 block">Cidade</label>
                <Select name="cidade" defaultValue={params.cidade ?? 'todos'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {cidades.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
              <span className="text-sm text-slate-500">
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
