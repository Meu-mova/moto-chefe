'use client'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronRight, MessageCircleQuestion, Pencil, RotateCcw, Table2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { CLASSE_SELECT_NATIVO } from '@/components/ui/select-nativo'
import { UFS } from '@/lib/sefaz/uf'
import { parseDataInput } from '@/lib/data-venda'
import { numerosDifalDaUf, percentualValido, type BaseDifal, type CorrecaoUf, type NumerosDifal } from '@/lib/notagateway/difal-ufs'
import { salvarCorrecaoUfAction, voltarAoPadraoUfAction } from '../actions'

/**
 * "Venda para fora da UF: moto importada" (#904, protótipo B aprovado; no celular a tabela
 * do MOVA abre numa folha de tela inteira). Os números de cada UF saem de numerosDifalDaUf,
 * a mesma função que a NF vai usar (#905).
 */

type Props = {
  grupoId: string
  ufEmitente: string | null
  correcoes: CorrecaoUf[]
  importado: string
  onImportado: (v: string) => void
}

const SEM_PADRAO = 'Sem valor padrão. Preencha com o seu contador.'
const pct = (v: number | null) => (v === null ? 'sem valor' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const nomeBase = (b: BaseDifal) => (b === 'unica' ? 'Única' : 'Dupla')
const nomeDaUf = (uf: string) => UFS.find(u => u.sigla === uf)?.nome ?? uf
const numeroDoForm = (v: string) => Number(v.trim().replace(',', '.'))

function resumoPadrao(n: NumerosDifal) {
  const p = n.padrao
  return p.aliquotaInterna === null ? 'sem valor padrão' : `${pct(p.aliquotaInterna)}, FCP ${pct(p.fcp)}, base ${nomeBase(p.base).toLowerCase()}`
}

const SeloCorrigido = () => (
  <span className="inline-flex items-center gap-1 rounded-full border border-warning/45 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"><Pencil size={12} aria-hidden />Corrigido pelo seu contador</span>
)

/** Número do padrão com a ressalva da fonte, quando houver (SP e MG: alíquota geral). */
const Ressalva = ({ n }: { n: NumerosDifal }) =>
  n.padrao.ressalva ? <span className="block text-[11px] text-warning">{n.padrao.ressalva}</span> : null

export function DifalUfs({ grupoId, ufEmitente, correcoes, importado, onImportado }: Props) {
  const idImportado = useId()
  const [editando, setEditando] = useState<NumerosDifal | null>(null)
  const [busca, setBusca] = useState('')
  const [folhaAberta, setFolhaAberta] = useState(false)
  const [pendVolta, startVolta] = useTransition()

  const todas = UFS.map(u => numerosDifalDaUf(u.sigla, correcoes)).filter((n): n is NumerosDifal => n !== null)
  const corrigidas = todas.filter(n => n.origem === 'corrigido')
  const termo = busca.trim().toLowerCase()
  const daTabela = todas.filter(n => n.origem === 'padrao' && n.uf !== ufEmitente)
  const filtradas = daTabela.filter(n => !termo || n.uf.toLowerCase().includes(termo) || nomeDaUf(n.uf).toLowerCase().includes(termo))

  function voltar(uf: string) {
    startVolta(async () => {
      const r = await voltarAoPadraoUfAction({ grupoId, uf })
      if (!r.ok) toast.error(r.erro)
    })
  }

  // Corrigir de dentro da folha fecha a folha antes: duas camadas modais embaralham foco e teclado.
  const corrigir = (n: NumerosDifal) => { setFolhaAberta(false); setEditando(n) }

  const campoBusca = <Input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar estado" aria-label="Buscar estado" />

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor={idImportado} className="text-xs">Alíquota ICMS para moto importada (%)</Label>
          <Input id={idImportado} inputMode="decimal" value={importado} onChange={e => onImportado(e.target.value)} placeholder="Ex.: 4,00" className="font-mono text-sm sm:max-w-xs" />
          <p className="text-[11px] leading-tight text-muted-foreground">Usada na venda de moto importada para outro estado. Vazio: a nota dessa venda fica com pendência na prévia.</p>
          {!importado.trim() && (
            <p className="mt-2 flex items-start gap-2 rounded-md border border-warning/35 bg-warning/5 p-2 text-xs text-warning">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              Ainda vazio. Pergunte ao seu contador e preencha antes de emitir nota de moto importada para outro estado.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium text-info"><MessageCircleQuestion size={16} aria-hidden />O que perguntar ao seu contador</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Qual a alíquota de ICMS para moto importada vendida para outro estado? (costuma ser 4%)</li>
            <li>Algum estado para onde vendemos tem alíquota interna, FCP ou base diferente da tabela do MOVA?</li>
            <li>Para cada um desses estados: a base do DIFAL é única ou dupla?</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">Vale só para moto importada vendida a consumidor final de outro estado. Moto nacional e venda dentro do estado não mudam.</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Estados corrigidos pelo seu contador</p>
        <p className="text-xs text-muted-foreground">Só aqui o número é diferente da tabela do MOVA. Vale só para este grupo.</p>
        {corrigidas.length === 0
          ? <p className="mt-2 text-xs text-muted-foreground">Nenhum estado corrigido.</p>
          : (
            <div data-corrigidas className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {corrigidas.map(n => (
                <div key={n.uf} className="rounded-lg border border-warning/35 bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm"><b>{n.uf}</b> <span className="text-muted-foreground">{nomeDaUf(n.uf)}</span></span>
                    <SeloCorrigido />
                  </div>
                  <p className="mt-1 text-sm tabular-nums">Interna <b>{pct(n.aliquotaInterna)}</b> · FCP <b>{pct(n.fcp)}</b> · Base <b>{nomeBase(n.base).toLowerCase()}</b></p>
                  <p className="text-xs text-muted-foreground">Padrão do MOVA: {resumoPadrao(n)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => corrigir(n)} aria-label={`Corrigir ${n.uf}`}><Pencil size={14} aria-hidden />Editar</Button>
                    <Button variant="ghost" size="sm" disabled={pendVolta} onClick={() => voltar(n.uf)} aria-label={`Voltar ao padrão ${n.uf}`}><RotateCcw size={14} aria-hidden />Voltar ao padrão</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Desktop: tabela do MOVA recolhível, com busca. */}
      <details className="hidden rounded-lg border bg-card md:block">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium"><Table2 size={16} aria-hidden />Tabela do MOVA: {daTabela.length} estados sem correção</summary>
        <div className="px-3 pb-3">
          <div className="max-w-xs py-2">{campoBusca}</div>
          {ufEmitente && (
            <div data-uf={ufEmitente} className="border-t py-2 text-sm text-muted-foreground"><b>{ufEmitente}</b> {nomeDaUf(ufEmitente)}: sua UF. Venda dentro do estado não usa esta tabela.</div>
          )}
          {filtradas.map(n => (
            <div key={n.uf} data-uf={n.uf} className="grid grid-cols-[180px_1fr_1fr_1fr_auto] items-center gap-2 border-t py-2 text-sm">
              <span><b>{n.uf}</b> <span className="text-muted-foreground">{nomeDaUf(n.uf)}</span></span>
              {n.aliquotaInterna === null
                ? <span className="col-span-3 text-warning">{SEM_PADRAO}</span>
                : <><span className="tabular-nums">{pct(n.aliquotaInterna)}<Ressalva n={n} /></span><span className="tabular-nums">FCP {pct(n.fcp)}</span><span>{nomeBase(n.base)}</span></>}
              <Button variant="ghost" size="sm" className="text-primary-text" onClick={() => corrigir(n)} aria-label={`Corrigir ${n.uf}`}><Pencil size={14} aria-hidden />Corrigir</Button>
            </div>
          ))}
        </div>
      </details>

      {/* Celular: botão que abre a folha de tela inteira (protótipo, opção 2). */}
      <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
        <SheetTrigger className="flex min-h-12 w-full items-center justify-between rounded-lg border bg-card px-3 text-sm font-medium md:hidden">
          <span className="flex items-center gap-2"><Table2 size={16} aria-hidden />Ver tabela do MOVA: {daTabela.length} estados</span>
          <ChevronRight size={16} aria-hidden />
        </SheetTrigger>
        <SheetContent side="bottom" showCloseButton={false} className="h-dvh gap-0 p-0" data-folha-ufs>
          <SheetHeader className="flex-row items-center justify-between border-b">
            <SheetTitle>Tabela do MOVA: {daTabela.length} estados</SheetTitle>
            <SheetClose render={<Button variant="ghost" size="sm" aria-label="Fechar" />}>Fechar</SheetClose>
          </SheetHeader>
          <div className="border-b px-4 py-2">{campoBusca}</div>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {filtradas.map(n => (
              <div key={n.uf} data-linha-uf={n.uf} className="flex min-h-11 items-center gap-2 border-t py-2 text-sm">
                <span className="min-w-0 flex-1 leading-snug">
                  <b>{n.uf}</b> {nomeDaUf(n.uf)}{' '}
                  {n.aliquotaInterna === null
                    ? <span className="text-warning">· {SEM_PADRAO}</span>
                    : <span className="tabular-nums text-muted-foreground">· {pct(n.aliquotaInterna)} · FCP {pct(n.fcp)} · {nomeBase(n.base)}</span>}
                  <Ressalva n={n} />
                </span>
                <Button variant="ghost" size="icon" aria-label={`Corrigir ${n.uf}`} onClick={() => corrigir(n)}><Pencil size={16} aria-hidden /></Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {editando && <DialogoCorrigir key={editando.uf} grupoId={grupoId} n={editando} onFechar={() => setEditando(null)} />}
    </div>
  )
}

function DialogoCorrigir({ grupoId, n, onFechar }: { grupoId: string; n: NumerosDifal; onFechar: () => void }) {
  const idAliq = useId()
  const idFcp = useId()
  const idBase = useId()
  const [aliq, setAliq] = useState(n.aliquotaInterna === null ? '' : String(n.aliquotaInterna).replace('.', ','))
  const [fcp, setFcp] = useState(n.fcp === null ? '' : String(n.fcp).replace('.', ','))
  const [base, setBase] = useState<BaseDifal>(n.base)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  const conferido = n.padrao.conferidoEm ? parseDataInput(n.padrao.conferidoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null

  function salvar() {
    const a = numeroDoForm(aliq)
    const f = numeroDoForm(fcp)
    if (!aliq.trim() || !percentualValido(a)) return setErro('Alíquota interna: use um número de 0 a 100, com até 2 casas.')
    if (!fcp.trim() || !percentualValido(f)) return setErro('FCP: use um número de 0 a 100, com até 2 casas.')
    setErro(null)
    start(async () => {
      const r = await salvarCorrecaoUfAction({ grupoId, uf: n.uf, aliquotaInterna: a, fcp: f, base })
      if (r.ok) { toast.success(`${n.uf} corrigido para este grupo`); onFechar() } else setErro(r.erro)
    })
  }

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto && !pendente) onFechar() }} disablePointerDismissal>
      <DialogContent className="sm:max-w-md" showCloseButton={!pendente}>
        <DialogHeader>
          <DialogTitle>Corrigir {n.uf} ({nomeDaUf(n.uf)}) para este grupo</DialogTitle>
          <DialogDescription>Só use o número que o seu contador passou. Os outros grupos continuam com o padrão.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor={idAliq} className="text-xs">Alíquota interna (%)</Label><Input id={idAliq} inputMode="decimal" value={aliq} onChange={e => setAliq(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={idFcp} className="text-xs">FCP (%)</Label><Input id={idFcp} inputMode="decimal" value={fcp} onChange={e => setFcp(e.target.value)} /></div>
          <div className="space-y-1">
            <Label htmlFor={idBase} className="text-xs">Base</Label>
            <select id={idBase} value={base} onChange={e => setBase(e.target.value as BaseDifal)} className={CLASSE_SELECT_NATIVO}>
              <option value="unica">Única</option>
              <option value="dupla">Dupla</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Padrão do MOVA: {resumoPadrao(n)}.
          {n.padrao.fonte && <> Fonte: {n.padrao.fonte}{conferido && `, conferido em ${conferido}`}.</>}
        </p>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="ghost" disabled={pendente} onClick={onFechar}>Cancelar</Button>
          <Button disabled={pendente} onClick={salvar}>{pendente ? 'Salvando...' : 'Salvar correção'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
