'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { excluirDespesaAction } from '../actions'
import { moedaDeSaida } from '@/lib/moeda-saida'
import { DespesaDialog } from './despesa-dialog'
import { ListaDetalhe } from './lista-detalhe'
import type { Loja, DespesaRow } from '../types'

type Props = {
  despesas: DespesaRow[]
  lojas: Loja[]
  categorias: string[]
  categoriasComBeneficiario: string[]
  beneficiarios: string[]
}

function fmtData(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function DespesasTable({ despesas, lojas, categorias, categoriasComBeneficiario, beneficiarios }: Props) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroLoja, setFiltroLoja]           = useState('')
  const [filtroBusca, setFiltroBusca]         = useState('')
  const [editando, setEditando]               = useState<DespesaRow | null>(null)

  const categoriasFiltro = useMemo(() =>
    [...new Set(despesas.map(d => d.categoria))].sort(),
    [despesas]
  )

  const dados = useMemo(() => despesas.filter(d => {
    if (filtroCategoria && d.categoria !== filtroCategoria) return false
    if (filtroLoja === '__geral' && d.lojaId !== null) return false
    if (filtroLoja && filtroLoja !== '__geral' && d.lojaId !== filtroLoja) return false
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase()
      if (!d.descricao?.toLowerCase().includes(q) &&
          !d.categoria.toLowerCase().includes(q) &&
          !d.banco.toLowerCase().includes(q)) return false
    }
    return true
  }), [despesas, filtroCategoria, filtroLoja, filtroBusca])

  const total = useMemo(() =>
    dados.reduce((s, d) => s + Number(d.valor), 0),
    [dados]
  )

  async function handleExcluir(id: string) {
    if (!confirm('Excluir esta despesa?')) return
    setExcluindo(id)
    try {
      await excluirDespesaAction(id)
      toast.success('Despesa excluída')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
    } finally {
      setExcluindo(null)
    }
  }

  if (despesas.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma despesa encontrada.</p>
  }

  const campo = 'h-11 text-base md:h-8 md:text-xs'
  const selectNativo = 'w-full min-w-0 rounded-md border border-input bg-card px-2'
  return (
    <div className="space-y-3">
      {/* Busca primeiro: no celular é o filtro que mais se usa; categoria e loja ficam logo abaixo. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        <Input
          className={`${campo} md:order-last md:w-64`}
          placeholder="Buscar descrição / categoria / banco..."
          value={filtroBusca}
          onChange={e => setFiltroBusca(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 md:flex">
          {/* <select> nativo: o <Select> do design system mostrava o value cru ("__todas") no gatilho. */}
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} aria-label="Categoria" className={`${campo} ${selectNativo} md:w-44`}>
            <option value="">Todas as categorias</option>
            {categoriasFiltro.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} aria-label="Loja" className={`${campo} ${selectNativo} md:w-44`}>
            <option value="">Todas as lojas</option>
            <option value="__geral">Geral (empresa)</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      </div>

      <ListaDetalhe
        itens={dados}
        idDe={d => `${d.origem}-${d.id}`}
        borda={d => (d.origem === 'caixa' ? 'border-l-warning' : 'border-l-transparent')}
        linha={d => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{d.beneficiario ?? d.descricao ?? d.categoria}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {fmtData(d.data)} · {d.categoria} · {d.lojaNome ?? 'Geral'}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-destructive">{moedaDeSaida(d.valor)}</span>
          </>
        )}
        tituloDetalhe="Despesa"
        descricaoDetalhe={d => `${d.categoria} · ${fmtData(d.data)}`}
        detalhe={d => (
          <>
            <p className="text-2xl font-bold tabular-nums text-destructive">{moedaDeSaida(d.valor)}</p>
            <dl className="space-y-2 text-sm">
              {[
                ['Categoria', d.categoria],
                ...(d.beneficiario ? [['A quem se destinou', d.beneficiario]] : []),
                ['Descrição', d.descricao ?? '—'],
                ['Loja', d.lojaNome ?? 'Geral'],
                ['Data', fmtData(d.data)],
                ['Pagamento', d.formaPagamento],
                ['Banco', d.banco],
                ['Lançada por', d.usuarioNome],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {/* Lançamento de caixa se edita no /caixa, onde ele nasceu e onde passa
                pela aprovação — aqui ele só compõe o resultado. */}
            {d.origem === 'caixa' ? (
              <p className="border-l-2 border-warning pl-3 text-sm text-warning">Saída do caixa da loja. Para editar, use o /caixa.</p>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 flex-1 md:h-9" onClick={() => setEditando(d)}>
                  <Pencil size={14} /> Editar
                </Button>
                <Button variant="outline" className="h-11 flex-1 text-destructive hover:text-destructive md:h-9" onClick={() => handleExcluir(d.id)} disabled={excluindo === d.id}>
                  <Trash2 size={14} /> Excluir
                </Button>
              </div>
            )}
          </>
        )}
        vazio={<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma despesa para os filtros aplicados.</p>}
      />

      {dados.length > 0 && (
        <p className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
          <span className="text-muted-foreground">Total filtrado</span>
          <span className="tabular-nums text-destructive">{moedaDeSaida(total)}</span>
        </p>
      )}

      {editando && (
        <DespesaDialog
          key={`${editando.id}-${editando.valor}-${editando.data}`}
          lojas={lojas} categorias={categorias}
          categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
          modo="editar" inicial={editando} open onOpenChange={o => { if (!o) setEditando(null) }}
        />
      )}
    </div>
  )
}
