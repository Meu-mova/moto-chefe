'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { salvarMarcasDaContaAction } from '../actions'

type Conta = { id: string; nome: string; marcas: string[] }

export function MarcasDaConta({ contas, marcas }: { contas: Conta[]; marcas: string[] }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marcas por Conta</h2>
        <p className="text-sm text-muted-foreground">
          Marcas que cada Conta vê ao escolher modelo (entrada, venda, demandas, estoque). Nenhuma
          marcada = vê todas; Conta nova nasce só com MotoChefe. Moto já cadastrada continua aparecendo.
        </p>
      </div>
      <div className="divide-y">
        {contas.map(c => <LinhaConta key={c.id} conta={c} marcas={marcas} />)}
      </div>
    </div>
  )
}

function LinhaConta({ conta, marcas }: { conta: Conta; marcas: string[] }) {
  const [escolhidas, setEscolhidas] = useState(new Set(conta.marcas))
  const [pending, start] = useTransition()
  const mudou = escolhidas.size !== conta.marcas.length || conta.marcas.some(m => !escolhidas.has(m))

  function alternar(marca: string) {
    setEscolhidas(prev => {
      const novo = new Set(prev)
      if (novo.has(marca)) novo.delete(marca)
      else novo.add(marca)
      return novo
    })
  }

  function salvar() {
    start(async () => {
      try {
        await salvarMarcasDaContaAction(conta.id, [...escolhidas])
        toast.success(`Marcas de ${conta.nome} salvas`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{conta.nome}</p>
        <p className="text-xs text-muted-foreground">
          {escolhidas.size ? `${escolhidas.size} marca(s)` : 'Todas as marcas'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {marcas.map(m => (
          <label key={m} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={escolhidas.has(m)} onChange={() => alternar(m)} disabled={pending} />
            {m}
          </label>
        ))}
        <Button size="sm" onClick={salvar} disabled={pending || !mudou}>Salvar</Button>
      </div>
    </div>
  )
}
