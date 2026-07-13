'use client'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Truck } from 'lucide-react'
import { simularFreteAction, type ResultadoFrete } from '../actions'

type Loja = { id: string; nome: string; temCep: boolean }

type Props = {
  lojas: Loja[]
  isAdmin: boolean
  lojaUsuarioId: string | null
  onResultado: (r: ResultadoFrete | null) => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FreteSimulador({ lojas, isAdmin, lojaUsuarioId, onResultado }: Props) {
  const lojaInicial = isAdmin ? (lojas[0]?.id ?? '') : (lojaUsuarioId ?? '')
  const [lojaId, setLojaId] = useState(lojaInicial)
  const [cep, setCep] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<ResultadoFrete | null>(null)
  const [erroInesperado, setErroInesperado] = useState(false)

  const lojaSelecionada = lojas.find(l => l.id === lojaId) ?? null

  async function calcular(cepAtual: string, lojaAtual: string) {
    const cepLimpo = cepAtual.replace(/\D/g, '')
    const lojaAlvo = lojas.find(l => l.id === lojaAtual)
    if (cepLimpo.length !== 8 || !lojaAtual || !lojaAlvo?.temCep) {
      setResultado(null)
      setErroInesperado(false)
      onResultado(null)
      return
    }
    setLoading(true)
    setErroInesperado(false)
    try {
      const r = await simularFreteAction(lojaAtual, cepLimpo)
      setResultado(r)
      onResultado(r)
    } catch {
      setResultado(null)
      onResultado(null)
      setErroInesperado(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const lojaAtual = lojas.find(l => l.id === lojaId)
    if (lojaAtual && !lojaAtual.temCep) {
      setResultado(null)
      setErroInesperado(false)
      onResultado(null)
      return
    }
    if (cep.replace(/\D/g, '').length === 8) {
      calcular(cep, lojaId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId])

  if (!lojaSelecionada && !isAdmin) {
    return null
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Truck size={15} className="text-slate-600" />
        <span className="font-semibold text-sm text-slate-800">Frete de Entrega</span>
      </div>

      {isAdmin && (
        <div className="max-w-xs space-y-1.5">
          <Label className="text-xs">Loja de origem</Label>
          <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')}>
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {lojaSelecionada && !lojaSelecionada.temCep ? (
        <p className="text-xs text-amber-600">
          Configure o CEP desta loja em Admin &gt; Lojas para calcular o frete.
        </p>
      ) : (
        <>
          <div className="max-w-xs space-y-1.5">
            <Label className="text-xs">CEP de destino</Label>
            <Input
              value={cep}
              onChange={e => setCep(e.target.value)}
              onBlur={e => calcular(e.target.value, lojaId)}
              placeholder="00000-000"
              className="h-9 text-sm"
            />
          </div>

          {loading && <p className="text-xs text-slate-400">Calculando frete...</p>}

          {!loading && resultado && !resultado.ok && (
            <p className="text-xs text-red-500">
              {resultado.motivo === 'cep_invalido' ? 'CEP inválido.' : 'Não foi possível calcular a distância para este CEP.'}
            </p>
          )}

          {!loading && erroInesperado && (
            <p className="text-xs text-red-500">
              Erro ao calcular o frete. Tente novamente.
            </p>
          )}

          {!loading && resultado?.ok && (
            <div className="text-xs text-slate-600 space-y-0.5">
              <p>Distância: {resultado.kmIdaEVolta.toFixed(1)} km (ida e volta)</p>
              <p className="font-semibold text-slate-800">
                Frete: {resultado.gratis ? 'Grátis' : fmt(resultado.custo)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
