'use client'
import { useState, useTransition, useRef } from 'react'
import * as XLSX from 'xlsx'
import { importarVeiculosAction, verificarChassisExistentesAction, type VeiculoImportRow } from './actions'
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2, X, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PreviewRow = VeiculoImportRow & { _linha: number; _erro?: string; _ignorado?: boolean }

const COLUNAS_ACEITAS: Record<string, keyof VeiculoImportRow> = {
  chassi: 'chassi', chassis: 'chassi', vin: 'chassi',
  motor: 'numeroMotor', 'numero motor': 'numeroMotor', 'num motor': 'numeroMotor', 'nº motor': 'numeroMotor',
  marca: 'marca', fabricante: 'marca',
  modelo: 'modelo', model: 'modelo',
  cor: 'cor', color: 'cor', 'cor/modelo': 'cor',
  ano: 'ano', year: 'ano', 'ano modelo': 'ano', 'ano/modelo': 'ano',
  'nf entrada': 'nfEntrada', nf: 'nfEntrada', 'nota fiscal': 'nfEntrada', 'nota fiscal entrada': 'nfEntrada',
  'nf de entrada': 'nfEntrada', 'num nf': 'nfEntrada', 'numero nf': 'nfEntrada', 'nº nf': 'nfEntrada',
  'nfe': 'nfEntrada', 'chave nfe': 'nfEntrada',
}

function normKey(k: string) { return k.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() }

function parsePlanilha(arquivo: File): Promise<PreviewRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (!json.length) { reject(new Error('Planilha vazia')); return }

        const rows: PreviewRow[] = json.map((raw, idx) => {
          const row: Partial<VeiculoImportRow> & { _linha: number; _erro?: string } = { _linha: idx + 2 }
          for (const [col, val] of Object.entries(raw)) {
            const campo = COLUNAS_ACEITAS[normKey(col)]
            if (!campo) continue
            if (campo === 'ano') row.ano = val ? parseInt(String(val)) : undefined
            else (row as any)[campo] = val ? String(val).trim() : undefined
          }
          if (!row.chassi?.trim()) row._erro = 'Chassi em branco'
          if (!row.marca?.trim())  row.marca  = '—'
          if (!row.modelo?.trim()) row.modelo = '—'
          return row as PreviewRow
        })

        resolve(rows)
      } catch (e: any) {
        reject(new Error('Erro ao ler o arquivo: ' + e.message))
      }
    }
    reader.readAsArrayBuffer(arquivo)
  })
}

export function ImportarVeiculosClient({ totalAtual }: { totalAtual: number }) {
  const [pendingImport, startImport] = useTransition()
  const [pendingVerif,  startVerif]  = useTransition()
  const [preview,    setPreview]    = useState<PreviewRow[] | null>(null)
  const [arquivo,    setArquivo]    = useState<string>('')
  const [resultado,  setResultado]  = useState<{ importados: number; ignorados: number; deOutraConta: number } | null>(null)
  const [erro,       setErro]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null); setResultado(null); setPreview(null)
    setArquivo(file.name)
    try {
      const rows = await parsePlanilha(file)

      // Verifica no servidor quais chassis já existem no sistema (tabela motos)
      startVerif(async () => {
        const chassisComChassi = rows.filter(r => r.chassi?.trim()).map(r => r.chassi!.trim().toUpperCase())
        const existentes = await verificarChassisExistentesAction(chassisComChassi)

        const rowsMarcadas = rows.map(r => ({
          ...r,
          _ignorado: r.chassi ? existentes.has(r.chassi.trim().toUpperCase()) : false,
        }))
        setPreview(rowsMarcadas)
      })
    } catch (e: any) {
      setErro(e.message)
    }
  }

  function confirmarImportacao() {
    if (!preview) return
    // Apenas válidos E não ignorados
    const paraImportar = preview.filter(r => !r._erro && !r._ignorado)
    if (!paraImportar.length) { setErro('Nenhum registro novo para importar'); return }
    const ignorados = preview.filter(r => r._ignorado).length

    startImport(async () => {
      try {
        const r = await importarVeiculosAction(paraImportar.map(({ _linha, _erro, _ignorado, ...v }) => v))
        setResultado({ importados: r.importados, ignorados, deOutraConta: r.deOutraConta })
        setPreview(null)
      } catch (e: any) { setErro(e.message) }
    })
  }

  const comErro   = preview?.filter(r => r._erro).length ?? 0
  const ignorados = preview?.filter(r => r._ignorado).length ?? 0
  const validos   = (preview?.length ?? 0) - comErro - ignorados
  const pending   = pendingImport || pendingVerif

  return (
    <div className="space-y-6">
      {/* Contagem atual */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        <FileSpreadsheet size={20} className="text-slate-500" />
        <div>
          <p className="text-sm font-medium text-slate-700">Veículos no banco histórico</p>
          <p className="text-2xl font-bold text-slate-800">{totalAtual.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Upload */}
      {!preview && !resultado && (
        <div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
          <button onClick={() => inputRef.current?.click()} disabled={pending}
            className="w-full border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center gap-3 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50">
            {pending
              ? <Loader2 size={32} className="text-slate-400 animate-spin" />
              : <Upload size={32} className="text-slate-400" />}
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {pending ? 'Verificando chassis no sistema…' : 'Clique para selecionar o arquivo Excel'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Aceita .xlsx, .xls — primeira planilha será usada</p>
            </div>
          </button>
        </div>
      )}

      {erro && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} />
          {erro}
          <button onClick={() => setErro(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{arquivo}</p>
              <p className="text-xs text-slate-500 space-x-2">
                <span>{preview.length} linhas lidas</span>
                <span>·</span>
                <span className="text-green-700">{validos} para importar</span>
                {ignorados > 0 && <><span>·</span><span className="text-amber-600">{ignorados} já no sistema (ignorados)</span></>}
                {comErro   > 0 && <><span>·</span><span className="text-red-600">{comErro} com erro</span></>}
              </p>
            </div>
            <button onClick={() => { setPreview(null); setArquivo(''); if (inputRef.current) inputRef.current.value = '' }}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              <X size={13} /> Cancelar
            </button>
          </div>

          {/* Banner de ignorados */}
          {ignorados > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <Ban size={14} className="shrink-0" />
              <span>
                <strong>{ignorados} chassis</strong> já existem no cadastro de estoque do sistema e serão ignorados na importação.
              </span>
            </div>
          )}

          {/* Tabela preview (primeiras 10) */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Linha','Chassi','Motor','Marca','Modelo','Cor','Ano','NF Entrada','Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 15).map(r => (
                  <tr key={r._linha} className={
                    r._ignorado ? 'bg-amber-50 opacity-60' :
                    r._erro     ? 'bg-red-50' :
                    'hover:bg-slate-50'
                  }>
                    <td className="px-3 py-1.5 text-slate-400">{r._linha}</td>
                    <td className="px-3 py-1.5 font-mono font-medium">{r.chassi || <span className="text-red-400">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-500">{r.numeroMotor || '—'}</td>
                    <td className="px-3 py-1.5">{r.marca}</td>
                    <td className="px-3 py-1.5">{r.modelo}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.cor || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.ano || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-500 text-[11px]">{r.nfEntrada || '—'}</td>
                    <td className="px-3 py-1.5">
                      {r._ignorado && <span className="text-amber-600 text-[10px] font-medium">Já no sistema</span>}
                      {r._erro     && <span className="text-red-500 text-[10px]">{r._erro}</span>}
                      {!r._ignorado && !r._erro && <span className="text-green-600 text-[10px]">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 15 && (
              <p className="px-3 py-2 text-xs text-slate-400 border-t">
                … e mais {(preview.length - 15).toLocaleString('pt-BR')} linhas
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Cabeçalhos recomendados: <strong>Chassi, Motor, Marca, Modelo, Cor, Ano, NF Entrada</strong>
          </div>

          <div className="flex gap-3">
            <Button onClick={confirmarImportacao} disabled={pendingImport || validos === 0} className="flex-1">
              {pendingImport
                ? <><Loader2 size={14} className="animate-spin mr-2" />Importando {validos.toLocaleString('pt-BR')} veículos…</>
                : `Importar ${validos.toLocaleString('pt-BR')} veículo${validos !== 1 ? 's' : ''} novos`}
            </Button>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 size={44} className="text-green-500" />
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-slate-800">
              {resultado.importados.toLocaleString('pt-BR')} veículos importados!
            </p>
            {resultado.ignorados > 0 && (
              <p className="text-sm text-amber-600">
                {resultado.ignorados.toLocaleString('pt-BR')} ignorados — já existiam no sistema
              </p>
            )}
            {resultado.deOutraConta > 0 && (
              <p className="text-sm text-muted-foreground">
                {resultado.deOutraConta.toLocaleString('pt-BR')} não importados — chassi já cadastrado
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => { setResultado(null); if (inputRef.current) inputRef.current.value = '' }}>
            Importar outro arquivo
          </Button>
        </div>
      )}
    </div>
  )
}
