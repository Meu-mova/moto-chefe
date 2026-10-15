'use client'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { LancarDespesaForm } from './lancar-despesa-form'
import { ListaDetalhe } from './lista-detalhe'
import type { Loja } from '../types'

export type SaidaRow = {
  id: string
  data: string
  banco: string
  favorecidoNome: string | null
  descricao: string | null
  valor: string
  despesaId: string | null
  categoria: string | null
  beneficiario: string | null
  lojaId: string | null
  lojaNome: string | null
  lancadoPorNome: string | null
  lancadoEm: string | null
}

type StatusFiltro = 'todas' | 'lancadas' | 'pendentes'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Sicoob Empresas" → "Sicoob". O nome vem do conector do mcp.ai e o sufixo
// não diz nada numa coluna estreita.
const nomeCurtoBanco = (banco: string) => banco.replace(/\s+Empresas$/i, '').replace(/\s+Pagamentos$/i, '')

export function SaidasTable({ saidas, lojas, categorias, categoriasComBeneficiario, beneficiarios, podeCategorizar }: {
  saidas: SaidaRow[]
  lojas: Loja[]
  categorias: string[]
  categoriasComBeneficiario: string[]
  beneficiarios: string[]
  podeCategorizar: boolean
}) {
  const [status, setStatus] = useState<StatusFiltro>('todas')

  const filtradas = useMemo(() => saidas.filter(s => {
    if (status === 'lancadas') return !!s.despesaId
    if (status === 'pendentes') return !s.despesaId
    return true
  }), [saidas, status])

  const opcoes: { value: StatusFiltro; label: string }[] = [
    { value: 'todas', label: `Todas (${saidas.length})` },
    { value: 'lancadas', label: `Lançadas (${saidas.filter(s => s.despesaId).length})` },
    { value: 'pendentes', label: `Não lançadas (${saidas.filter(s => !s.despesaId).length})` },
  ]

  return (
    <div className="space-y-3">
      <div className="flex max-w-full overflow-x-auto rounded-lg border bg-muted p-0.5 gap-0.5 md:inline-flex">
        {opcoes.map(o => (
          <button
            key={o.value}
            onClick={() => setStatus(o.value)}
            className={cn(
              'h-10 flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors md:h-8 md:flex-none md:text-xs',
              status === o.value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <ListaDetalhe
        itens={filtradas}
        idDe={s => s.id}
        borda={s => (s.despesaId ? 'border-l-transparent' : 'border-l-warning')}
        linha={s => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.favorecidoNome || '—'}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {new Date(s.data).toLocaleDateString('pt-BR')} · {nomeCurtoBanco(s.banco)}
                {s.despesaId ? ` · ${s.categoria ?? 'Lançada'}` : ' · pendente'}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-destructive">{fmt(Number(s.valor))}</span>
          </>
        )}
        tituloDetalhe="Saída do banco"
        descricaoDetalhe={s => `${new Date(s.data).toLocaleDateString('pt-BR')} · ${nomeCurtoBanco(s.banco)}`}
        detalhe={s => (
          <>
            <p className="text-2xl font-bold tabular-nums text-destructive">{fmt(Number(s.valor))}</p>
            <dl className="space-y-2 text-sm">
              {[
                ['Favorecido', s.favorecidoNome || '—'],
                ['Descrição', s.descricao || '—'],
                ['Banco', nomeCurtoBanco(s.banco)],
                ['Data', new Date(s.data).toLocaleDateString('pt-BR')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <LancarDespesaForm
              id={s.id}
              lojas={lojas}
              categorias={categorias}
              categoriasComBeneficiario={categoriasComBeneficiario}
              beneficiarios={beneficiarios}
              podeCategorizar={podeCategorizar}
              jaLancado={s.despesaId ? {
                categoria: s.categoria,
                beneficiario: s.beneficiario,
                lojaId: s.lojaId,
                lojaNome: s.lojaNome,
                lancadoPorNome: s.lancadoPorNome,
                lancadoEm: s.lancadoEm,
              } : null}
            />
          </>
        )}
        vazio={
          <p className="py-8 text-center text-sm text-muted-foreground">
            {saidas.length === 0 ? 'Nenhuma saída no período.' : 'Nenhuma saída para o filtro selecionado.'}
          </p>
        }
      />
    </div>
  )
}
