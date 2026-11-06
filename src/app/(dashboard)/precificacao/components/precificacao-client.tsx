'use client'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TaxasForm } from './taxas-form'
import { ModeloDialog } from './modelo-dialog'
import { ImportarPrecos } from './importar-precos'
import { PadraoSimuladorCard } from './padrao-simulador-card'
import { toggleAtivoAction, excluirModeloAction } from '../actions'
import { parcelaDe12x, usaValor12x, type PadraoSimulador } from '@/lib/simulador-padrao'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, TrendingUp, AlertTriangle, Tag } from 'lucide-react'
import { fmtBRL } from '@/lib/preco-minimo'

type Taxas = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
  freteValorFixo: string
  imposto: string
}

type Modelo = {
  id: string
  /** null = modelo do catálogo que ainda não tem preço neste grupo */
  precId: string | null
  doCatalogo: boolean
  nome: string
  marca: string | null
  valorMinimo: string | null
  custo: string | null
  valor12x: string | null
  ativo: boolean
  estoqueDisponivel: number
}

type Props = {
  taxas: Taxas
  modelos: Modelo[]
  grupoNome: string
  padraoSimulador: PadraoSimulador
}


function fmtBRLStr(v: string | null) {
  if (!v) return '—'
  return fmtBRL(parseFloat(v))
}

type Margem = { reais: number; pct: number }

function calcMargem(valorMinimo: string | null, custo: string | null): Margem | null {
  if (!custo || !valorMinimo) return null
  const vMin = parseFloat(valorMinimo)
  const vCusto = parseFloat(custo)
  if (!vCusto || !vMin) return null
  return { reais: vMin - vCusto, pct: ((vMin - vCusto) / vMin) * 100 }
}

function corMargem(pct: number) {
  if (pct >= 20) return { badge: 'text-success bg-success/10 border-success/30', text: 'text-success' }
  if (pct >= 10) return { badge: 'text-warning bg-warning/10 border-warning/30', text: 'text-warning' }
  return { badge: 'text-destructive bg-destructive/10 border-destructive/30', text: 'text-destructive' }
}

export function PrecificacaoClient({ taxas, modelos, grupoNome, padraoSimulador }: Props) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

  async function handleToggle(m: Modelo) {
    if (!m.precId) return
    if (m.ativo && m.estoqueDisponivel > 0) {
      const confirmado = confirm(
        `"${m.nome}" tem ${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} disponíve${m.estoqueDisponivel !== 1 ? 'is' : 'l'} em estoque.\n\nDesativar remove o modelo do Simulador, mas o estoque continua disponível para venda. Deseja continuar?`
      )
      if (!confirmado) return
    }
    try {
      await toggleAtivoAction(m.precId, !m.ativo)
      toast.success(m.ativo ? 'Modelo desativado' : 'Modelo ativado')
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleExcluir(m: Modelo) {
    if (!m.precId) return
    // Modelo do catálogo não some da lista: excluir aqui apaga só o preço, e a
    // linha volta como "Sem preço". Quem tira o modelo da lista é /admin/modelos.
    const pergunta = m.doCatalogo
      ? `Limpar o preço de "${m.nome}" neste grupo?\n\nO modelo continua na lista, sem preço, e sai do Simulador.`
      : `Excluir "${m.nome}" permanentemente?`
    if (!confirm(pergunta)) return
    try {
      await excluirModeloAction(m.precId)
      toast.success(m.doCatalogo ? 'Preço removido' : 'Modelo excluído')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const editar = (m: Modelo | null) => { setModeloEdicao(m); setDialogAberto(true) }
  const temCusto = modelos.some(m => m.custo)
  const semPreco = modelos.filter(m => !m.precId)
  const com12x = usaValor12x(padraoSimulador)
  const sem12x = com12x ? modelos.filter(m => m.precId && m.ativo && !m.valor12x) : []

  return (
    <div className="space-y-6">
      <PadraoSimuladorCard padrao={padraoSimulador} sem12x={sem12x.length} />

      {/* Taxas globais no topo */}
      <TaxasForm taxas={taxas} recolhida={com12x} />

      {/* Lista de modelos */}
      <div className="bg-card rounded-xl border shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Modelos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modelos.length} modelo{modelos.length !== 1 ? 's' : ''} no catálogo
              {semPreco.length > 0 && (
                <> · <span className="text-warning font-medium">{semPreco.length} sem preço em {grupoNome}</span></>
              )}
              {sem12x.length > 0 && (
                <> · <span className="text-warning font-medium">{sem12x.length} ativo{sem12x.length !== 1 ? 's' : ''} sem valor em 12x</span></>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ImportarPrecos />
            <Button onClick={() => editar(null)} className="gap-1.5">
              <Plus size={16} /> Novo Modelo
            </Button>
          </div>
        </div>

        {modelos.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Nenhum modelo cadastrado.</div>
        ) : (
          <>
          <ul aria-label="Modelos" className="divide-y sm:hidden">
            {modelos.map(m => {
              const margem = calcMargem(m.valorMinimo, m.custo)
              const cor = margem ? corMargem(margem.pct) : null
              return (
                <li key={m.id} className={`px-4 py-3 space-y-3 ${m.precId === null ? 'bg-warning/5' : ''}`}>
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground break-words">
                      {m.nome}
                      {m.marca && <span className="ml-2 font-normal text-xs text-muted-foreground">{m.marca}</span>}
                    </p>
                    <StatusModelo m={m} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Campo rotulo="Custo">{m.custo ? fmtBRL(parseFloat(m.custo)) : 'Sem custo'}</Campo>
                    <Campo rotulo="Valor mínimo (PIX)">{m.valorMinimo ? <b>{fmtBRL(parseFloat(m.valorMinimo))}</b> : 'Sem preço'}</Campo>
                    {com12x && (
                      <Campo rotulo="Total em 12x">
                        {m.valor12x && <>{fmtBRL(parseFloat(m.valor12x))}<br /></>}
                        <span className="text-xs text-muted-foreground"><Valor12x m={m} longo /></span>
                      </Campo>
                    )}
                    {margem && cor && (
                      <Campo rotulo="Margem">
                        <span className={`font-semibold ${cor.text}`}>{fmtBRL(margem.reais)} ({margem.pct.toFixed(1)}%)</span>
                      </Campo>
                    )}
                  </dl>
                  <AcoesModelo m={m} onEditar={editar} onAlternar={handleToggle} onExcluir={handleExcluir} />
                </li>
              )
            })}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modelo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Custo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Mínimo (PIX)</th>
                  {com12x && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total em 12x</th>}
                  {temCusto && (
                    <>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                        <span className="flex items-center justify-end gap-1">
                          <TrendingUp size={12} />Margem R$
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margem %</th>
                    </>
                  )}
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelos.map(m => {
                  const margem = calcMargem(m.valorMinimo, m.custo)
                  const cor = margem ? corMargem(margem.pct) : null
                  const precificado = m.precId !== null
                  return (
                    <tr key={m.id} className={precificado ? 'hover:bg-muted/50' : 'bg-warning/5 hover:bg-warning/10'}>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {m.nome}
                        {m.marca && <span className="ml-2 font-normal text-xs text-muted-foreground">{m.marca}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground text-xs">
                        {fmtBRLStr(m.custo)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                        {m.valorMinimo ? fmtBRL(parseFloat(m.valorMinimo)) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {com12x && (
                        <td className="px-4 py-3 text-right font-mono text-foreground">
                          {m.valor12x && fmtBRL(parseFloat(m.valor12x))}
                          <span className="block text-xs text-muted-foreground"><Valor12x m={m} /></span>
                        </td>
                      )}
                      {temCusto && (
                        <>
                          <td className="px-4 py-3 text-right font-mono">
                            {margem && cor ? (
                              <span className={`font-semibold ${cor.text}`}>{fmtBRL(margem.reais)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {margem && cor ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cor.badge}`}>
                                {margem.pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-center">
                        <StatusModelo m={m} className="justify-center" />
                      </td>
                      <td className="px-4 py-3">
                        <AcoesModelo m={m} onEditar={editar} onAlternar={handleToggle} onExcluir={handleExcluir} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {dialogAberto && (
        <ModeloDialog
          modelo={modeloEdicao}
          com12x={com12x}
          onClose={() => { setDialogAberto(false); setModeloEdicao(null) }}
        />
      )}
    </div>
  )
}

function AcoesModelo({ m, onEditar, onAlternar, onExcluir }: {
  m: Modelo
  onEditar: (m: Modelo) => void
  onAlternar: (m: Modelo) => void
  onExcluir: (m: Modelo) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {m.precId !== null ? (
        <>
          <Button
            variant="ghost" size="sm"
            onClick={() => onEditar(m)}
            title="Editar"
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => onAlternar(m)}
            title={m.ativo ? 'Desativar' : 'Ativar'}
            className={m.ativo ? 'text-muted-foreground' : 'text-success'}
          >
            {m.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => onExcluir(m)}
            className="text-destructive/70 hover:text-destructive"
            title={m.doCatalogo ? 'Limpar preço' : 'Excluir'}
            aria-label={m.doCatalogo ? 'Limpar preço' : 'Excluir'}
          >
            <Trash2 size={14} />
          </Button>
        </>
      ) : (
        <Button
          variant="outline" size="sm"
          onClick={() => onEditar(m)}
          className="gap-1.5 border-warning/50 text-warning hover:bg-warning/10"
        >
          <Tag size={13} /> Definir preço
        </Button>
      )}
    </div>
  )
}

/** Total em 12x de um modelo; "Sem valor" só para quem tem preço e está ativo (os outros ficam fora do simulador). */
function Valor12x({ m, longo = false }: { m: Modelo; longo?: boolean }) {
  if (m.valor12x) return <>12x de {fmtBRL(parcelaDe12x(parseFloat(m.valor12x)))}</>
  if (m.precId !== null && m.ativo) return <span className="text-warning">{longo ? 'Sem valor em 12x' : 'Sem valor'}</span>
  return null
}

/** Selo de status do modelo (sem preço, ativo, inativo) e o aviso de estoque fora do simulador. */
function StatusModelo({ m, className = '' }: { m: Modelo; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {m.precId === null ? (
        <span
          title="Modelo cadastrado em Modelos, mas ainda sem valor mínimo neste grupo — fora do Simulador até ter preço"
          className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-bold text-warning"
        >
          <Tag size={12} /> Sem preço
        </span>
      ) : (
        <Badge variant={m.ativo ? 'default' : 'secondary'}>
          {m.ativo ? 'Ativo' : 'Inativo'}
        </Badge>
      )}
      {m.precId !== null && !m.ativo && m.estoqueDisponivel > 0 && (
        <span
          title={`${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} disponíve${m.estoqueDisponivel !== 1 ? 'is' : 'l'} em estoque, mas fora do Simulador`}
          className="inline-flex items-center gap-1 text-warning text-xs font-medium"
        >
          <AlertTriangle size={12} />
          {m.estoqueDisponivel} em estoque
        </span>
      )}
      {m.precId === null && m.estoqueDisponivel > 0 && (
        <span
          title={`${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} em estoque sem preço mínimo definido`}
          className="inline-flex items-center gap-1 text-warning text-xs font-medium"
        >
          <AlertTriangle size={12} />
          {m.estoqueDisponivel} em estoque
        </span>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="tabular-nums text-foreground">{children}</dd>
    </div>
  )
}
