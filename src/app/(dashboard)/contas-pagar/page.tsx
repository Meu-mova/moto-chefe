import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { listarContasDoMesAction, listarContasAction } from './actions'
import { ContasMes } from './components/contas-mes'
import { ContasCadastro } from './components/contas-cadastro'
import { MesSelectorContas } from './components/mes-selector'

export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/contas-pagar')) redirect('/dashboard')

  const params = await searchParams
  const hoje = hojeBrt()
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : hoje.slice(0, 7)

  // listarContasDoMesAction materializa as ocorrências do mês antes de ler, então
  // roda primeiro; o resto pode ir junto.
  const { doMes, atrasadas } = await listarContasDoMesAction(mes)
  const [contas, lojasOpts] = await Promise.all([
    listarContasAction(),
    listarLojasDoGrupoAtivo(usuario),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-sm text-slate-500">
            Compromissos de pagamento. Não entram em Despesas, Caixa nem no DRE — quem paga continua lançando a
            despesa pelo caminho normal.
          </p>
        </div>
        <MesSelectorContas mesAtual={mes} />
      </div>

      <Tabs defaultValue="mes">
        <TabsList>
          <TabsTrigger value="mes">Do mês</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="mt-4">
          <ContasMes doMes={doMes} atrasadas={atrasadas} hoje={hoje} />
        </TabsContent>

        <TabsContent value="cadastro" className="mt-4">
          <ContasCadastro contas={contas} lojas={lojasOpts} mes={mes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
