'use client'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TIPOS_AJUSTE } from '@/lib/folha'
import { criarAjusteBaseAction, excluirAjusteBaseAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'
import { fmtBRL } from '@/lib/preco-minimo'
import { CAMPO, CELULA, NUMERO, SO_DESKTOP, SO_TABLET } from './folha-mes-grade'
import { Campo, CartaoFormulario, LinhaLancamento, SELECT, TabelaLancamentos } from './folha-lancamento'

export type AjusteRow = {
  id: string
  lojaId: string
  lojaNome: string
  tipo: string
  usuarioId: string | null
  usuarioNome: string | null
  valor: string
  observacao: string | null
}

export type LojaOpcao = { id: string; nome: string }
export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

const reais = (v: string) => fmtBRL(parseFloat(v))
const TIPO_LABEL = Object.fromEntries(TIPOS_AJUSTE.map(t => [t.valor, t.label]))

// Celular: loja (com "tipo · funcionário" embaixo), valor e seta. Tablet: + colunas Tipo e Funcionário.
// Desktop: Loja, Tipo, Funcionário, Valor, Motivo e lixeira.
const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(120px,1.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_44px]',
  '@[960px]/folha:grid-cols-[minmax(120px,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,2fr)_44px]',
].join(' ')
const COLUNAS = [
  { titulo: 'Loja' },
  { titulo: 'Tipo', className: SO_TABLET },
  { titulo: 'Funcionário', className: SO_TABLET },
  { titulo: 'Valor', className: 'text-right' },
  { titulo: 'Motivo', className: SO_DESKTOP },
]

export function AjustesBaseTable({
  ajustes, lojas, funcionarios, mes,
}: {
  ajustes: AjusteRow[]
  lojas: LojaOpcao[]
  funcionarios: FuncionarioOpcao[]
  mes: string
}) {
  const [lojaId, setLojaId] = useState('')
  const [tipo, setTipo] = useState<string>('pecas')
  const [usuarioId, setUsuarioId] = useState('')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [pending, startTransition] = useTransition()
  const idForm = useId()

  // Só faz sentido creditar alguém da própria loja do ajuste — a action valida isso também.
  const funcionariosDaLoja = funcionarios.filter(f => f.lojaId === lojaId)

  function adicionar() {
    const valorNum = parseNumeroBR(valor)
    if (valorNum === null) { toast.error('Valor inválido'); return }

    startTransition(async () => {
      try {
        await criarAjusteBaseAction({
          lojaId,
          mes,
          tipo,
          usuarioId: usuarioId || null,
          valor: valorNum,
          observacao,
        })
        toast.success('Ajuste lançado')
        setValor('')
        setObservacao('')
        setUsuarioId('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar ajuste')
      }
    })
  }

  function excluir(id: string) {
    startTransition(async () => {
      try {
        await excluirAjusteBaseAction(id)
        toast.success('Ajuste removido')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[72ch] text-sm text-muted-foreground">
        Venda que aconteceu de verdade mas não foi lançada no sistema. Entra só no cálculo da folha: não aparece
        em Financeiro, Despesas nem no estoque. O valor sempre soma à base da loja; se você escolher um funcionário,
        soma também à base individual dele. Valor negativo corrige um lançamento a maior.
      </p>

      <TabelaLancamentos rotulo="Ajustes do mês" grade={GRADE} colunas={COLUNAS} quantidade={ajustes.length} vazio="Nenhum ajuste neste mês.">
        {ajustes.map(a => {
          const tipoRotulo = TIPO_LABEL[a.tipo] ?? a.tipo
          const funcionario = a.usuarioNome ?? 'só a loja'
          const descricao = `${a.lojaNome}, ${tipoRotulo}, ${funcionario}, ${reais(a.valor)}`
          return (
            <LinhaLancamento key={a.id} id={a.id} grade={GRADE} nome={descricao} rotuloDetalhe="Motivo" detalhe={a.observacao}
              rotuloRemover={`Remover ajuste de ${descricao}`} onRemover={() => excluir(a.id)} ocupado={pending}>
              <div role="cell" className={CELULA}>
                <p className="wrap-anywhere font-medium">{a.lojaNome}</p>
                <p className="text-xs text-muted-foreground @[680px]/folha:hidden">{tipoRotulo} · {funcionario}</p>
              </div>
              <div role="cell" className={`${CELULA} ${SO_TABLET}`}>{tipoRotulo}</div>
              <div role="cell" className={`${CELULA} ${SO_TABLET} ${a.usuarioNome ? '' : 'text-muted-foreground'}`}>{funcionario}</div>
              <div role="cell" className={`${NUMERO} font-medium`}>{reais(a.valor)}</div>
              <div role="cell" className={`${CELULA} ${SO_DESKTOP} text-xs text-muted-foreground`}>{a.observacao}</div>
            </LinhaLancamento>
          )
        })}
      </TabelaLancamentos>

      <CartaoFormulario titulo="Lançar ajuste" colunas="@[960px]/folha:grid-cols-4"
        dica={lojaId ? null : 'Escolha a loja para liberar o funcionário e o botão. Só aparece quem é daquela loja.'}>
        <Campo id={`${idForm}-loja`} rotulo="Loja">
          <select id={`${idForm}-loja`} value={lojaId} onChange={e => { setLojaId(e.target.value); setUsuarioId('') }} className={SELECT}>
            <option value="">Selecione…</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo id={`${idForm}-tipo`} rotulo="Tipo">
          <select id={`${idForm}-tipo`} value={tipo} onChange={e => setTipo(e.target.value)} className={SELECT}>
            {TIPOS_AJUSTE.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo id={`${idForm}-funcionario`} rotulo="Funcionário (opcional)">
          <select id={`${idForm}-funcionario`} value={usuarioId} onChange={e => setUsuarioId(e.target.value)} disabled={!lojaId} className={SELECT}>
            <option value="">Só a loja</option>
            {funcionariosDaLoja.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo id={`${idForm}-valor`} rotulo="Valor (R$)">
          <Input id={`${idForm}-valor`} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className={CAMPO} placeholder="0,00" />
        </Campo>
        <Campo id={`${idForm}-motivo`} rotulo="Motivo" className="@[960px]/folha:col-span-3">
          <Input id={`${idForm}-motivo`} value={observacao} onChange={e => setObservacao(e.target.value)} className={CAMPO} placeholder="Ex.: OS lançada fora do sistema" />
        </Campo>
        <Button className="h-11 w-full text-sm @[680px]/folha:self-end @[960px]/folha:h-8 @[960px]/folha:w-fit @[960px]/folha:text-xs"
          disabled={pending || !lojaId} onClick={adicionar}>
          Lançar ajuste
        </Button>
      </CartaoFormulario>
    </div>
  )
}
