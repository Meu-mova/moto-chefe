'use client'
import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, FileDown, FileX, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { diaEHoraBrt } from '@/lib/data-venda'
import { deveDesfazerFaturamento, ehFinal, ehRecusada, limiteCancelamento, situacaoCancelamento } from '@/lib/notagateway/status'
import { cancelarNfePropriaAction, consultarNfePropriaAction, type NotaResumo } from '../../vendas/nfe-propria-actions'

type Props = { nota: NotaResumo; onAtualizada: (nota: NotaResumo) => void }

function falta(ate: Date) {
  const minutos = Math.max(0, Math.floor((ate.getTime() - Date.now()) / 60000))
  const horas = Math.floor(minutos / 60)
  return horas > 0 ? `${horas}h ${String(minutos % 60).padStart(2, '0')}min` : `${minutos}min`
}

export function NfSaidaCard({ nota, onAtualizada }: Props) {
  const [formAberto, setFormAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [acao, setAcao] = useState<'cancelar' | 'consultar' | null>(null)
  const [, startTransition] = useTransition()

  const producao = nota.ambiente === 'Producao'
  const situacao = situacaoCancelamento(nota, new Date())
  const limite = nota.dataAutorizacao ? limiteCancelamento(nota.dataAutorizacao) : null

  function executar(tipo: 'cancelar' | 'consultar') {
    setErro('')
    setAcao(tipo)
    startTransition(async () => {
      const r = tipo === 'cancelar' ? await cancelarNfePropriaAction(nota.id, motivo) : await consultarNfePropriaAction(nota.id)
      setAcao(null)
      if (r.nota) {
        onAtualizada(r.nota)
        setFormAberto(false)
      }
      if (!r.ok) setErro(r.error)
    })
  }

  function abrirForm(motivoAnterior = '') {
    setErro('')
    setMotivo(motivoAnterior)
    setFormAberto(true)
  }

  const [rotulo, corRotulo] =
    nota.status === 'Autorizada' ? ['Autorizada', 'border-green-200 bg-green-50 text-green-700']
    : nota.status === 'Cancelada' ? ['Cancelada', 'border-slate-300 bg-slate-100 text-slate-600']
    : nota.status === 'CancelamentoNegado' ? ['Cancelamento recusado', 'border-red-200 bg-red-50 text-red-700']
    : situacao === 'em_andamento' ? ['Cancelando…', 'border-amber-200 bg-amber-50 text-amber-800']
    : ehRecusada(nota.status) ? ['Não autorizada', 'border-red-200 bg-red-50 text-red-700']
    : ['Em processamento', 'border-slate-200 bg-slate-50 text-slate-700']

  const registro = nota.cancelamento && (
    <p className="text-xs text-slate-600">
      Motivo: <b>{nota.cancelamento.motivo}</b> · pedido por {nota.cancelamento.por ?? '—'} em {diaEHoraBrt(nota.cancelamento.em)}
    </p>
  )

  const botaoConsultar = (
    <Button variant="outline" size="sm" onClick={() => executar('consultar')} className="gap-1">
      <RefreshCw size={13} /> Consultar
    </Button>
  )

  let corpo: React.ReactNode = null
  if (acao) {
    corpo = (
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
        <Loader2 size={16} className="animate-spin text-teal-600" />
        <div>
          <p className="font-medium">{acao === 'cancelar' ? 'Pedindo o cancelamento à SEFAZ…' : 'Consultando a Nota Gateway…'}</p>
          <p className="text-xs text-slate-500">Costuma levar poucos segundos. Não feche esta janela.</p>
        </div>
      </div>
    )
  } else if (formAberto) {
    corpo = (
      <div className="space-y-2 rounded-md border border-red-200 bg-red-50/40 p-3">
        <Label htmlFor={`motivo-${nota.id}`}>Motivo do cancelamento <span className="text-red-500">*</span></Label>
        <Textarea
          id={`motivo-${nota.id}`}
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={3}
          placeholder="Ex.: cliente desistiu da compra; valor errado na nota"
          className="bg-white"
        />
        <p className="text-[11px] text-slate-500">
          Fica registrado no MOVA com o seu nome e a hora. A SEFAZ recebe sempre a justificativa padrão &quot;Pedido cancelado&quot;.
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
          {producao ? (
            <>
              <li>A NF {nota.numero} é cancelada na SEFAZ. Não tem volta.</li>
              <li>A venda fica sem número de NF e a moto volta a &quot;Ag. NF Saída&quot;: dá para emitir uma nota nova.</li>
              <li>Comissão, caixa e pagamentos não mudam.</li>
              <li>O cliente não recebe e-mail; o link do DANFE que ele já recebeu passa a mostrar a nota cancelada.</li>
            </>
          ) : (
            <li>Nota de homologação: é cancelada na SEFAZ de teste, e a venda não muda.</li>
          )}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => { setFormAberto(false); setErro('') }}>Voltar</Button>
          <Button variant="destructive" size="sm" onClick={() => executar('cancelar')} disabled={!motivo.trim()} className="gap-1">
            <FileX size={13} /> Confirmar cancelamento
          </Button>
        </div>
      </div>
    )
  } else if (nota.status === 'Cancelada') {
    corpo = (
      <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-1.5 font-medium text-slate-800"><CheckCircle2 size={15} className="text-slate-600" /> NF {nota.numero} cancelada na SEFAZ</p>
        {registro}
        {deveDesfazerFaturamento(nota) && (
          <p className="text-xs text-slate-700">
            A venda ficou sem NF e a moto voltou a <b>&quot;Ag. NF Saída&quot;</b>: a nota nova sai pelo botão <b>NF Saída</b> da venda.
          </p>
        )}
        {!producao && <p className="text-xs text-slate-500">Nota de homologação: a venda não mudou.</p>}
      </div>
    )
  } else if (nota.status === 'CancelamentoNegado') {
    corpo = (
      <div className="space-y-1.5 rounded-md border border-red-200 bg-red-50 p-3">
        <p className="flex items-center gap-1.5 font-medium text-red-800"><XCircle size={15} /> A SEFAZ recusou o cancelamento</p>
        <p className="text-xs text-red-700">{nota.motivoStatus ?? 'Sem motivo informado.'}</p>
        <p className="text-xs text-red-800">A NF {nota.numero} continua autorizada{producao ? ' e a venda continua faturada' : ''}.</p>
        {registro}
        {situacao === 'disponivel' && limite ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-slate-600">Ainda dá para pedir de novo até {diaEHoraBrt(limite.toISOString())} (faltam {falta(limite)}).</p>
            <Button variant="outline" size="sm" onClick={() => abrirForm(nota.cancelamento?.motivo)} className="gap-1 border-red-300 text-red-700 hover:bg-red-100">
              <RefreshCw size={13} /> Tentar de novo
            </Button>
          </div>
        ) : situacao === 'fora_do_prazo' && <AvisoForaDoPrazo producao={producao} />}
      </div>
    )
  } else if (situacao === 'em_andamento') {
    corpo = (
      <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-1.5 font-medium text-amber-900"><Clock size={15} /> Cancelamento em andamento na SEFAZ</p>
        <p className="text-xs text-amber-800">A NF {nota.numero} ainda vale até a SEFAZ confirmar. Consulte de novo em instantes; não emita outra nota.</p>
        {registro}
        <div className="flex justify-end pt-1">{botaoConsultar}</div>
      </div>
    )
  } else if (situacao === 'disponivel' && limite) {
    corpo = (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-teal-200 bg-teal-50/60 p-3">
        <p className="text-xs text-teal-900">Dá para cancelar até <b>{diaEHoraBrt(limite.toISOString())}</b> (faltam {falta(limite)}).</p>
        <Button variant="destructive" size="sm" onClick={() => abrirForm()} className="gap-1">
          <FileX size={13} /> Cancelar NF
        </Button>
      </div>
    )
  } else if (situacao === 'fora_do_prazo') {
    corpo = <AvisoForaDoPrazo producao={producao} />
  } else if (situacao === 'sem_data') {
    corpo = (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-700">A data de autorização desta nota ainda não foi gravada: consulte para ver o prazo de cancelamento.</p>
        {botaoConsultar}
      </div>
    )
  } else if (ehRecusada(nota.status)) {
    corpo = nota.motivoStatus && <p className="text-xs text-red-600">{nota.motivoStatus}</p>
  } else if (!ehFinal(nota.status)) {
    corpo = <div className="flex justify-end">{botaoConsultar}</div>
  }

  return (
    <div className="space-y-2 rounded-md border bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${corRotulo}`}>{rotulo}</span>
        <span className={nota.status === 'Cancelada' ? 'font-medium text-slate-500 line-through' : 'font-medium'}>
          {nota.numero ? `NF ${nota.numero} · série ${nota.serie}` : 'Sem número'}
        </span>
        <span className="text-xs text-slate-400">· {producao ? 'produção' : 'homologação'} · {diaEHoraBrt(nota.criadoEm)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {nota.dataAutorizacao && <span>Autorizada em {diaEHoraBrt(nota.dataAutorizacao)}</span>}
        {nota.linkDanfe && (
          <a href={nota.linkDanfe} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
            <ExternalLink size={12} /> DANFE
          </a>
        )}
        {nota.linkXml && (
          <a href={nota.linkXml} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
            <FileDown size={12} /> XML
          </a>
        )}
        <span className="font-mono text-[10px] text-slate-400" title="Status como a Nota Gateway devolve">{nota.status}</span>
      </div>
      {corpo}
      {erro && <p className="whitespace-pre-line text-xs text-red-600">{erro}</p>}
    </div>
  )
}

function AvisoForaDoPrazo({ producao }: { producao: boolean }) {
  return (
    <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 font-medium text-amber-900"><AlertTriangle size={15} /> Passou o prazo de 24h para cancelar</p>
      <p className="text-xs text-amber-800">
        {producao
          ? <>O caminho agora é a <b>NF de devolução</b> ou o cancelamento extemporâneo na SEFAZ, combinado com o contador.</>
          : 'Nota de homologação, sem valor fiscal: não precisa fazer nada.'}
      </p>
    </div>
  )
}
