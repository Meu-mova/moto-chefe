'use client'

import { useState, useRef } from 'react'
import { registrarEntrada } from '../actions'
import { toast } from 'sonner'
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react'

type Modelo = { id: string; modelo: string; marca: string }
type MotoLinha = { chassi: string; cor: string; motor: string }

export function EntradaForm({ modelos }: { modelos: Modelo[] }) {
  const [notaFiscal, setNotaFiscal] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [valor, setValor] = useState('')
  const [linhas, setLinhas] = useState<MotoLinha[]>([{ chassi: '', cor: '', motor: '' }])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function addLinha() {
    setLinhas(prev => [...prev, { chassi: '', cor: '', motor: '' }])
  }

  function removeLinha(i: number) {
    setLinhas(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLinha(i: number, field: keyof MotoLinha, value: string) {
    setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())

      const header = lines[0].toLowerCase()
      const hasHeader = header.includes('chassi') || header.includes('cor')
      const dataLines = hasHeader ? lines.slice(1) : lines

      const novas: MotoLinha[] = dataLines.map(line => {
        const sep = line.includes(';') ? ';' : ','
        const parts = line.split(sep).map(s => s.trim().replace(/^["']|["']$/g, ''))
        return {
          chassi: parts[0] || '',
          cor: parts[1] || '',
          motor: parts[2] || '',
        }
      }).filter(m => m.chassi)

      if (novas.length === 0) {
        toast.error('Nenhuma moto encontrada no arquivo')
        return
      }

      setLinhas(prev => {
        const existentes = prev.filter(l => l.chassi)
        return [...existentes, ...novas]
      })
      toast.success(`${novas.length} moto(s) importada(s) do CSV`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!notaFiscal || !modeloId) {
      toast.error('Preencha a nota fiscal e selecione o modelo')
      return
    }

    const motosValidas = linhas.filter(l => l.chassi.trim())
    if (motosValidas.length === 0) {
      toast.error('Adicione pelo menos uma moto com chassi')
      return
    }

    setLoading(true)
    try {
      const result = await registrarEntrada({
        notaFiscal,
        modeloId,
        valor,
        motos: motosValidas,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.success)
        setNotaFiscal('')
        setValor('')
        setLinhas([{ chassi: '', cor: '', motor: '' }])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dados da nota */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h3 className="font-semibold text-slate-700">Dados da Nota Fiscal</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nº Nota Fiscal *</label>
            <input
              type="text"
              value={notaFiscal}
              onChange={e => setNotaFiscal(e.target.value)}
              placeholder="Ex: 12345"
              className="w-full border rounded-md px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Modelo *</label>
            <select
              value={modeloId}
              onChange={e => setModeloId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              required
            >
              <option value="">Selecione...</option>
              {modelos.map(m => (
                <option key={m.id} value={m.id}>{m.marca} — {m.modelo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Valor unitário (R$)</label>
            <input
              type="text"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="Ex: 8500.00"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Lista de motos */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">
            Motos ({linhas.filter(l => l.chassi.trim()).length})
          </h3>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleCSV}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
            >
              <Upload size={14} />
              Importar CSV
            </button>
            <button
              type="button"
              onClick={addLinha}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              <Plus size={14} />
              Adicionar
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1">
          <FileSpreadsheet size={12} />
          CSV: chassi, cor, motor (uma moto por linha)
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-left px-2 py-2 font-medium w-8">#</th>
              <th className="text-left px-2 py-2 font-medium">Chassi *</th>
              <th className="text-left px-2 py-2 font-medium">Cor *</th>
              <th className="text-left px-2 py-2 font-medium">Nº Motor</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={linha.chassi}
                    onChange={e => updateLinha(i, 'chassi', e.target.value)}
                    placeholder="Chassi"
                    className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={linha.cor}
                    onChange={e => updateLinha(i, 'cor', e.target.value)}
                    placeholder="Cor"
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={linha.motor}
                    onChange={e => updateLinha(i, 'motor', e.target.value)}
                    placeholder="Motor"
                    className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLinha(i)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'Registrando...' : `Registrar entrada (${linhas.filter(l => l.chassi.trim()).length} motos)`}
        </button>
      </div>
    </form>
  )
}
