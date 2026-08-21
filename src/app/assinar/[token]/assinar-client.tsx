'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, FileText, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { solicitarCodigoAction, conferirCodigoAction, selarAssinaturaAction } from './actions'
import {
  ITENS_CHECKLIST, LABEL_RESPOSTA, checklistCompleto,
  type RespostaItem, type RespostasChecklist,
} from '@/lib/assinatura/documento'
import { ViaAssinada } from './via-assinada'

type Passo = 'leitura' | 'codigo' | 'selfie' | 'traco'

type Props = {
  token: string
  html: string
  tipo: string
  status: string
  cancelado: boolean
  expirado: boolean
  docHash: string | null
  assinadoEm: string | null
  ipAssinatura: string | null
  /** Passo retomado do servidor: o cliente sai para o e-mail e volta, e ao
   *  voltar costuma recarregar a página. */
  passoInicial: Passo
}

const AVISO_LGPD =
  'Vamos pedir uma foto sua para comprovar quem está assinando. A imagem fica guardada ' +
  'em ambiente restrito, é usada apenas como prova da assinatura deste documento e não ' +
  'é publicada em lugar nenhum. Você pode desistir e assinar presencialmente na loja.'

export function AssinarClient(props: Props) {
  const router = useRouter()
  const [passo, setPasso] = useState<Passo>(props.passoInicial)
  const [assinado, setAssinado] = useState(props.status === 'assinado')
  // A foto fica em ref, não em estado: base64 de imagem é grande e não precisa
  // redesenhar a tela quando muda.
  const fotoRef = useRef<string | null>(null)
  // Checklist preenchido pelo comprador. Fica no estado porque a tela precisa
  // refletir cada marcação e habilitar o botão só quando estiver completo.
  const [respostas, setRespostas] = useState<RespostasChecklist>({ itens: {}, observacoes: '' })

  if (assinado) {
    return (
      <ViaAssinada
        html={props.html}
        docHash={props.docHash}
        assinadoEm={props.assinadoEm}
        ipAssinatura={props.ipAssinatura}
      />
    )
  }

  if (props.cancelado) return <Aviso titulo="Documento cancelado" texto="Este documento foi cancelado pela loja. Fale com a loja para receber um novo link." />
  if (props.expirado) return <Aviso titulo="Link expirado" texto="Este link de assinatura expirou. Peça um novo à loja." />

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <Etapas passo={passo} />
      {passo === 'leitura' && (
        props.tipo === 'checklist_entrega'
          ? <PreencherChecklist
              html={props.html}
              respostas={respostas}
              setRespostas={setRespostas}
              onOk={() => setPasso('codigo')}
            />
          : <Leitura html={props.html} onOk={() => setPasso('codigo')} />
      )}
      {passo === 'codigo' && <Codigo token={props.token} onOk={() => setPasso('selfie')} />}
      {passo === 'selfie' && <Selfie onOk={() => setPasso('traco')} onFoto={f => (fotoRef.current = f)} />}
      {passo === 'traco' && (
        <Traco
          token={props.token}
          getFoto={() => fotoRef.current}
          respostas={props.tipo === 'checklist_entrega' ? respostas : null}
          onAssinado={() => { setAssinado(true); router.refresh() }}
          onVoltarSelfie={() => setPasso('selfie')}
          onVoltarChecklist={() => setPasso('leitura')}
        />
      )}
    </div>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <X size={38} className="mx-auto text-slate-400 mb-3" />
      <h1 className="text-lg font-semibold text-slate-800">{titulo}</h1>
      <p className="text-sm text-slate-500 mt-1">{texto}</p>
    </div>
  )
}

function Etapas({ passo }: { passo: Passo }) {
  const lista: { id: Passo; label: string }[] = [
    { id: 'leitura', label: 'Documento' },
    { id: 'codigo', label: 'Código' },
    { id: 'selfie', label: 'Foto' },
    { id: 'traco', label: 'Assinatura' },
  ]
  const atual = lista.findIndex(l => l.id === passo)
  return (
    <ol className="flex gap-1.5 mb-3">
      {lista.map((l, i) => (
        <li
          key={l.id}
          className={`flex-1 rounded-full h-1.5 ${i <= atual ? 'bg-slate-800' : 'bg-slate-300'}`}
          title={l.label}
        />
      ))}
    </ol>
  )
}

function Leitura({ html, onOk }: { html: string; onOk: () => void }) {
  const [leuTudo, setLeuTudo] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Só libera o botão depois de rolar até o fim: é a prova de que o documento
  // esteve disponível por inteiro antes do aceite.
  function aoRolar() {
    const el = ref.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setLeuTudo(true)
  }

  useEffect(() => {
    // Documento curto que já cabe na tela nunca dispara scroll — libera direto.
    const el = ref.current
    if (el && el.scrollHeight <= el.clientHeight + 24) setLeuTudo(true)
  }, [])

  return (
    <>
      <div className="rounded-lg border bg-white px-4 py-3 mb-3 flex items-center gap-2">
        <FileText size={17} className="text-slate-500" />
        <p className="text-sm text-slate-700">Leia o documento até o fim para liberar a assinatura.</p>
      </div>
      {/* HTML gerado pelo servidor, com escape em todo campo do banco — ver via-assinada.tsx */}
      <div
        ref={ref}
        onScroll={aoRolar}
        className="bg-white rounded-lg border p-4 mb-3 overflow-y-auto"
        style={{ maxHeight: '65vh' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        onClick={onOk}
        disabled={!leuTudo}
        className="w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white disabled:bg-slate-300"
      >
        {leuTudo ? 'Li e concordo — assinar' : 'Role até o fim do documento'}
      </button>
    </>
  )
}

// Checklist: o comprador não só lê, ele confere item a item. As três colunas
// são OK, NÃO e NA (não se aplica), e nada avança com item em branco.
function PreencherChecklist({
  html, respostas, setRespostas, onOk,
}: {
  html: string
  respostas: RespostasChecklist
  setRespostas: (r: RespostasChecklist) => void
  onOk: () => void
}) {
  const completo = checklistCompleto(respostas)
  const faltam = ITENS_CHECKLIST.filter(i => !respostas.itens[i]).length

  function marcar(item: string, valor: RespostaItem) {
    setRespostas({ ...respostas, itens: { ...respostas.itens, [item]: valor } })
  }

  return (
    <>
      <div className="rounded-lg border bg-white px-4 py-3 mb-3">
        <p className="text-sm font-medium text-slate-800">Confira o veículo item a item</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Marque <b>OK</b> se está certo, <b>NÃO</b> se tem problema, ou <b>NA</b> se não se
          aplica a este veículo.
        </p>
      </div>

      {/* Cabeçalho do documento (dados da venda), sem a tabela em branco */}
      <details className="rounded-lg border bg-white mb-3">
        <summary className="cursor-pointer px-4 py-2.5 text-sm text-slate-600">
          Ver dados do documento
        </summary>
        <div className="border-t p-4 text-xs" dangerouslySetInnerHTML={{ __html: html }} />
      </details>

      <div className="rounded-lg border bg-white divide-y">
        {ITENS_CHECKLIST.map(item => (
          <div key={item} className="px-3 py-2.5">
            <p className="text-sm text-slate-700 mb-1.5">{item}</p>
            <div className="flex gap-1.5">
              {(['ok', 'nao', 'na'] as RespostaItem[]).map(v => {
                const ativo = respostas.itens[item] === v
                const cor = v === 'ok'
                  ? 'bg-emerald-600 border-emerald-600'
                  : v === 'nao' ? 'bg-red-600 border-red-600' : 'bg-slate-500 border-slate-500'
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => marcar(item, v)}
                    className={`flex-1 rounded-md border py-2 text-xs font-medium ${
                      ativo ? `${cor} text-white` : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    {LABEL_RESPOSTA[v]}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-3 mt-3">
        <label htmlFor="obs" className="text-sm text-slate-700">Observações</label>
        <textarea
          id="obs"
          rows={4}
          value={respostas.observacoes}
          onChange={e => setRespostas({ ...respostas, observacoes: e.target.value })}
          placeholder="Algo a registrar sobre a entrega? (opcional)"
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={onOk}
        disabled={!completo}
        className="mt-3 w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white disabled:bg-slate-300"
      >
        {completo ? 'Continuar para a assinatura' : `Faltam ${faltam} ${faltam === 1 ? 'item' : 'itens'}`}
      </button>
    </>
  )
}

function Codigo({ token, onOk }: { token: string; onOk: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [pending, startTransition] = useTransition()
  const pediu = useRef(false)
  // Espera até poder pedir outro código, e quantos ainda restam. Vêm do
  // servidor — quem recarrega a página precisa voltar com o botão no estado
  // certo, e não liberado até clicar e tomar o erro.
  const [espera, setEspera] = useState(0)
  const [restantes, setRestantes] = useState<number | null>(null)

  function aplicarCota(r: { restantes?: number; esperarSegundos?: number }) {
    if (typeof r.restantes === 'number') setRestantes(r.restantes)
    if (typeof r.esperarSegundos === 'number') setEspera(r.esperarSegundos)
  }

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  // Ao entrar no passo, garante que existe um código válido. A action não gera
  // outro se o anterior ainda vale — voltar do e-mail não invalida o código
  // que o cliente acabou de copiar.
  useEffect(() => {
    if (pediu.current) return
    pediu.current = true
    startTransition(async () => {
      const r = await solicitarCodigoAction(token)
      aplicarCota(r)
      if (r.ok) setEnviado(true)
      else setErro(r.error ?? 'Falha ao enviar o código')
    })
  }, [token])

  // Reenviar é o único caminho que gera código novo — aí o anterior perde a vez
  // por decisão explícita do cliente, não por um recarregamento de página.
  function reenviar() {
    setErro('')
    startTransition(async () => {
      const r = await solicitarCodigoAction(token, true)
      aplicarCota(r)
      if (r.ok) { setEnviado(true); setCodigo('') }
      else setErro(r.error ?? 'Falha ao enviar o código')
    })
  }

  function confirmar() {
    if (codigo.trim().length !== 6) { setErro('Digite os 6 dígitos'); return }
    setErro('')
    startTransition(async () => {
      const r = await conferirCodigoAction(token, codigo)
      if (r.ok) onOk()
      else setErro(r.error ?? 'Código inválido')
    })
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <ShieldCheck size={22} className="text-slate-500 mb-2" />
      <h1 className="text-base font-semibold text-slate-800">Confirme que é você</h1>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        {enviado
          ? 'Enviamos um código de 6 dígitos no seu e-mail. Digite abaixo.'
          : 'Enviando o código para o seu e-mail…'}
      </p>

      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className="w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-[0.4em] font-mono"
      />

      <p className="mt-2 text-xs text-slate-500">
        Pode abrir o seu e-mail e voltar — você volta direto para esta etapa, e o código
        continua valendo.
      </p>

      {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}

      <button
        onClick={confirmar}
        disabled={pending || codigo.length !== 6}
        className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white disabled:bg-slate-300"
      >
        {pending ? 'Verificando…' : 'Confirmar'}
      </button>
      {restantes === 0 ? (
        // Sem reenvio sobrando. A saída é pela loja: reenviar o documento
        // cancela este e cria outro, com link e cota novos.
        <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Você já pediu o código o máximo de vezes. Fale com a loja para receber um link novo.
        </p>
      ) : (
        <button
          onClick={reenviar}
          disabled={pending || espera > 0}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-sm text-slate-500 disabled:opacity-50"
        >
          <RefreshCw size={14} />
          {espera > 0 ? `Reenviar em ${espera}s` : 'Reenviar código'}
        </button>
      )}
    </div>
  )
}

function Selfie({ onOk, onFoto }: { onOk: () => void; onFoto: (f: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    // Sempre desliga a câmera ao sair — senão o LED do celular fica aceso.
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [stream])

  async function abrirCamera() {
    setErro('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        await videoRef.current.play()
      }
    } catch {
      setErro('Não conseguimos abrir a câmera. Autorize o acesso nas permissões do navegador.')
    }
  }

  function capturar() {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0)
    onFoto(canvas.toDataURL('image/jpeg', 0.8))
    stream?.getTracks().forEach(t => t.stop())
    onOk()
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <Camera size={22} className="text-slate-500 mb-2" />
      <h1 className="text-base font-semibold text-slate-800">Foto do signatário</h1>
      <p className="text-xs text-slate-500 mt-2 mb-4 leading-relaxed">{AVISO_LGPD}</p>

      {!stream && (
        <button onClick={abrirCamera} className="w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white">
          Permitir câmera
        </button>
      )}

      {/* playsInline é obrigatório: sem ele o iOS abre o vídeo em tela cheia */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`w-full rounded-lg bg-black ${stream ? 'block' : 'hidden'}`}
      />

      {stream && (
        <button onClick={capturar} className="mt-3 w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white">
          Tirar foto
        </button>
      )}

      {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
    </div>
  )
}

function Traco({
  token, getFoto, respostas, onAssinado, onVoltarSelfie, onVoltarChecklist,
}: {
  token: string
  getFoto: () => string | null
  respostas: RespostasChecklist | null
  onAssinado: () => void
  onVoltarSelfie: () => void
  onVoltarChecklist: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [temTraco, setTemTraco] = useState(false)
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    desenhando.current = true
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setTemTraco(true)
  }

  function fim() { desenhando.current = false }

  function limpar() {
    const c = canvasRef.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setTemTraco(false)
  }

  // Geolocalização é bônus: se o cliente negar ou demorar, a assinatura segue.
  function pegarGeo(): Promise<{ lat: number; lon: number; precisao: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      const timer = setTimeout(() => resolve(null), 5000)
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy }) },
        () => { clearTimeout(timer); resolve(null) },
        { timeout: 5000 },
      )
    })
  }

  function assinar() {
    const foto = getFoto()
    if (!foto) { setErro('A foto se perdeu. Refaça a foto.'); onVoltarSelfie(); return }
    const traco = canvasRef.current?.toDataURL('image/png')
    if (!traco || !temTraco) { setErro('Assine no quadro acima'); return }
    setErro('')
    startTransition(async () => {
      const geo = await pegarGeo()
      const r = await selarAssinaturaAction(token, foto, traco, geo, respostas)
      if (r.ok) { onAssinado(); return }
      setErro(r.error ?? 'Não foi possível assinar')
      // Item do checklist em branco: manda de volta para a conferência, senão
      // o cliente fica preso numa tela que não tem como corrigir o problema.
      if (r.error?.includes('todos os itens')) onVoltarChecklist()
    })
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <h1 className="text-base font-semibold text-slate-800">Assine com o dedo</h1>
      <p className="text-sm text-slate-500 mt-1 mb-3">Desenhe sua assinatura no quadro abaixo.</p>

      {/* touchAction none: sem isso o dedo rola a página em vez de desenhar */}
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerLeave={fim}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50"
        style={{ touchAction: 'none' }}
      />

      <div className="flex gap-2 mt-3">
        <button onClick={limpar} disabled={pending} className="flex-1 rounded-lg border py-2.5 text-sm text-slate-600">
          Limpar
        </button>
        <button
          onClick={assinar}
          disabled={pending || !temTraco}
          className="flex-[2] flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:bg-slate-300"
        >
          <Check size={16} /> {pending ? 'Assinando…' : 'Assinar documento'}
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
    </div>
  )
}
