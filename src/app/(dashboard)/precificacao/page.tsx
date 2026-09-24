import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas, motos, modelos as modelosTable } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { asc, eq, and, inArray, sql } from 'drizzle-orm'
import { PrecificacaoClient } from './components/precificacao-client'
import { redirect } from 'next/navigation'

// Chave de casamento entre o catálogo (`modelos.modelo`) e o preço
// (`precificacao.nome`). O resto do sistema casa por igualdade exata — ver
// buscarPrecificacao em vendas/actions e custoMotoExpr — e o catálogo está todo
// em caixa alta e sem espaço sobrando. Aqui a comparação é tolerante só para
// não duplicar a linha na tela se algum nome antigo tiver caixa diferente.
const chaveNome = (s: string) => s.trim().toUpperCase()

export default async function PrecificacaoPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/precificacao')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [taxasRow, precos, catalogo, estoqueDisponivel] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(eq(precificacao.grupoId, grupo.id)).orderBy(asc(precificacao.nome)),
    db
      .select({ id: modelosTable.id, modelo: modelosTable.modelo, marca: modelosTable.marca })
      .from(modelosTable)
      .orderBy(asc(modelosTable.modelo)),
    db
      .select({ nome: modelosTable.modelo, qtd: sql<number>`count(*)::int` })
      .from(motos)
      .innerJoin(modelosTable, eq(motos.modeloId, modelosTable.id))
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIdsGrupo)))
      .groupBy(modelosTable.modelo),
  ])

  const estoquePorNome = Object.fromEntries(
    estoqueDisponivel.map(e => [chaveNome(e.nome), e.qtd])
  )
  const precoPorNome = new Map(precos.map(p => [chaveNome(p.nome), p]))

  // A lista é o catálogo inteiro — todo modelo cadastrado em /admin/modelos
  // aparece aqui, com ou sem preço. Quem ainda não tem preço vem com
  // valorMinimo null e é isso que o cliente mostra como "Sem preço".
  const doCatalogo = catalogo.map(m => {
    const p = precoPorNome.get(chaveNome(m.modelo))
    return {
      id: p?.id ?? `modelo:${m.id}`,
      precId: p?.id ?? null,
      doCatalogo: true,
      nome: m.modelo,
      marca: m.marca as string | null,
      valorMinimo: p?.valorMinimo ?? null,
      custo: p?.custo ?? null,
      ativo: p?.ativo ?? false,
      estoqueDisponivel: estoquePorNome[chaveNome(m.modelo)] ?? 0,
    }
  })

  // Preços de nomes que não existem (mais) no catálogo — criados direto aqui
  // antes de o módulo Modelos ser a fonte única. Continuam editáveis para não
  // sumir preço que já está valendo em venda.
  const nomesDoCatalogo = new Set(catalogo.map(m => chaveNome(m.modelo)))
  const avulsos = precos
    .filter(p => !nomesDoCatalogo.has(chaveNome(p.nome)))
    .map(p => ({
      id: p.id,
      precId: p.id,
      doCatalogo: false,
      nome: p.nome,
      marca: null,
      valorMinimo: p.valorMinimo,
      custo: p.custo,
      ativo: p.ativo,
      estoqueDisponivel: estoquePorNome[chaveNome(p.nome)] ?? 0,
    }))

  const modelos = [...doCatalogo, ...avulsos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const taxas = taxasRow[0] ?? {
    taxasCartao: {} as Record<string, number>,
    taxasDebito: {} as Record<string, number>,
    taxasLink: {} as Record<string, number>,
    taxasFinanciamento: {} as Record<string, number>,
    freteValorKm: '3.00',
    freteKmGratis: 40,
    freteValorFixo: '0.00',
    imposto: '0.06',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precificação</h1>
        <p className="text-slate-500 text-sm">
          Configure as taxas globais e os valores mínimos por modelo
        </p>
      </div>
      <PrecificacaoClient
        key={grupo.id}
        taxas={{
          taxasCartao: (taxas.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas.taxasFinanciamento ?? {}) as Record<string, number>,
          freteValorKm: taxas.freteValorKm ?? '3.00',
          freteKmGratis: taxas.freteKmGratis ?? 40,
          freteValorFixo: taxas.freteValorFixo ?? '0.00',
          imposto: taxas.imposto ?? '0.06',
        }}
        modelos={modelos}
        grupoNome={grupo.nome}
      />
    </div>
  )
}
