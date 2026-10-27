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
import { ExcluirModeloButton } from './components/excluir-modelo-button'
import { podeCadastrarModelo, podeEditarModelo } from '@/lib/gestao-modelos'

export default async function ModelosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  // O admin_geral edita todos; o sócio cadastra e edita só os da própria Conta (#321).
  const adminGeral = usuario.papel === 'admin_geral'
  const contaId = adminGeral ? null : await contaDoGrupoAtivo(usuario)
  const quem = { papel: usuario.papel, contaId }
  const podeCadastrar = podeCadastrarModelo(quem)
  const { modelos: todos, codigos, apelidos, contas } = await carregarTelaModelos(contaId === null
    ? { adminGeral: true, contaId: null, grupoId: grupo.id }
    : { adminGeral: false, contaId, grupoId: grupo.id })
  const nomeDaConta = new Map((contas ?? []).map(c => [c.id, c.nome]))
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
              escreve o modelo — “DRIFT” para DRIFT CAR — e é o que liga a moto à ficha fiscal.</> : <>Modelos da plataforma (das marcas da sua Conta) e os que a sua Conta cadastrou. Você edita e exclui só os da sua Conta; exclusão só enquanto nenhuma moto ou demanda usa o modelo.</>}
            </p>
          </div>
          {podeCadastrar && <ModeloFormButton />}
        </div>
        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Potência</TableHead>
                {adminGeral && <TableHead>Conta</TableHead>}
                {adminGeral && <TableHead>Cód. Bling</TableHead>}
                <TableHead>Apelidos na NF</TableHead>
                <TableHead className="w-20"></TableHead>
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
                  {adminGeral && <TableCell className="text-muted-foreground">{m.contaId ? nomeDaConta.get(m.contaId) ?? '—' : 'Plataforma'}</TableCell>}
                  {adminGeral && (
                    <TableCell>
                      {/* Modelo da Conta não tem código Bling: o cliente novo emite pela Nota Gateway. */}
                      {m.contaId ? '—' : <BlingCodigoCell modeloId={m.id} valor={codigoPorModelo.get(m.id) ?? null} />}
                    </TableCell>
                  )}
                  <TableCell>
                    {podeEditarModelo(quem, m)
                      ? <ApelidosCell modeloId={m.id} valores={apelidosPorModelo.get(m.id) ?? []} />
                      : (apelidosPorModelo.get(m.id) ?? []).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {podeEditarModelo(quem, m) && (
                      <div className="flex">
                        <ModeloFormButton modelo={{
                          id: m.id, marca: m.marca, modelo: m.modelo,
                          categoria: m.categoria, potenciaW: m.potenciaW,
                        }} />
                        <ExcluirModeloButton id={m.id} nome={m.modelo} />
                      </div>
                    )}
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
