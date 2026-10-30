'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { carregarConferenciaPlanilhaPecas, registrarEntradaPlanilhaPecas } from '../actions'
import { lerPlanilhaPecas, linhaDaPlanilha, MODELO_PLANILHA_PECAS, type ItemPlanilhaPecas } from '@/lib/planilha-pecas'
import { paraGravacao, problemaDaLinha, type LinhaConferencia } from '@/lib/conferencia-pecas'
import type { ConferenciaPlanilha } from '@/lib/entrada-pecas'
import { cnpjValido } from '@/lib/documento'
import { ConferenciaPecas } from './conferencia-pecas'

type Props = { lojaId: string; lojaNome: string }

/** Peças e acessórios sem nota (#519): a planilha passa pela mesma conferência do XML. */
export function PecasPorPlanilha({ lojaId, lojaNome }: Props) {
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [itens, setItens] = useState<ItemPlanilhaPecas[]>([])
  const [errosLeitura, setErrosLeitura] = useState<string[]>([])
  const [cnpj, setCnpj] = useState('')
  const [conferencia, setConferencia] = useState<ConferenciaPlanilha | null>(null)
  const [linhas, setLinhas] = useState<LinhaConferencia[]>([])
  const [lancarRepetida, setLancarRepetida] = useState(false)
  const [loading, setLoading] = useState(false)

  const itensDaConferencia = (lista: ItemPlanilhaPecas[]) => lista.map(i => ({
    codigo: i.codigo, nomeXml: i.descricao, quantidade: i.quantidade, custoUnitario: i.custoUnitario,
  }))

  // CNPJ pela metade não recarrega a conferência a cada tecla: só vale vazio ou completo.
  const cnpjFornecedor = cnpjValido(cnpj) ? cnpj : null

  // Recarrega ao trocar a loja ou o CNPJ: as sugestões e o aviso de repetida mudam com eles.
  useEffect(() => {
    // Sem a conferência da loja nova, o botão fica travado até ela chegar.
    setConferencia(null)
    if (!itens.length || !lojaId) return
    let vale = true
    carregarConferenciaPlanilhaPecas(lojaId, { fornecedorCnpj: cnpjFornecedor, itens: itensDaConferencia(itens) }).then(r => {
      if (!vale) return
      if ('error' in r) { toast.error(r.error); setConferencia(null); return }
      setConferencia(r.conferencia)
      // Como no XML: a peça do catálogo volta para a sugestão desta Conta; o resto fica.
      setLinhas(prev => itens.map((it, i) => {
        const nova = linhaDaPlanilha(it, r.conferencia.sugestoes[i])
        const antes = prev.length === itens.length ? prev[i] : null
        if (!antes) return nova
        return antes.destino === 'catalogo' ? { ...nova, quantidade: antes.quantidade } : { ...antes, pecaId: '' }
      }))
      setLancarRepetida(false)
    })
    return () => { vale = false }
  }, [itens, lojaId, cnpjFornecedor])

  function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.arrayBuffer().then(buf => {
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
      const r = lerPlanilhaPecas(rows)
      setErrosLeitura(r.erros)
      setLinhas([])
      setItens(r.erros.length ? [] : r.itens)
      if (!r.erros.length && !r.itens.length) toast.error('Nenhum item encontrado na planilha')
    })
  }

  function baixarModelo() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MODELO_PLANILHA_PECAS), 'Peças')
    XLSX.writeFile(wb, 'modelo-pecas-mova.xlsx')
  }

  function limpar() {
    setItens([]); setErrosLeitura([]); setConferencia(null); setLinhas([])
  }

  const comProblema = linhas.filter(l => problemaDaLinha(l)).length
  const entram = linhas.filter(l => l.destino !== 'ignorar').length
  const travado = loading || !conferencia || (!!cnpj.trim() && !cnpjFornecedor) || comProblema > 0 || entram === 0 || (!!conferencia.planilhaJaLancada && !lancarRepetida)

  async function registrar() {
    setLoading(true)
    const r = await registrarEntradaPlanilhaPecas({ lojaId, fornecedorCnpj: cnpj.trim() || null, linhas: paraGravacao(linhas) })
    setLoading(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(r.success)
    limpar()
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Peças e acessórios por planilha</h3>
            <p className="text-xs text-muted-foreground">
              Para peças sem XML. Colunas: CÓDIGO, DESCRIÇÃO, QUANTIDADE, CUSTO UNITÁRIO e PREÇO DE VENDA.
              Só DESCRIÇÃO e QUANTIDADE são obrigatórias; o preço de venda é pedido para peça nova.
            </p>
          </div>
          <button type="button" onClick={baixarModelo} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Download size={16} /> Baixar modelo
          </button>
        </div>

        <label className="block">
          <span className="block text-sm text-muted-foreground mb-1">CNPJ do fornecedor (opcional)</span>
          <input
            value={cnpj}
            onChange={e => setCnpj(e.target.value)}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            className="w-full border border-input rounded-md px-3 py-2 text-sm"
          />
          <span className="block text-xs text-muted-foreground mt-1">
            Com ele, o MOVA lembra qual peça é cada código desse fornecedor. Sem ele, sugere pelo nome.
          </span>
          {cnpj.trim() && !cnpjFornecedor && <span className="block text-xs text-destructive mt-1">CNPJ incompleto ou inválido.</span>}
        </label>

        <input ref={arquivoRef} type="file" accept=".xlsx,.xls" onChange={lerArquivo} className="hidden" />
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:border-ring hover:bg-muted"
        >
          <Upload size={16} />
          {itens.length ? `${itens.length} item(ns) carregado(s); clique para trocar a planilha` : 'Selecionar planilha de peças (.xlsx)'}
        </button>

        {errosLeitura.length > 0 && (
          <div className="rounded-lg border border-destructive p-3 text-sm text-destructive">
            <p className="font-medium">Nada foi carregado. Corrija a planilha:</p>
            <ul className="mt-1 list-disc pl-5">{errosLeitura.map(e => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </div>

      {itens.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={limpar} className="text-sm text-destructive hover:opacity-80">Tirar a planilha</button>
          </div>
          {conferencia?.planilhaJaLancada && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-muted px-4 py-3 text-sm text-warning">
              <span>
                <strong>
                  Parece que esta planilha já foi lançada em{' '}
                  {new Date(conferencia.planilhaJaLancada.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por {conferencia.planilhaJaLancada.por}.
                </strong>{' '}
                Lançar de novo?
              </span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={lancarRepetida} onChange={e => setLancarRepetida(e.target.checked)} />
                Lançar mesmo assim
              </label>
            </div>
          )}
          {!lojaId && (
            <p className="bg-card rounded-lg border p-4 text-sm text-muted-foreground">
              Escolha a loja de destino para conferir as peças.
            </p>
          )}
          {lojaId && conferencia && (
            <ConferenciaPecas
              origem="planilha"
              linhas={linhas}
              onChange={(i, patch) => setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))}
              pecas={conferencia.pecas}
              sugestoes={conferencia.sugestoes}
              lojaNome={lojaNome}
            />
          )}
          <div className="flex items-center justify-end gap-4">
            {comProblema > 0 && (
              <span className="text-sm text-destructive">
                {comProblema === 1 ? '1 linha precisa de correção.' : `${comProblema} linhas precisam de correção.`}
              </span>
            )}
            <button
              type="button"
              disabled={travado}
              onClick={registrar}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 font-medium"
            >
              {loading ? 'Registrando...' : `Registrar entrada (${entram} peças)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
