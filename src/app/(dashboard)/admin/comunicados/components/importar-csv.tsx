'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { importarComunicadosAction } from '../actions'

type Linha = { titulo: string; conteudo: string; ativo: boolean; dataPostagem: string | null }

function parseCsv(texto: string): Linha[] {
  const linhas = texto.trim().split('\n')
  if (linhas.length < 2) throw new Error('CSV deve ter cabeçalho e ao menos uma linha')

  const cabecalho = linhas[0].split(';').map(h => h.trim().toLowerCase().replace(/["\r]/g, ''))
  const idxTitulo = cabecalho.indexOf('titulo')
  const idxConteudo = cabecalho.indexOf('conteudo')
  const idxData = cabecalho.indexOf('data_postagem')
  const idxAtivo = cabecalho.indexOf('ativo')

  if (idxTitulo === -1 || idxConteudo === -1) throw new Error('CSV precisa das colunas: titulo, conteudo')

  return linhas.slice(1).filter(l => l.trim()).map((linha, i) => {
    const cols = linha.split(';').map(c => c.trim().replace(/^"|"$/g, '').replace(/\r$/, ''))
    const titulo = cols[idxTitulo] ?? ''
    const conteudo = cols[idxConteudo] ?? ''
    if (!titulo) throw new Error(`Linha ${i + 2}: título vazio`)
    if (!conteudo) throw new Error(`Linha ${i + 2}: conteúdo vazio`)
    const dataRaw = idxData !== -1 ? (cols[idxData] ?? '') : ''
    const dataPostagem = dataRaw ? new Date(dataRaw).toISOString() : null
    if (dataRaw && isNaN(Date.parse(dataRaw))) throw new Error(`Linha ${i + 2}: data_postagem inválida ("${dataRaw}")`)
    const ativoRaw = idxAtivo !== -1 ? (cols[idxAtivo] ?? 'true') : 'true'
    const ativo = !['false', '0', 'nao', 'não', 'n'].includes(ativoRaw.toLowerCase())
    return { titulo, conteudo, ativo, dataPostagem }
  })
}

export function ImportarCsv() {
  const [preview, setPreview] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErro('')
    setPreview(null)
    setSucesso(false)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const linhas = parseCsv(ev.target?.result as string)
        setPreview(linhas)
      } catch (err: any) {
        setErro(err.message)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function handleImportar() {
    if (!preview?.length) return
    setLoading(true)
    setErro('')
    try {
      await importarComunicadosAction(preview)
      setPreview(null)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 4000)
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500 space-y-1">
        <p>Formato esperado: arquivo <strong>.csv</strong> com separador <strong>ponto e vírgula (;)</strong></p>
        <p>Colunas: <code className="bg-slate-100 px-1 rounded">titulo</code> <code className="bg-slate-100 px-1 rounded">conteudo</code> <code className="bg-slate-100 px-1 rounded">data_postagem</code> (opcional) <code className="bg-slate-100 px-1 rounded">ativo</code> (opcional, padrão: true)</p>
        <p>Data no formato ISO: <code className="bg-slate-100 px-1 rounded">2026-07-15T09:00:00</code></p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => document.getElementById('csv-upload')?.click()} type="button">
          <Upload size={14} className="mr-1" /> Selecionar arquivo CSV
        </Button>
        <input id="csv-upload" type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      </div>

      {erro && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {erro}
        </div>
      )}

      {sucesso && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle2 size={14} />
          Comunicados importados com sucesso!
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{preview.length} comunicado{preview.length !== 1 ? 's' : ''} encontrado{preview.length !== 1 ? 's' : ''} — prévia:</p>
          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto text-xs">
            {preview.map((l, i) => (
              <div key={i} className="px-3 py-2 space-y-0.5">
                <div className="font-medium">{l.titulo}</div>
                <div className="text-slate-500 line-clamp-1">{l.conteudo}</div>
                <div className="flex gap-3 text-slate-400">
                  {l.dataPostagem && <span>📅 {new Date(l.dataPostagem).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                  <span>{l.ativo ? '✓ ativo' : '✗ inativo'}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImportar} disabled={loading} size="sm">
              {loading ? 'Importando...' : `Importar ${preview.length} comunicado${preview.length !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
