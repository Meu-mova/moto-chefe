import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { itensDoUsuario } from '@/lib/navegacao-servidor'
import { CATEGORIAS, type Slug } from '@/lib/navegacao'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const categoria = CATEGORIAS.find(c => c.slug === slug)
  if (!categoria) notFound()

  const usuario = await getUsuarioLogado()
  const itens = itensDoUsuario(usuario).filter(i => i.categoria === (slug as Slug))
  // Categoria vazia para esta pessoa é 404, não página em branco: ela não
  // deveria ter chegado aqui, já que o sidebar não mostra a linha.
  if (itens.length === 0) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{categoria.nome}</h1>
        <p className="text-slate-500 text-sm">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {itens.map(({ id, href, label, icon: Icon }) => (
          <Link key={id} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Icon className="text-slate-600" size={20} />
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
