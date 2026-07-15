import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas, motos, modelos as modelosTable } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { asc, eq, and, inArray, sql } from 'drizzle-orm'
import { PrecificacaoClient } from './components/precificacao-client'
import { redirect } from 'next/navigation'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function PrecificacaoPage() {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [taxasRow, modelos, estoqueDisponivel] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(eq(precificacao.grupoId, grupo.id)).orderBy(asc(precificacao.nome)),
    db
      .select({ nome: modelosTable.modelo, qtd: sql<number>`count(*)::int` })
      .from(motos)
      .innerJoin(modelosTable, eq(motos.modeloId, modelosTable.id))
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIdsGrupo)))
      .groupBy(modelosTable.modelo),
  ])

  const estoquePorNome = Object.fromEntries(
    estoqueDisponivel.map(e => [e.nome.trim().toUpperCase(), e.qtd])
  )

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
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          custo: m.custo,
          ativo: m.ativo,
          estoqueDisponivel: estoquePorNome[m.nome.trim().toUpperCase()] ?? 0,
        }))}
      />
    </div>
  )
}
