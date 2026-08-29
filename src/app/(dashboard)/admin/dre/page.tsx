import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { colunasDoMes, colunasEvolucao } from '@/lib/queries/dre'
import { DreTabela } from '@/components/dre/dre-tabela'
import { DreFiltros } from './components/dre-filtros'
import { mesBrt } from '@/lib/data-venda'
import { AlertTriangle } from 'lucide-react'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function mesDoParametro(valor?: string) {
  const padrao = mesBrt()
  const usar = valor && /^\d{4}-\d{2}$/.test(valor) ? valor : padrao
  const [ano, mes] = usar.split('-').map(Number)
  if (mes < 1 || mes > 12) {
    const [a, m] = padrao.split('-').map(Number)
    return { ano: a, mes: m, texto: padrao }
  }
  return { ano, mes, texto: usar }
}

export default async function DrePage({
  searchParams,
}: { searchParams: Promise<{ mes?: string; aba?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/dre')) redirect('/dashboard')

  const params = await searchParams
  const { ano, mes, texto } = mesDoParametro(params.mes)
  const aba = params.aba === 'evolucao' ? 'evolucao' : 'lojas'

  const grupo = await getGrupoAtivo(usuario)
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)

  const porLoja = aba === 'lojas'
    ? await colunasDoMes({ grupoId: grupo.id, lojaIds, ano, mes })
    : null
  const evolucao = aba === 'evolucao'
    ? await colunasEvolucao({ grupoId: grupo.id, lojaIds, ano, mes, meses: 12 })
    : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">DRE — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Demonstração do resultado. {aba === 'lojas'
            ? `${MESES[mes - 1]} de ${ano}, loja a loja.`
            : 'Últimos 12 meses, consolidado do grupo.'}
          {' '}O resultado operacional é o mesmo Lucro Líquido do Financeiro — aqui ele aparece aberto.
        </p>
      </div>

      <DreFiltros mes={texto} aba={aba} />

      <div className="bg-white rounded-lg border p-4">
        {aba === 'lojas' && porLoja && <DreTabela colunas={porLoja.colunas} />}
        {aba === 'evolucao' && evolucao && (
          <DreTabela colunas={evolucao} mostrarPercentual={false} />
        )}
      </div>

      <div className="space-y-2 text-xs text-slate-500">
        <p className="flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>Só moto tem custo cadastrado.</strong> Serviço de OS e peça entram como receita
            sem CMV correspondente (a compra de peças é lançada como não operacional), então o
            Lucro Bruto delas sai inflado. Em agosto isso são R$ 21 mil de receita num total de
            R$ 1,5 milhão — pequeno, mas cresce se a oficina crescer.
          </span>
        </p>
        <p className="flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>Taxa de cartão só é descontada do que já foi conciliado.</strong> Enquanto a
            conciliação do mês não termina, a Receita Líquida está otimista e o resultado também.
          </span>
        </p>
        {porLoja && porLoja.semGrupo.length > 0 && (
          <p className="flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
            <span>
              Sem grupo do DRE, caíram em <strong>Outras</strong>:{' '}
              {porLoja.semGrupo.join(', ')}. Categoria que não existe no cadastro de despesas
              (as de caixa, por exemplo) não tem onde guardar o grupo — cadastre com o mesmo nome
              em Admin → Categorias para ela entrar na linha certa.
            </span>
          </p>
        )}
        <p className="pl-6">
          Imposto entra nas despesas operacionais (Tributos), não como dedução da receita: no
          sistema ele é lançado quando pago, não estimado por alíquota sobre cada venda.
        </p>
      </div>
    </div>
  )
}
