'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type LojaComCategorias = {
  lojaId: string
  nome: string
  total: number
  categorias: { categoria: string; total: number }[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Em que cada loja gasta — o mesmo detalhe do card "Geral (Empresa) por
 * Categoria", só que do dinheiro que TEM loja atribuída.
 *
 * O card "Despesas por Loja", ao lado, responde quanto cada uma gastou. Este
 * responde em quê: sem ele, a loja que gasta o dobro da vizinha é um número
 * maior e nada mais.
 */
export function ResumoDespesasLojaCategoria({ lojas }: { lojas: LojaComCategorias[] }) {
  // Abre na loja que mais gastou — a lista já vem ordenada por total.
  const [ativa, setAtiva] = useState(lojas[0]?.lojaId ?? '')
  const loja = lojas.find(l => l.lojaId === ativa) ?? lojas[0]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Despesas da Loja por Categoria</CardTitle>
        <p className="text-xs text-muted-foreground">
          só o que tem loja atribuída — o resto está em Geral (Empresa)
        </p>
      </CardHeader>
      <CardContent>
        {!loja ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma despesa com loja atribuída no período.
          </p>
        ) : (
          <>
            {/* Com uma loja só (filtro ativo) o seletor não tem o que selecionar. */}
            {lojas.length > 1 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {lojas.map(l => (
                  <button
                    key={l.lojaId}
                    onClick={() => setAtiva(l.lojaId)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      l.lojaId === loja.lojaId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {l.nome}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {loja.categorias.map(c => (
                <div key={c.categoria} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{c.categoria}</span>
                  <span className="font-mono text-destructive whitespace-nowrap">
                    {fmt(c.total)}
                    {loja.total > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {((c.total / loja.total) * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {loja.categorias.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma despesa desta loja no período.
                </p>
              )}
            </div>

            {loja.categorias.length > 0 && (
              <div className="flex items-baseline justify-between gap-3 text-sm border-t mt-2 pt-2 font-semibold">
                <span>Total {lojas.length > 1 ? `— ${loja.nome}` : ''}</span>
                <span className="font-mono text-destructive">{fmt(loja.total)}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
