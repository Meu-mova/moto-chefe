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

type Props = {
  modo: 'criar' | 'editar'
  inicial?: Grupo
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function GrupoDialog({ modo, inicial, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)
  const [blingClientId, setBlingClientId] = useState(inicial?.blingClientId ?? '')
  const [blingClientSecret, setBlingClientSecret] = useState(inicial?.blingClientSecret ?? '')
  // Começa sempre vazio, mesmo na edição: o valor salvo não chega aqui. Vazio
  // significa "mantém o que está lá".
  const [mcpaiEndpointUrl, setMcpaiEndpointUrl] = useState('')
  const [mcpaiRemover, setMcpaiRemover] = useState(false)
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
        await criarGrupoAction(dados)
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === 'criar' ? 'Novo Grupo' : 'Editar Grupo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: BH" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CNPJ *</Label>
            <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="h-9 text-sm" />
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Dados para contrato</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Razão social</Label>
              <Input
                value={razaoSocial}
                onChange={e => setRazaoSocial(e.target.value)}
                placeholder="MOTOCHEFE SUL DE MINAS LTDA."
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
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
              <p className="text-[11px] text-slate-400">
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
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Sem estes três campos, o envio de contrato para assinatura fica bloqueado neste grupo.
              </p>
            )}
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Integrações (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client ID</Label>
                <Input value={blingClientId} onChange={e => setBlingClientId(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client Secret</Label>
                <Input type="password" value={blingClientSecret} onChange={e => setBlingClientSecret(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
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
                  <p className="text-[11px] text-emerald-700">
                    Configurada: {inicial.mcpaiResumo}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMcpaiRemover(v => !v); setMcpaiEndpointUrl('') }}
                    className="text-[11px] text-slate-400 hover:text-red-600 underline underline-offset-2"
                  >
                    {mcpaiRemover ? 'Cancelar remoção' : 'Remover chave'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600">
                  Sem chave própria, esta empresa usa a conta global do sistema — e só enxerga extrato,
                  PIX e cartão se o CNPJ dela estiver conectado lá.
                </p>
              )}
              {mcpaiRemover && (
                <p className="text-[11px] text-red-600">
                  A chave será apagada ao salvar. Os módulos de Open Finance desta empresa voltam para a conta global.
                </p>
              )}
            </div>
            <p className="text-xs text-slate-400">
              A URL do mcp.ai é gravada cifrada e nunca volta para esta tela — por isso o campo aparece vazio.
              Bling é a emissão de NF-e. O login da fábrica fica no cadastro de cada loja.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativo" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            <Label htmlFor="ativo" className="text-xs">Grupo ativo</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NovoGrupoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Novo Grupo
      </Button>
      <GrupoDialog modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}

export function EditarGrupoButton({ grupo }: { grupo: Grupo }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-700 p-1" title="Editar">
        <Pencil size={14} />
      </button>
      <GrupoDialog key={grupo.id} modo="editar" inicial={grupo} open={open} onOpenChange={setOpen} />
    </>
  )
}
