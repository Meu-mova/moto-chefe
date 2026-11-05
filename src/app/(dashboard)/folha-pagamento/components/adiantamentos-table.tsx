'use client'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { criarAdiantamentoAction, excluirAdiantamentoAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'
import { fmtBRL } from '@/lib/preco-minimo'
import { CAMPO, CELULA, NUMERO, SO_DESKTOP, SO_TABLET } from './folha-mes-grade'
import { Campo, CartaoFormulario, LinhaLancamento, SELECT, TabelaLancamentos } from './folha-lancamento'

export type AdiantamentoRow = {
  id: string
  lojaId: string
  lojaNome: string
  usuarioId: string
  usuarioNome: string | null
  valor: string
  data: string | null
  observacao: string | null
}

export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

const reais = (v: string) => fmtBRL(parseFloat(v))

// Data vem do banco como 'YYYY-MM-DD'. Formatar com new Date() jogaria para o dia
// anterior no fuso de Brasília — o mesmo motivo de parseDataInput em @/lib/data-venda.
function fmtData(d: string | null) {
  if (!d) return 'Sem data'
  const [ano, mes, dia] = d.slice(0, 10).split('-')
  return dia + '/' + mes + '/' + ano
}

// Celular: funcionário (com "data · loja" embaixo), valor e seta. Tablet: + coluna Data (a loja fica
// embaixo do nome). Desktop: Funcionário, Loja, Data, Valor, Observação e lixeira.
const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(140px,2fr)_minmax(0,1fr)_minmax(0,1fr)_44px]',
  '@[960px]/folha:grid-cols-[minmax(150px,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,2fr)_44px]',
].join(' ')
const COLUNAS = [
  { titulo: 'Funcionário' },
  { titulo: 'Loja', className: SO_DESKTOP },
  { titulo: 'Data', className: SO_TABLET },
  { titulo: 'Valor', className: 'text-right' },
  { titulo: 'Observação', className: SO_DESKTOP },
]

export function AdiantamentosTable({
  adiantamentos, funcionarios, mes,
}: {
  adiantamentos: AdiantamentoRow[]
  funcionarios: FuncionarioOpcao[]
  mes: string
}) {
  const [usuarioId, setUsuarioId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [pending, startTransition] = useTransition()
  const idForm = useId()

  const total = adiantamentos.reduce((s, a) => s + parseFloat(a.valor), 0)

  function adicionar() {
    const valorNum = parseNumeroBR(valor)
    if (valorNum === null) { toast.error('Valor inválido'); return }

    startTransition(async () => {
      try {
        await criarAdiantamentoAction({ usuarioId, mes, valor: valorNum, data: data || null, observacao })
        toast.success('Adiantamento lançado')
        setValor('')
        setData('')
        setObservacao('')
        setUsuarioId('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar adiantamento')
      }
    })
  }

  function excluir(id: string) {
    startTransition(async () => {
      try {
        await excluirAdiantamentoAction(id)
        toast.success('Adiantamento removido')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[72ch] text-sm text-muted-foreground">
        Dinheiro entregue ao funcionário antes do fechamento do mês. Desconta do total a pagar da folha e aparece
        no impresso da contabilidade. Não vira despesa nem saída de caixa: o salário cheio já é contabilizado
        quando é pago, e lançar os dois contaria o mesmo dinheiro duas vezes. O adiantamento fixo de cada pessoa
        fica na aba Funcionários e não entra nesta lista.
      </p>

      <TabelaLancamentos rotulo="Adiantamentos do mês" grade={GRADE} colunas={COLUNAS} quantidade={adiantamentos.length}
        vazio="Nenhum adiantamento neste mês."
        rodape={(
          <div role="row" className={`${GRADE} items-center border-t bg-muted font-bold`}>
            <div role="cell" className={`${CELULA} text-xs font-medium text-muted-foreground @[680px]/folha:col-span-2 @[960px]/folha:col-span-3`}>Total do mês</div>
            <div role="cell" className={`${NUMERO} text-warning`}>{fmtBRL(total)}</div>
          </div>
        )}>
        {adiantamentos.map(a => {
          const nome = a.usuarioNome ?? 'Sem nome'
          return (
            <LinhaLancamento key={a.id} id={a.id} grade={GRADE} nome={nome} rotuloDetalhe="Observação" detalhe={a.observacao}
              rotuloRemover={`Remover adiantamento de ${nome}`} onRemover={() => excluir(a.id)} ocupado={pending}>
              <div role="cell" className={CELULA}>
                <p className="wrap-anywhere font-medium">{nome}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="@[680px]/folha:hidden">{fmtData(a.data)} · </span><span className="@[960px]/folha:hidden">{a.lojaNome}</span>
                </p>
              </div>
              <div role="cell" className={`${CELULA} ${SO_DESKTOP} text-muted-foreground`}>{a.lojaNome}</div>
              <div role="cell" className={`${CELULA} ${SO_TABLET} text-muted-foreground`}>{fmtData(a.data)}</div>
              <div role="cell" className={`${NUMERO} font-medium text-warning`}>{reais(a.valor)}</div>
              <div role="cell" className={`${CELULA} ${SO_DESKTOP} text-xs text-muted-foreground`}>{a.observacao}</div>
            </LinhaLancamento>
          )
        })}
      </TabelaLancamentos>

      <CartaoFormulario titulo="Lançar adiantamento" colunas="@[960px]/folha:grid-cols-3" dica={usuarioId ? null : 'Escolha o funcionário para liberar o botão.'}>
        <Campo id={`${idForm}-funcionario`} rotulo="Funcionário">
          <select id={`${idForm}-funcionario`} value={usuarioId} onChange={e => setUsuarioId(e.target.value)} className={SELECT}>
            <option value="">Selecione…</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo id={`${idForm}-valor`} rotulo="Valor (R$)">
          <Input id={`${idForm}-valor`} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className={CAMPO} placeholder="0,00" />
        </Campo>
        <Campo id={`${idForm}-data`} rotulo="Data do adiantamento">
          <Input id={`${idForm}-data`} type="date" value={data} onChange={e => setData(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo id={`${idForm}-obs`} rotulo="Observação (opcional)" className="@[960px]/folha:col-span-2">
          <Input id={`${idForm}-obs`} value={observacao} onChange={e => setObservacao(e.target.value)} className={CAMPO} placeholder="Ex.: vale do dia 05" />
        </Campo>
        <Button className="h-11 w-full text-sm @[680px]/folha:col-span-2 @[960px]/folha:col-span-1 @[960px]/folha:h-8 @[960px]/folha:w-fit @[960px]/folha:text-xs"
          disabled={pending || !usuarioId} onClick={adicionar}>
          Lançar adiantamento
        </Button>
      </CartaoFormulario>
    </div>
  )
}
