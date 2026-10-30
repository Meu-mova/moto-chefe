'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TaxasForm } from './taxas-form'
import { ModeloDialog } from './modelo-dialog'
import { ImportarPrecos } from './importar-precos'
import { toggleAtivoAction, excluirModeloAction } from '../actions'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, TrendingUp, AlertTriangle, Tag } from 'lucide-react'

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
  ativo: boolean
  estoqueDisponivel: number
}

type Props = {
  taxas: Taxas
  modelos: Modelo[]
  grupoNome: string
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtBRLStr(v: string | null) {
  if (!v) return '—'
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

export function PrecificacaoClient({ taxas, modelos, grupoNome }: Props) {
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

  const temCusto = modelos.some(m => m.custo)
  const semPreco = modelos.filter(m => !m.precId)

  return (
    <div className="space-y-6">
      {/* Taxas globais no topo */}
      <TaxasForm taxas={taxas} />

      {/* Lista de modelos */}
      <div className="bg-card rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Modelos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modelos.length} modelo{modelos.length !== 1 ? 's' : ''} no catálogo
              {semPreco.length > 0 && (
                <> · <span className="text-warning font-medium">{semPreco.length} sem preço em {grupoNome}</span></>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ImportarPrecos />
            <Button onClick={() => { setModeloEdicao(null); setDialogAberto(true) }} className="gap-1.5">
              <Plus size={16} /> Novo Modelo
            </Button>
          </div>
        </div>

        {modelos.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Nenhum modelo cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modelo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Custo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Mínimo (PIX)</th>
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
                        <div className="flex items-center justify-center gap-1.5">
                          {!precificado ? (
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
                          {precificado && !m.ativo && m.estoqueDisponivel > 0 && (
                            <span
                              title={`${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} disponíve${m.estoqueDisponivel !== 1 ? 'is' : 'l'} em estoque, mas fora do Simulador`}
                              className="inline-flex items-center gap-1 text-warning text-xs font-medium"
                            >
                              <AlertTriangle size={12} />
                              {m.estoqueDisponivel} em estoque
                            </span>
                          )}
                          {!precificado && m.estoqueDisponivel > 0 && (
                            <span
                              title={`${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} em estoque sem preço mínimo definido`}
                              className="inline-flex items-center gap-1 text-warning text-xs font-medium"
                            >
                              <AlertTriangle size={12} />
                              {m.estoqueDisponivel} em estoque
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {precificado ? (
                            <>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => { setModeloEdicao(m); setDialogAberto(true) }}
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleToggle(m)}
                                title={m.ativo ? 'Desativar' : 'Ativar'}
                                className={m.ativo ? 'text-muted-foreground' : 'text-success'}
                              >
                                {m.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleExcluir(m)}
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
                              onClick={() => { setModeloEdicao(m); setDialogAberto(true) }}
                              className="gap-1.5 border-warning/50 text-warning hover:bg-warning/10"
                            >
                              <Tag size={13} /> Definir preço
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogAberto && (
        <ModeloDialog
          modelo={modeloEdicao}
          onClose={() => { setDialogAberto(false); setModeloEdicao(null) }}
        />
      )}
    </div>
  )
}
