'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { criarLancamentoAction, uploadComprovanteAction } from '../../actions'
import Link from 'next/link'

type Loja = { id: string; nome: string }

const categoriasEntrada = [
  'Venda',
  'Entrada de sinal',
  'Recebimento parcela',
  'Aporte sócio',
  'Outros',
]

const categoriasSaida = [
  'Depósito',
  'Água',
  'Luz',
  'Internet',
  'Material escritório',
  'Material oficina',
  'Manutenção',
  'Outros',
]

export function NovoLancamentoForm({ lojas, lojaUsuarioId, isAdmin }: { lojas: Loja[]; lojaUsuarioId: string | null; isAdmin: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(new Date().toISOString().split('T')[0])
  const [lojaId, setLojaId] = useState(lojaUsuarioId ?? lojas[0]?.id ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não suportado. Envie JPG, PNG, WebP ou PDF.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 10MB.')
      return
    }
    setArquivo(file)
    e.target.value = ''
  }

  const categorias = tipo === 'entrada' ? categoriasEntrada : categoriasSaida
  const isSaida = tipo === 'saida'
  const comprovanteOk = !isSaida || arquivo !== null

  async function handleSalvar() {
    if (!categoria || !valor || !data || !lojaId) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    if (isSaida && !arquivo) {
      toast.error('Comprovante obrigatório para saídas')
      return
    }

    setLoading(true)
    try {
      let comprovanteUrl: string | undefined

      if (arquivo) {
        const fd = new FormData()
        fd.append('file', arquivo)
        comprovanteUrl = await uploadComprovanteAction(fd)
      }

      await criarLancamentoAction({
        lojaId,
        tipo,
        categoria,
        descricao: descricao.trim() || undefined,
        valor,
        data,
        comprovanteUrl,
      })
      toast.success('Lançamento registrado!')
      router.push('/caixa')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo *</Label>
          <select
            value={tipo}
            onChange={e => { setTipo(e.target.value as 'entrada' | 'saida'); setCategoria(''); setArquivo(null) }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none"
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Loja *</Label>
          <select
            value={lojaId}
            onChange={e => setLojaId(e.target.value)}
            disabled={!isAdmin}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {lojas.map(l => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categoria *</Label>
        <select
          value={categoria}
          onChange={e => setCategoria(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none"
        >
          <option value="">Selecione...</option>
          {categorias.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Valor (R$) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-2">
          <Label>Data *</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Detalhes do lançamento..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Comprovante {isSaida && <span className="text-red-500">*</span>}
          {!isSaida && <span className="text-slate-400 text-xs ml-1">(opcional)</span>}
        </Label>
        {arquivo ? (
          <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-green-50 border-green-200">
            <FileCheck size={16} className="text-green-600 shrink-0" />
            <span className="text-sm text-green-700 truncate flex-1">{arquivo.name}</span>
            <span className="text-xs text-green-500">{(arquivo.size / 1024).toFixed(0)} KB</span>
            <button
              type="button"
              onClick={() => setArquivo(null)}
              className="text-green-400 hover:text-red-500 p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
          />
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link href="/caixa">
          <Button variant="outline">Cancelar</Button>
        </Link>
        <Button onClick={handleSalvar} disabled={loading || !comprovanteOk}>
          {loading ? 'Salvando...' : 'Salvar Lançamento'}
        </Button>
      </div>
    </div>
  )
}
