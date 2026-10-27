'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, X, Plus } from 'lucide-react'
import { registrarPagamentoOSAction } from '../../actions'
import { buscarCupomPorCodigoAction } from '@/app/(dashboard)/cupons/actions'
import type { PgtoOS } from '@/lib/conciliacao-status'
import { TIPO_PAGAMENTO_CUPOM, normalizarCodigoCupom } from '@/lib/cupom-revisao'
import { toast } from 'sonner'

const FORMAS = [
  { value: 'pix',             label: 'PIX' },
  { value: 'dinheiro',        label: 'Dinheiro' },
  { value: 'cartao_credito',  label: 'Cartão de Crédito' },
  { value: 'cartao_debito',   label: 'Cartão de Débito' },
  { value: 'transferencia',   label: 'Transferência' },
  { value: 'cortesia',        label: 'Cortesia / Garantia' },
  { value: TIPO_PAGAMENTO_CUPOM, label: 'Cupom de revisão gratuita' },
]
const FORMAS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone',       label: 'Stone' },
  { value: 'pagueveloz',  label: 'PaguéVeloz' },
  { value: 'cielo',       label: 'Cielo' },
  { value: 'getnet',      label: 'GetNet' },
  { value: 'redecard',    label: 'Redecard' },
]

type Linha = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string; cupom?: string }

type Props = {
  osId: string
  valorTotal: number
  /** Mão de obra da OS. É exatamente o que um cupom de revisão cobre. */
  valorServicos: number
  pagamentosIniciais: PgtoOS[]
  jaPago: boolean
  aprovacaoPendente?: boolean
}

function linhasIniciais(pagamentos: PgtoOS[], valorTotal: number): Linha[] {
  if (pagamentos.length > 0) {
    return pagamentos.map((p, i) => ({
      id: String(i),
      tipo: p.tipo,
      valor: String(p.valor),
      operadora: p.operadora,
      parcelas: p.parcelas != null ? String(p.parcelas) : undefined,
      autorizacao: p.autorizacao,
      cupom: p.cupom,
    }))
  }
  return [{ id: '1', tipo: '', valor: valorTotal > 0 ? valorTotal.toFixed(2) : '' }]
}

export function OSPagamentoPanel({ osId, valorTotal, valorServicos, pagamentosIniciais, jaPago, aprovacaoPendente }: Props) {
  const [pending, start] = useTransition()
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(pagamentosIniciais, valorTotal))
  // Conferência do código digitado, por linha. Só informativa: a trava está em
  // registrarPagamentoOSAction.
  const [cupomInfo, setCupomInfo] = useState<Record<string, { ok: boolean; texto: string }>>({})

  const addLinha = () => setLinhas(l => [...l, { id: Date.now().toString(), tipo: '', valor: '' }])
  const removeLinha = (id: string) => setLinhas(l => l.filter(x => x.id !== id))
  const updateLinha = (id: string, campo: keyof Linha, val: string) =>
    setLinhas(l => l.map(x => {
      if (x.id !== id) return x
      // Escolher cupom já preenche o valor: ele cobre exatamente a mão de obra, e
      // o servidor recusa qualquer outro número.
      if (campo === 'tipo' && val === TIPO_PAGAMENTO_CUPOM) {
        return { ...x, tipo: val, valor: valorServicos.toFixed(2) }
      }
      return { ...x, [campo]: val }
    }))

  // Digitar de novo apaga o resultado da conferência anterior: manter o ícone de ok
  // ao lado de um código já alterado é pior que não mostrar nada.
  function limparCupomInfo(linhaId: string) {
    setCupomInfo(c => {
      if (!(linhaId in c)) return c
      const { [linhaId]: _removido, ...resto } = c
      return resto
    })
  }

  async function conferirCupom(linhaId: string, codigo: string) {
    const normalizado = normalizarCodigoCupom(codigo)
    if (!normalizado) { setCupomInfo(c => ({ ...c, [linhaId]: { ok: false, texto: 'Informe o código' } })); return }
    try {
      const cupom = await buscarCupomPorCodigoAction(normalizado)
      if (!cupom) {
        setCupomInfo(c => ({ ...c, [linhaId]: { ok: false, texto: 'Cupom não encontrado neste grupo' } }))
        return
      }
      const usadoEmOutra = cupom.status === 'usado' && cupom.osId !== osId
      const dono = cupom.clienteNome ?? cupom.chassi ?? 'sem titular'
      const texto =
        cupom.status === 'cancelado' ? 'Cupom cancelado' :
        usadoEmOutra                 ? 'Cupom já utilizado em outra OS' :
        `${dono} · válido até ${cupom.validoAte.slice(8, 10)}/${cupom.validoAte.slice(5, 7)}/${cupom.validoAte.slice(0, 4)}`
      setCupomInfo(c => ({ ...c, [linhaId]: { ok: cupom.status !== 'cancelado' && !usadoEmOutra, texto } }))
    } catch {
      setCupomInfo(c => ({ ...c, [linhaId]: { ok: false, texto: 'Não foi possível consultar o cupom' } }))
    }
  }

  const somatorio = linhas.reduce((a, l) => a + (parseFloat(l.valor) || 0), 0)
  const somatorioOk = Math.abs(somatorio - valorTotal) < 0.01
  const linhasCompletas = linhas.every(l => l.tipo && l.valor)

  function salvar() {
    if (!linhasCompletas) { toast.error('Preencha forma e valor de todas as linhas'); return }
    if (!somatorioOk) { toast.error('A soma dos pagamentos precisa bater com o valor total'); return }
    start(async () => {
      try {
        const resultado = await registrarPagamentoOSAction(osId, {
          valorTotal,
          pagamentos: linhas.map(l => ({
            tipo: l.tipo,
            valor: parseFloat(l.valor),
            ...(l.tipo === TIPO_PAGAMENTO_CUPOM ? { cupom: normalizarCodigoCupom(l.cupom ?? '') } : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.operadora   ? { operadora: l.operadora }                     : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.parcelas    ? { parcelas: parseInt(l.parcelas, 10) }         : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.autorizacao?.trim() ? { autorizacao: l.autorizacao.trim().toUpperCase() } : {}),
          })),
        })
        if (!resultado.ok) { toast.error(resultado.erro); return }
        toast.success(resultado.dados.aguardandoAprovacao
          ? 'Pagamento por transferência enviado para aprovação'
          : 'Pagamento registrado')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function concluirGratuita() {
    start(async () => {
      try {
        const r = await registrarPagamentoOSAction(osId, { valorTotal: 0, pagamentos: [] })
        if (!r.ok) { toast.error(r.erro); return }
        toast.success('OS concluída como gratuita')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  if (valorTotal < 0.01) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jaPago ? (
            <p className="text-sm text-primary-text">OS gratuita — sem pendência de pagamento.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Esta OS não tem cobrança (R$ 0,00).</p>
              <Button size="sm" onClick={concluirGratuita} disabled={pending} className="w-full">
                {pending ? 'Concluindo…' : 'Concluir OS gratuita'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aprovacaoPendente && (
          <p className="text-xs text-foreground bg-muted border border-border rounded-md px-3 py-2">
            Pagamento por transferência bancária enviado para aprovação — a OS só fica marcada como paga quando for aprovado.
          </p>
        )}

        {linhas.map(l => (
          <div key={l.id} className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-3">
            {/* No celular a forma ocupa a linha e o valor desce: lado a lado, o select não encolhe e espreme o valor. */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <select value={l.tipo} onChange={e => updateLinha(l.id, 'tipo', e.target.value)}
                className="w-full min-w-0 border border-input rounded-md px-3 py-2 text-sm bg-background sm:w-auto sm:flex-1">
                <option value="">Selecione...</option>
                {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <CurrencyInput className="min-w-0 flex-1 sm:w-32 sm:flex-none" placeholder="0,00" value={l.valor} onChange={v => updateLinha(l.id, 'valor', v)} />
              {linhas.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeLinha(l.id)}>
                  <X size={14} />
                </Button>
              )}
            </div>

            {FORMAS_CARTAO.has(l.tipo) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={l.operadora ?? ''} onChange={e => updateLinha(l.id, 'operadora', e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Operadora...</option>
                  {OPERADORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={l.parcelas ?? ''} onChange={e => updateLinha(l.id, 'parcelas', e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Parcelas...</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            )}
            {FORMAS_CARTAO.has(l.tipo) && (
              <Input
                value={l.autorizacao ?? ''}
                onChange={e => updateLinha(l.id, 'autorizacao', e.target.value)}
                placeholder="Autorização (impresso no comprovante) — opcional"
              />
            )}

            {l.tipo === TIPO_PAGAMENTO_CUPOM && (
              <div className="space-y-1">
                <Input
                  value={l.cupom ?? ''}
                  onChange={e => { updateLinha(l.id, 'cupom', e.target.value.toUpperCase()); limparCupomInfo(l.id) }}
                  onBlur={e => conferirCupom(l.id, e.target.value)}
                  placeholder="Código do cupom (REV-XXXXXX)"
                  className="font-mono"
                />
                {cupomInfo[l.id] && (
                  <p className={`flex items-center gap-1 text-xs ${cupomInfo[l.id].ok ? 'text-primary-text' : 'text-destructive'}`}>
                    {cupomInfo[l.id].ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}{cupomInfo[l.id].texto}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  O cupom cobre a mão de obra ({valorServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).
                  As peças continuam sendo cobradas.
                </p>
              </div>
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" className="gap-1 w-full" onClick={addLinha}>
          <Plus size={14} /> Adicionar forma de pagamento
        </Button>

        <div className={`text-xs px-3 py-2 rounded-md border font-medium ${
          somatorioOk ? 'bg-primary-soft text-primary-text border-primary/30' : 'bg-warning/10 text-warning border-warning/40'
        }`}>
          Soma: {somatorio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          {' '}/ Total: {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>

        <Button size="sm" onClick={salvar} disabled={pending || !somatorioOk || !linhasCompletas} className="w-full">
          {pending ? 'Salvando…' : jaPago ? 'Atualizar pagamento' : 'Registrar pagamento'}
        </Button>
      </CardContent>
    </Card>
  )
}
