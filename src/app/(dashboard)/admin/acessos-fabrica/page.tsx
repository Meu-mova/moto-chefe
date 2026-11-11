import { asc, eq } from 'drizzle-orm'
import { exigirAcessoPagina } from '../components/admin-guard'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { PAPEL_FABRICA } from '@/lib/painel-fabrica'
import { AcessosFabrica } from './components/acessos-fabrica'

export default async function AcessosFabricaPage() {
  // Antes de qualquer busca (#579).
  await exigirAcessoPagina('/admin/acessos-fabrica')
  const acessos = await db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, ativo: usuarios.ativo })
    .from(usuarios).where(eq(usuarios.papel, PAPEL_FABRICA)).orderBy(asc(usuarios.nome))

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Acessos da fábrica</h1>
        <p className="text-muted-foreground text-sm">
          Login e senha da fábrica MotoChefe. Quem entra com um destes vê só o Painel da Fábrica
          (estoque e vendas MotoChefe de todas as lojas), sem menu e sem nenhuma outra tela.
        </p>
      </div>
      <AcessosFabrica acessos={acessos} />
    </div>
  )
}
