import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { colunasDoMes, colunasEvolucao } from '@/lib/queries/dre'
import { DreTabela } from '@/components/dre/dre-tabela'
import { mesBrt } from '@/lib/data-venda'

// Mesmo gate da tela. Rota de impressão sem gate é rota aberta.
const PAPEIS = ['admin_geral', 'admin_socio']

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export default async function DreImprimirPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS.includes(usuario.papel)) redirect('/dashboard')

  const params = await searchParams
  const bruto = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : mesBrt()
  const [ano, mes] = bruto.split('-').map(Number)
  const aba = params.aba === 'evolucao' ? 'evolucao' : 'lojas'

  const grupo = await getGrupoAtivo(usuario)
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)

  const porLoja = aba === 'lojas' ? await colunasDoMes({ grupoId: grupo.id, lojaIds, ano, mes }) : null
  const evolucao = aba === 'evolucao'
    ? await colunasEvolucao({ grupoId: grupo.id, lojaIds, ano, mes, meses: 12 })
    : null

  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <div className="p-8 text-[11px] text-foreground">
      {/* Paisagem: o DRE por loja tem uma coluna por loja mais o total, e em
          retrato as últimas cairiam fora da folha. */}
      <style>{`@page { size: A4 landscape; margin: 10mm } @media print { .nao-imprime { display: none } }`}</style>

      <header className="mb-4">
        <h1 className="text-lg font-bold">DRE — {grupo.nome}</h1>
        <p>
          {aba === 'lojas'
            ? `${MESES[mes - 1]} de ${ano} · por loja`
            : `12 meses até ${MESES[mes - 1]} de ${ano} · consolidado`}
        </p>
      </header>

      {aba === 'lojas' && porLoja && <DreTabela colunas={porLoja.colunas} />}
      {aba === 'evolucao' && evolucao && <DreTabela colunas={evolucao} mostrarPercentual={false} />}

      <footer className="mt-6 text-[9px] text-muted-foreground space-y-0.5">
        <p>
          Resultado operacional = receita líquida − custo das motos vendidas − despesas
          operacionais. É o mesmo Lucro Líquido da tela Financeiro.
        </p>
        <p>
          Serviço de OS e peça entram sem CMV (não há custo cadastrado para peça). Taxa de cartão
          só é descontada do que já foi conciliado. Imposto entra em Tributos, não como dedução da
          receita — no sistema ele é lançado quando pago.
        </p>
        <p>Emitido em {emitidoEm}.</p>
      </footer>
    </div>
  )
}
