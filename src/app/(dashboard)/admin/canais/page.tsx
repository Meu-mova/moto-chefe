import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { db } from '@/lib/db'
import { marketingInvestimento } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { canaisParaAdmin, funisParaAdmin } from '@/lib/queries/marketing'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CanaisTable } from './components/canais-table'
import { FunisTable } from './components/funis-table'
import { InvestimentoTable } from './components/investimento-table'
import { Megaphone } from 'lucide-react'

export default async function CanaisPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/canais')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [canais, funis, grupos, investimentos] = await Promise.all([
    canaisParaAdmin(),
    funisParaAdmin(),
    listarGruposAtivos(),
    db.select().from(marketingInvestimento)
      .where(eq(marketingInvestimento.grupoId, grupo.id))
      .orderBy(desc(marketingInvestimento.mes), marketingInvestimento.plataforma),
  ])

  // Só os funis do grupo ativo entram no seletor de verba — verba de BH não se
  // lança num funil do Sul de Minas.
  const funisDoGrupo = funis.filter(f => f.grupoId === grupo.id).map(f => ({ pipelineId: f.pipelineId, funil: f.funil }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone size={22} /> Canais e verba — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Configuração do relatório de <Link href="/marketing" className="underline">Marketing</Link>:
          nome dos canais, grupo de cada funil e investimento em mídia
        </p>
      </div>

      <Tabs defaultValue="canais">
        <TabsList>
          <TabsTrigger value="canais">Canais</TabsTrigger>
          <TabsTrigger value="funis">Funis e grupos</TabsTrigger>
          <TabsTrigger value="investimento">Investimento</TabsTrigger>
        </TabsList>
        <TabsContent value="canais">
          <div className="pt-4"><CanaisTable canais={canais} /></div>
        </TabsContent>
        <TabsContent value="funis">
          <div className="pt-4">
            <FunisTable funis={funis} grupos={grupos.map(g => ({ id: g.id, nome: g.nome }))} />
          </div>
        </TabsContent>
        <TabsContent value="investimento">
          <div className="pt-4">
            <InvestimentoTable
              grupoNome={grupo.nome}
              funis={funisDoGrupo}
              investimentos={investimentos.map(i => ({
                id: i.id,
                mes: i.mes,
                pipelineId: i.pipelineId,
                plataforma: i.plataforma,
                valor: Number(i.valor) || 0,
                observacao: i.observacao,
              }))}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
