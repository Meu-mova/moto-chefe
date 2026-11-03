'use client'
import { useState } from 'react'
import { AlertCircle, Check, ChevronDown, ExternalLink, Filter, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rotuloDoPapel } from '@/lib/rotulo-do-papel'
import {
  TIPOS_HOLERITE, descricaoEnvio, resumirEnvios, rotuloEnviado,
} from '@/lib/holerites-tela'
import { rotuloMes } from '@/lib/folha-tela'
import type { HoleriteRow } from '../holerites-actions'
import { useEnvioHolerite } from './holerite-envio'

export type FuncionarioHolerite = { id: string; nome: string; papel: string; lojaNome: string }

// Faixas pela largura do CONTEÚDO (container `folha`, ver folha-casca.tsx): celular < 680 px (nome
// e etiquetas curtas, tocar abre as ações), tablet 680 a 959 px (uma etiqueta por tipo), desktop
// >= 960 px (etiqueta e ações na própria linha, sem detalhe). Colunas fixas para os botões
// alinharem de cima a baixo.
const COLUNAS = 'grid-cols-[minmax(0,1fr)_2.75rem] @[680px]/folha:grid-cols-[minmax(0,1fr)_9rem_9rem_2.75rem] @[960px]/folha:grid-cols-[minmax(0,1fr)_24rem_24rem]'
const ETIQUETA = 'inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold [&_svg]:size-3.5'
const ALVO = 'h-11 @[960px]/folha:h-9'

function Etiqueta({ enviado, children }: { enviado: boolean; children: React.ReactNode }) {
  const Icone = enviado ? Check : AlertCircle
  return (
    <span className={`${ETIQUETA} ${enviado ? 'border-success/45 bg-success/10 text-success' : 'border-dashed border-warning/60 bg-warning/10 text-warning'}`}>
      <Icone aria-hidden /> {children}
    </span>
  )
}

type Envio = ReturnType<typeof useEnvioHolerite>

function Acoes({ envio, tipo, holerite, pessoa, className }: {
  envio: Envio
  tipo: (typeof TIPOS_HOLERITE)[number]
  holerite: HoleriteRow | undefined
  pessoa: string
  className: string
}) {
  const ocupado = envio.ocupado(tipo.valor)
  if (!holerite) {
    return (
      <div className={className}>
        <Button variant="outline" className={`${ALVO} col-span-full border-primary text-primary-text`} disabled={ocupado}
          onClick={() => envio.escolherArquivo(tipo.valor, false)}>
          <Upload aria-hidden /> {ocupado ? 'Enviando…' : 'Enviar PDF'}
        </Button>
      </div>
    )
  }
  return (
    <div className={className}>
      <Button variant="outline" className={ALVO} disabled={ocupado} onClick={() => envio.abrir(holerite)}>
        <ExternalLink aria-hidden /> Abrir
      </Button>
      <Button variant="outline" className={ALVO} disabled={ocupado} onClick={() => envio.escolherArquivo(tipo.valor, true)}>
        <Upload aria-hidden /> {ocupado ? 'Enviando…' : 'Substituir'}
      </Button>
      <Button variant="outline" className={`${ALVO} w-11 px-0 text-muted-foreground hover:text-destructive @[960px]/folha:w-9`} disabled={ocupado}
        aria-label={`Remover holerite de ${tipo.nome.toLowerCase()} de ${pessoa}`} onClick={() => envio.remover(holerite)}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

function LinhaPessoa({ funcionario: f, mes, holeritesDaPessoa }: {
  funcionario: FuncionarioHolerite
  mes: string
  holeritesDaPessoa: HoleriteRow[]
}) {
  const [aberta, setAberta] = useState(false)
  const envio = useEnvioHolerite(f.id, mes)
  const doTipo = (valor: string) => holeritesDaPessoa.find(h => h.tipo === valor)
  const dica = (h?: HoleriteRow) => (h ? `${h.arquivoNome}. ${descricaoEnvio(h)}` : undefined)

  return (
    <div role="row" className={`grid ${COLUNAS} items-center border-t @[960px]/folha:min-h-[4.5rem] ${aberta ? 'bg-muted' : 'hover:bg-muted'}`}
      onClick={e => { if (!(e.target as HTMLElement).closest('button, a, input')) setAberta(v => !v) }}>
      <div role="cell" className="min-w-0 px-4 py-3">
        <p data-nome className="font-medium">{f.nome}</p>
        <input ref={envio.inputRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => { const arquivo = e.target.files?.[0]; if (arquivo) void envio.enviar(arquivo) }} />
        <p className="text-xs text-muted-foreground">{rotuloDoPapel({ papel: f.papel })} · {f.lojaNome}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 @[680px]/folha:hidden">
          {TIPOS_HOLERITE.map(t => (
            <Etiqueta key={t.valor} enviado={!!doTipo(t.valor)}>
              {t.curto}<span className="sr-only">{doTipo(t.valor) ? ' enviado' : ' falta enviar'}</span>
            </Etiqueta>
          ))}
        </div>
      </div>
      {TIPOS_HOLERITE.map(t => (
        <div key={t.valor} role="cell" className="hidden items-center gap-2.5 py-3 @[680px]/folha:flex">
          <span className="w-[7.5rem] shrink-0" title={dica(doTipo(t.valor))}>
            <Etiqueta enviado={!!doTipo(t.valor)}>{doTipo(t.valor) ? rotuloEnviado(doTipo(t.valor)!.enviadoEm) : 'Falta enviar'}</Etiqueta>
          </span>
          <Acoes envio={envio} tipo={t} holerite={doTipo(t.valor)} pessoa={f.nome} className="hidden gap-1.5 @[960px]/folha:flex" />
        </div>
      ))}
      <div role="cell" className="@[960px]/folha:hidden">
        <button type="button" aria-expanded={aberta} aria-label={`Ver detalhes de ${f.nome}`} onClick={() => setAberta(v => !v)}
          className="flex size-11 items-center justify-center text-muted-foreground">
          <ChevronDown aria-hidden className={aberta ? 'rotate-180' : ''} />
        </button>
      </div>
      {aberta && (
        <div className="col-span-full grid gap-2 px-4 pb-3 @[680px]/folha:grid-cols-2 @[960px]/folha:hidden">
          {TIPOS_HOLERITE.map(t => (
            <section key={t.valor} className="rounded-lg border bg-card p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{t.nome}</h3>
                <Etiqueta enviado={!!doTipo(t.valor)}>{doTipo(t.valor) ? rotuloEnviado(doTipo(t.valor)!.enviadoEm) : 'Falta enviar'}</Etiqueta>
              </div>
              <p className="mb-2.5 text-[13px] text-muted-foreground">
                {doTipo(t.valor) ? descricaoEnvio(doTipo(t.valor)!) : 'O PDF deste mês ainda não foi enviado.'}
              </p>
              <Acoes envio={envio} tipo={t} holerite={doTipo(t.valor)} pessoa={f.nome} className="grid grid-cols-[1fr_1fr_2.75rem] gap-2" />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export function HoleritesTable({ funcionarios, holerites, mes }: {
  funcionarios: FuncionarioHolerite[]
  holerites: HoleriteRow[]
  mes: string
}) {
  const [soFalta, setSoFalta] = useState(false)
  const resumo = resumirEnvios(funcionarios, holerites)
  const visiveis = soFalta ? funcionarios.filter(f => resumo.pessoasComFalta.includes(f.id)) : funcionarios

  return (
    <div className="space-y-3">
      <section aria-label="Envio dos holerites" className="grid gap-3 rounded-lg border bg-card px-4 py-3.5 @[680px]/folha:grid-cols-[1fr_auto] @[680px]/folha:items-center @[680px]/folha:gap-6">
        <div className="@[680px]/folha:max-w-[30rem]">
          <p role="status" className="text-[15px]">
            <b className="text-xl tabular-nums">{resumo.enviados} de {resumo.esperados}</b> enviados em {rotuloMes(mes)}
          </p>
          <div role="progressbar" aria-label="Holerites enviados" aria-valuemin={0} aria-valuemax={resumo.esperados}
            aria-valuenow={resumo.enviados} className="my-2 h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-success" style={{ width: `${resumo.porcentagem}%` }} />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {resumo.porTipo.map(t => (
              <li key={t.valor}>{t.nome}: <b className="tabular-nums text-foreground">{t.enviados} de {funcionarios.length}</b></li>
            ))}
          </ul>
        </div>
        <Button variant="outline" aria-pressed={soFalta} onClick={() => setSoFalta(v => !v)}
          className={`${ALVO} w-full @[680px]/folha:w-auto ${soFalta ? 'border-primary bg-primary-soft font-semibold text-primary-text' : ''}`}>
          <Filter aria-hidden /> Só o que falta{' '}
          <span className="min-w-[22px] rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning">{resumo.pessoasComFalta.length}</span>
        </Button>
      </section>

      <p className="max-w-[72ch] text-sm text-muted-foreground">
        PDFs que a contabilidade manda todo mês. O link para abrir vale 10 minutos. Enviar de novo troca o arquivo daquele mês.
      </p>

      <div role="table" aria-label="Holerites por funcionário" className="overflow-hidden rounded-lg border bg-card">
        <div role="row" className={`hidden ${COLUNAS} bg-muted py-2 text-xs font-medium text-muted-foreground @[680px]/folha:grid`}>
          <div role="columnheader" className="px-4">Funcionário</div>
          {TIPOS_HOLERITE.map(t => <div key={t.valor} role="columnheader">{t.nome}</div>)}
          <div role="columnheader" className="sr-only @[960px]/folha:hidden">Detalhes</div>
        </div>
        {visiveis.map(f => (
          <LinhaPessoa key={f.id} funcionario={f} mes={mes} holeritesDaPessoa={holerites.filter(h => h.usuarioId === f.id)} />
        ))}
        {visiveis.length === 0 && (
          <p className="border-t py-6 text-center text-sm text-muted-foreground">
            {funcionarios.length === 0 ? 'Nenhum funcionário ativo neste recorte.' : 'Ninguém com envio pendente neste mês.'}
          </p>
        )}
      </div>
    </div>
  )
}
