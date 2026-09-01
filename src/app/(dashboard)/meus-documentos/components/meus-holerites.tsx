'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, ExternalLink } from 'lucide-react'
import type { MeuHoleriteRow } from '../../folha-pagamento/holerites-actions'
import { getMeuHoleriteUrlAction } from '../../folha-pagamento/holerites-actions'

const TIPO_LABEL: Record<string, string> = {
  adiantamento: 'Adiantamento',
  salario: 'Pagamento do salário',
}

function fmtMes(mes: string) {
  // 'YYYY-MM' formatado sem new Date(mes): o construtor leria como UTC e o mês
  // viraria o anterior no fuso de Brasília.
  const [ano, m] = mes.split('-')
  const nome = new Date(Number(ano), Number(m) - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

function fmtTamanho(bytes: number | null) {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function Documento({ holerite }: { holerite: MeuHoleriteRow }) {
  const [abrindo, setAbrindo] = useState(false)

  async function abrir() {
    setAbrindo(true)
    try {
      // A aba é aberta ANTES do await: navegador bloqueia window.open disparado
      // depois de uma promise, por não ser mais gesto do usuário.
      const aba = window.open('', '_blank')
      const url = await getMeuHoleriteUrlAction(holerite.id)
      if (aba) aba.location.href = url
      else window.location.href = url
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir o documento')
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <button
      onClick={abrir}
      disabled={abrindo}
      className="w-full flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-60"
    >
      <FileText size={18} className="shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{TIPO_LABEL[holerite.tipo] ?? holerite.tipo}</p>
        <p className="truncate text-xs text-slate-400">
          {holerite.arquivoNome}
          {holerite.tamanho ? ` · ${fmtTamanho(holerite.tamanho)}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs text-slate-400">{abrindo ? 'abrindo…' : 'abrir'}</span>
      <ExternalLink size={14} className="shrink-0 text-slate-300" />
    </button>
  )
}

export function MeusHolerites({ holerites }: { holerites: MeuHoleriteRow[] }) {
  if (holerites.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-16 text-center">
        <FileText size={28} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm text-slate-500">Nenhum holerite disponível ainda.</p>
        <p className="mt-1 text-xs text-slate-400">
          Eles aparecem aqui assim que o escritório recebe os arquivos da contabilidade.
        </p>
      </div>
    )
  }

  // Agrupa por mês preservando a ordem que veio do servidor (mais recente primeiro).
  const meses: { mes: string; itens: MeuHoleriteRow[] }[] = []
  for (const h of holerites) {
    const atual = meses.find(m => m.mes === h.mes)
    if (atual) atual.itens.push(h)
    else meses.push({ mes: h.mes, itens: [h] })
  }

  return (
    <div className="space-y-6">
      {meses.map(({ mes, itens }) => (
        <section key={mes} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">{fmtMes(mes)}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {itens.map(h => <Documento key={h.id} holerite={h} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
