'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { criarGrupoAction, editarGrupoAction } from '../actions'

type Grupo = {
  id: string
  nome: string
  cnpj: string
  ativo: boolean
  blingClientId: string | null
  blingClientSecret: string | null
  // A chave do mcp.ai não vem para cá — só se ela existe e um resumo dela
  // (host + últimos caracteres). É credencial de acesso a dado bancário; o
  // valor não trafega para o navegador.
  mcpaiConfigurado: boolean
  mcpaiResumo: string | null
  razaoSocial: string | null
  enderecoSede: string | null
  cidadeSede: string | null
  comarcaForo: string | null
}

export type ContaOpcao = { id: string; nome: string; grupos: string[] }

type Props = {
  modo: 'criar' | 'editar'
  inicial?: Grupo
  /** Só na criação: Contas existentes para o grupo nascer dentro (#199). */
  contas?: ContaOpcao[]
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function GrupoDialog({ modo, inicial, contas = [], open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [nome, setNome] = useState(inicial?.nome ?? '')
  // Vazio = Conta nova com o nome do grupo (padrão).
  const [contaId, setContaId] = useState('')
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)
  const [blingClientId, setBlingClientId] = useState(inicial?.blingClientId ?? '')
  const [blingClientSecret, setBlingClientSecret] = useState(inicial?.blingClientSecret ?? '')
  // Começa sempre vazio, mesmo na edição: o valor salvo não chega aqui. Vazio
  // significa "mantém o que está lá".
  const [mcpaiEndpointUrl, setMcpaiEndpointUrl] = useState('')
  const [mcpaiRemover, setMcpaiRemover] = useState(false)
  // Abre sozinha quando já há integração: o "Configurada" e o "Remover chave" ficam à vista.
  const integracaoConfigurada = !!(inicial?.blingClientId || inicial?.mcpaiConfigurado)
  const [integracoesAbertas, setIntegracoesAbertas] = useState(integracaoConfigurada)
  const [razaoSocial, setRazaoSocial] = useState(inicial?.razaoSocial ?? '')
  const [enderecoSede, setEnderecoSede] = useState(inicial?.enderecoSede ?? '')
  const [cidadeSede, setCidadeSede] = useState(inicial?.cidadeSede ?? '')
  const [comarcaForo, setComarcaForo] = useState(inicial?.comarcaForo ?? '')

  const contratoIncompleto = !razaoSocial.trim() || !enderecoSede.trim() || !cidadeSede.trim() || !comarcaForo.trim()

  async function handleSalvar() {
    if (!nome.trim() || !cnpj.trim()) {
      toast.error('Preencha nome e CNPJ')
      return
    }
    setLoading(true)
    try {
      const dados = {
        nome, cnpj, ativo, blingClientId, blingClientSecret,
        mcpaiEndpointUrl, mcpaiRemover,
        razaoSocial, enderecoSede, cidadeSede, comarcaForo,
      }
      if (modo === 'criar') {
        await criarGrupoAction({ ...dados, contaId: contaId || null })
        toast.success('Grupo criado!')
      } else {
        await editarGrupoAction(inicial!.id, dados)
        toast.success('Grupo atualizado!')
      }
      onOpenChange?.(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Corpo rola por dentro e o rodapé fica fixo: com os dados de contrato e as
          integrações, o formulário passa da altura de telas baixas (#313). */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
          <DialogTitle>{modo === 'criar' ? 'Novo Grupo' : 'Editar Grupo'}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: BH" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ *</Label>
              <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="h-9 text-sm" />
            </div>

            {modo === 'criar' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="grupo-conta" className="text-xs">Conta</Label>
                {/* <select> nativo: o do design system mostraria o id da Conta no lugar do nome. */}
                <select
                  id="grupo-conta"
                  value={contaId}
                  onChange={e => setContaId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Conta nova</option>
                  {contas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}{c.grupos.length ? ` (${c.grupos.join(', ')})` : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {contaId ? 'O grupo entra nesta Conta e compartilha usuários, clientes e modelos com os grupos dela.' : 'Cria uma Conta só para este grupo.'}
                </p>
              </div>
            )}

            <p className="border-t pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:col-span-2">Dados para contrato</p>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Razão social</Label>
              <Input
                value={razaoSocial}
                onChange={e => setRazaoSocial(e.target.value)}
                placeholder="MOTOCHEFE SUL DE MINAS LTDA."
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Endereço da sede</Label>
              <Input
                value={enderecoSede}
                onChange={e => setEnderecoSede(e.target.value)}
                placeholder="Avenida X, n° 000, Bairro, CEP: 00.000-000, Cidade – UF"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade da sede</Label>
              <Input
                value={cidadeSede}
                onChange={e => setCidadeSede(e.target.value)}
                placeholder="Pouso Alegre"
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Sai no fecho do contrato ("Pouso Alegre, 11/08/2026"), independente da loja que vendeu.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comarca do foro</Label>
              <Input
                value={comarcaForo}
                onChange={e => setComarcaForo(e.target.value)}
                placeholder="Pouso Alegre, Minas Gerais"
                className="h-9 text-sm"
              />
            </div>
            {contratoIncompleto && (
              <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning sm:col-span-2">
                Sem estes três campos, o envio de contrato para assinatura fica bloqueado neste grupo.
              </p>
            )}

            {/* Com remoção pendente, abre e o título avisa: recolhida, a remoção não passa calada. */}
            <details
              className="rounded-lg border px-3 py-2 sm:col-span-2"
              open={integracoesAbertas || mcpaiRemover}
              onToggle={e => setIntegracoesAbertas(e.currentTarget.open)}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Integrações (opcional){' '}
                {mcpaiRemover
                  ? <span className="ml-1 text-xs font-normal text-destructive">chave do Open Finance será removida</span>
                  : <span className="ml-1 text-xs font-normal text-muted-foreground">{integracaoConfigurada ? 'configurada' : 'Bling, Open Finance'}</span>}
              </summary>
              <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bling — Client ID</Label>
                  <Input value={blingClientId} onChange={e => setBlingClientId(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bling — Client Secret</Label>
                  <Input type="password" value={blingClientSecret} onChange={e => setBlingClientSecret(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Open Finance (mcp.ai) — URL do endpoint</Label>
                  <Input
                    type="password"
                    value={mcpaiEndpointUrl}
                    onChange={e => { setMcpaiEndpointUrl(e.target.value); setMcpaiRemover(false) }}
                    placeholder={inicial?.mcpaiConfigurado ? 'Deixe em branco para manter a atual' : 'https://api.mcp.ai/...'}
                    className="h-9 text-sm"
                    disabled={mcpaiRemover}
                  />
                  {inicial?.mcpaiConfigurado ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-primary-text">
                        Configurada: {inicial.mcpaiResumo}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setMcpaiRemover(v => !v); setMcpaiEndpointUrl('') }}
                        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-destructive"
                      >
                        {mcpaiRemover ? 'Cancelar remoção' : 'Remover chave'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-warning">
                      Sem chave própria, esta empresa usa a conta global do sistema — e só enxerga extrato,
                      PIX e cartão se o CNPJ dela estiver conectado lá.
                    </p>
                  )}
                  {mcpaiRemover && (
                    <p className="text-[11px] text-destructive">
                      A chave será apagada ao salvar. Os módulos de Open Finance desta empresa voltam para a conta global.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  A URL do mcp.ai é gravada cifrada e nunca volta para esta tela — por isso o campo aparece vazio.
                  Bling é a emissão de NF-e. O login da fábrica fica no cadastro de cada loja.
                </p>
              </div>
            </details>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" id="ativo" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
              <Label htmlFor="ativo" className="text-xs">Grupo ativo</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/40 px-4 py-3 sm:px-6">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button className="flex-1 sm:flex-none" onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NovoGrupoButton({ contas }: { contas: ContaOpcao[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Novo Grupo
      </Button>
      <GrupoDialog modo="criar" contas={contas} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function EditarGrupoButton({ grupo }: { grupo: Grupo }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground p-1" title="Editar">
        <Pencil size={14} />
      </button>
      <GrupoDialog key={grupo.id} modo="editar" inicial={grupo} open={open} onOpenChange={setOpen} />
    </>
  )
}
