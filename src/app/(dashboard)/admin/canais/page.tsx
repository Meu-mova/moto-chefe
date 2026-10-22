import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarGruposVisiveis } from '@/lib/grupo'
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
  // listarGruposVisiveis (não listarGruposAtivos): o dropdown de "funil→grupo"
  // só pode oferecer grupos que este usuário enxerga — senão um aux_adm
  // reatribuía o funil de outro lojista pro grupo dele e passava a ver os
  // leads do concorrente (kommo_pipeline_grupo é a prova de tenant de
  // /marketing inteiro). A action definirGrupoFunilAction valida de novo no
  // servidor — o filtro aqui é só para não nem oferecer a opção errada.
  // Canais e funis da Kommo são da integração inteira: só o admin_geral vê e edita.
  // Os demais recebem só os funis do próprio grupo, para lançar verba (#328).
  const adminGeral = usuario.papel === 'admin_geral'
  const [canais, funis, grupos, investimentos] = await Promise.all([
    adminGeral ? canaisParaAdmin() : Promise.resolve([]),
    funisParaAdmin(adminGeral ? undefined : grupo.id),
    listarGruposVisiveis(usuario),
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

      <Tabs defaultValue={adminGeral ? 'canais' : 'investimento'}>
        <TabsList>
          {adminGeral && <TabsTrigger value="canais">Canais</TabsTrigger>}
          {adminGeral && <TabsTrigger value="funis">Funis e grupos</TabsTrigger>}
          <TabsTrigger value="investimento">Investimento</TabsTrigger>
        </TabsList>
        {adminGeral && (
          <TabsContent value="canais">
            <div className="pt-4"><CanaisTable canais={canais} /></div>
          </TabsContent>
        )}
        {adminGeral && (
          <TabsContent value="funis">
            <div className="pt-4">
              <FunisTable funis={funis} grupos={grupos.map(g => ({ id: g.id, nome: g.nome }))} />
            </div>
          </TabsContent>
        )}
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
