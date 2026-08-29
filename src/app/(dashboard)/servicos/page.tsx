import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { servicosCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { ServicoForm } from './components/servico-form'
import { ServicoAtivoToggle } from './components/servico-ativo-toggle'

export default async function ServicosPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/servicos')) redirect('/dashboard')

  const servicos = await db.select().from(servicosCatalogo).orderBy(asc(servicosCatalogo.nome))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Serviços</h1>
          <p className="text-slate-500 text-sm">Serviços disponíveis para uso em Ordens de Serviço</p>
        </div>
        <ServicoForm trigger={
          <span className={buttonVariants({ variant: 'default', size: 'sm' })}>
            <Plus size={15} className="mr-1.5" /> Novo Serviço
          </span>
        } />
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tempo previsto</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicos.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell>{s.tempoPrevistoMinutos ? `${s.tempoPrevistoMinutos} min` : '—'}</TableCell>
                <TableCell>
                  {parseFloat(s.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </TableCell>
                <TableCell>
                  <ServicoAtivoToggle id={s.id} ativo={s.ativo} />
                </TableCell>
                <TableCell>
                  <ServicoForm
                    servicoInicial={{ id: s.id, nome: s.nome, tempoPrevistoMinutos: s.tempoPrevistoMinutos, valor: s.valor }}
                    trigger={
                      <button className="text-slate-400 hover:text-slate-700">
                        <Pencil size={14} />
                      </button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {servicos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  Nenhum serviço cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
