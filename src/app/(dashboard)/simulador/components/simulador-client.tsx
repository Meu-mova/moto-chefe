'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimularDialog } from './simular-dialog'
import { GerenciarDialog } from './gerenciar-dialog'
import { excluirSimuladorAction } from '../actions'
import { Plus, Pencil, Trash2, Calculator, Search } from 'lucide-react'

type Modelo = {
  id: string
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}

function fmt(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  modelos: Modelo[]
  isAdmin: boolean
}

export function SimuladorClient({ modelos, isAdmin }: Props) {
  const [busca, setBusca] = useState('')
  const [simular, setSimular] = useState<Modelo | null>(null)
  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

  const filtrados = modelos.filter(m =>
    m.nome.toLowerCase().includes(busca.toLowerCase())
  )

  async function handleExcluir(m: Modelo) {
    if (!confirm(`Remover ${m.nome} do simulador?`)) return
    try {
      await excluirSimuladorAction(m.id)
      toast.success('Modelo removido')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Buscar modelo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        {isAdmin && (
          <Button
            onClick={() => { setModeloEdicao(null); setGerenciarAberto(true) }}
            className="gap-1.5"
          >
            <Plus size={16} /> Novo Modelo
          </Button>
        )}
      </div>

      {filtrados.length === 0 && (
        <p className="text-center text-slate-400 py-16 text-sm">
          {busca ? 'Nenhum modelo encontrado.' : 'Nenhum modelo cadastrado.'}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtrados.map(m => {
          const desconto = parseFloat(m.precoAvista) - parseFloat(m.precoPix)
          const pctDesc = (desconto / parseFloat(m.precoAvista) * 100).toFixed(1)

          return (
            <div key={m.id} className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="p-4 flex-1">
                <h3 className="font-bold text-slate-900 text-lg mb-3">{m.nome}</h3>

                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">À vista</span>
                    <span className="font-semibold text-slate-800">{fmt(m.precoAvista)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-green-600 font-medium">PIX / Dinheiro</span>
                    <div className="text-right">
                      <span className="font-bold text-green-700">{fmt(m.precoPix)}</span>
                      <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                        -{pctDesc}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Cartão físico</span>
                    <span className="text-xs text-slate-500">
                      +{(parseFloat(m.taxaCartaoFisico) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Link pagamento</span>
                    <span className="text-xs text-slate-500">
                      +{(parseFloat(m.taxaLinkPagamento) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 pt-0 flex gap-2">
                <Button
                  className="flex-1 gap-1.5"
                  size="sm"
                  onClick={() => setSimular(m)}
                >
                  <Calculator size={14} /> Simular
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setModeloEdicao(m); setGerenciarAberto(true) }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="text-red-500 hover:text-red-700 hover:border-red-300"
                      onClick={() => handleExcluir(m)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {simular && (
        <SimularDialog modelo={simular} onClose={() => setSimular(null)} />
      )}

      {gerenciarAberto && (
        <GerenciarDialog
          modelo={modeloEdicao}
          onClose={() => { setGerenciarAberto(false); setModeloEdicao(null) }}
        />
      )}
    </>
  )
}
