import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, contaDoGrupoAtivo } from '@/lib/grupo'
import { carregarTelaModelos } from '@/lib/modelos-tela'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BlingCodigoCell } from './components/bling-codigo-cell'
import { ModeloFormButton } from './components/modelo-form-button'
import { ApelidosCell } from './components/apelidos-cell'
import { MarcasDaConta } from './components/marcas-da-conta'

export default async function ModelosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  // Só o admin_geral edita (as actions exigem admin_geral); o sócio só consulta.
  const adminGeral = usuario.papel === 'admin_geral'
  const { modelos: todos, codigos, apelidos, contas } = await carregarTelaModelos(adminGeral
    ? { adminGeral: true, contaId: null, grupoId: grupo.id }
    : { adminGeral: false, contaId: await contaDoGrupoAtivo(usuario), grupoId: grupo.id })
  const marcas = [...new Set(todos.map(m => m.marca))].sort()
  const codigoPorModelo = new Map(codigos.map(c => [c.modeloId, c.codigo]))
  const apelidosPorModelo = new Map<string, string[]>()
  for (const a of apelidos) {
    apelidosPorModelo.set(a.modeloId, [...(apelidosPorModelo.get(a.modeloId) ?? []), a.apelido])
  }

  return (
    <AdminGuard href="/admin/modelos">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Modelos</h1>
            <p className="text-muted-foreground text-sm">
              {adminGeral ? <>Clique em <strong>Cód. Bling</strong> (do grupo <strong>{grupo.nome}</strong>) ou em{' '}
              <strong>Apelidos na NF</strong> para editar inline. Apelido é como a nota de entrada
              escreve o modelo — “DRIFT” para DRIFT CAR — e é o que liga a moto à ficha fiscal.</> : <>Modelos das marcas da sua Conta. Só a plataforma edita.</>}
            </p>
          </div>
          {adminGeral && <ModeloFormButton />}
        </div>
        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Potência</TableHead>
                <TableHead>Cód. Bling</TableHead>
                <TableHead>Apelidos na NF</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.marca}</TableCell>
                  <TableCell>{m.modelo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.categoria}</Badge>
                  </TableCell>
                  <TableCell>{m.potenciaW}W</TableCell>
                  <TableCell>
                    {adminGeral
                      ? <BlingCodigoCell modeloId={m.id} valor={codigoPorModelo.get(m.id) ?? null} />
                      : codigoPorModelo.get(m.id) ?? '—'}
                  </TableCell>
                  <TableCell>
                    {adminGeral
                      ? <ApelidosCell modeloId={m.id} valores={apelidosPorModelo.get(m.id) ?? []} />
                      : (apelidosPorModelo.get(m.id) ?? []).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {adminGeral && <ModeloFormButton modelo={{
                      id: m.id, marca: m.marca, modelo: m.modelo,
                      categoria: m.categoria, potenciaW: m.potenciaW,
                    }} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {contas && <MarcasDaConta contas={contas} marcas={marcas} />}
      </div>
    </AdminGuard>
  )
}
