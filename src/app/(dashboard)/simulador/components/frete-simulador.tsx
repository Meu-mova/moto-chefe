'use client'
import { useEffect, useState } from 'react'
import { CepInput } from '@/components/ui/cep-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
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
        <Truck size={15} className="text-muted-foreground" />
        <span className="font-semibold text-sm text-foreground">Frete de Entrega</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <div className="w-52 space-y-1.5">
            <Label className="text-xs">Loja de origem</Label>
            <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')}>
              <SelectTrigger className="h-9 text-sm w-full">
                <span className={lojaId ? 'text-foreground' : 'text-muted-foreground'}>
                  {lojaSelecionada?.nome ?? 'Selecione a loja'}
                </span>
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
          <p className="text-xs text-warning pb-1.5">
            Configure o CEP desta loja em Admin &gt; Lojas para calcular o frete.
          </p>
        ) : (
          <>
            <div className="w-36 space-y-1.5">
              <Label className="text-xs">CEP de destino</Label>
              <CepInput
                value={cep}
                onChange={setCep}
                onBlur={e => calcular(e.target.value, lojaId)}
                className="h-9 text-sm"
              />
            </div>

            {!loading && resultado?.ok && (
              <p className="text-xs text-muted-foreground pb-1.5 max-w-xs">{resultado.endereco}</p>
            )}

            {(loading || erroInesperado || resultado) && (
              <div className="rounded-lg bg-muted border px-3 py-1.5 text-xs">
                {loading && <p className="text-muted-foreground">Calculando frete...</p>}

                {!loading && resultado && !resultado.ok && (
                  <p className="text-destructive">
                    {resultado.motivo === 'cep_invalido' ? 'CEP inválido.' : 'Não foi possível calcular a distância para este CEP.'}
                  </p>
                )}

                {!loading && erroInesperado && (
                  <p className="text-destructive">Erro ao calcular o frete. Tente novamente.</p>
                )}

                {!loading && resultado?.ok && (
                  <div className="text-muted-foreground space-y-0.5">
                    <p>Distância: {resultado.kmIdaEVolta.toFixed(1)} km (ida e volta)</p>
                    <p className="font-semibold text-foreground">
                      Frete: {resultado.gratis ? 'Grátis' : fmt(resultado.custo)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
