import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas, lojas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { asc, eq, and } from 'drizzle-orm'
import { SimuladorClient } from './components/simulador-client'
import { redirect } from 'next/navigation'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function SimuladorPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/simulador')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const isAdmin = ADMINS.includes(usuario.papel)

  const [taxasRow, modelos, lojasComCep] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(and(eq(precificacao.grupoId, grupo.id), eq(precificacao.ativo, true))).orderBy(asc(precificacao.nome)),
    listarLojasDoGrupoAtivo(usuario).then(async (opts) => {
      const rows = await db
        .select({ id: lojas.id, latitude: lojas.latitude })
        .from(lojas)
        .where(eq(lojas.grupoId, grupo.id))
      const temCepPorId = new Map(rows.map(r => [r.id, r.latitude !== null]))
      return opts.map(l => ({ id: l.id, nome: l.nome, temCep: temCepPorId.get(l.id) ?? false }))
    }),
  ])

  const taxas = taxasRow[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-muted-foreground text-sm">Referência de valores e condições de pagamento</p>
      </div>
      <SimuladorClient
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          imagemUrl: m.imagemUrl ?? null,
        }))}
        taxas={{
          taxasCartao: (taxas?.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas?.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas?.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas?.taxasFinanciamento ?? {}) as Record<string, number>,
        }}
        lojasFrete={lojasComCep}
        isAdmin={isAdmin}
        lojaUsuarioId={usuario.lojaId ?? null}
      />
    </div>
  )
}
