'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy } from 'lucide-react'
import { parseNumeroBR } from '@/lib/numero-br'
import { salvarMetasDoMesAction, metasDoMesAction } from '../actions'

type Linha = {
  lojaId: string
  loja: string
  cidade: string
  meta: number | null
  realizado: number
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const paraCampo = (v: number | null) =>
  v === null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
}

export function MetasForm({ ano, mes, linhas }: { ano: number; mes: number; linhas: Linha[] }) {
  const router = useRouter()
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(linhas.map(l => [l.lojaId, paraCampo(l.meta)])),
  )
  const [salvando, salvar] = useTransition()
  const [copiando, copiar] = useTransition()

  const anterior = mesAnterior(ano, mes)

  // Campo vazio é meta apagada, não erro. Texto que não vira número é erro, e
  // aí o total não é somável — melhor não mostrar um total mentiroso.
  const numeros = linhas.map(l => {
    const texto = (valores[l.lojaId] ?? '').trim()
    return { lojaId: l.lojaId, valor: texto === '' ? null : parseNumeroBR(texto) }
  })
  const invalidos = numeros.filter(n => n.valor === null && (valores[n.lojaId] ?? '').trim() !== '')
  const totalMeta = numeros.reduce((a, n) => a + (n.valor ?? 0), 0)
  const totalRealizado = linhas.reduce((a, l) => a + l.realizado, 0)

  function trocarMes(valor: string) {
    router.push(`/admin/metas?mes=${valor}`)
  }

  function copiarAnterior() {
    copiar(async () => {
      try {
        const metas = await metasDoMesAction(anterior.ano, anterior.mes)
        if (metas.length === 0) {
          toast.error(`Nenhuma meta cadastrada em ${MESES[anterior.mes - 1]}`)
          return
        }
        const porLoja = new Map(metas.map(m => [m.lojaId, m.valor]))
        setValores(atual => {
          const proximo = { ...atual }
          for (const l of linhas) {
            const v = porLoja.get(l.lojaId)
            if (v !== undefined) proximo[l.lojaId] = paraCampo(v)
          }
          return proximo
        })
        toast.success(`Metas de ${MESES[anterior.mes - 1]} carregadas — confira e salve`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao copiar')
      }
    })
  }

  function salvarTudo() {
    if (invalidos.length > 0) {
      toast.error('Há valor que não dá pra ler — corrija antes de salvar')
      return
    }
    salvar(async () => {
      try {
        await salvarMetasDoMesAction(ano, mes, numeros)
        toast.success('Metas salvas')
        router.refresh()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar as metas')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={`${ano}-${String(mes).padStart(2, '0')}`}
          onChange={e => trocarMes(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
        />
        <Button variant="outline" size="sm" onClick={copiarAnterior} disabled={copiando}>
          <Copy size={14} className="mr-1.5" />
          {copiando ? 'Carregando…' : `Copiar de ${MESES[anterior.mes - 1]}`}
        </Button>
        <span className="text-xs text-muted-foreground">
          Copiar só preenche os campos — nada é salvo até você clicar em Salvar metas.
        </span>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center bg-card border rounded-lg">
          Nenhuma loja ativa neste grupo.
        </p>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Loja</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-52">Meta do mês (R$)</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Realizado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map(l => {
                const n = numeros.find(x => x.lojaId === l.lojaId)
                const invalido = n?.valor === null && (valores[l.lojaId] ?? '').trim() !== ''
                return (
                  <tr key={l.lojaId} className="hover:bg-muted">
                    <td className="px-4 py-2">
                      {l.loja}
                      <span className="block text-xs text-muted-foreground">{l.cidade}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={valores[l.lojaId] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [l.lojaId]: e.target.value }))}
                        placeholder="sem meta"
                        inputMode="decimal"
                        className={`text-right ${invalido ? 'border-destructive/50' : ''}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtBRL(l.realizado)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-muted border-t font-medium">
              <tr>
                <td className="px-4 py-2">Total do grupo</td>
                <td className="px-4 py-2 text-right">{fmtBRL(totalMeta)}</td>
                <td className="px-4 py-2 text-right">{fmtBRL(totalRealizado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {invalidos.length > 0 && (
          <span className="text-xs text-destructive">
            {invalidos.length} valor(es) que não dá pra ler
          </span>
        )}
        <Button onClick={salvarTudo} disabled={salvando || linhas.length === 0}>
          {salvando ? 'Salvando…' : 'Salvar metas'}
        </Button>
      </div>
    </div>
  )
}
