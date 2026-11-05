import { AdminGuard, exigirAcessoPagina } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { contaDoEditor } from '@/lib/grupo'
import { listarDadosFuncionarios } from '@/lib/dados-funcionarios'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TIPOS_CHAVE_PIX, type TipoChavePix } from '@/lib/dados-funcionario'
import { EditarPixDialog } from './components/editar-pix-dialog'

function formatCpf(cpf: string) {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

// A coluna é `date` puro e chega como "YYYY-MM-DD". Formatar quebrando a string
// em vez de passar por `new Date()`, que vira 21h do dia anterior em Brasília.
function formatData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function DadosFuncionariosPage() {
  await exigirAcessoPagina('/admin/dados-funcionarios')
  const usuario = await getUsuarioLogado()
  const contaId = await contaDoEditor(usuario)
  const linhas = await listarDadosFuncionarios(contaId)

  const rotulo = (t: string | null) => TIPOS_CHAVE_PIX.find(x => x.valor === t)?.rotulo ?? '—'
  const faltando = linhas.filter(l => !l.cpf).length

  return (
    <AdminGuard href="/admin/dados-funcionarios">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Dados dos funcionários</h1>
          <p className="text-muted-foreground text-sm">
            Preenchidos pelo próprio funcionário no primeiro acesso. A chave PIX pode ser corrigida aqui.
            {faltando > 0 && ` ${faltando} ainda não preencheram.`}
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Chave PIX</TableHead>
              <TableHead>Nascimento</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell>
                  {l.cpf ? formatCpf(l.cpf) : <span className="text-muted-foreground">não preencheu</span>}
                </TableCell>
                <TableCell>{rotulo(l.pixTipo)}</TableCell>
                <TableCell>{l.pixChave ?? '—'}</TableCell>
                <TableCell>{l.dataNascimento ? formatData(l.dataNascimento) : '—'}</TableCell>
                {/* A lista já vem só com a Conta de quem edita; a action confere de novo. */}
                <TableCell>
                  {l.pixTipo && l.pixChave && (
                    <EditarPixDialog usuarioId={l.id} nome={l.nome}
                                     pixTipo={l.pixTipo as TipoChavePix} pixChave={l.pixChave} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminGuard>
  )
}
