'use client'
// Bloco "Dados para a Nota Gateway" (#588, Admin do protótipo): o cadastro "Nova empresa"
// no painel da NG segue manual; aqui ficam os dados na mesma ordem, com Copiar por campo.
import { useEffect, useState, useTransition } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { soDigitos } from '@/lib/adesao-fiscal'
import {
  camposIdentificacao, camposLocalizacao, faltandoParaNg, numeracaoSugerida, type CampoNg, type DadosAdesaoNg, type NumeracaoInformada,
} from '@/lib/adesao-nota-gateway'
import type { StatusNg } from '@/lib/adesao-status-ng'
import { corrigirNumeracaoAction, statusNgAction } from '../actions'

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs ${ok ? 'bg-primary-soft text-primary-text' : 'bg-muted text-warning'}`}>{children}</span>
  )
}

function Linha({ campo }: { campo: CampoNg }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    if (!campo.valor) return
    try {
      await navigator.clipboard.writeText(campo.valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1200)
    } catch {
      toast.error('Não deu para copiar. Selecione o texto e copie à mão.')
    }
  }
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 border-b py-2 text-sm">
      <span className="text-muted-foreground">{campo.rotulo}</span>
      {campo.valor
        ? <span className="break-all rounded-md bg-muted px-2.5 py-1.5 font-mono">{campo.valor}</span>
        : <span className="text-warning">Cliente não informou</span>}
      {campo.copiar && campo.valor ? (
        <button type="button" onClick={copiar} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${copiado ? 'border-primary bg-primary-soft text-primary-text' : 'border-input'}`}>
          {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      ) : <span className="text-xs text-muted-foreground">{campo.valor ? 'Marcar' : ''}</span>}
    </div>
  )
}

/** O admin_geral corrige a série e a última nota que o cliente informou (#588). */
function EditarNumeracao({ adesaoId, atual, onSalvo }: { adesaoId: string; atual: NumeracaoInformada; onSalvo: (n: NumeracaoInformada) => void }) {
  const [editando, setEditando] = useState(false)
  const [naoEmite, setNaoEmite] = useState(!atual.serie && !atual.ultima)
  const [serie, setSerie] = useState(atual.serie ?? '')
  const [ultima, setUltima] = useState(atual.ultima ?? '')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setNaoEmite(!atual.serie && !atual.ultima); setSerie(atual.serie ?? ''); setUltima(atual.ultima ?? ''); setErro(''); setEditando(true)
  }
  function salvar() {
    iniciar(async () => {
      const r = await corrigirNumeracaoAction(adesaoId, { naoEmite, serie, ultima })
      if (!r.ok) { setErro(r.erro); return }
      onSalvo(r.valor)
      setEditando(false)
      toast.success('Numeração corrigida')
    })
  }

  if (!editando) return <Button type="button" variant="outline" size="sm" onClick={abrir}>Editar série e última nota</Button>
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={naoEmite} onChange={e => { setNaoEmite(e.target.checked); if (e.target.checked) { setSerie(''); setUltima('') } }} />
        Loja não emite
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${adesaoId}-serie`}>Série</Label>
          <Input id={`${adesaoId}-serie`} inputMode="numeric" disabled={naoEmite} value={serie} onChange={e => setSerie(soDigitos(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${adesaoId}-ultima`}>Última nota emitida</Label>
          <Input id={`${adesaoId}-ultima`} inputMode="numeric" disabled={naoEmite} value={ultima} onChange={e => setUltima(soDigitos(e.target.value))} />
        </div>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={salvar} disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)} disabled={pendente}>Cancelar</Button>
      </div>
    </div>
  )
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function NotaGatewayBloco({ adesaoId, dados }: { adesaoId: string; dados: DadosAdesaoNg }) {
  const [status, setStatus] = useState<StatusNg | null | 'erro'>(null)
  useEffect(() => {
    let vivo = true
    statusNgAction(adesaoId).then(s => { if (vivo) setStatus(s) }, () => { if (vivo) setStatus('erro') })
    return () => { vivo = false }
  }, [adesaoId])

  // Correção salva vale na hora; a lista da página só chega no próximo carregamento.
  const [numeracao, setNumeracao] = useState<NumeracaoInformada>({ serie: dados.nfSerieAnterior, ultima: dados.nfUltimoNumero })
  const faltando = faltandoParaNg(dados)
  const cert = status && status !== 'erro' ? status.certificado : null

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Na mesma ordem do cadastro &quot;Nova empresa&quot; no painel da Nota Gateway. Clique em Copiar e cole lá.
      </p>
      <div className="flex flex-wrap gap-2">
        {status === null && <Pill ok={false}>Conferindo certificado…</Pill>}
        {status === 'erro' && <Pill ok={false}>Não deu para conferir o certificado agora</Pill>}
        {cert && <Pill ok={cert.recebido}>{cert.recebido ? 'Certificado recebido' : 'Sem certificado'}</Pill>}
        {cert?.recebido && cert.cnpjConfere !== null && <Pill ok={cert.cnpjConfere}>{cert.cnpjConfere ? 'CNPJ confere' : 'CNPJ do certificado é outro'}</Pill>}
        <Pill ok={faltando.length === 0}>{faltando.length === 0 ? 'Campos completos' : `Faltando: ${faltando.join(', ')}`}</Pill>
        {status && status !== 'erro' && <Pill ok={status.cadastradaNaNg}>{status.cadastradaNaNg ? 'Cadastrada na NG' : 'Ainda não cadastrada na NG'}</Pill>}
      </div>
      {dados.situacaoCadastral && (
        <p className="text-xs text-muted-foreground">Situação na Receita, informada na adesão: <span className="text-foreground">{dados.situacaoCadastral}</span></p>
      )}

      <Tabs defaultValue="localizacao">
        {/* Na largura do painel as abas quebram em duas linhas: altura livre, senão a segunda linha cobre o conteúdo. */}
        <TabsList variant="line" className="flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="localizacao">1 · Localização</TabsTrigger>
          <TabsTrigger value="identificacao">2 · Identificação</TabsTrigger>
          <TabsTrigger value="municipais">3 · Dados municipais</TabsTrigger>
          <TabsTrigger value="certificado">4 · Certificado</TabsTrigger>
          <TabsTrigger value="numeracao">Depois · Numeração</TabsTrigger>
        </TabsList>
        <TabsContent value="localizacao">{camposLocalizacao(dados).map(c => <Linha key={c.rotulo} campo={c} />)}</TabsContent>
        <TabsContent value="identificacao">{camposIdentificacao(dados).map(c => <Linha key={c.rotulo} campo={c} />)}</TabsContent>
        <TabsContent value="municipais">
          <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-text">
            Esta aba é de nota de serviço (NFS-e). O MOVA emite só nota de produto: clique em &quot;Preencher depois&quot;.
            Se o painel exigir, use Regime especial &quot;Nenhum&quot; e peça ISS e NBS ao contador.
          </p>
        </TabsContent>
        <TabsContent value="certificado" className="space-y-2 text-sm">
          {!cert ? <p className="text-muted-foreground">Conferindo…</p>
            : !cert.recebido ? <p className="text-warning">A adesão não tem certificado e o grupo ainda não tem um em Certificados.</p>
            : cert.problema ? <p className="text-warning">{cert.problema}. Peça o arquivo e a senha de novo ao cliente.</p>
            : <p>Certificado recebido{cert.validoAte && <>, válido até <b>{dataBr(cert.validoAte)}</b></>}.</p>}
          <p className="text-xs text-muted-foreground">O envio do certificado à Nota Gateway vai virar botão em Notas fiscais (próxima etapa).</p>
        </TabsContent>
        <TabsContent value="numeracao" className="space-y-2 text-sm">
          <p className="text-muted-foreground">Depois de cadastrar, cole o Id da empresa em Notas fiscais. A numeração da NF-e se grava por lá.</p>
          {numeracaoSugerida({ nfSerieAnterior: numeracao.serie, nfUltimoNumero: numeracao.ultima }).map(n => (
            <p key={n.ambiente}>
              <b>{n.ambiente}</b>: série {n.serie} · próxima nota {n.proxima}
              {n.daAdesao && <span className="text-xs text-muted-foreground"> (a loja informou a última nota emitida; confira no DANFE)</span>}
            </p>
          ))}
          <EditarNumeracao adesaoId={adesaoId} atual={numeracao} onSalvo={setNumeracao} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
