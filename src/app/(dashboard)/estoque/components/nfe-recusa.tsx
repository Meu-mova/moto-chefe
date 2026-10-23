'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarCpfCnpj, tipoPessoaDoDocumento } from '@/lib/documento'
import { fraseDaRecusa, telaDaRecusa, type GrupoCorrecao } from '@/lib/notagateway/recusa'
import type { CorrecaoNf } from '@/lib/notagateway/correcao'
import type { NotaResumo, PreviaNfe } from '../../vendas/nfe-propria-actions'

type Previa = Extract<PreviaNfe, { ok: true }>
type Comprador = NonNullable<CorrecaoNf['comprador']>

type Props = {
  nota: NotaResumo
  previa: Previa
  pending: boolean
  /** Erro da última correção (o envio em si volta como outro resultado). */
  erro: string | null
  onSalvarEReenviar: (c: CorrecaoNf) => void
  /** Volta à conferência para emitir de novo, sem correção aqui. */
  onEmitirDeNovo: () => void
  onVoltar: () => void
}

/**
 * Tela da nota recusada (#347). Um só padrão de texto: título simples, "Por quê?",
 * "E o número N?", "O que fazer" quando couber, e o código só em "Detalhes técnicos".
 * A correção grava no cadastro de origem e a nota é remontada dele.
 */
export function NfeRecusa({ nota, previa, pending, erro, onSalvarEReenviar, onEmitirDeNovo, onVoltar }: Props) {
  const tela = telaDaRecusa(nota)
  const bloqueada = tela.tipo === 'denegada_cliente' || tela.tipo === 'denegada_empresa' || tela.tipo === 'denegada'
  const n = nota.numero
  const porque = fraseDaRecusa(nota.motivoStatus) ?? nota.motivoStatus ?? 'A SEFAZ não informou o motivo.'

  const [comprador, setComprador] = useState<Comprador>(() => ({ ...previa.correcao.comprador }))
  const [moto, setMoto] = useState(previa.correcao.moto)
  const [abertos, setAbertos] = useState<GrupoCorrecao[]>(tela.tipo === 'corrigir' ? tela.abertos : [])
  const [ie, setIe] = useState({
    indicador: previa.correcao.comprador.clienteIndicadorIe ?? '',
    numero: previa.correcao.comprador.clienteInscricaoEstadual ?? '',
  })

  const apontados = tela.tipo === 'corrigir' ? tela.abertos : []
  // Moto sem ficha não se corrige aqui: a ficha nasce na conferência.
  const correcao = (): CorrecaoNf => ({
    comprador,
    ...(previa.ficha ? { moto } : {}),
  })
  const correcaoIe = (): CorrecaoNf => ({
    ieComprador: { clienteIndicadorIe: ie.indicador || null, clienteInscricaoEstadual: ie.indicador === 'contribuinte' ? ie.numero : null },
  })

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <span className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-bold',
          bloqueada ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive',
        )}>!</span>
        <div>
          <p className="text-lg font-semibold">{bloqueada ? 'A SEFAZ bloqueou esta nota' : 'A SEFAZ recusou esta nota'}</p>
          <p className="text-sm text-muted-foreground">{n ? `Nota nº ${n} · ` : ''}venda nº {previa.vendaNumero}</p>
        </div>
      </div>

      <div className={cn('space-y-2 rounded-lg px-3.5 py-3 text-sm leading-relaxed', bloqueada ? 'bg-warning/10' : 'bg-destructive/10')}>
        <p><b>Por quê?</b> {porque}</p>
        {n && (
          <p>
            <b>E o número {n}?</b>{' '}
            {bloqueada
              ? 'Fica bloqueado e não volta. A nova nota sai com outro número. Isso é normal.'
              : tela.tipo === 'corrigir'
                ? `Continua o mesmo. Corrija abaixo e reenvie: a nota sai de novo com o nº ${n}.`
                : `Continua o mesmo. Depois da correção, a nota sai de novo com o nº ${n}.`}
          </p>
        )}
      </div>

      {tela.tipo === 'corrigir' && (
        <>
          <Grupo
            titulo="Cliente"
            resumo={`${comprador.clienteNome} · ${formatarCpfCnpj(comprador.clienteCpf)}`}
            apontado={apontados.includes('comprador')}
            aberto={abertos.includes('comprador')}
            onAbrir={() => setAbertos(a => [...a, 'comprador'])}
          >
            <CamposComprador valor={comprador} onChange={patch => setComprador(prev => ({ ...prev, ...patch }))} />
          </Grupo>
          {previa.ficha && (
            <Grupo
              titulo="Moto"
              resumo={`NCM ${moto.ncm || 'vazio'} · CEST ${moto.cest || 'vazio'}`}
              apontado={apontados.includes('moto')}
              aberto={abertos.includes('moto')}
              onAbrir={() => setAbertos(a => [...a, 'moto'])}
            >
              <Campo id="corr-ncm" rotulo="NCM" valor={moto.ncm} onChange={v => setMoto(m => ({ ...m, ncm: v }))} inputMode="numeric" />
              <Campo id="corr-cest" rotulo="CEST" valor={moto.cest} onChange={v => setMoto(m => ({ ...m, cest: v }))} inputMode="numeric" />
            </Grupo>
          )}
          {tela.empresa && <OQueFazerEmpresa podeConfigurar={previa.podeConfigurarFiscal} />}
          <p className="border-l-2 border-border pl-2.5 text-sm text-muted-foreground">
            Salvar corrige também a venda nº {previa.vendaNumero}{previa.ficha ? ' e a ficha fiscal da moto' : ''}.
          </p>
        </>
      )}

      {tela.tipo === 'empresa' && <OQueFazerEmpresa podeConfigurar={previa.podeConfigurarFiscal} />}

      {tela.tipo === 'denegada_cliente' && (
        <IeDoCliente comprador={comprador} ie={ie} onChange={setIe} />
      )}

      {tela.tipo === 'denegada_empresa' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">O que fazer</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Consulte a Inscrição Estadual da empresa no SINTEGRA.</li>
            <li>Regularize com a SEFAZ (em geral, pelo contador).</li>
            {previa.podeConfigurarFiscal
              ? <li>Confira a configuração em <Link href="/admin/notas-fiscais" className="text-primary-text underline">Admin › Notas fiscais</Link>.</li>
              : <li>Peça a um Admin Geral ou Sócio para conferir a configuração fiscal.</li>}
            <li>Depois, volte aqui e emita a nova nota.</li>
          </ol>
        </div>
      )}

      {erro && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Detalhes técnicos</summary>
        <p className="mt-1 whitespace-pre-line">{nota.motivoStatus ?? 'Sem motivo informado.'}</p>
      </details>

      <div className="space-y-2">
        {tela.tipo === 'corrigir' && (
          <>
            <Button onClick={() => onSalvarEReenviar(correcao())} disabled={pending} className="h-11 w-full">Salvar e reenviar{n ? ` nº ${n}` : ''}</Button>
            <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
          </>
        )}
        {tela.tipo === 'denegada_cliente' && (
          <>
            <Button onClick={() => onSalvarEReenviar(correcaoIe())} disabled={pending || !ie.indicador} className="h-11 w-full">Salvar e emitir a nova nota</Button>
            <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
          </>
        )}
        {(tela.tipo === 'empresa' || tela.tipo === 'denegada_empresa' || tela.tipo === 'denegada') && (
          <>
            <Button onClick={onEmitirDeNovo} disabled={pending} className="h-11 w-full">
              {tela.tipo === 'empresa' ? `Reenviar${n ? ` nº ${n}` : ''}` : 'Emitir a nova nota'}
            </Button>
            <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
          </>
        )}
      </div>
    </div>
  )
}

function Grupo({ titulo, resumo, apontado, aberto, onAbrir, children }: {
  titulo: string; resumo: string; apontado: boolean; aberto: boolean; onAbrir: () => void; children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-lg border', apontado ? 'border-primary' : 'border-border')}>
      {aberto ? (
        <>
          <p className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold">
            {titulo}
            {apontado && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary-text">Corrigir aqui</span>}
          </p>
          <div className="grid grid-cols-2 gap-2.5 px-3 pb-3">{children}</div>
        </>
      ) : (
        <button type="button" onClick={onAbrir} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm">
          <span className="font-semibold">{titulo}</span>
          <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{resumo}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

function Campo({ id, rotulo, valor, onChange, inteiro, inputMode }: {
  id: string; rotulo: string; valor: string | null | undefined; onChange: (v: string) => void
  inteiro?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  return (
    <div className={cn('space-y-1', inteiro && 'col-span-2')}>
      <Label htmlFor={id} className="text-muted-foreground">{rotulo}</Label>
      <Input id={id} value={valor ?? ''} onChange={e => onChange(e.target.value)} inputMode={inputMode} className="h-10" />
    </div>
  )
}

function CamposComprador({ valor: v, onChange }: { valor: Comprador; onChange: (patch: Partial<Comprador>) => void }) {
  const juridica = tipoPessoaDoDocumento(v.clienteCpf) === 'juridica'
  return (
    <>
      <Campo id="corr-doc" rotulo="CPF ou CNPJ" valor={v.clienteCpf} onChange={x => onChange({ clienteCpf: x })} inteiro inputMode="numeric" />
      <Campo id="corr-nome" rotulo="Nome" valor={v.clienteNome} onChange={x => onChange({ clienteNome: x })} inteiro />
      <Campo id="corr-cep" rotulo="CEP" valor={v.clienteCep} onChange={x => onChange({ clienteCep: x })} inputMode="numeric" />
      <Campo id="corr-numero" rotulo="Número" valor={v.clienteNumero} onChange={x => onChange({ clienteNumero: x })} />
      <Campo id="corr-rua" rotulo="Rua" valor={v.clienteLogradouro} onChange={x => onChange({ clienteLogradouro: x })} inteiro />
      <Campo id="corr-bairro" rotulo="Bairro" valor={v.clienteBairro} onChange={x => onChange({ clienteBairro: x })} />
      <Campo id="corr-complemento" rotulo="Complemento" valor={v.clienteComplemento} onChange={x => onChange({ clienteComplemento: x })} />
      <Campo id="corr-cidade" rotulo="Cidade" valor={v.clienteCidade} onChange={x => onChange({ clienteCidade: x })} />
      <Campo id="corr-uf" rotulo="UF" valor={v.clienteEstado} onChange={x => onChange({ clienteEstado: x.toUpperCase().slice(0, 2) })} />
      {juridica && (
        <>
          <div className="space-y-1">
            <Label htmlFor="corr-ind-ie" className="text-muted-foreground">Inscrição Estadual</Label>
            {/* <select> nativo: o Select do design system mostra o valor cru quando difere do texto. */}
            <select
              id="corr-ind-ie"
              value={v.clienteIndicadorIe ?? 'nao_contribuinte'}
              onChange={e => onChange({ clienteIndicadorIe: e.target.value })}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="contribuinte">Tem</option>
              <option value="nao_contribuinte">Não tem</option>
              <option value="isento">É isento</option>
            </select>
          </div>
          {v.clienteIndicadorIe === 'contribuinte' && (
            <Campo id="corr-ie" rotulo="Número da IE" valor={v.clienteInscricaoEstadual} onChange={x => onChange({ clienteInscricaoEstadual: x })} inputMode="numeric" />
          )}
        </>
      )}
    </>
  )
}

function IeDoCliente({ comprador, ie, onChange }: {
  comprador: Comprador
  ie: { indicador: string; numero: string }
  onChange: (ie: { indicador: string; numero: string }) => void
}) {
  const opcoes: [string, string, string | null][] = [
    ['contribuinte', 'Sim', 'Informe a inscrição correta abaixo'],
    ['nao_contribuinte', 'Não tem', 'Cliente consumidor final'],
    ['isento', 'É isento', null],
  ]
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border px-3 py-2.5">
        <p className="text-sm font-semibold">{comprador.clienteNome}</p>
        <p className="text-sm text-muted-foreground">CNPJ {formatarCpfCnpj(comprador.clienteCpf)}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">O cliente tem Inscrição Estadual?</legend>
        {opcoes.map(([valor, rotulo, dica]) => (
          <label
            key={valor}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
              ie.indicador === valor ? 'border-primary bg-primary/10' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="corr-ie-indicador"
              value={valor}
              checked={ie.indicador === valor}
              onChange={() => onChange({ ...ie, indicador: valor })}
              className="size-4 accent-primary"
            />
            <span>{rotulo}{dica && <span className="block text-xs text-muted-foreground">{dica}</span>}</span>
          </label>
        ))}
      </fieldset>
      {ie.indicador === 'contribuinte' && (
        <div className="space-y-1">
          <Label htmlFor="corr-ie-numero" className="text-muted-foreground">Inscrição Estadual</Label>
          <Input id="corr-ie-numero" value={ie.numero} onChange={e => onChange({ ...ie, numero: e.target.value })} inputMode="numeric" className="h-10" />
          <p className="text-xs text-muted-foreground">Confira com o cliente antes de salvar.</p>
        </div>
      )}
    </div>
  )
}

function OQueFazerEmpresa({ podeConfigurar }: { podeConfigurar: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">O que fazer</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {podeConfigurar ? (
          <li>Corrija em <Link href="/admin/notas-fiscais" className="text-primary-text underline">Admin › Notas fiscais</Link> (configuração fiscal do grupo).</li>
        ) : (
          <>
            <li>Isso se corrige na configuração fiscal da empresa, não na venda.</li>
            <li>Peça a um Admin Geral ou Sócio para corrigir.</li>
          </>
        )}
        <li>Depois, volte aqui e reenvie.</li>
      </ol>
    </div>
  )
}
