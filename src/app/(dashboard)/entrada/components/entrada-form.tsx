'use client'

import { useState, useRef, useEffect } from 'react'
import { registrarEntrada, registrarEntradaLote, registrarEntradaNota, carregarConferenciaPecas } from '../actions'
import { toast } from 'sonner'
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import { CurrencyInput } from '@/components/ui/currency-input'
import * as XLSX from 'xlsx'
import { parseMotosInfCpl, extrairDaNfe, mapearModelo, extrairItensDePeca, type ItemPecaNfe } from '@/lib/nfe-entrada'
import { linhaInicial, paraGravacao, problemaDaLinha, type LinhaConferencia } from '@/lib/conferencia-pecas'
import type { Conferencia } from '@/lib/entrada-pecas'
import { ConferenciaPecas } from './conferencia-pecas'
import { casarModelo } from '@/lib/entrada-preco'
import { extrairFiscalDaNfe, extrairEmitenteDaNfe, ligarFichasAosChassis, type FichaFiscal, type EmitenteNfe, type NomeDeModelo } from '@/lib/nfe-fiscal'

type Modelo = {
  id: string
  modelo: string
  marca: string
}
type Loja = { id: string; nome: string }
type MotoLinha = { chassi: string; cor: string; motor: string }
// `modelo` guarda o nome cru que veio do XML/planilha (é a chave de agrupamento da
// tela); `modeloId` e `preco` são o que de fato vai pro banco, e ambos ficam editáveis.
type MotoLinhaPlanilha = {
  chassi: string
  cor: string
  motor: string
  modelo: string
  nf: string
  modeloId: string
  preco: string
}

export function EntradaForm({ modelos, lojas, apelidos = [] }: { modelos: Modelo[]; lojas: Loja[]; apelidos?: NomeDeModelo[] }) {
  const [modo, setModo] = useState<'manual' | 'planilha'>('planilha')

  const [notaFiscal, setNotaFiscal] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [precoCompra, setPrecoCompra] = useState('')
  const [lojaId, setLojaId] = useState('')
  const [linhas, setLinhas] = useState<MotoLinha[]>([{ chassi: '', cor: '', motor: '' }])

  const [linhasPlanilha, setLinhasPlanilha] = useState<MotoLinhaPlanilha[]>([])
  // Ficha fiscal (NCM, CEST, origem…) lida dos <det> dos XMLs importados. Não
  // aparece na tela: é cadastro do modelo, e vai junto no envio para preencher
  // quem ainda não tem — ver cadastrarFichaFiscalFaltante na action.
  const [fiscais, setFiscais] = useState<{ chassi: string; emitente: EmitenteNfe; ficha: FichaFiscal }[]>([])

  // Peças da nota (#427): uma nota com peças por vez, conferida contra o catálogo
  // da Conta da loja de destino.
  const [notaPecas, setNotaPecas] = useState<{
    nota: { chaveAcesso: string; numero: string; fornecedorCnpj: string; fornecedorNome: string }
    itens: ItemPecaNfe[]
  } | null>(null)
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)
  const [linhasPecas, setLinhasPecas] = useState<LinhaConferencia[]>([])
  const [lancarRepetida, setLancarRepetida] = useState(false)

  useEffect(() => {
    if (!notaPecas || !lojaId) { setConferencia(null); return }
    let vale = true
    const { fornecedorNome: _, ...nota } = notaPecas.nota
    carregarConferenciaPecas(lojaId, {
      ...nota, itens: notaPecas.itens.map(i => ({ codigo: i.codigo, nomeXml: i.nomeXml })),
    }).then(r => {
      if (!vale) return
      if ('error' in r) { toast.error(r.error); setConferencia(null); return }
      setConferencia(r.conferencia)
      setLinhasPecas(notaPecas.itens.map((it, i) => linhaInicial(it, r.conferencia.sugestoes[i])))
      setLancarRepetida(false)
    })
    return () => { vale = false }
  }, [notaPecas, lojaId])

  function mudarLinhaPeca(i: number, patch: Partial<LinhaConferencia>) {
    setLinhasPecas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)
  const xmlRef = useRef<HTMLInputElement>(null)

  // --- Manual helpers ---
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

  // --- Modelo das motos importadas ---
  // Casa o nome que veio do arquivo com o cadastro; o que não casar entra sem
  // modeloId e a pessoa escolhe na tela. O preço sempre vem vazio (#288).
  function sugerirModelo(nomeArquivo: string) {
    return { modeloId: casarModelo(nomeArquivo, modelos), preco: '' }
  }

  function trocarModeloDoGrupo(indices: number[], modeloId: string) {
    const alvo = new Set(indices)
    setLinhasPlanilha(prev => prev.map((l, i) => (alvo.has(i) ? { ...l, modeloId } : l)))
  }

  function updatePreco(idx: number, preco: string) {
    setLinhasPlanilha(prev => prev.map((l, i) => i === idx ? { ...l, preco } : l))
  }

  // --- Planilha XLSX handler ---
  function handleXLSX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws)

      if (rows.length === 0) {
        toast.error('Planilha vazia')
        return
      }

      const novas: MotoLinhaPlanilha[] = rows
        .filter(r => r['CHASSI'])
        .map(r => {
          const modelo = String(r['MODELO'] || '').trim()
          return {
            chassi: String(r['CHASSI'] || '').trim(),
            cor: String(r['COR'] || '').trim(),
            motor: String(r['MOTOR'] || '').trim(),
            modelo,
            nf: String(r['NF ENTRADA'] || '').trim(),
            ...sugerirModelo(modelo),
          }
        })

      if (novas.length === 0) {
        toast.error('Nenhuma moto encontrada na planilha')
        return
      }

      setLinhasPlanilha(novas)
      toast.success(`${novas.length} moto(s) importada(s) da planilha`)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // --- XMLs de NF-e ---
  async function handleXMLs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    const nomesMova = modelos.map(m => m.modelo)
    const novas: MotoLinhaPlanilha[] = []
    const fichasNovas: { chassi: string; emitente: EmitenteNfe; ficha: FichaFiscal }[] = []
    const avisos: string[] = []
    let pecasNovas: typeof notaPecas = null

    for (const file of files) {
      try {
        const xml = await file.text()
        const { nNF, infCpl, qtdProdutos } = extrairDaNfe(xml)
        const motos = parseMotosInfCpl(infCpl)
        const itensPeca = extrairItensDePeca(xml)

        // Ficha fiscal por CHASSI, não por modelo: o mesmo X12 vem da LAIOUNS
        // e da Q.P.A com CEST, origem e CST diferentes, e cada moto tem de sair
        // com a classificação da nota que a trouxe.
        const emitente = extrairEmitenteDaNfe(xml)
        if (itensPeca.length) {
          if (pecasNovas || notaPecas) {
            avisos.push(`NF ${nNF || file.name}: já há uma nota com peças nesta entrada. Lance uma nota com peças por vez.`)
          } else {
            pecasNovas = {
              nota: { chaveAcesso: emitente.nfChave, numero: nNF, fornecedorCnpj: emitente.cnpj, fornecedorNome: emitente.nome },
              itens: itensPeca,
            }
          }
        }
        for (const [chassi, ficha] of ligarFichasAosChassis(motos, extrairFiscalDaNfe(xml), [...nomesMova, ...apelidos])) {
          fichasNovas.push({ chassi, emitente, ficha })
        }
        // Conferência: o nº de motos lidas tem que bater com a qtd de motos da nota
        // (as linhas de peça vão para a conferência de peças).
        const qtdMotosNaNota = qtdProdutos - itensPeca.reduce((s, i) => s + Math.round(i.quantidade), 0)
        if (qtdMotosNaNota > 0 && motos.length !== qtdMotosNaNota) {
          avisos.push(`NF ${nNF || file.name}: li ${motos.length} moto(s), mas a nota tem ${qtdMotosNaNota} moto(s). Confira.`)
        }
        for (const m of motos) {
          const modelo = mapearModelo(m.modelo, nomesMova) ?? m.modelo // de-para NF → MOVA
          novas.push({
            chassi: m.chassi,
            cor: m.cor,
            motor: m.motor,
            modelo,
            nf: nNF,
            ...sugerirModelo(modelo),
          })
        }
      } catch {
        avisos.push(`${file.name}: falha ao ler o XML`)
      }
    }

    if (pecasNovas) setNotaPecas(pecasNovas)
    if (!novas.length) {
      if (!pecasNovas) toast.error('Nenhuma moto nem peça encontrada nos XMLs')
      avisos.forEach(a => toast.warning(a, { duration: Infinity, closeButton: true }))
      return
    }

    setLinhasPlanilha(prev => {
      const vistos = new Set(prev.map(l => l.chassi.toUpperCase()))
      const add = novas.filter(n => n.chassi && !vistos.has(n.chassi.toUpperCase()))
      return [...prev, ...add]
    })
    setFiscais(prev => [...prev, ...fichasNovas])
    toast.success(`${novas.length} moto(s) de ${files.length} nota(s) importadas`)
    // Fixo até fechar: moto a menos na leitura passava despercebida em 9 s (#289).
    avisos.forEach(a => toast.warning(a, { duration: Infinity, closeButton: true }))
  }

  // --- Submit manual ---
  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault()
    if (!notaFiscal || !modeloId || !precoCompra || !lojaId) {
      toast.error('Preencha a nota fiscal, modelo, preço de compra e loja de destino')
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
        precoCompra,
        lojaId,
        motos: motosValidas,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.success)
        setNotaFiscal('')
        setPrecoCompra('')
        setModeloId('')
        setLojaId('')
        setLinhas([{ chassi: '', cor: '', motor: '' }])
      }
    } finally {
      setLoading(false)
    }
  }

  // --- Submit planilha ---
  async function handleSubmitPlanilha(e: React.FormEvent) {
    e.preventDefault()

    if (!lojaId) {
      toast.error('Selecione a loja de destino')
      return
    }

    if (linhasPlanilha.length === 0 && !notaPecas) {
      toast.error('Importe uma planilha primeiro')
      return
    }

    const semNf = linhasPlanilha.filter(l => !l.nf)
    if (semNf.length > 0) {
      toast.error(`${semNf.length} moto(s) sem NF de entrada na planilha`)
      return
    }

    const semModelo = linhasPlanilha.filter(l => !l.modeloId)
    if (semModelo.length > 0) {
      toast.error(`${semModelo.length} moto(s) sem modelo selecionado`)
      return
    }

    const semPreco = linhasPlanilha.filter(l => !l.preco)
    if (semPreco.length > 0) {
      toast.error(`${semPreco.length} moto(s) sem preço de compra`)
      return
    }

    if (notaPecas) {
      if (!conferencia) {
        toast.error('Espere carregar a conferência das peças')
        return
      }
      const comProblema = linhasPecas.filter(l => problemaDaLinha(l))
      if (comProblema.length) {
        toast.error(`${comProblema.length} linha(s) de peça precisam de correção`)
        return
      }
      if (conferencia.notaJaLancada && !lancarRepetida) {
        toast.error('Esta nota já entrou. Marque "Lançar mesmo assim" para continuar.')
        return
      }
      setLoading(true)
      try {
        const { fornecedorNome: _, ...nota } = notaPecas.nota
        const result = await registrarEntradaNota({
          lojaId,
          nota,
          motos: linhasPlanilha.map(l => ({
            chassi: l.chassi, cor: l.cor, motor: l.motor, modeloId: l.modeloId, precoCompra: l.preco, notaFiscal: l.nf,
          })),
          fiscais,
          pecas: paraGravacao(linhasPecas),
        })
        if (result.error) {
          toast.error(result.error, { duration: Infinity, closeButton: true })
        } else {
          toast.success(result.success)
          setLinhasPlanilha([])
          setNotaPecas(null)
          setLinhasPecas([])
          setLojaId('')
        }
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const result = await registrarEntradaLote({
        lojaId,
        motos: linhasPlanilha.map(l => ({
          chassi: l.chassi,
          cor: l.cor,
          motor: l.motor,
          modeloId: l.modeloId,
          precoCompra: l.preco,
          notaFiscal: l.nf,
        })),
        fiscais,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.success)
        setLinhasPlanilha([])
        setLojaId('')
      }
    } finally {
      setLoading(false)
    }
  }

  // --- Agrupar motos por NF > Modelo para exibição ---
  // Guarda o índice de cada linha junto: a chave do grupo é o nome cru do XML, então
  // trocar o modelo de um bloco não o faz saltar de lugar embaixo do clique.
  const nfsAgrupadas = linhasPlanilha.reduce<Record<string, Record<string, { moto: MotoLinhaPlanilha; idx: number }[]>>>((acc, m, idx) => {
    const nfKey = m.nf || 'SEM NF'
    const modeloKey = m.modelo.toUpperCase()
    if (!acc[nfKey]) acc[nfKey] = {}
    if (!acc[nfKey][modeloKey]) acc[nfKey][modeloKey] = []
    acc[nfKey][modeloKey].push({ moto: m, idx })
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Toggle modo */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModo('planilha')}
          className={`px-4 py-2 text-sm rounded-md font-medium ${modo === 'planilha' ? 'bg-primary text-primary-foreground' : 'bg-card border text-muted-foreground hover:bg-muted'}`}
        >
          <FileSpreadsheet size={14} className="inline mr-1.5 -mt-0.5" />
          Importar Planilha
        </button>
        <button
          type="button"
          onClick={() => setModo('manual')}
          className={`px-4 py-2 text-sm rounded-md font-medium ${modo === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-card border text-muted-foreground hover:bg-muted'}`}
        >
          <Plus size={14} className="inline mr-1.5 -mt-0.5" />
          Entrada Manual
        </button>
      </div>

      {/* ===== MODO PLANILHA ===== */}
      {modo === 'planilha' && (
        <form onSubmit={handleSubmitPlanilha} className="space-y-6">
          <div className="bg-card rounded-lg border p-4 space-y-4">
            <h3 className="font-semibold text-foreground">Importar NF-e (XML) ou Planilha</h3>
            <p className="text-xs text-muted-foreground">
              Baixe os XMLs das notas (FSist) e importe direto — o MOVA lê as Informações
              Complementares e extrai modelo, chassi, motor e cor, casando o modelo com o
              cadastro. Ou use a planilha (colunas: NF ENTRADA, MODELO, CHASSI, MOTOR, COR).
            </p>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">Loja de Destino *</label>
              <select
                value={lojaId}
                onChange={e => setLojaId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="">Selecione a loja...</option>
                {lojas.map(l => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">XMLs de NF-e (recomendado)</label>
              <input
                ref={xmlRef}
                type="file"
                accept=".xml"
                multiple
                onChange={handleXMLs}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => xmlRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-success/50 bg-success/10 rounded-md px-3 py-2.5 text-sm text-success hover:border-success hover:bg-success/15"
              >
                <Upload size={16} />
                {linhasPlanilha.length > 0
                  ? `${linhasPlanilha.length} moto(s) carregada(s) — clique para adicionar mais XMLs`
                  : 'Selecionar XMLs das notas (.xml) — pode escolher vários'}
              </button>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">Ou planilha (.xlsx)</label>
              <input
                ref={xlsxRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleXLSX}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => xlsxRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:border-ring hover:bg-muted"
              >
                <Upload size={16} />
                Selecionar planilha (.xlsx)
              </button>
            </div>
          </div>

          {/* Motos importadas agrupadas por modelo */}
          {linhasPlanilha.length > 0 && (
            <div className="bg-card rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  Motos importadas ({linhasPlanilha.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setLinhasPlanilha([])}
                  className="text-sm text-destructive hover:opacity-80"
                >
                  Limpar
                </button>
              </div>

              {Object.entries(nfsAgrupadas).map(([nf, modelosGrupo]) => {
                const totalNf = Object.values(modelosGrupo).reduce((s, arr) => s + arr.length, 0)
                return (
                  <div key={nf} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <span className="text-sm font-semibold text-foreground">NF {nf}</span>
                      <span className="text-xs bg-info/10 text-info px-2 py-0.5 rounded-full">
                        {totalNf} moto(s)
                      </span>
                    </div>

                    {Object.entries(modelosGrupo).map(([modelo, motosGrupo]) => {
                      const indices = motosGrupo.map(g => g.idx)
                      // O bloco só tem um modelo escolhido quando todas as suas motos
                      // apontam pro mesmo — senão o select abre vazio, esperando escolha.
                      const idsNoGrupo = new Set(motosGrupo.map(g => g.moto.modeloId))
                      const modeloIdDoGrupo = idsNoGrupo.size === 1 ? [...idsNoGrupo][0] : ''
                      return (
                        <div key={`${nf}-${modelo}`} className="border rounded-md p-3 space-y-2 ml-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{modelo}</span>
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                              {motosGrupo.length} un.
                            </span>
                            <select
                              value={modeloIdDoGrupo}
                              onChange={e => trocarModeloDoGrupo(indices, e.target.value)}
                              className={`border rounded px-2 py-1 text-xs ${modeloIdDoGrupo ? '' : 'border-destructive/50 text-destructive bg-destructive/10'}`}
                            >
                              <option value="">Escolha o modelo cadastrado...</option>
                              {modelos.map(m => (
                                <option key={m.id} value={m.id}>{m.marca} — {m.modelo}</option>
                              ))}
                            </select>
                            {!modeloIdDoGrupo && (
                              <span className="text-xs text-destructive font-medium">
                                Modelo não cadastrado — escolha o equivalente
                              </span>
                            )}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left px-2 py-1 w-8">#</th>
                                <th className="text-left px-2 py-1">Chassi</th>
                                <th className="text-left px-2 py-1">Motor</th>
                                <th className="text-left px-2 py-1">Cor</th>
                                <th className="text-left px-2 py-1 w-32">Preço de compra</th>
                              </tr>
                            </thead>
                            <tbody>
                              {motosGrupo.map(({ moto: m, idx }, i) => (
                                <tr key={idx} className="border-b last:border-0">
                                  <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                                  <td className="px-2 py-1 font-mono">{m.chassi}</td>
                                  <td className="px-2 py-1 font-mono">{m.motor}</td>
                                  <td className="px-2 py-1">{m.cor}</td>
                                  <td className="px-2 py-1">
                                    <CurrencyInput
                                      value={m.preco}
                                      onChange={v => updatePreco(idx, v)}
                                      placeholder="0,00"
                                      className="h-7 text-xs"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {notaPecas && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  NF {notaPecas.nota.numero}, de {notaPecas.nota.fornecedorNome || notaPecas.nota.fornecedorCnpj}
                </p>
                <button
                  type="button"
                  onClick={() => { setNotaPecas(null); setLinhasPecas([]) }}
                  className="text-sm text-destructive hover:opacity-80"
                >
                  Tirar as peças
                </button>
              </div>
              {conferencia?.notaJaLancada && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-muted px-4 py-3 text-sm text-warning">
                  <span>
                    <strong>
                      {conferencia.notaJaLancada.soPeloNumero ? 'Uma nota com este número' : 'Esta nota'} já entrou em{' '}
                      {new Date(conferencia.notaJaLancada.em).toLocaleDateString('pt-BR')} por {conferencia.notaJaLancada.por}.
                    </strong>{' '}
                    Confira antes de lançar de novo.
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
                  linhas={linhasPecas}
                  onChange={mudarLinhaPeca}
                  pecas={conferencia.pecas}
                  sugestoes={conferencia.sugestoes}
                  lojaNome={lojas.find(l => l.id === lojaId)?.nome ?? 'loja'}
                />
              )}
            </div>
          )}

          {(linhasPlanilha.length > 0 || notaPecas) && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 font-medium"
              >
                {loading
                  ? 'Registrando...'
                  : notaPecas
                    ? `Registrar entrada (${linhasPlanilha.length} motos e ${linhasPecas.filter(l => l.destino !== 'ignorar').length} peças)`
                    : `Registrar entrada (${linhasPlanilha.length} motos)`}
              </button>
            </div>
          )}
        </form>
      )}

      {/* ===== MODO MANUAL ===== */}
      {modo === 'manual' && (
        <form onSubmit={handleSubmitManual} className="space-y-6">
          <div className="bg-card rounded-lg border p-4 space-y-4">
            <h3 className="font-semibold text-foreground">Dados da Nota Fiscal</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Nº Nota Fiscal *</label>
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
                <label className="block text-sm text-muted-foreground mb-1">Loja de Destino *</label>
                <select
                  value={lojaId}
                  onChange={e => setLojaId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione a loja...</option>
                  {lojas.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Modelo *</label>
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
                <label className="block text-sm text-muted-foreground mb-1">Preço de Compra (R$) *</label>
                <CurrencyInput
                  value={precoCompra}
                  onChange={setPrecoCompra}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
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
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
                >
                  <Upload size={14} />
                  Importar CSV
                </button>
                <button
                  type="button"
                  onClick={addLinha}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
                >
                  <Plus size={14} />
                  Adicionar
                </button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <FileSpreadsheet size={12} />
              CSV: chassi, cor, motor (uma moto por linha)
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
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
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
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
                          className="text-destructive hover:opacity-80 p-1"
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 font-medium"
            >
              {loading ? 'Registrando...' : `Registrar entrada (${linhas.filter(l => l.chassi.trim()).length} motos)`}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
