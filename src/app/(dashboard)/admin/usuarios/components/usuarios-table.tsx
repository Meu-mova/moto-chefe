'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, Trash2, UserPlus, Eye, EyeOff, Power, PowerOff, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { criarUsuarioAction, editarUsuarioAction, excluirUsuarioAction, alternarAtivoUsuarioAction } from '../actions'
import { ModulosPicker } from './modulos-picker'
import { CargosDialog, type Cargo } from './cargos-dialog'
import { CARGOS_VISIVEIS, cargosDoAlvo } from '@/lib/cargos-opcoes'
import type { LimitesDaTela } from '@/lib/gestao-usuarios'
import { diferencaDaFuncao } from '@/lib/modulos-picker-estado'
import { ITENS } from '@/lib/navegacao'
import { contaDoFormulario, gruposDaConta } from '@/lib/grupos-do-formulario'
import { filtrarUsuarios, type FiltrosUsuarios } from '@/lib/usuarios-filtro'

// O picker esconde os itens de regra própria: o resumo conta só o que ele mostra.
const IDS_MODULOS = ITENS.filter(i => !i.regraPropria).map(i => i.id)

type Loja = { id: string; nome: string; grupoId: string }
type Grupo = { id: string; nome: string; contaId: string }
/** Grupo que o admin_geral pode liberar ao admin_rede, com a Conta dona ao lado. */
export type GrupoLiberavel = Grupo & { contaNome: string }
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
  acoesExtras,
}: {
  /** Desativar e excluir, no rodapé do painel de edição. */
  acoesExtras?: React.ReactNode
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

  // Aprovação e acesso só com grupos da Conta da loja escolhida; outra Conta é pelo bloco do admin_rede.
  const contaDoUsuario = contaDoFormulario(lojaId, lojas, grupos, gruposAcesso, inicial)
  const gruposDaContaDoUsuario = gruposDaConta(grupos, contaDoUsuario)
  function escolherLoja(v: string) {
    setLojaId(v)
    // Trocou de Conta: marcações de grupo da outra Conta saem, senão o servidor recusaria.
    const doNovo = new Set(gruposDaConta(grupos, contaDoFormulario(v, lojas, grupos, gruposAcesso, inicial)).map(g => g.id))
    setGruposAprov(a => a.filter(g => doNovo.has(g)))
    setGruposAcesso(a => a.filter(g => doNovo.has(g)))
  }

  const mostrarAprovacao = PAPEIS_APROVADORES.includes(papel)
  // admin_geral já enxerga todos os grupos pelo papel — mostrar a lista para
  // ele sugeriria, errado, que ela é que manda. Só admin_socio usa isto.
  const mostrarAcessoGrupos = papel === 'admin_socio' || papel === 'admin_rede'
  // Grupos da Conta do próprio usuário vão pelos grupos de acesso acima (ADR-0019).
  const outrasContas = (liberaveis ?? []).filter(g => g.contaId !== inicial?.contaId)
  const mostrarLiberados = papel === 'admin_rede' && liberaveis !== null

  function toggleLiberado(id: string) {
    const saindo = gruposLiberados.includes(id)
    setGruposLiberados(atual => saindo ? atual.filter(g => g !== id) : [...atual, id])
    // Sem a liberação, a aprovação naquele grupo também sai (o servidor faz o mesmo ao revogar).
    if (saindo) setGruposAprov(a => a.filter(g => g !== id))
  }
  // admin_rede aprova também nos grupos liberados para ele (ADR-0019): entram na lista de aprovação.
  const gruposParaAprovar = papel === 'admin_rede'
    ? [...gruposDaContaDoUsuario, ...(liberaveis ?? []).filter(g => gruposLiberados.includes(g.id))]
    : gruposDaContaDoUsuario

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

  const caixa = (marcado: boolean, onChange: () => void, rotulo: React.ReactNode, travado = false) => (
    <label className="flex items-center gap-2 py-1 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={marcado} disabled={travado} onChange={onChange} />
      <span className={travado ? 'text-muted-foreground' : ''}>{rotulo}</span>
    </label>
  )
  const rotuloDaLoja = (g: Grupo, texto: string) => (
    <>{g.nome}{g.id === inicial?.grupoDaLojaId && <span className="text-muted-foreground"> {texto}</span>}</>
  )

  return (
    // Abas no lugar da página longa (#557); o estado fica aqui, então trocar de aba não perde nada.
    <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList variant="line" className="w-full justify-start gap-4 border-b px-4 sm:px-6">
        <TabsTrigger value="dados">Dados</TabsTrigger>
        <TabsTrigger value="acesso">Acesso</TabsTrigger>
        {mostrarAprovacao && <TabsTrigger value="aprovacao">Aprovação</TabsTrigger>}
        <TabsTrigger value="modulos">Módulos</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <TabsContent value="dados" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome completo</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João da Silva" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>{isEdit ? 'Nova senha' : 'Senha'}</Label>
            <SenhaInput value={senha} onChange={setSenha} placeholder={isEdit ? 'Em branco mantém a atual' : 'Mínimo 6 caracteres'} />
          </div>
          <div className="space-y-1.5">
            <Label>Função</Label>
            <Select value={papel} onValueChange={v => { if (v) setPapel(v) }} disabled={inicial?.id === limites.meuId && limites.travaASiMesmo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a função">
                  {(v: string | null) => v ? (PAPEIS.find(p => p.value === v)?.label ?? v) : 'Selecione a função'}
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Conecta <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input value={conecta} onChange={e => setConecta(e.target.value)} placeholder="https://checkout.aride.com.br/?org=...&seller=..." />
          </div>
        </TabsContent>

        <TabsContent value="acesso" className="space-y-5">
          <div className="space-y-1.5">
            <Label>Loja</Label>
            <Select value={lojaId ?? ''} onValueChange={v => escolherLoja(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={rotuloSemLoja ?? 'Escolha a loja'}>
                  {(v: string | null) => v ? (lojas.find(l => l.id === v)?.nome ?? v) : (rotuloSemLoja ?? 'Escolha a loja')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rotuloSemLoja && <SelectItem value="">{rotuloSemLoja}</SelectItem>}
                {lojas.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mostrarAcessoGrupos && (
            <div className="space-y-1">
              <Label>Empresas que enxerga</Label>
              <p className="text-xs text-muted-foreground">Aparecem no seletor de empresa. O grupo da loja já vem incluso.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {gruposDaContaDoUsuario.map(g => (
                  <div key={g.id}>{caixa(gruposAcesso.includes(g.id) || g.id === inicial?.grupoDaLojaId, () => toggleGrupoAcesso(g.id), rotuloDaLoja(g, 'grupo da loja'), g.id === inicial?.grupoDaLojaId)}</div>
                ))}
                {gruposDaContaDoUsuario.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo ativo.</p>}
              </div>
            </div>
          )}
          {mostrarLiberados && (
            <div className="space-y-1">
              <Label>Grupos de outras Contas</Label>
              <p className="text-xs text-muted-foreground">Em cada grupo marcado ele age como sócio, só com os dados da Conta dona.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {outrasContas.map(g => (
                  <div key={g.id}>{caixa(gruposLiberados.includes(g.id), () => toggleLiberado(g.id), <>{g.nome} <span className="text-muted-foreground">{g.contaNome}</span></>)}</div>
                ))}
                {outrasContas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo de outra Conta.</p>}
              </div>
            </div>
          )}
        </TabsContent>

        {mostrarAprovacao && (
          <TabsContent value="aprovacao" className="space-y-3">
            <div className="space-y-1">
              <Label>Aprova venda em</Label>
              <p className="text-xs text-muted-foreground">O grupo da loja já é aprovado por ele. Marque os grupos a mais.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {gruposParaAprovar.filter(g => limites.gruposAprovacao === null || limites.gruposAprovacao.includes(g.id) || (inicial?.gruposAprovacao ?? []).includes(g.id)).map(g => (
                  <div key={g.id}>{caixa(gruposAprov.includes(g.id), () => toggleGrupo(g.id), rotuloDaLoja(g, 'grupo da loja'))}</div>
                ))}
                {gruposParaAprovar.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo ativo.</p>}
              </div>
            </div>
            <div className="border-t pt-3">
              {caixa(aprovaSensivel, () => setAprovaSensivel(v => !v),
                <>Aprova transferência bancária <span className="block text-xs text-muted-foreground">Nos mesmos grupos. Sem isto, ele só aprova venda abaixo do preço.</span></>,
                !limites.aprovaPagamentoSensivel && !inicial?.aprovaPagamentoSensivel)}
            </div>
          </TabsContent>
        )}

        <TabsContent value="modulos" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {diferenca.liberados || diferenca.bloqueados
              ? [diferenca.liberados ? `${diferenca.liberados} liberado(s) a mais` : '', diferenca.bloqueados ? `${diferenca.bloqueados} bloqueado(s)` : ''].filter(Boolean).join(', ') + ' em relação à função.'
              : 'Usa os módulos da função. Ajuste aqui só a diferença: liberar algo a mais ou bloquear algo que a função dá.'}
          </p>
          <ModulosPicker
            liberaveis={limites.itensLiberaveis}
            papel={papel}
            papeisExtras={inicial?.papeisExtras ?? []}
            extras={modulosExtras}
            bloqueados={modulosBloqueados}
            onChange={v => { setModulosExtras(v.extras); setModulosBloqueados(v.bloqueados) }}
          />
        </TabsContent>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-4 py-3 sm:px-6">
        {acoesExtras}
        <span className="flex-1" />
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSubmit}>{isEdit ? 'Salvar' : 'Criar usuário'}</Button>
      </div>
    </Tabs>
  )
}

export function UsuariosTable({ usuarios, lojas, grupos, limites, cargos, contaAtiva, podeDarAoCargo, liberaveis, liberadosPorUsuario, contasNomes = {} }: {
  usuarios: Usuario[]; lojas: Loja[]; grupos: Grupo[]; limites: Limites; cargos: Cargo[]; contaAtiva: string; podeDarAoCargo: string[]
  liberaveis: GrupoLiberavel[] | null; liberadosPorUsuario: Record<string, string[]>
  /** Nomes das Contas dos usuários da lista (só delas). */
  contasNomes?: Record<string, string>
}) {
  const [vendoCargos, setVendoCargos] = useState(false)
  const [criando,    setCriando]    = useState(false)
  const [editando,   setEditando]   = useState<Usuario | null>(null)
  const [excluindo,  setExcluindo]  = useState<Usuario | null>(null)
  const [pending, startTransition]  = useTransition()


  function handleCriar(dados: DadosForm) {
    startTransition(async () => {
      try {
        // Usuário novo ainda não tem grupo liberado: a aprovação neles vai depois de liberar.
        const daConta = dados.gruposAprovacao.filter(g => !dados.gruposLiberados.includes(g))
        const r = await criarUsuarioAction({ ...dados, gruposAprovacao: daConta })
        // Recusa: o modal fica aberto com o que foi preenchido.
        if (!r.ok) { toast.error(r.erro); return }
        if (liberaveis && dados.gruposLiberados.length) {
          // Liberações e a aprovação nos grupos de fora numa edição só (uma transação).
          const e = await editarUsuarioAction(r.id, { ...dados, novaSenha: undefined, cargoId: dados.cargoId || null, gruposLiberados: dados.gruposLiberados })
          // O usuário já foi criado: fecha o modal e avisa o que não foi gravado.
          if (!e.ok) { toast.error(`Usuário criado, mas os grupos de outras Contas não: ${e.erro}`); setCriando(false); return }
        }
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
        // Liberações vão junto na mesma action (uma transação): recusa desfaz tudo.
        const r = await editarUsuarioAction(editando.id, {
          ...(liberaveis ? { gruposLiberados: dados.gruposLiberados } : {}),
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
        if (!r.ok) { toast.error(r.erro); return }
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
        const r = await alternarAtivoUsuarioAction(u.id, !u.ativo)
        if (!r.ok) { toast.error(r.erro); return }
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
        const r = await excluirUsuarioAction(excluindo.id)
        // Recusa (ex.: usuário com histórico): a confirmação fica aberta com a frase.
        if (!r.ok) { toast.error(r.erro); return }
        toast.success('Usuário excluído')
        setExcluindo(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      }
    })
  }

  const [filtros, setFiltros] = useState<FiltrosUsuarios>({ busca: '', papel: '', contaId: '', situacao: 'ativos' })
  const lista = filtrarUsuarios(usuarios, filtros)
  const contasDaLista = [...new Set(usuarios.map(u => u.contaId).filter((c): c is string => !!c))]
  const nomePapel = (u: Usuario) => u.papel === 'cargo' ? (cargos.find(c => c.id === u.cargoId)?.nome ?? 'Cargo') : (PAPEIS.find(p => p.value === u.papel)?.label ?? u.papel)
  const ondeAprova = (u: Usuario) => {
    if (!PAPEIS_APROVADORES.includes(u.papel)) return 'Não aprova'
    // O grupo da loja já aprova por padrão e às vezes também está marcado: conta uma vez só.
    const n = new Set([...u.gruposAprovacao, ...(u.grupoDaLojaId ? [u.grupoDaLojaId] : [])]).size
    return `${n} ${n === 1 ? 'grupo' : 'grupos'}${u.aprovaPagamentoSensivel ? ', transferência' : ''}`
  }
  const iniciais = (nome: string) => { const p = nome.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() }
  const Situacao = ({ ativo }: { ativo: boolean }) => (
    <span className={`inline-flex items-center gap-1.5 text-sm ${ativo ? '' : 'text-muted-foreground'}`}>
      <span className={`size-1.5 rounded-full ${ativo ? 'bg-success' : 'bg-input'}`} />{ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
  const Ini = ({ nome }: { nome: string }) => (
    <span className="grid size-7 shrink-0 place-items-center rounded-sm border bg-muted text-[11px] font-semibold text-muted-foreground">{iniciais(nome)}</span>
  )
  const painel = criando || !!editando

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2 text-muted-foreground sm:w-72">
          <Search size={15} className="shrink-0" />
          <input value={filtros.busca} onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))} placeholder="Buscar por nome, e-mail ou loja"
            aria-label="Buscar usuário" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        {/* selects nativos: o Select do design system mostraria o id no lugar do nome */}
        <select aria-label="Função" value={filtros.papel} onChange={e => setFiltros(f => ({ ...f, papel: e.target.value }))} className="h-8 flex-1 rounded-md border border-input bg-card px-2 text-sm sm:flex-none">
          <option value="">Todas as funções</option>
          {PAPEIS.filter(p => usuarios.some(u => u.papel === p.value)).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {contasDaLista.length > 1 && (
          <select aria-label="Conta" value={filtros.contaId} onChange={e => setFiltros(f => ({ ...f, contaId: e.target.value }))} className="h-8 flex-1 rounded-md border border-input bg-card px-2 text-sm sm:flex-none">
            <option value="">Todas as Contas</option>
            {contasDaLista.map(c => <option key={c} value={c}>{contasNomes[c] ?? 'Conta'}</option>)}
          </select>
        )}
        <div className="flex gap-1" role="group" aria-label="Situação">
          {(['ativos', 'inativos', 'todos'] as const).map(s => (
            <button key={s} type="button" aria-pressed={filtros.situacao === s} onClick={() => setFiltros(f => ({ ...f, situacao: s }))}
              className="h-8 rounded-md border px-2.5 text-sm text-muted-foreground aria-pressed:border-foreground aria-pressed:font-medium aria-pressed:text-foreground">
              {s === 'ativos' ? 'Ativos' : s === 'inativos' ? 'Inativos' : 'Todos'}
            </button>
          ))}
        </div>
        <span className="hidden flex-1 sm:block" />
        {CARGOS_VISIVEIS && <Button variant="outline" onClick={() => setVendoCargos(true)} className="gap-2"><BadgeCheck size={16} /> Cargos</Button>}
        <Button onClick={() => setCriando(true)} className="gap-2"><UserPlus size={16} /> Novo usuário</Button>
      </div>

      {/* Computador e tablet: tabela; clicar na linha abre o painel. */}
      <div className="hidden overflow-hidden rounded-md border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Usuário</th>
              <th className="px-3 py-2 font-medium">Função</th>
              <th className="px-3 py-2 font-medium">Loja</th>
              {contasDaLista.length > 1 && <th className="px-3 py-2 font-medium">Conta</th>}
              <th className="px-3 py-2 font-medium">Aprova em</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(u => (
              <tr key={u.id} onClick={() => setEditando(u)} className="cursor-pointer border-t hover:bg-muted/60">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setEditando(u)} className="flex items-center gap-2.5 text-left">
                    <Ini nome={u.nome} />
                    <span className="min-w-0"><span className="block font-medium">{u.nome}</span><span className="block text-xs text-muted-foreground">{u.email}</span></span>
                  </button>
                </td>
                <td className="px-3 py-2"><span className="whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">{nomePapel(u)}</span></td>
                <td className="px-3 py-2">{u.lojaNome ?? <span className="text-muted-foreground">Sem loja</span>}</td>
                {contasDaLista.length > 1 && <td className="px-3 py-2 text-muted-foreground">{u.contaId ? contasNomes[u.contaId] : 'Plataforma'}</td>}
                <td className="px-3 py-2 text-muted-foreground tabular-nums">{ondeAprova(u)}</td>
                <td className="px-3 py-2"><Situacao ativo={u.ativo} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{lista.length} de {usuarios.length} usuários</p>
      </div>

      {/* Celular: cartões. */}
      <div className="divide-y rounded-md border bg-card md:hidden">
        {lista.map(u => (
          <button key={u.id} type="button" onClick={() => setEditando(u)} className="flex w-full items-start gap-2.5 px-3 py-3 text-left">
            <Ini nome={u.nome} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{u.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-sm border px-1.5 py-0.5">{nomePapel(u)}</span>{u.lojaNome ?? 'Sem loja'}
              </span>
            </span>
            <Situacao ativo={u.ativo} />
          </button>
        ))}
      </div>
      {lista.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário com esses filtros.</p>}

      {CARGOS_VISIVEIS && <CargosDialog open={vendoCargos} onOpenChange={setVendoCargos} cargos={cargosDoAlvo(cargos, null, contaAtiva)} podeDar={podeDarAoCargo} />}

      {/* Painel lateral de criar e editar; no celular ocupa a tela. */}
      <Sheet open={painel} onOpenChange={o => { if (!o && !pending) { setCriando(false); setEditando(null) } }}>
        <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b pr-12">
            {editando ? (
              <div className="flex items-center gap-2.5">
                <Ini nome={editando.nome} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{editando.nome}</SheetTitle>
                  <p className="text-xs text-muted-foreground">{nomePapel(editando)}{editando.lojaNome ? ` na ${editando.lojaNome}` : ''}</p>
                </div>
              </div>
            ) : <SheetTitle>Novo usuário</SheetTitle>}
          </SheetHeader>
          {criando && (
            <FormUsuario lojas={lojas} grupos={grupos} limites={limites} cargos={cargos} contaAtiva={contaAtiva}
              liberaveis={liberaveis} liberadosIniciais={[]} onSubmit={handleCriar} onCancel={() => setCriando(false)} isEdit={false} />
          )}
          {editando && (
            <FormUsuario key={editando.id} inicial={editando} lojas={lojas} grupos={grupos} limites={limites} cargos={cargos} contaAtiva={contaAtiva}
              liberaveis={liberaveis} liberadosIniciais={liberadosPorUsuario[editando.id] ?? []} onSubmit={handleEditar} onCancel={() => setEditando(null)} isEdit
              acoesExtras={<>
                {!(editando.id === limites.meuId && limites.travaASiMesmo) && (
                  <Button variant="outline" onClick={() => handleToggleAtivo(editando)} disabled={pending} className="gap-1.5">
                    {editando.ativo ? <PowerOff size={15} /> : <Power size={15} />}{editando.ativo ? 'Desativar' : 'Reativar'}
                  </Button>
                )}
                {limites.podeExcluir && (
                  <Button variant="outline" onClick={() => setExcluindo(editando)} disabled={pending} className="gap-1.5 text-destructive">
                    <Trash2 size={15} /> Excluir
                  </Button>
                )}
              </>} />
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmação de excluir */}
      <Dialog open={!!excluindo} onOpenChange={open => { if (!open) setExcluindo(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir usuário</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir <strong>{excluindo?.nome}</strong> remove o acesso ao sistema e não tem volta. Quem tem histórico só pode ser desativado.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setExcluindo(null)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={pending}>{pending ? 'Excluindo...' : 'Excluir'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
