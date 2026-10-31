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
        <p className="text-muted-foreground text-sm">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
      </div>
      {/* Itens sem seção caem num bloco sem título; a ordem das seções é a de ITENS. */}
      {[...new Set(itens.map(i => i.secao))].map(secao => (
        <section key={secao ?? ''} className="space-y-3">
          {secao && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{secao}</h2>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {itens.filter(i => i.secao === secao).map(({ id, href, label, icon: Icon }) => (
              <Link key={id} href={href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="flex-row gap-3 items-center pb-2">
                    <Icon className="text-muted-foreground" size={20} />
                    <CardTitle className="text-base">{label}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
