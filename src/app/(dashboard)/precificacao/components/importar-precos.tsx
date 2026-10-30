'use client'
import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { LinhaDaPrevia } from '@/lib/importar-precos'
import { importarPrecosAction, previaImportacaoAction } from '../actions'

const brl = (v: string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Previa = {
  arquivo: string
  matriz: unknown[][]
  linhas: LinhaDaPrevia[]
  iguais: string[]
  foraDoCatalogo: string[]
  parciais: string[]
  foraDaImportacao: string[]
}

// Lista recolhida do rodapé da prévia: só a contagem até o sócio pedir para ver.
function ListaRecolhida({ titulo, nomes }: { titulo: string; nomes: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <ul className="columns-1 gap-6 text-xs sm:columns-2">
        {nomes.map((n, i) => <li key={`${i}-${n}`} className="break-inside-avoid py-0.5">{n}</li>)}
      </ul>
    </div>
  )
}

export function ImportarPrecos() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [trocar, setTrocar] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [aberta, setAberta] = useState<'iguais' | 'fora' | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let matriz: unknown[][]
    try {
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
      matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    } catch {
      toast.error('Não deu para ler o arquivo. Use .xlsx ou .csv.')
      return
    }
    start(async () => {
      const r = await previaImportacaoAction(matriz)
      if (!r.ok) { toast.error(r.erro); return }
      setTrocar(new Set(r.linhas.filter(l => l.tipo === 'muda').map(l => l.modeloId)))
      setAberta(null)
      setPrevia({
        arquivo: file.name, matriz, linhas: r.linhas, iguais: r.iguais,
        foraDoCatalogo: r.foraDoCatalogo, parciais: r.parciais, foraDaImportacao: r.foraDaImportacao,
      })
    })
  }

  function marcar(modeloId: string, sim: boolean) {
    setTrocar(prev => {
      const novo = new Set(prev)
      if (sim) novo.add(modeloId)
      else novo.delete(modeloId)
      return novo
    })
  }

  function gravar() {
    if (!previa) return
    start(async () => {
      const r = await importarPrecosAction(previa.matriz, [...trocar])
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(`${r.gravados} preço${r.gravados !== 1 ? 's' : ''} gravado${r.gravados !== 1 ? 's' : ''}`)
      setPrevia(null)
    })
  }

  const aGravar = previa ? previa.linhas.filter(l => l.tipo === 'novo' || trocar.has(l.modeloId)).length : 0

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={pending} className="gap-1.5">
        {pending && !previa ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar planilha
      </Button>

      {previa && (
        <Dialog open onOpenChange={() => setPrevia(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Importar planilha de preços</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {previa.arquivo}. Desmarque o que não quer trocar. Preço para modelo sem preço sempre entra.
              </p>
            </DialogHeader>

            {previa.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum preço novo nem diferente do atual.</p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left font-medium">Modelo</th>
                      <th className="px-3 py-2 text-right font-medium">Hoje</th>
                      <th className="px-3 py-2 text-right font-medium">Planilha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previa.linhas.map(l => (
                      <tr key={l.modeloId}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Gravar ${l.nome}`}
                            checked={l.tipo === 'novo' || trocar.has(l.modeloId)}
                            disabled={l.tipo === 'novo'}
                            onChange={e => marcar(l.modeloId, e.target.checked)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {l.nome}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${l.tipo === 'novo' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                            {l.tipo === 'novo' ? 'novo' : 'muda'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                          {l.precoAtual ? brl(l.precoAtual) : 'sem preço'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{brl(l.precoNovo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previa.parciais.map(p => (
              <p key={p} className="rounded-md bg-info/10 px-3 py-2 text-xs text-info">{p}.</p>
            ))}

            {previa.foraDaImportacao.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-warning">Ficam fora da importação:</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
                  {previa.foraDaImportacao.map(a => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}

            {(previa.iguais.length > 0 || previa.foraDoCatalogo.length > 0) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {previa.iguais.length > 0 && (
                  <span>
                    {previa.iguais.length} com o mesmo preço{' '}
                    <button type="button" className="font-semibold text-primary-text hover:underline"
                      onClick={() => setAberta(a => (a === 'iguais' ? null : 'iguais'))}>
                      {aberta === 'iguais' ? 'esconder' : 'ver'}
                    </button>
                  </span>
                )}
                {previa.foraDoCatalogo.length > 0 && (
                  <span>
                    {previa.foraDoCatalogo.length} fora do seu catálogo, não serão atualizados{' '}
                    <button type="button" className="font-semibold text-primary-text hover:underline"
                      onClick={() => setAberta(a => (a === 'fora' ? null : 'fora'))}>
                      {aberta === 'fora' ? 'esconder' : 'ver todos'}
                    </button>
                  </span>
                )}
              </div>
            )}
            {aberta === 'iguais' && <ListaRecolhida titulo="Mesmo preço, ficam como estão" nomes={previa.iguais} />}
            {aberta === 'fora' && <ListaRecolhida titulo="Fora do seu catálogo" nomes={previa.foraDoCatalogo} />}

            <DialogFooter>
              <Button variant="outline" onClick={() => setPrevia(null)} disabled={pending}>Cancelar</Button>
              <Button onClick={gravar} disabled={pending || aGravar === 0}>
                {pending && <Loader2 size={16} className="animate-spin" />} Gravar os marcados ({aGravar})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
