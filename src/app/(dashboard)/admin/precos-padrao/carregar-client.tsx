'use client'
import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { carregarTabelaPadraoAction } from './actions'

type Resultado = { ok: boolean; erro?: string; confirmar?: boolean; gravados?: number; anteriores?: number; avisos?: string[] }

export function CarregarTabelaClient({ mesAtual }: { mesAtual: string }) {
  const [competencia, setCompetencia] = useState(mesAtual)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [matriz, setMatriz] = useState<unknown[][] | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResultado(null)
    try {
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
      const lida = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
      setMatriz(lida)
      start(async () => setResultado(await carregarTabelaPadraoAction(lida, competencia)))
    } catch {
      setResultado({ ok: false, erro: 'Não deu para ler o arquivo. Use .xlsx ou .csv.' })
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Planilha com as colunas MODELO e PREÇO, ou a tabela da MotoChefe (lê só a coluna PIX). A carga troca a tabela inteira.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm space-y-1">
          <span className="block text-muted-foreground">Mês da tabela</span>
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2" />
        </label>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
        <Button onClick={() => inputRef.current?.click()} disabled={pending || !competencia}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Carregar planilha
        </Button>
      </div>
      {resultado && (
        <div className="text-sm space-y-1">
          {resultado.ok && <p className="text-success">Antes {resultado.anteriores} modelos, agora {resultado.gravados}.</p>}
          {resultado.confirmar && (
            <div className="space-y-2">
              <p className="text-warning">
                Antes {resultado.anteriores} modelos, agora {resultado.gravados}. A tabela atual vai ser trocada por esta, bem menor. Confira as linhas abaixo.
              </p>
              <Button variant="outline" disabled={pending || !matriz}
                onClick={() => start(async () => setResultado(await carregarTabelaPadraoAction(matriz, competencia, true)))}>
                Trocar mesmo assim
              </Button>
            </div>
          )}
          {!resultado.ok && !resultado.confirmar && <p className="text-destructive">{resultado.erro}</p>}
          {!!resultado.avisos?.length && (
            <ul className="list-disc pl-5 text-warning">
              {resultado.avisos.map(a => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
