'use client'
import { useState } from 'react'
import { FileSpreadsheet, Loader2, Printer } from 'lucide-react'

/**
 * Exportação para a assessoria contábil.
 *
 * O download é por fetch + blob, não por `<a href>`: a geração lê venda, OS,
 * peça e extrato do período inteiro e pode levar dezenas de segundos. Num link
 * simples a tela fica muda e a pessoa clica de novo, disparando a consulta
 * inteira outra vez; aqui o botão mostra que está trabalhando e o erro aparece
 * escrito, em vez de abrir uma aba com JSON.
 */
export function ExportContabil({ de: dePadrao, ate: atePadrao }: { de: string; ate: string }) {
  const [de, setDe] = useState(dePadrao)
  const [ate, setAte] = useState(atePadrao)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function baixar() {
    setGerando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/relatorios/contabilidade?de=${de}&ate=${ate}`)
      if (!res.ok) {
        const corpo = await res.json().catch(() => null)
        setErro(corpo?.error ?? 'Não foi possível gerar a planilha agora.')
        return
      }
      const blob = await res.blob()
      const nome = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `contabilidade-${de}-a-${ate}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErro('Não foi possível gerar a planilha agora.')
    } finally {
      setGerando(false)
    }
  }

  const campo = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none'

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-slate-800">Exportar para a contabilidade</h2>
        <p className="text-sm text-slate-500">
          Planilha com o DRE do período e, em abas separadas, cada despesa e cada venda linha a
          linha. A coluna <strong>entraNoResultado</strong> diz o que compõe o resultado e o que
          ficou de fora (compra de moto, retirada, transferência entre as empresas do grupo) — é
          o que permite conferir a planilha contra o DRE sem chegar a um total que não existe.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">De</label>
        <input type="month" value={de} onChange={e => setDe(e.target.value)} className={campo} />
        <label className="text-sm text-slate-600">até</label>
        <input type="month" value={ate} onChange={e => setAte(e.target.value)} className={campo} />

        <button
          onClick={baixar}
          disabled={gerando}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 text-white px-3 h-9 text-sm hover:bg-slate-700 disabled:opacity-60"
        >
          {gerando
            ? <><Loader2 size={14} className="animate-spin" /> Gerando…</>
            : <><FileSpreadsheet size={14} /> Baixar planilha</>}
        </button>

        <a
          href={`/dre/imprimir?mes=${ate}&aba=lojas`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Printer size={14} /> DRE em PDF
        </a>
      </div>

      {erro && (
        <p className="text-sm text-red-600">{erro}</p>
      )}
      <p className="text-xs text-slate-400">
        No máximo 12 meses por arquivo. A planilha sai do grupo ativo — hoje o que está no topo da
        tela.
      </p>
    </div>
  )
}
