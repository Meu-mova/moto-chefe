'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, Download, ExternalLink, Nfc, QrCode, RefreshCw, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LojaPainel, PainelAvaliacoes } from '@/lib/avaliacoes-google/avaliacoes'
import { atualizarAgoraAction, salvarChaveGoogleAction, salvarPlaceIdAction } from '../actions'

export type PlacaTela = { link: string; linkQr: string; qrSvg: string }

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

function Estrelas({ nota, tamanho = 14 }: { nota: number; tamanho?: number }) {
  return (
    <span className="inline-flex" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={tamanho} className={i <= Math.round(nota) ? 'fill-warning text-warning' : 'text-muted-foreground'} />
      ))}
    </span>
  )
}

function Variacao({ valor, sufixo = '' }: { valor: number | null; sufixo?: string }) {
  if (valor === null || valor === 0) return <span className="text-muted-foreground">sem mudança</span>
  const sobe = valor > 0
  return (
    <span className={sobe ? 'text-success' : 'text-destructive'}>
      {sobe ? '+' : ''}{valor.toLocaleString('pt-BR')}{sufixo}
    </span>
  )
}

function CardLoja({ loja }: { loja: LojaPainel }) {
  const toques = loja.toquesMes.nfc + loja.toquesMes.qr
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{loja.nome}</span>
          {loja.mapsUri && (
            <a href={loja.mapsUri} target="_blank" rel="noreferrer" className="text-xs font-normal text-primary-text inline-flex items-center gap-1">
              Ver no Google <ExternalLink size={12} />
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loja.placeId ? (
          <p className="text-sm text-muted-foreground">Ainda sem ficha do Google. Configure o Place ID abaixo.</p>
        ) : loja.nota === null ? (
          <p className="text-sm text-muted-foreground">
            {loja.erro ? '' : 'Aguardando a primeira leitura (o MOVA lê o Google uma vez por dia, ou clique em "Atualizar agora").'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-3xl font-bold">{loja.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</p>
              <Estrelas nota={loja.nota} />
            </div>
            <div>
              <p className="text-3xl font-bold">{loja.total?.toLocaleString('pt-BR') ?? '-'}</p>
              <p className="text-xs text-muted-foreground">avaliações</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{toques}</p>
              <p className="text-xs text-muted-foreground">toques na placa no mês</p>
            </div>
          </div>
        )}

        {loja.variacao && (
          <p className="text-xs text-muted-foreground">
            Desde {fmtData(`${loja.variacao.desde}T12:00:00Z`)}: nota <Variacao valor={loja.variacao.nota} />,{' '}
            avaliações <Variacao valor={loja.variacao.total} />.
            {toques > 0 && ` Placa: ${loja.toquesMes.nfc} por NFC e ${loja.toquesMes.qr} por QR neste mês.`}
          </p>
        )}

        {loja.erro && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">Última leitura falhou: {loja.erro}</p>
        )}

        {loja.avaliacoes.length > 0 && (
          <ul className="space-y-3">
            {loja.avaliacoes.map(a => (
              <li key={a.googleId} className="border-t pt-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.autorUri
                      ? <a href={a.autorUri} target="_blank" rel="noreferrer">{a.autor ?? 'Anônimo'}</a>
                      : (a.autor ?? 'Anônimo')}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.publicadaEm ? fmtData(a.publicadaEm) : ''}</span>
                </div>
                <Estrelas nota={a.nota} tamanho={12} />
                {a.texto && <p className="text-muted-foreground mt-1 whitespace-pre-line">{a.texto}</p>}
              </li>
            ))}
          </ul>
        )}

        {loja.sincronizadoEm && (
          <p className="text-xs text-muted-foreground">Dados do Google, lidos em {fmtDataHora(loja.sincronizadoEm)}.</p>
        )}
      </CardContent>
    </Card>
  )
}

function ChaveForm({ temChave }: { temChave: boolean }) {
  const [chave, setChave] = useState('')
  const [pendente, iniciar] = useTransition()
  const salvar = () => iniciar(async () => {
    const r = await salvarChaveGoogleAction(chave)
    if (!r.ok) return void toast.error(r.erro)
    setChave('')
    toast.success('Chave salva')
  })
  return (
    <div className="space-y-2">
      <Label htmlFor="chave-google">Chave da Places API do grupo</Label>
      <div className="flex gap-2">
        <Input
          id="chave-google" type="password" autoComplete="off" value={chave}
          onChange={e => setChave(e.target.value)}
          placeholder={temChave ? 'Configurada. Cole outra para trocar' : 'AIza...'}
        />
        <Button onClick={salvar} disabled={pendente || !chave.trim()}>Salvar</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fica cifrada no banco e não volta para a tela. Passo a passo em docs/produto/avaliacoes-google.md.
      </p>
    </div>
  )
}

function baixar(nome: string, dataUrl: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nome
  a.click()
}

function LinhaPlaca({ loja, placa }: { loja: LojaPainel; placa: PlacaTela | undefined }) {
  const [placeId, setPlaceId] = useState(loja.placeId ?? '')
  const [pendente, iniciar] = useTransition()
  const salvar = () => iniciar(async () => {
    const r = await salvarPlaceIdAction(loja.lojaId, placeId)
    if (!r.ok) return void toast.error(r.erro)
    toast.success(placeId.trim() ? 'Place ID salvo' : 'Leitura do Google desligada para a loja')
  })
  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto)
    toast.success('Link copiado')
  }

  return (
    <div className="border-t pt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
      <div className="space-y-3 min-w-0">
        <p className="font-medium">{loja.nome}</p>
        <div className="space-y-1">
          <Label htmlFor={`place-${loja.lojaId}`} className="text-xs">Place ID</Label>
          <div className="flex gap-2">
            <Input id={`place-${loja.lojaId}`} value={placeId} onChange={e => setPlaceId(e.target.value)} placeholder="ChIJ..." />
            <Button variant="secondary" onClick={salvar} disabled={pendente || placeId.trim() === (loja.placeId ?? '')}>Salvar</Button>
          </div>
        </div>
        {placa ? (
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground flex items-center gap-1"><Nfc size={14} /> Grave este link na tag NFC:</p>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded break-all">{placa.link}</code>
              <Button size="icon-sm" variant="ghost" onClick={() => copiar(placa.link)} aria-label="Copiar link da tag"><Copy /></Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">O link da placa aparece depois de salvar o Place ID.</p>
        )}
      </div>
      {placa && (
        <div className="flex flex-col items-center gap-2">
          <img src={placa.qrSvg} alt={`QR code da placa de ${loja.nome}`} className="size-32 rounded-md" />
          <Button size="sm" variant="secondary" onClick={() => baixar(`qr-avaliacao-${loja.nome}.svg`, placa.qrSvg)}>
            <Download /> Baixar QR
          </Button>
        </div>
      )}
    </div>
  )
}

export function AvaliacoesClient({ painel, placas }: { painel: PainelAvaliacoes; placas: Record<string, PlacaTela> }) {
  const [pendente, iniciar] = useTransition()
  const atualizar = () => iniciar(async () => {
    const r = await atualizarAgoraAction()
    if (!r.ok) return void toast.error(r.erro)
    if (r.aviso) toast.warning(r.aviso)
    else toast.success('Avaliações atualizadas')
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={atualizar} disabled={pendente || !painel.temChave}>
          <RefreshCw className={pendente ? 'animate-spin' : ''} /> Atualizar agora
        </Button>
      </div>

      {painel.lojas.length === 0
        ? <p className="text-sm text-muted-foreground">Nenhuma loja ativa neste grupo.</p>
        : <div className="grid gap-4 md:grid-cols-2">{painel.lojas.map(l => <CardLoja key={l.lojaId} loja={l} />)}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><QrCode size={18} /> Configuração e plaquinhas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChaveForm temChave={painel.temChave} />
          {painel.lojas.map(l => <LinhaPlaca key={l.lojaId} loja={l} placa={placas[l.lojaId]} />)}
        </CardContent>
      </Card>
    </div>
  )
}
