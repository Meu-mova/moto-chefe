import { getUsuarioLogado } from '@/lib/auth'
import { listarClientesAction, listarCidadesAction } from './actions'
import { ClientesTable } from './components/clientes-table'
import { ClienteForm } from './components/cliente-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()

  if (usuario.papel === 'mecanico') {
    return (
      <div className="p-6">
        <p className="text-slate-500">Sem permissão para acessar esta página.</p>
      </div>
    )
  }

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)

  const [lista, cidades] = await Promise.all([
    listarClientesAction({
      busca: params.busca,
      tipoPessoa: params.tipoPessoa,
      sexo: params.sexo,
      cidade: params.cidade,
    }),
    listarCidadesAction(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-slate-500 text-sm">Cadastro e histórico de clientes</p>
        </div>
        <ClienteForm />
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
        <CardHeader>
          <CardTitle className="text-base">
            {lista.length} cliente{lista.length !== 1 ? 's' : ''} encontrado{lista.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ClientesTable clientes={lista} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
