'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Download, ExternalLink, Nfc, Plus, QrCode, RefreshCw, Star, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LojaPainel, PainelAvaliacoes, PlacaPainel } from '@/lib/avaliacoes-google/avaliacoes'
import {
  atualizarAgoraAction, criarPlacaAction, editarPlacaAction, salvarChaveGoogleAction, salvarPlaceIdAction,
} from '../actions'

export type LinkPlaca = { link: string; qrSvg: string }

const BALCAO = 'Balcão (sem vendedor)'
const selectClass = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/** Os últimos 12 meses (Brasília), do atual para trás, como 'YYYY-MM'. */
function ultimosMeses(): { valor: string; rotulo: string }[] {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date())
  let [a, m] = hoje.split('-').map(Number)
  const meses = []
  for (let i = 0; i < 12; i++) {
    const valor = `${a}-${String(m).padStart(2, '0')}`
    const rotulo = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    meses.push({ valor, rotulo })
    if (--m === 0) { m = 12; a-- }
  }
  return meses
}

function Estrelas({ nota, tamanho = 14 }: { nota: number; tamanho?: number }) {
  return (
    <span className="inline-flex" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={tamanho} className={i <= Math.round(nota) ? 'fill-warning text-warning' : 'text-muted-foreground'} />
      ))}
    </span>
  )
}

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null || valor === 0) return <span className="text-muted-foreground">sem mudança</span>
  const sobe = valor > 0
  return <span className={sobe ? 'text-success' : 'text-destructive'}>{sobe ? '+' : ''}{valor.toLocaleString('pt-BR')}</span>
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
          !loja.erro && (
            <p className="text-sm text-muted-foreground">
              Aguardando a primeira leitura (o MOVA lê o Google uma vez por dia, ou clique em &quot;Atualizar agora&quot;).
            </p>
          )
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
              <p className="text-xs text-muted-foreground">toques nas placas no mês</p>
            </div>
          </div>
        )}

        {loja.variacao && (
          <p className="text-xs text-muted-foreground">
            Desde {fmtData(`${loja.variacao.desde}T12:00:00Z`)}: nota <Variacao valor={loja.variacao.nota} />,{' '}
            avaliações <Variacao valor={loja.variacao.total} />.
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

function ResultadoPorVendedor({ painel }: { painel: PainelAvaliacoes }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Trophy size={18} /> Toques por vendedor no mês</CardTitle>
        <p className="text-xs text-muted-foreground">
          Conta para quem era o dono da placa na hora do toque. O Google não diz quem de fato avaliou:
          compare com o aumento do total de avaliações da loja.
        </p>
      </CardHeader>
      <CardContent>
        {painel.porResponsavel.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum toque neste mês.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 font-medium">Vendedor</th>
                <th className="font-medium">Loja</th>
                <th className="font-medium text-right">NFC</th>
                <th className="font-medium text-right">QR</th>
                <th className="font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {painel.porResponsavel.map(r => (
                <tr key={`${r.usuarioId ?? 'balcao'}-${r.lojaId}`} className="border-t">
                  <td className="py-2">{r.nome}</td>
                  <td className="text-muted-foreground">{r.lojaNome}</td>
                  <td className="text-right">{r.toques.nfc}</td>
                  <td className="text-right">{r.toques.qr}</td>
                  <td className="text-right font-semibold">{r.toques.nfc + r.toques.qr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function baixar(nome: string, dataUrl: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nome
  a.click()
}

function NovaPlaca({ painel }: { painel: PainelAvaliacoes }) {
  const [lojaId, setLojaId] = useState(painel.lojas[0]?.lojaId ?? '')
  const [usuarioId, setUsuarioId] = useState('')
  const [nome, setNome] = useState('')
  const [pendente, iniciar] = useTransition()
  const criar = () => iniciar(async () => {
    const r = await criarPlacaAction(lojaId, usuarioId, nome)
    if (!r.ok) return void toast.error(r.erro)
    setNome('')
    toast.success('Placa criada. Grave o link dela na tag.')
  })
  if (painel.lojas.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="nova-placa-loja" className="text-xs">Loja</Label>
        <select id="nova-placa-loja" className={selectClass} value={lojaId} onChange={e => setLojaId(e.target.value)}>
          {painel.lojas.map(l => <option key={l.lojaId} value={l.lojaId}>{l.nome}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="nova-placa-vendedor" className="text-xs">Vendedor</Label>
        <select id="nova-placa-vendedor" className={selectClass} value={usuarioId} onChange={e => setUsuarioId(e.target.value)}>
          <option value="">{BALCAO}</option>
          {painel.responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="nova-placa-nome" className="text-xs">Apelido (opcional)</Label>
        <Input id="nova-placa-nome" className="h-8" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: crachá, mesa 2" maxLength={60} />
      </div>
      <Button onClick={criar} disabled={pendente || !lojaId}><Plus /> Nova placa</Button>
    </div>
  )
}

function LinhaPlaca({ placa, link, painel }: { placa: PlacaPainel; link: LinkPlaca; painel: PainelAvaliacoes }) {
  const [pendente, iniciar] = useTransition()
  const editar = (mudanca: { usuarioId?: string; ativa?: boolean }, sucesso: string) => iniciar(async () => {
    const r = await editarPlacaAction(placa.id, mudanca)
    if (!r.ok) return void toast.error(r.erro)
    toast.success(sucesso)
  })
  const copiar = async () => {
    await navigator.clipboard.writeText(link.link)
    toast.success('Link copiado')
  }
  // Responsável inativo continua aparecendo como opção para não sumir do select.
  const responsaveis = placa.usuarioId && !painel.responsaveis.some(u => u.id === placa.usuarioId)
    ? [...painel.responsaveis, { id: placa.usuarioId, nome: `${placa.usuarioNome ?? 'Usuário'} (inativo)` }]
    : painel.responsaveis
  const titulo = `${placa.usuarioNome ?? BALCAO}${placa.nome ? ` · ${placa.nome}` : ''}`

  return (
    <div className={`border-t pt-4 grid gap-4 sm:grid-cols-[1fr_auto] ${placa.ativa ? '' : 'opacity-60'}`}>
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground">{placa.lojaNome}{placa.ativa ? '' : ' · desativada'}</p>
        </div>
        <p className="text-sm">
          <span className="font-semibold">{placa.toquesMes.nfc + placa.toquesMes.qr}</span> toques no mês
          <span className="text-muted-foreground"> ({placa.toquesMes.nfc} NFC, {placa.toquesMes.qr} QR) · {placa.toquesTotal} desde o início</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`resp-${placa.id}`} className="text-xs">Vendedor responsável</Label>
            <select
              id={`resp-${placa.id}`} className={selectClass} value={placa.usuarioId ?? ''} disabled={pendente}
              onChange={e => editar({ usuarioId: e.target.value }, 'Responsável trocado. Os toques antigos continuam com quem era o dono.')}
            >
              <option value="">{BALCAO}</option>
              {responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <Button
            size="sm" variant={placa.ativa ? 'ghost' : 'secondary'} disabled={pendente}
            onClick={() => editar({ ativa: !placa.ativa }, placa.ativa ? 'Placa desativada: não conta mais toque' : 'Placa reativada')}
          >
            {placa.ativa ? 'Desativar' : 'Reativar'}
          </Button>
        </div>
        <div className="space-y-1 text-xs">
          <p className="text-muted-foreground flex items-center gap-1"><Nfc size={14} /> Grave este link na tag NFC:</p>
          <div className="flex items-center gap-2">
            <code className="bg-muted px-2 py-1 rounded break-all">{link.link}</code>
            <Button size="icon-sm" variant="ghost" onClick={copiar} aria-label="Copiar link da tag"><Copy /></Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <img src={link.qrSvg} alt={`QR code da placa ${titulo}`} className="size-28 rounded-md" />
        <Button size="sm" variant="secondary" onClick={() => baixar(`qr-avaliacao-${placa.lojaNome}-${placa.usuarioNome ?? 'balcao'}-${placa.codigo}.svg`, link.qrSvg)}>
          <Download /> Baixar QR
        </Button>
      </div>
    </div>
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

function PlaceIdLoja({ loja }: { loja: LojaPainel }) {
  const [placeId, setPlaceId] = useState(loja.placeId ?? '')
  const [pendente, iniciar] = useTransition()
  const salvar = () => iniciar(async () => {
    const r = await salvarPlaceIdAction(loja.lojaId, placeId)
    if (!r.ok) return void toast.error(r.erro)
    toast.success(placeId.trim() ? 'Place ID salvo' : 'Leitura do Google desligada para a loja')
  })
  return (
    <div className="space-y-1">
      <Label htmlFor={`place-${loja.lojaId}`} className="text-xs">Place ID de {loja.nome}</Label>
      <div className="flex gap-2">
        <Input id={`place-${loja.lojaId}`} value={placeId} onChange={e => setPlaceId(e.target.value)} placeholder="ChIJ..." />
        <Button variant="secondary" onClick={salvar} disabled={pendente || placeId.trim() === (loja.placeId ?? '')}>Salvar</Button>
      </div>
    </div>
  )
}

export function AvaliacoesClient({ painel, links }: { painel: PainelAvaliacoes; links: Record<string, LinkPlaca> }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const atualizar = () => iniciar(async () => {
    const r = await atualizarAgoraAction()
    if (!r.ok) return void toast.error(r.erro)
    if (r.aviso) toast.warning(r.aviso)
    else toast.success('Avaliações atualizadas')
  })
  const semPlaceId = painel.lojas.filter(l => !l.placeId).map(l => l.lojaId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor="mes-toques" className="text-xs">Mês dos toques</Label>
          <select
            id="mes-toques" className={selectClass} value={painel.mes}
            onChange={e => router.push(`?mes=${e.target.value}`)}
          >
            {ultimosMeses().map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={atualizar} disabled={pendente || !painel.temChave}>
          <RefreshCw className={pendente ? 'animate-spin' : ''} /> Atualizar agora
        </Button>
      </div>

      {painel.lojas.length === 0
        ? <p className="text-sm text-muted-foreground">Nenhuma loja ativa neste grupo.</p>
        : <div className="grid gap-4 md:grid-cols-2">{painel.lojas.map(l => <CardLoja key={l.lojaId} loja={l} />)}</div>}

      <ResultadoPorVendedor painel={painel} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><QrCode size={18} /> Plaquinhas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Uma placa por vendedor (crachá, mesa) ou de balcão. Cada uma tem link e QR próprios: grave
            o link certo em cada tag.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <NovaPlaca painel={painel} />
          {painel.placas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma placa criada.</p>}
          {painel.placas.map(p => (
            <div key={p.id}>
              {semPlaceId.includes(p.lojaId) && (
                <p className="text-xs text-warning border-t pt-3">A loja {p.lojaNome} ainda não tem Place ID: esta placa só funciona depois de configurar.</p>
              )}
              <LinhaPlaca placa={p} link={links[p.id]} painel={painel} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuração do Google</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ChaveForm temChave={painel.temChave} />
          {painel.lojas.map(l => <PlaceIdLoja key={l.lojaId} loja={l} />)}
        </CardContent>
      </Card>
    </div>
  )
}
