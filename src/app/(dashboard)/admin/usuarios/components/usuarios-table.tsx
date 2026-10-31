'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, Pencil, Trash2, UserPlus, Eye, EyeOff, Power, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { criarUsuarioAction, editarUsuarioAction, excluirUsuarioAction, alternarAtivoUsuarioAction, salvarGruposLiberadosAction } from '../actions'
import { ModulosPicker } from './modulos-picker'
import { CargosDialog, type Cargo } from './cargos-dialog'
import { CARGOS_VISIVEIS, cargosDoAlvo } from '@/lib/cargos-opcoes'
import type { LimitesDaTela } from '@/lib/gestao-usuarios'
import { diferencaDaFuncao } from '@/lib/modulos-picker-estado'
import { ITENS } from '@/lib/navegacao'

// O picker esconde os itens de regra própria: o resumo conta só o que ele mostra.
const IDS_MODULOS = ITENS.filter(i => !i.regraPropria).map(i => i.id)

type Loja = { id: string; nome: string }
type Grupo = { id: string; nome: string }
/** Grupo que o admin_geral pode liberar ao admin_rede, com a Conta dona ao lado. */
export type GrupoLiberavel = Grupo & { contaId: string; contaNome: string }
type Usuario = {
  id: string
  nome: string
  email: string
  papel: string
  papeisExtras: string[]
  lojaId: string | null
  lojaNome: string | null
  conecta: string | null
  gruposAprovacao: string[]
  aprovaPagamentoSensivel: boolean
  gruposAcesso: string[]
  grupoDaLojaId: string | null
  ativo: boolean
  modulosExtras: string[]
  modulosBloqueados: string[]
  cargoId: string | null
  contaId: string | null
}

type DadosForm = {
  nome: string
  email: string
  senha: string
  papel: string
  lojaId: string | null
  conecta: string | null
  gruposAprovacao: string[]
  aprovaPagamentoSensivel: boolean
  gruposAcesso: string[]
  modulosExtras: string[]
  modulosBloqueados: string[]
  cargoId: string | null
  gruposLiberados: string[]
}

// Aprovação de venda é coisa de admin — para os demais papéis o bloco nem aparece.
const PAPEIS_APROVADORES = ['admin_geral', 'admin_rede', 'admin_socio']

const PAPEIS: { value: string; label: string }[] = [
  { value: 'admin_geral',  label: 'Admin Geral' },
  { value: 'admin_rede',   label: 'Admin de Rede' },
  { value: 'admin_socio',  label: 'Admin Sócio' },
  { value: 'aux_adm',      label: 'Aux. Administrativo' },
  { value: 'vendedor',     label: 'Vendedor' },
  { value: 'mecanico',     label: 'Mecânico' },
  { value: 'motorista',    label: 'Motorista' },
  { value: 'cargo',        label: 'Cargo da Conta' },
]

type Limites = LimitesDaTela

const PAPEL_CORES: Record<string, string> = {
  admin_geral: 'bg-info/15 text-info border-info/30',
  admin_rede:  'bg-info/15 text-info border-info/30',
  admin_socio: 'bg-info/15 text-info border-info/30',
  aux_adm:     'bg-warning/15 text-warning border-warning/30',
  vendedor:    'bg-success/15 text-success border-success/30',
  mecanico:    'bg-muted text-foreground border-border',
  motorista:   'bg-info/15 text-info border-info/30',
  cargo:       'bg-muted text-foreground border-border',
}

function SenhaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <div className="relative">
      <Input
        type={mostrar ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setMostrar(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function FormUsuario({
  inicial,
  lojas,
  grupos,
  onSubmit,
  onCancel,
  isEdit,
  limites,
  cargos: todosCargos,
  contaAtiva,
  liberaveis,
  liberadosIniciais,
}: {
  /** null: quem edita não é admin_geral e não libera grupos de outras Contas. */
  liberaveis: GrupoLiberavel[] | null
  liberadosIniciais: string[]
  inicial?: Partial<Usuario>
  cargos: Cargo[]
  contaAtiva: string
  lojas: Loja[]
  grupos: Grupo[]
  limites: Limites
  onSubmit: (dados: DadosForm) => void
  onCancel: () => void
  isEdit: boolean
}) {
  const [nome,    setNome]    = useState(inicial?.nome    ?? '')
  const [email,   setEmail]   = useState(inicial?.email   ?? '')
  const [senha,   setSenha]   = useState('')
  const [papel,   setPapel]   = useState(inicial?.papel   ?? '')
  // Sem loja o servidor só aceita admin_geral e sócio com grupos de acesso (recusaDaGravacao).
  const rotuloSemLoja = papel === 'admin_socio' || papel === 'admin_rede' ? 'Sem loja (vê pelos grupos de acesso)'
    : !limites.papeis.includes('admin_geral') ? null
    : papel === 'admin_geral' ? 'Sem loja (Admin Geral)' : 'Sem loja'
  const [lojaId,  setLojaId]  = useState(inicial?.lojaId  ?? '')
  const [conecta, setConecta] = useState(inicial?.conecta ?? '')
  const [gruposAprov, setGruposAprov] = useState<string[]>(inicial?.gruposAprovacao ?? [])
  const [aprovaSensivel, setAprovaSensivel] = useState(inicial?.aprovaPagamentoSensivel ?? false)
  const [gruposAcesso, setGruposAcesso] = useState<string[]>(inicial?.gruposAcesso ?? [])
  const [modulosExtras, setModulosExtras] = useState<string[]>(inicial?.modulosExtras ?? [])
  const [modulosBloqueados, setModulosBloqueados] = useState<string[]>(inicial?.modulosBloqueados ?? [])
  const [cargoId, setCargoId] = useState(inicial?.cargoId ?? '')
  const [gruposLiberados, setGruposLiberados] = useState<string[]>(liberadosIniciais)
  const cargos = cargosDoAlvo(todosCargos, inicial?.contaId ?? null, contaAtiva)
  const diferenca = diferencaDaFuncao(papel, inicial?.papeisExtras ?? [], modulosExtras, modulosBloqueados, IDS_MODULOS)
  // Recolhido: a lista tem ~60 itens e quase sempre fica como a função define. Quem
  // já tem diferença salva abre aberto, para o ajuste não ficar escondido.
  const [verModulos, setVerModulos] = useState(() => diferenca.liberados + diferenca.bloqueados > 0)

  const mostrarAprovacao = PAPEIS_APROVADORES.includes(papel)
  // admin_geral já enxerga todos os grupos pelo papel — mostrar a lista para
  // ele sugeriria, errado, que ela é que manda. Só admin_socio usa isto.
  const mostrarAcessoGrupos = papel === 'admin_socio' || papel === 'admin_rede'
  // Grupos da Conta do próprio usuário vão pelos grupos de acesso acima (ADR-0019).
  const outrasContas = (liberaveis ?? []).filter(g => g.contaId !== inicial?.contaId)
  const mostrarLiberados = papel === 'admin_rede' && liberaveis !== null

  function toggleLiberado(id: string) {
    setGruposLiberados(atual => atual.includes(id) ? atual.filter(g => g !== id) : [...atual, id])
  }

  function toggleGrupo(id: string) {
    setGruposAprov(atual => atual.includes(id) ? atual.filter(g => g !== id) : [...atual, id])
  }

  function toggleGrupoAcesso(id: string) {
    setGruposAcesso(atual => atual.includes(id) ? atual.filter(g => g !== id) : [...atual, id])
  }

  function handleSubmit() {
    if (!nome.trim())  { toast.error('Informe o nome');  return }
    if (!email.trim()) { toast.error('Informe o e-mail'); return }
    if (!papel)        { toast.error('Selecione a função'); return }
    if (papel === 'cargo' && !cargoId) { toast.error('Selecione o cargo'); return }
    if (!isEdit && !senha.trim()) { toast.error('Informe a senha'); return }
    onSubmit({
      nome: nome.trim(),
      email: email.trim(),
      senha,
      papel,
      lojaId: lojaId || null,
      conecta: conecta.trim() || null,
      gruposAprovacao: mostrarAprovacao ? gruposAprov : [],
      aprovaPagamentoSensivel: mostrarAprovacao && aprovaSensivel,
      gruposAcesso: mostrarAcessoGrupos ? gruposAcesso : [],
      modulosExtras,
      modulosBloqueados,
      cargoId: papel === 'cargo' ? cargoId : null,
      gruposLiberados: mostrarLiberados ? gruposLiberados : [],
    })
  }

  return (
    // Rolagem só no meio: o diálogo não pode passar da altura da tela (#235).
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome completo</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João da Silva" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>{isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</Label>
            <SenhaInput value={senha} onChange={setSenha} placeholder={isEdit ? 'Nova senha' : 'Mínimo 6 caracteres'} />
          </div>
          <div className="space-y-1.5">
            <Label>Função</Label>
            <Select value={papel} onValueChange={v => { if (v) setPapel(v) }} disabled={inicial?.id === limites.meuId && limites.travaASiMesmo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a função">
                  {(v: string | null) => v ? (PAPEIS.find(p => p.value === v)?.label ?? v) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {/* O papel atual sempre na lista: sem item para o valor, o Select mostraria o valor cru. */}
                {PAPEIS.filter(p => limites.papeis.includes(p.value) || p.value === inicial?.papel).map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {papel === 'cargo' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cargo-usuario">Cargo</Label>
              {/* select nativo: o Select do design system mostraria o UUID cru. */}
              <select id="cargo-usuario" value={cargoId} onChange={e => setCargoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{cargos.length ? 'Selecione o cargo' : 'Crie um cargo no botão Cargos'}</option>
                {cargos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Loja</Label>
            <Select value={lojaId ?? ''} onValueChange={v => setLojaId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={rotuloSemLoja ?? 'Escolha a loja'}>
                  {(v: string | null) => v ? (lojas.find(l => l.id === v)?.nome ?? v) : (rotuloSemLoja ?? 'Escolha a loja')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rotuloSemLoja && <SelectItem value="">{rotuloSemLoja}</SelectItem>}
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Conecta <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input
              value={conecta}
              onChange={e => setConecta(e.target.value)}
              placeholder="https://checkout.aride.com.br/?org=…&seller=…"
            />
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/50 p-3 sm:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <Label>Acesso a módulos</Label>
                <p className="text-xs text-muted-foreground">
                  {diferenca.liberados || diferenca.bloqueados
                    ? [
                        diferenca.liberados ? `${diferenca.liberados} liberado(s) a mais` : '',
                        diferenca.bloqueados ? `${diferenca.bloqueados} bloqueado(s)` : '',
                      ].filter(Boolean).join(' · ') + ' em relação à função'
                    : 'Usa os módulos da função.'}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" aria-expanded={verModulos} onClick={() => setVerModulos(v => !v)}>
                {verModulos ? 'Ocultar módulos' : 'Personalizar'}
              </Button>
            </div>
            {verModulos && (
              <>
                <p className="text-xs text-muted-foreground">
                  O que está marcado como &quot;do papel&quot; vem da função. Aqui você só ajusta a diferença: libera algo a mais ou bloqueia algo que a função dá.
                </p>
                <ModulosPicker
                  liberaveis={limites.itensLiberaveis}
                  papel={papel}
                  papeisExtras={inicial?.papeisExtras ?? []}
                  extras={modulosExtras}
                  bloqueados={modulosBloqueados}
                  onChange={v => { setModulosExtras(v.extras); setModulosBloqueados(v.bloqueados) }}
                />
              </>
            )}
          </div>

          {mostrarAprovacao && (
            <div className="space-y-2 rounded-lg border bg-muted/50 p-3 sm:col-span-2">
              <div>
                <Label>Aprovação de venda</Label>
                <p className="text-xs text-muted-foreground">
                  O grupo da loja deste usuário já é aprovado por ele. Marque aqui os grupos <strong>a mais</strong>.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {grupos.filter(g => limites.gruposAprovacao === null || limites.gruposAprovacao.includes(g.id) || (inicial?.gruposAprovacao ?? []).includes(g.id)).map(g => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={gruposAprov.includes(g.id)}
                      onChange={() => toggleGrupo(g.id)}
                    />
                    <span>
                      {g.nome}
                      {g.id === inicial?.grupoDaLojaId && (
                        <span className="text-muted-foreground"> — grupo da loja (já aprova)</span>
                      )}
                    </span>
                  </label>
                ))}
                {grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo ativo.</p>}
              </div>
              <label className="flex items-center gap-2 border-t pt-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={aprovaSensivel}
                  disabled={!limites.aprovaPagamentoSensivel && !inicial?.aprovaPagamentoSensivel}
                  onChange={e => setAprovaSensivel(e.target.checked)}
                />
                <span>
                  Aprova transferência bancária
                  <span className="block text-xs text-muted-foreground">
                    Vale nos mesmos grupos acima. Sem isto, ele só aprova venda abaixo do preço.
                  </span>
                </span>
              </label>
            </div>
          )}

          {mostrarAcessoGrupos && (
            <div className="space-y-2 rounded-lg border bg-muted/50 p-3 sm:col-span-2">
              <div>
                <Label>Empresas que este usuário enxerga</Label>
                <p className="text-xs text-muted-foreground">
                  Diferente da aprovação de venda acima: isto controla quais empresas aparecem no seletor de empresa
                  (trocar de grupo) e os dados que ele pode ver. O grupo da loja dele já vem incluso e não precisa ser marcado aqui.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {grupos.map(g => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={gruposAcesso.includes(g.id)}
                      onChange={() => toggleGrupoAcesso(g.id)}
                    />
                    <span>
                      {g.nome}
                      {g.id === inicial?.grupoDaLojaId && (
                        <span className="text-muted-foreground"> — grupo da loja (já enxerga)</span>
                      )}
                    </span>
                  </label>
                ))}
                {grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo ativo.</p>}
              </div>
            </div>
          )}

          {mostrarLiberados && (
            <div className="space-y-2 rounded-lg border bg-muted/50 p-3 sm:col-span-2">
              <div>
                <Label>Grupos de outras Contas</Label>
                <p className="text-xs text-muted-foreground">
                  Liberar ou tirar vale na hora. Em cada grupo marcado ele age como sócio, só com os dados da Conta dona.
                  A Conta dona vê quem tem acesso, mas não tira.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {outrasContas.map(g => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={gruposLiberados.includes(g.id)}
                      onChange={() => toggleLiberado(g.id)}
                    />
                    <span>
                      {g.nome}
                      <span className="text-muted-foreground"> ({g.contaNome})</span>
                    </span>
                  </label>
                ))}
                {outrasContas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo de outra Conta.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 rounded-b-xl px-4 sm:px-6">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSubmit}>{isEdit ? 'Salvar alterações' : 'Criar usuário'}</Button>
      </DialogFooter>
    </div>
  )
}

export function UsuariosTable({ usuarios, lojas, grupos, limites, cargos, contaAtiva, podeDarAoCargo, liberaveis, liberadosPorUsuario }: {
  usuarios: Usuario[]; lojas: Loja[]; grupos: Grupo[]; limites: Limites; cargos: Cargo[]; contaAtiva: string; podeDarAoCargo: string[]
  liberaveis: GrupoLiberavel[] | null; liberadosPorUsuario: Record<string, string[]>
}) {
  const [vendoCargos, setVendoCargos] = useState(false)
  const [criando,    setCriando]    = useState(false)
  const [editando,   setEditando]   = useState<Usuario | null>(null)
  const [excluindo,  setExcluindo]  = useState<Usuario | null>(null)
  const [pending, startTransition]  = useTransition()

  const nomeGrupo = (id: string) => grupos.find(g => g.id === id)?.nome ?? id

  function handleCriar(dados: DadosForm) {
    startTransition(async () => {
      try {
        const id = await criarUsuarioAction(dados)
        if (liberaveis && dados.gruposLiberados.length) await salvarGruposLiberadosAction(id, dados.gruposLiberados)
        toast.success('Usuário criado com sucesso')
        setCriando(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao criar usuário')
      }
    })
  }

  function handleEditar(dados: DadosForm) {
    if (!editando) return
    startTransition(async () => {
      try {
        await editarUsuarioAction(editando.id, {
          nome:      dados.nome,
          email:     dados.email,
          novaSenha: dados.senha || undefined,
          papel:     dados.papel,
          lojaId:    dados.lojaId,
          conecta:   dados.conecta,
          gruposAprovacao:         dados.gruposAprovacao,
          aprovaPagamentoSensivel: dados.aprovaPagamentoSensivel,
          gruposAcesso:            dados.gruposAcesso,
          modulosExtras:           dados.modulosExtras,
          modulosBloqueados:       dados.modulosBloqueados,
        })
        if (liberaveis) await salvarGruposLiberadosAction(editando.id, dados.gruposLiberados)
        toast.success('Usuário atualizado')
        setEditando(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar')
      }
    })
  }

  function handleToggleAtivo(u: Usuario) {
    startTransition(async () => {
      try {
        await alternarAtivoUsuarioAction(u.id, !u.ativo)
        toast.success(u.ativo ? 'Usuário desativado — sai dos relatórios de vendedor' : 'Usuário reativado')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao alterar')
      }
    })
  }

  function handleExcluir() {
    if (!excluindo) return
    startTransition(async () => {
      try {
        await excluirUsuarioAction(excluindo.id)
        toast.success('Usuário excluído')
        setExcluindo(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          {CARGOS_VISIVEIS && <Button variant="outline" onClick={() => setVendoCargos(true)} className="gap-2">
            <BadgeCheck size={16} /> Cargos
          </Button>}
          <Button onClick={() => setCriando(true)} className="gap-2">
            <UserPlus size={16} /> Novo usuário
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Aprova</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead className="text-right w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map(u => (
              <TableRow key={u.id} className={u.ativo ? '' : 'opacity-55'}>
                <TableCell className="font-medium">
                  {u.nome}
                  {!u.ativo && <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium align-middle">Inativo</span>}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${PAPEL_CORES[u.papel] ?? 'bg-muted text-foreground'}`}>
                    {u.papel === 'cargo' ? (cargos.find(c => c.id === u.cargoId)?.nome ?? 'Cargo') : (PAPEIS.find(p => p.value === u.papel)?.label ?? u.papel)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.lojaNome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {PAPEIS_APROVADORES.includes(u.papel) && (u.gruposAprovacao.length > 0 || u.aprovaPagamentoSensivel) ? (
                    <div className="flex flex-wrap gap-1">
                      {u.gruposAprovacao.map(gid => (
                        <span key={gid} className="inline-flex px-1.5 py-0.5 rounded border border-info/30 bg-info/10 text-info text-[11px]">
                          + {nomeGrupo(gid)}
                        </span>
                      ))}
                      {u.aprovaPagamentoSensivel && (
                        <span className="inline-flex px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success text-[11px]">
                          transferência
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {u.papel === 'admin_geral' ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded border border-info/30 bg-info/10 text-info text-[11px]">todas</span>
                  ) : u.gruposAcesso.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {u.gruposAcesso.map(gid => (
                        <span key={gid} className="inline-flex px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground text-[11px]">
                          {nomeGrupo(gid)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {!(u.id === limites.meuId && limites.travaASiMesmo) && <Button
                      variant="ghost" size="icon"
                      className={`h-8 w-8 ${u.ativo ? 'text-muted-foreground hover:text-foreground' : 'text-success hover:text-success'} hover:bg-muted`}
                      onClick={() => handleToggleAtivo(u)}
                      title={u.ativo ? 'Desativar (sai dos relatórios)' : 'Reativar'}
                      disabled={pending}
                    >
                      {u.ativo ? <PowerOff size={15} /> : <Power size={15} />}
                    </Button>}
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-warning hover:text-warning hover:bg-warning/10"
                      onClick={() => setEditando(u)}
                    >
                      <Pencil size={15} />
                    </Button>
                    {limites.podeExcluir && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setExcluindo(u)}
                    >
                      <Trash2 size={15} />
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {CARGOS_VISIVEIS && <CargosDialog open={vendoCargos} onOpenChange={setVendoCargos} cargos={cargosDoAlvo(cargos, null, contaAtiva)} podeDar={podeDarAoCargo} />}

      {/* Dialog Criar */}
      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <FormUsuario
            lojas={lojas}
            grupos={grupos}
            limites={limites}
            cargos={cargos}
            contaAtiva={contaAtiva}
            liberaveis={liberaveis}
            liberadosIniciais={[]}
            onSubmit={handleCriar}
            onCancel={() => setCriando(false)}
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog Editar */}
      <Dialog open={!!editando} onOpenChange={open => { if (!open) setEditando(null) }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
            <DialogTitle>Editar usuário</DialogTitle>
            <p className="text-sm text-muted-foreground">{editando?.nome}</p>
          </DialogHeader>
          {editando && (
            <FormUsuario
              inicial={editando}
              lojas={lojas}
              grupos={grupos}
              limites={limites}
              cargos={cargos}
              contaAtiva={contaAtiva}
              liberaveis={liberaveis}
              liberadosIniciais={liberadosPorUsuario[editando.id] ?? []}
              onSubmit={handleEditar}
              onCancel={() => setEditando(null)}
              isEdit
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Excluir */}
      <Dialog open={!!excluindo} onOpenChange={open => { if (!open) setExcluindo(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{excluindo?.nome}</strong>?
            Esta ação é irreversível e removerá o acesso ao sistema.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setExcluindo(null)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={pending}>
              {pending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
