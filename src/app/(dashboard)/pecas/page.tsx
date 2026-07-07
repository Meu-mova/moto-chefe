import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { PecaForm } from './components/peca-form'
import { PecaAtivoToggle } from './components/peca-ativo-toggle'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

export default async function PecasPage() {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) redirect('/dashboard')

  const pecas = await db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Peças</h1>
          <p className="text-slate-500 text-sm">Peças disponíveis para uso em Ordens de Serviço</p>
        </div>
        <PecaForm trigger={
          <span className={buttonVariants({ variant: 'default', size: 'sm' })}>
            <Plus size={15} className="mr-1.5" /> Nova Peça
          </span>
        } />
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pecas.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>
                  {parseFloat(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </TableCell>
                <TableCell>
                  <PecaAtivoToggle id={p.id} ativo={p.ativo} />
                </TableCell>
                <TableCell>
                  <PecaForm
                    pecaInicial={{ id: p.id, nome: p.nome, valor: p.valor }}
                    trigger={
                      <button className="text-slate-400 hover:text-slate-700">
                        <Pencil size={14} />
                      </button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {pecas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  Nenhuma peça cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
