import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { metasDoMes, realizadoDoMes } from '@/lib/queries/metas'
import { hojeEmBrasilia } from '@/lib/meta-vendas'
import { MetasForm } from './components/metas-form'

/** "2026-08" → {ano, mes}. Texto inválido cai no mês corrente de Brasília. */
function mesDoParametro(valor?: string) {
  const hoje = hojeEmBrasilia()
  if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return { ano: hoje.ano, mes: hoje.mes }
  const [ano, mes] = valor.split('-').map(Number)
  if (mes < 1 || mes > 12) return { ano: hoje.ano, mes: hoje.mes }
  return { ano, mes }
}

export default async function MetasPage({
  searchParams,
}: { searchParams: Promise<{ mes?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/metas')) redirect('/dashboard')

  const { mes: mesParam } = await searchParams
  const { ano, mes } = mesDoParametro(mesParam)
  const grupo = await getGrupoAtivo(usuario)

  // Só lojas ativas: loja fechada não tem meta a cumprir, e deixá-la na grade
  // convida alguém a preencher uma meta que ninguém vai perseguir.
  const lojasDoGrupo = await db
    .select({ id: lojas.id, nome: lojas.nome, cidade: lojas.cidade })
    .from(lojas)
    .where(and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)))
    .orderBy(asc(lojas.nome))

  const lojaIds = lojasDoGrupo.map(l => l.id)
  const [metas, realizado] = await Promise.all([
    metasDoMes(lojaIds, ano, mes),
    realizadoDoMes(lojaIds, ano, mes),
  ])

  const linhas = lojasDoGrupo.map(l => ({
    lojaId: l.id,
    loja: l.nome,
    cidade: l.cidade,
    meta: metas.get(l.id) ?? null,
    realizado: realizado.get(l.id) ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Metas de vendas — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Quanto cada loja precisa faturar no mês, em reais. É o que o card de meta do dashboard
          acompanha, medido pelo valor cheio das vendas. Cada mês guarda a sua meta: mexer em
          setembro não muda como agosto foi julgado. Loja deixada em branco fica fora do card.
        </p>
      </div>

      <MetasForm
        key={`${ano}-${mes}`}
        ano={ano}
        mes={mes}
        linhas={linhas}
      />
    </div>
  )
}
