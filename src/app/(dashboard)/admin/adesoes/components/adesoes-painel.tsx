'use client'
import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarCpfCnpj } from '@/lib/documento'
import { formatarNumeroBR } from '@/lib/numero-br'
import { precoSugerido } from '@/lib/mova-empresa'
import { mensagemRecusa } from '@/lib/adesao-recusa'
import {
  CAMPOS_CONTRATO, ROTULO_STATUS_ADESAO, ROTULO_SITUACAO_CONTRATO, camposFaltando, situacaoContrato,
  type CampoContrato, type StatusAdesao, type SituacaoContrato,
} from '@/lib/adesao-campos'
import {
  salvarDadosContratoAction, recusarAdesaoAction, linkCartaoCnpjAction, enviarContratoAction, vincularGrupoAction,
  type AdesaoLinha, type GrupoOpcao,
} from '../actions'
import { AtivacaoAcessos, AtivacaoLoja, useAtivacao } from './ativar-cliente'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EnderecoSedeCampos } from './endereco-sede-campos'
import { NotaGatewayBloco } from './nota-gateway-bloco'
import { deEnderecoGravado, limparEnderecoSede, montarEnderecoSede, type EnderecoSede } from '@/lib/endereco-sede'

const CLASSE_STATUS: Record<StatusAdesao, string> = {
  pendente: 'border-warning text-warning',
  dados_completos: 'border-primary text-primary-text',
  recusada: 'border-destructive text-destructive',
  processada: 'border-border text-muted-foreground',
}

const CLASSE_SITUACAO: Record<SituacaoContrato, string> = {
  enviado: 'border-primary text-primary-text',
  nao_entregue: 'border-destructive text-destructive',
  visualizado: 'border-primary text-primary-text',
  assinado: 'border-primary bg-primary-soft text-primary-text',
  expirado: 'border-warning text-warning',
}

/** Com contrato enviado, a situação dele diz mais que "Dados completos". */
function StatusBadge({ adesao: a }: { adesao: AdesaoLinha }) {
  const situacao = a.status === 'dados_completos' ? situacaoContrato(a.contrato, new Date()) : null
  if (situacao) return <Badge variant="outline" className={CLASSE_SITUACAO[situacao]}>{ROTULO_SITUACAO_CONTRATO[situacao]}</Badge>
  return <Badge variant="outline" className={CLASSE_STATUS[a.status]}>{ROTULO_STATUS_ADESAO[a.status]}</Badge>
}

const data = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function resumoContrato(a: AdesaoLinha): string {
  if (a.status === 'recusada' || a.status === 'processada') return '—'
  const faltam = camposFaltando(a).length
  return faltam ? `faltam ${faltam}` : 'completo'
}

export function AdesoesPainel({ adesoes, grupos, envioTravado }: { adesoes: AdesaoLinha[]; grupos: GrupoOpcao[]; envioTravado: boolean }) {
  const [selId, setSelId] = useState<string | null>(null)
  const sel = adesoes.find(a => a.id === selId) ?? null

  return (
    <div className="space-y-4">
      <div className={sel ? 'hidden lg:block' : ''}>
        <h1 className="text-2xl font-bold">Adesões</h1>
        <p className="text-muted-foreground text-sm">Lojistas que pediram para aderir ao MOVA pelo /adesao</p>
      </div>

      <div className={`grid gap-4 ${sel ? 'lg:grid-cols-[1fr_1.2fr]' : ''}`}>
        <div className={sel ? 'hidden lg:block' : ''}>
          {adesoes.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhuma adesão recebida ainda.</p>
            : <Lista adesoes={adesoes} selId={selId} onAbrir={setSelId} />}
        </div>
        {/* key: trocar de adesão remonta o painel e zera o formulário. */}
        {sel && <Detalhe key={sel.id} adesao={sel} grupos={grupos} envioTravado={envioTravado} onFechar={() => setSelId(null)} />}
      </div>
    </div>
  )
}

function Lista({ adesoes, selId, onAbrir }: { adesoes: AdesaoLinha[]; selId: string | null; onAbrir: (id: string) => void }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {adesoes.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAbrir(a.id)}
            className={`w-full text-left rounded-lg border bg-card p-3 hover:bg-muted ${a.id === selId ? 'bg-muted' : ''}`}
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium text-sm">{a.loja}</span>
              <StatusBadge adesao={a} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {a.responsavel} · {data(a.criadoEm)} · {resumoContrato(a)}
            </div>
          </button>
        ))}
      </div>
      <div className="hidden md:block bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Recebida</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adesoes.map(a => (
              <TableRow
                key={a.id}
                onClick={() => onAbrir(a.id)}
                className={`cursor-pointer ${a.id === selId ? 'bg-muted' : ''}`}
              >
                <TableCell className="font-medium">{a.loja}</TableCell>
                <TableCell>{a.responsavel}</TableCell>
                <TableCell>{data(a.criadoEm)}</TableCell>
                <TableCell className="text-muted-foreground">{resumoContrato(a)}</TableCell>
                <TableCell><StatusBadge adesao={a} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function precoFormatado(franqueado: boolean) {
  const p = precoSugerido(franqueado)
  return { taxaImplantacao: formatarNumeroBR(p.implantacao), valorMensal: formatarNumeroBR(p.mensalidade) }
}

function valoresIniciais(a: AdesaoLinha): Record<CampoContrato, string> {
  return {
    razaoSocial: a.razaoSocial ?? '',
    cnpj: formatarCpfCnpj(a.cnpj),
    enderecoSede: a.enderecoSede ?? '',
    email: a.email ?? '',
    responsavelCpf: formatarCpfCnpj(a.responsavelCpf),
    // Adesão sem valor gravado já abre com o preço da tabela, editável.
    taxaImplantacao: a.taxaImplantacao ? formatarNumeroBR(a.taxaImplantacao) : precoFormatado(a.franqueadoMotochefe).taxaImplantacao,
    valorMensal: a.valorMensal ? formatarNumeroBR(a.valorMensal) : precoFormatado(a.franqueadoMotochefe).valorMensal,
  }
}

type Aba = 'contrato' | 'grupo' | 'acessos' | 'ng'

const sedeInicial = (a: AdesaoLinha): EnderecoSede => deEnderecoGravado(a.sede)

function Detalhe({ adesao: a, grupos, envioTravado, onFechar }: { adesao: AdesaoLinha; grupos: GrupoOpcao[]; envioTravado: boolean; onFechar: () => void }) {
  const [valores, setValores] = useState(() => valoresIniciais(a))
  const [sede, setSede] = useState(() => sedeInicial(a))

  const [franqueado, setFranqueado] = useState(a.franqueadoMotochefe)
  const [erros, setErros] = useState<Partial<Record<CampoContrato, string>>>({})
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendente, iniciar] = useTransition()
  // Recusada ou processada não se edita mais por esta tela.
  const travada = a.status === 'recusada' || a.status === 'processada'
  // Mesma regra do servidor: campos incompletos não tiram a linha que já vale.
  const faltam = camposFaltando({ ...valores, enderecoSede: montarEnderecoSede(limparEnderecoSede(sede)) ?? valores.enderecoSede })
  const situacao = situacaoContrato(a.contrato, new Date())
  // O contrato sai do que está gravado: com edição não salva, o lojista
  // receberia valores diferentes dos que estão na tela.
  const alterado = JSON.stringify(valores) !== JSON.stringify(valoresIniciais(a)) || franqueado !== a.franqueadoMotochefe
    || JSON.stringify(sede) !== JSON.stringify(sedeInicial(a))

  function salvar() {
    iniciar(async () => {
      const r = await salvarDadosContratoAction(a.id, { ...valores, franqueadoMotochefe: franqueado, sede })
      if (!r.ok) {
        setErros(r.erros ?? {})
        toast.error(r.erro ?? 'Corrija os campos marcados')
        return
      }
      setErros({})
      toast.success(r.status === 'dados_completos' ? 'Dados completos para o contrato' : 'Dados salvos')
    })
  }

  function recusar() {
    iniciar(async () => {
      const r = await recusarAdesaoAction(a.id, motivo)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(`Recusa registrada. Avise ${a.responsavel}: ${a.celular}`)
      setRecusando(false)
    })
  }

  function enviarContrato() {
    if (situacao === 'enviado' || situacao === 'nao_entregue' || situacao === 'visualizado') {
      if (!window.confirm('Já existe um contrato enviado. Reenviar cancela o link anterior. Continuar?')) return
    }
    iniciar(async () => {
      const r = await enviarContratoAction(a.id)
      if (r.ok) { toast.success(`Contrato enviado para ${a.email}`); return }
      if (r.url) {
        toast.error(r.erro, { action: { label: 'Copiar link', onClick: () => { void navigator.clipboard.writeText(r.url!) } } })
        return
      }
      toast.error(r.erro)
    })
  }

  function abrirCartao() {
    iniciar(async () => {
      const r = await linkCartaoCnpjAction(a.id)
      if (r.ok) window.open(r.url, '_blank', 'noopener')
      else toast.error(r.erro)
    })
  }

  // Ativação só depois do contrato assinado e do grupo ligado; carrega ao abrir a aba.
  const ativavel = a.contrato?.status === 'assinado' && !!a.grupoId && !travada
  const ativacao = useAtivacao(a.id)
  const [aba, setAba] = useState<Aba>('contrato')
  const abaDeAtivacao = aba === 'grupo' || aba === 'acessos'
  // Também cobre o grupo ligado com a aba já aberta: a ativação fica disponível sem trocar de aba.
  const { dados: dadosAtivacao, pendente: carregandoAtivacao, carregar: carregarAtivacao } = ativacao
  useEffect(() => {
    if (abaDeAtivacao && ativavel && !dadosAtivacao && !carregandoAtivacao) carregarAtivacao()
    // Só a aba e a disponibilidade disparam: carregar muda a cada render.
  }, [abaDeAtivacao, ativavel])

  return (
    // No desktop o painel tem a altura da tela e rola por dentro, com cabeçalho e
    // botões fixos (#312); no tablet e no celular rola com a página.
    <section className="bg-card rounded-lg border min-w-0 flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)]">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onFechar} className="lg:hidden text-muted-foreground" aria-label="Voltar para a lista">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="font-semibold">{a.loja}</h2>
          <StatusBadge adesao={a} />
        </div>
        <button type="button" onClick={onFechar} className="hidden lg:block text-muted-foreground" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* O que o lojista enviou: uma faixa, não uma aba; cabe numa linha e sempre se vê. */}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 border-b bg-muted/40 px-4 py-2 text-sm break-words">
        <div className="flex gap-1"><dt className="text-muted-foreground">Responsável</dt><dd>{a.responsavel}</dd></div>
        <div className="flex gap-1"><dt className="text-muted-foreground">Celular</dt><dd>{a.celular}</dd></div>
        <div className="flex gap-1"><dt className="text-muted-foreground">Recebida</dt><dd>{data(a.criadoEm)}</dd></div>
        <div className="flex gap-1"><dt className="text-muted-foreground">Usuários</dt><dd>{a.usuarios.length}</dd></div>
        <div className="flex gap-1">
          <dt className="sr-only">Cartão CNPJ</dt>
          <dd>
            <button type="button" onClick={abrirCartao} disabled={pendente} className="text-primary-text underline">
              Cartão CNPJ
            </button>
          </dd>
        </div>
        <div className="flex gap-1"><dt className="sr-only">Certificado e senhas</dt><dd className="text-muted-foreground">A1 e senhas cifrados</dd></div>
      </dl>

      <Tabs value={aba} onValueChange={v => setAba(v as Aba)} className="flex min-h-0 flex-1 flex-col gap-0">
        {/* overflow-y-hidden tira a barra vertical que o sublinhado da aba (5px abaixo) criava; o pb devolve esse espaço. */}
        <div className="overflow-x-auto overflow-y-hidden border-b px-4 pb-[5px]">
          {/* Com a aba Nota Gateway (#588) as quatro não cabem no painel estreito: quebram em vez de rolar. */}
          <TabsList variant="line" className="flex-wrap justify-start group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="contrato">
              Contrato
              {!travada && situacao !== 'assinado' && faltam.length > 0 && <Badge variant="outline" className="border-warning text-warning">{faltam.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="grupo">Grupo e loja</TabsTrigger>
            <TabsTrigger value="acessos">Usuários e acessos</TabsTrigger>
            <TabsTrigger value="ng">Nota Gateway</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* keepMounted: trocar de aba não perde o que foi digitado. */}
          <TabsContent value="contrato" keepMounted className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={franqueado}
                disabled={travada || pendente}
                onChange={e => {
                  const marcado = e.target.checked
                  const antes = precoFormatado(!marcado)
                  const depois = precoFormatado(marcado)
                  setFranqueado(marcado)
                  // Só troca o valor que ainda é o da tabela anterior: um valor negociado
                  // à mão não some calado ao mexer na marcação.
                  setValores(prev => ({
                    ...prev,
                    taxaImplantacao: prev.taxaImplantacao === antes.taxaImplantacao ? depois.taxaImplantacao : prev.taxaImplantacao,
                    valorMensal: prev.valorMensal === antes.valorMensal ? depois.valorMensal : prev.valorMensal,
                  }))
                }}
              />
              Franqueado MotoChefe (desconto na implantação e na mensalidade)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_CONTRATO.map(c => c.chave === 'enderecoSede' ? (
                <EnderecoSedeCampos
                  key={c.chave}
                  id={a.id}
                  valor={sede}
                  onChange={patch => setSede(prev => ({ ...prev, ...patch }))}
                  disabled={travada || pendente}
                  erro={erros.enderecoSede}
                  linhaAtual={a.enderecoSede}
                />
              ) : (
                <div key={c.chave} className={'largo' in c ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
                  <Label htmlFor={`${a.id}-${c.chave}`}>{c.rotulo}</Label>
                  <Input
                    id={`${a.id}-${c.chave}`}
                    value={valores[c.chave]}
                    disabled={travada || pendente}
                    inputMode={'inputMode' in c ? c.inputMode : undefined}
                    aria-invalid={!!erros[c.chave]}
                    onChange={e => {
                      const v = e.target.value
                      setValores(prev => ({ ...prev, [c.chave]: v }))
                    }}
                  />
                  {erros[c.chave] && <p className="text-xs text-destructive">{erros[c.chave]}</p>}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="grupo" keepMounted className="space-y-4">
            <GrupoVinculado adesao={a} grupos={grupos} />
            {ativavel
              ? <AtivacaoLoja adesaoId={a.id} ativacao={ativacao} />
              : <p className="text-sm text-muted-foreground">A loja se cria depois do contrato assinado e do grupo ligado.</p>}
          </TabsContent>

          <TabsContent value="acessos" keepMounted>
            {ativavel
              ? <AtivacaoAcessos adesaoId={a.id} ativacao={ativacao} />
              : <p className="text-sm text-muted-foreground">Usuários, certificado e portal se aplicam depois do contrato assinado e do grupo ligado.</p>}
          </TabsContent>

          <TabsContent value="ng">
            <NotaGatewayBloco adesaoId={a.id} dados={{
              ...a,
              sedeCep: a.sede.cep, sedeLogradouro: a.sede.logradouro, sedeNumero: a.sede.numero, sedeComplemento: a.sede.complemento,
              sedeBairro: a.sede.bairro, sedeCidade: a.sede.cidade, sedeUf: a.sede.uf,
            }} />
          </TabsContent>
        </div>
      </Tabs>

      <div className="sticky bottom-0 border-t bg-card px-4 py-3 rounded-b-lg lg:static">
        {a.status === 'processada' ? (
          <p className="text-sm text-muted-foreground">Adesão já processada.</p>
        ) : a.status === 'recusada' ? (
          <p className="text-sm text-destructive">
            Recusada em {a.recusadaEm ? data(a.recusadaEm) : '—'}: {a.motivoRecusa}
            {/* 'enviado' só existe em recusas antigas, do tempo do aviso por WhatsApp. */}
            {a.avisoRecusa !== 'enviado' && <AvisoManual adesao={a} />}
          </p>
        ) : recusando ? (
          <div className="space-y-2">
            <Label htmlFor={`${a.id}-motivo`}>Motivo da recusa (o aviso ao lojista é feito por vocês)</Label>
            <Textarea id={`${a.id}-motivo`} value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={recusar} disabled={pendente || motivo.trim().length < 3}>Registrar recusa</Button>
              <Button variant="outline" onClick={() => setRecusando(false)} disabled={pendente}>Voltar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="flex-1 sm:flex-none" onClick={salvar} disabled={pendente}>Salvar dados</Button>
            <Button variant="outline" className="flex-1 border-destructive text-destructive sm:flex-none" onClick={() => setRecusando(true)} disabled={pendente}>
              Recusar…
            </Button>
            {a.status === 'dados_completos' && situacao !== 'assinado' && (
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={enviarContrato} disabled={pendente || alterado || envioTravado}>
                {situacao ? 'Reenviar contrato' : 'Enviar contrato'}
              </Button>
            )}
            <span className="w-full text-xs text-muted-foreground sm:w-auto">
              {envioTravado && a.status === 'dados_completos'
                ? 'Envio travado até os termos do contrato serem confirmados'
                : alterado && a.status === 'dados_completos'
                ? 'Salve os dados antes de enviar o contrato'
                : faltam.length ? `Faltam ${faltam.length} campo(s) para o contrato` : 'Pronto para o contrato'}
            </span>
            {a.contrato && situacao && (
              <p className="w-full text-xs text-muted-foreground">
                {situacao === 'assinado' && a.contrato.assinadoEm
                  ? `Assinado em ${data(a.contrato.assinadoEm)}`
                  : situacao === 'nao_entregue'
                    ? `O e-mail para ${a.email} falhou em ${data(a.contrato.criadoEm)}. Confira o e-mail, salve e reenvie.`
                    : `Enviado em ${data(a.contrato.criadoEm)} para ${a.email}`}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function AvisoManual({ adesao: a }: { adesao: AdesaoLinha }) {
  const texto = mensagemRecusa(a.loja, a.motivoRecusa ?? '')
  return (
    <span className="block text-warning mt-1">
      Avise {a.responsavel} ({a.celular}).{' '}
      <button
        type="button"
        className="underline"
        onClick={() => navigator.clipboard.writeText(texto).then(
          () => toast.success('Mensagem copiada'),
          () => toast.error('Não deu para copiar. Selecione o texto do motivo e copie à mão.'),
        )}
      >
        Copiar mensagem
      </button>
    </span>
  )
}

function GrupoVinculado({ adesao: a, grupos }: { adesao: AdesaoLinha; grupos: GrupoOpcao[] }) {
  const [pendente, iniciar] = useTransition()

  const assinado = a.contrato?.status === 'assinado'
  const recusada = a.status === 'recusada'
  // Inativo só aparece se já for o grupo ligado, para o select não perder o valor atual.
  const opcoes = grupos.filter(g => g.ativo || g.id === a.grupoId)

  function vincular(grupoId: string) {
    if (a.grupoId && grupoId !== a.grupoId
      && !window.confirm('Trocar ou desligar o grupo muda de onde vêm os valores das próximas mensalidades dele. Continuar?')) return
    iniciar(async () => {
      const r = await vincularGrupoAction(a.id, grupoId || null)
      if (!r.ok) { toast.error(r.erro); return }
      if (r.aviso) toast.warning(r.aviso)
      else toast.success(grupoId ? 'Grupo ligado à adesão' : 'Grupo desligado da adesão')
    })
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={`${a.id}-grupo`}>Grupo no MOVA</Label>
      {/* select nativo: o value é o id do grupo, e o Select do design system mostraria o UUID. */}
      <select
        id={`${a.id}-grupo`}
        value={a.grupoId ?? ''}
        disabled={pendente || (!a.grupoId && (!assinado || recusada))}
        onChange={e => vincular(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Ainda não criado</option>
        {opcoes.map(g => (
          <option key={g.id} value={g.id}>{g.nome} ({formatarCpfCnpj(g.cnpj)}){g.ativo ? '' : ' — inativo'}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {recusada ? 'Adesão recusada não define mensalidade.'
          : !assinado && !a.grupoId ? 'Disponível depois que o contrato for assinado.'
          : 'A mensalidade deste grupo sai dos valores desta adesão.'}
      </p>
    </div>
  )
}
