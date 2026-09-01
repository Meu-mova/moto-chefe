'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Trash2, Power } from 'lucide-react'
import { TIPOS_CONTA, BASES_FORMULA, MESES_REFERENCIA, labelBaseFormula, labelMesReferencia } from '@/lib/contas-pagar'
import { parseNumeroBR } from '@/lib/numero-br'
import {
  criarContaAction, alternarContaAtivaAction, excluirContaAction, type ContaRow,
} from '../actions'

const fmt = (v: string | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_LABEL = Object.fromEntries(TIPOS_CONTA.map(t => [t.valor, t.label]))

function fmtVigencia(inicio: string | null, fim: string | null) {
  if (!inicio && !fim) return 'sem limite'
  const f = (m: string | null, fallback: string) => {
    if (!m) return fallback
    const [ano, mes] = m.split('-')
    return `${mes}/${ano}`
  }
  return `${f(inicio, 'desde sempre')} → ${f(fim, 'sem fim')}`
}

export function ContasCadastro({ contas, lojas, mes }: {
  contas: ContaRow[]
  lojas: { id: string; nome: string }[]
  /** Mês corrente da tela — vira o padrão do início da vigência. */
  mes: string
}) {
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [lojaId, setLojaId] = useState('')
  const [tipo, setTipo] = useState('recorrente')
  const [valor, setValor] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [diaVencimento, setDiaVencimento] = useState('10')
  const [formulaBase, setFormulaBase] = useState('venda_motos_com_nf')
  const [formulaPercentual, setFormulaPercentual] = useState('')
  const [formulaMesRef, setFormulaMesRef] = useState('anterior')
  const [inicio, setInicio] = useState(mes)
  const [fim, setFim] = useState('')
  const [observacao, setObservacao] = useState('')
  const [pending, start] = useTransition()

  const ehUnica = tipo === 'unica'
  const ehAutomatica = tipo === 'automatica'

  function criar() {
    const valorNum = ehAutomatica ? null : parseNumeroBR(valor)
    const percentualNum = ehAutomatica ? parseNumeroBR(formulaPercentual) : null
    if (!ehAutomatica && valorNum === null) { toast.error('Valor inválido'); return }
    if (ehAutomatica && percentualNum === null) { toast.error('Percentual inválido'); return }

    start(async () => {
      try {
        await criarContaAction({
          descricao,
          categoria,
          lojaId: lojaId || null,
          tipo,
          valor: valorNum,
          dataVencimento: ehUnica ? dataVencimento : null,
          diaVencimento: ehUnica ? null : Number(diaVencimento),
          formulaBase: ehAutomatica ? formulaBase : null,
          formulaPercentual: percentualNum,
          formulaMesRef,
          // Única não tem vigência: a data dela já diz quando acontece.
          inicio: ehUnica ? null : (inicio || null),
          fim: ehUnica ? null : (fim || null),
          observacao,
        })
        toast.success('Conta cadastrada')
        setDescricao('')
        setValor('')
        setFormulaPercentual('')
        setObservacao('')
        setDataVencimento('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar')
      }
    })
  }

  function alternar(c: ContaRow) {
    start(async () => {
      try {
        await alternarContaAtivaAction(c.id, !c.ativo)
        toast.success(c.ativo ? 'Conta desativada' : 'Conta reativada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao alterar')
      }
    })
  }

  function excluir(c: ContaRow) {
    if (!confirm(`Apagar "${c.descricao}"?\n\nTodas as competências dela somem, inclusive as já pagas.\n\nPara só parar de cobrar daqui pra frente, use o botão de desativar.`)) return
    start(async () => {
      try {
        await excluirContaAction(c.id)
        toast.success('Conta removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  const selectCls = 'h-8 text-xs border border-slate-200 rounded-md px-2 bg-white block'

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        A conta cadastrada aqui gera um compromisso por mês. <strong>Automática</strong> calcula o valor sobre um
        movimento apurado — imposto e folha olham o <strong>mês anterior</strong>, adiantamento olha o{' '}
        <strong>mês da competência</strong>. Enquanto não estiver paga, ela é recalculada a cada abertura da tela,
        porque o mês apurado continua fechando; depois de paga, o valor congela.
      </p>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Descrição</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Tipo</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Vencimento</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Valor</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Vigência</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {contas.map(c => (
              <tr key={c.id} className={`hover:bg-slate-50 ${c.ativo ? '' : 'text-slate-400'}`}>
                <td className="px-4 py-2">
                  <p className={c.ativo ? 'font-medium' : ''}>{c.descricao}</p>
                  <p className="text-xs text-slate-400">
                    {c.categoria ? `${c.categoria} · ` : ''}{c.lojaNome ?? 'empresa'}
                    {c.ativo ? '' : ' · desativada'}
                  </p>
                </td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className={
                    c.tipo === 'automatica' ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : c.tipo === 'recorrente' ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                  }>
                    {TIPO_LABEL[c.tipo] ?? c.tipo}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-xs">
                  {c.tipo === 'unica'
                    ? (c.dataVencimento ?? '—').slice(0, 10).split('-').reverse().join('/')
                    : `todo dia ${c.diaVencimento}`}
                </td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">
                  {c.tipo === 'automatica'
                    ? <span className="text-violet-700">
                        {Number(c.formulaPercentual).toLocaleString('pt-BR')}%
                        <span className="block text-[11px] font-normal text-slate-400">
                          {labelBaseFormula(c.formulaBase ?? '')}
                          {' · '}{labelMesReferencia(c.formulaMesRef).toLowerCase()}
                        </span>
                      </span>
                    : fmt(c.valor)}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {c.tipo === 'unica' ? '—' : fmtVigencia(c.inicio, c.fim)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button onClick={() => alternar(c)} disabled={pending}
                    title={c.ativo ? 'Desativar (para de gerar novos meses)' : 'Reativar'}
                    className="mr-2 text-slate-400 hover:text-amber-600">
                    <Power size={14} />
                  </button>
                  <button onClick={() => excluir(c)} disabled={pending} title="Apagar de vez"
                    className="text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {contas.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">Nenhuma conta cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs text-slate-500">Descrição</label>
          <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-8 text-xs" placeholder="Ex.: Imposto sobre vendas" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Categoria</label>
          <Input value={categoria} onChange={e => setCategoria(e.target.value)} className="h-8 text-xs w-32" placeholder="Opcional" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Loja</label>
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} className={`${selectCls} w-36`}>
            <option value="">Empresa toda</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${selectCls} w-56`}>
            {TIPOS_CONTA.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </div>

        {ehUnica ? (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Vence em</label>
            <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="h-8 text-xs w-36" />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Dia do vencimento</label>
            <Input type="number" min="1" max="31" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} className="h-8 text-xs w-24" />
          </div>
        )}

        {ehAutomatica ? (
          <>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Base do cálculo</label>
              <select value={formulaBase} onChange={e => setFormulaBase(e.target.value)} className={`${selectCls} w-64`}>
                {BASES_FORMULA.map(b => <option key={b.valor} value={b.valor}>{b.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Apura o</label>
              {/* Imposto e folha olham o mês anterior; adiantamento olha o mês da
                  competência — o vale do dia 20 é o adiantamento daquele mês. */}
              <select value={formulaMesRef} onChange={e => setFormulaMesRef(e.target.value)} className={`${selectCls} w-44`}>
                {MESES_REFERENCIA.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Percentual (%)</label>
              <Input value={formulaPercentual} onChange={e => setFormulaPercentual(e.target.value)} className="h-8 text-xs w-24" placeholder="6" />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Valor (R$)</label>
            <Input value={valor} onChange={e => setValor(e.target.value)} className="h-8 text-xs w-28" placeholder="0,00" />
          </div>
        )}

        {!ehUnica && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Começa em</label>
              <Input type="month" value={inicio} onChange={e => setInicio(e.target.value)} className="h-8 text-xs w-32" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Até (opcional)</label>
              <Input type="month" value={fim} onChange={e => setFim(e.target.value)} className="h-8 text-xs w-32" />
            </div>
          </>
        )}

        <div className="space-y-1 flex-1 min-w-40">
          <label className="text-xs text-slate-500">Observação</label>
          <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="h-8 text-xs" placeholder="Opcional" />
        </div>

        <Button size="sm" className="h-8 text-xs" disabled={pending || !descricao.trim()} onClick={criar}>
          Cadastrar conta
        </Button>
      </div>
    </div>
  )
}
