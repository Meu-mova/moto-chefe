'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { UserPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarCpfCnpj, soDigitosDoc } from '@/lib/documento'
import { editarClienteVendaPecaAction } from '../actions'

type Props = {
  vendaId: string
  numero: number
  clienteNome: string | null
  clienteDocumento: string | null
  clienteTipoPessoa: string
}

// Corrige só o tomador (nome digitado errado no balcão). Itens e pagamentos têm o
// próprio "Editar"; aqui nada mexe em estoque nem conciliação.
export function EditarClienteVendaPecaDialog({ vendaId, numero, clienteNome, clienteDocumento, clienteTipoPessoa }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [nome, setNome] = useState('')
  const [tipoPessoa, setTipoPessoa] = useState('fisica')
  const [documento, setDocumento] = useState('')

  function abrir() {
    setNome(clienteNome ?? '')
    setTipoPessoa(clienteTipoPessoa === 'juridica' ? 'juridica' : 'fisica')
    setDocumento(clienteDocumento ? formatarCpfCnpj(clienteDocumento) : '')
    setOpen(true)
  }

  // Espelha validarDocumento do servidor só pra desabilitar o botão.
  const digitosDoc = soDigitosDoc(documento)
  const clientePJOk = tipoPessoa !== 'juridica' || (digitosDoc.length === 14 && nome.trim().length > 0)

  function salvar() {
    start(async () => {
      try {
        await editarClienteVendaPecaAction(vendaId, {
          clienteNome: nome.trim() || null,
          clienteTipoPessoa: tipoPessoa,
          clienteDocumento: digitosDoc || null,
        })
        toast.success(`Cliente da venda #${numero} atualizado`)
        setOpen(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar o cliente')
      }
    })
  }

  return (
    <>
      <Button variant="outline" onClick={abrir} className="h-10 flex-1 gap-1.5">
        <UserPen className="size-4" /> Cliente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cliente da venda de peças #{numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <Label>Tipo de cliente</Label>
              {/* <select> nativo: o Select do base-ui mostra o value cru quando ele
                  não é o rótulo exibido. */}
              <select
                value={tipoPessoa}
                onChange={e => setTipoPessoa(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="fisica">Pessoa física</option>
                <option value="juridica">Empresa (CNPJ)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{tipoPessoa === 'juridica' ? 'Razão social *' : 'Cliente (opcional)'}</Label>
              <Input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder={tipoPessoa === 'juridica' ? 'Razão social da empresa' : 'Nome do cliente'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tipoPessoa === 'juridica' ? 'CNPJ *' : 'CPF (opcional)'}</Label>
              <Input
                value={documento}
                onChange={e => setDocumento(e.target.value)}
                placeholder={tipoPessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                className="font-mono"
              />
              {tipoPessoa === 'juridica' && !clientePJOk && (
                <p className="text-xs text-warning">Venda para empresa exige razão social e CNPJ com 14 dígitos.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">O recibo passa a sair com estes dados. Itens, pagamentos e conciliação não mudam.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !clientePJOk}>{pending ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
