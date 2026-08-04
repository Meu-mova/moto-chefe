import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { usuarios, usuariosDados } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TIPOS_CHAVE_PIX } from '@/lib/dados-funcionario'

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
  const linhas = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      cpf: usuariosDados.cpf,
      pixTipo: usuariosDados.pixTipo,
      pixChave: usuariosDados.pixChave,
      dataNascimento: usuariosDados.dataNascimento,
    })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .orderBy(asc(usuarios.nome))

  const rotulo = (t: string | null) => TIPOS_CHAVE_PIX.find(x => x.valor === t)?.rotulo ?? '—'
  const faltando = linhas.filter(l => !l.cpf).length

  return (
    <AdminGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Dados dos funcionários</h1>
          <p className="text-slate-500 text-sm">
            Preenchidos pelo próprio funcionário no primeiro acesso.
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell>
                  {l.cpf ? formatCpf(l.cpf) : <span className="text-slate-400">não preencheu</span>}
                </TableCell>
                <TableCell>{rotulo(l.pixTipo)}</TableCell>
                <TableCell>{l.pixChave ?? '—'}</TableCell>
                <TableCell>{l.dataNascimento ? formatData(l.dataNascimento) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminGuard>
  )
}
