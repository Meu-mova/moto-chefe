'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarClienteAction, atualizarClienteAction, type ClienteInput } from '../actions'

type Props = {
  trigger: React.ReactNode
  clienteInicial?: ClienteInput & { id: string }
}

const FORM_VAZIO: ClienteInput = {
  nome: '',
  tipoPessoa: 'fisica',
  cpfCnpj: '',
  sexo: 'nao_identificado',
  email: '',
  celular: '',
  cep: '',
  numero: '',
  endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

export function ClienteForm({ trigger, clienteInicial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<ClienteInput>(clienteInicial ?? FORM_VAZIO)

  const isEdit = Boolean(clienteInicial)

  function setFiltro(campo: string, valor: string) {
    const isRequired = campo === 'nome' || campo === 'tipoPessoa' || campo === 'sexo'
    setForm(prev => ({
      ...prev,
      [campo]: isRequired ? valor : (valor || null),
    }) as ClienteInput)
  }

  function handleOpen() {
    setForm(clienteInicial ?? FORM_VAZIO)
    setOpen(true)
  }

  async function buscarCep(cep: string) {
    const cepLimpo = cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const data = await res.json() as Record<string, string>
      if (data.erro) return
      setForm(prev => ({
        ...prev,
        endereco: data.logradouro ?? prev.endereco,
        bairro: data.bairro ?? prev.bairro,
        cidade: data.localidade ?? prev.cidade,
        uf: data.uf ?? prev.uf,
      }))
    } catch {
      // ignora falhas de lookup de CEP
    }
  }

  async function handleSalvar() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    setLoading(true)
    try {
      if (isEdit && clienteInicial) {
        await atualizarClienteAction(clienteInicial.id, form)
        toast.success('Cliente atualizado!')
      } else {
        await criarClienteAction(form)
        toast.success('Cliente cadastrado!')
      }
      setOpen(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={handleOpen} className="inline-flex cursor-pointer">
        {trigger}
      </div>
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v)
        if (!v && !clienteInicial) setForm(FORM_VAZIO)
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 pt-2">
            {/* Nome */}
            <div className="col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setFiltro('nome', e.target.value)}
                placeholder="Nome completo ou razão social"
              />
            </div>

            {/* Tipo de Pessoa */}
            <div className="space-y-1">
              <Label>Tipo de Pessoa</Label>
              <select
                value={form.tipoPessoa}
                onChange={e => setFiltro('tipoPessoa', e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="fisica">Pessoa Física</option>
                <option value="juridica">Pessoa Jurídica</option>
              </select>
            </div>

            {/* CPF/CNPJ */}
            <div className="space-y-1">
              <Label>CPF/CNPJ</Label>
              <Input
                value={form.cpfCnpj ?? ''}
                onChange={e => setFiltro('cpfCnpj', e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>

            {/* Sexo */}
            <div className="space-y-1">
              <Label>Sexo</Label>
              <select
                value={form.sexo}
                onChange={e => setFiltro('sexo', e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao_identificado">Não identificado</option>
              </select>
            </div>

            {/* Celular */}
            <div className="space-y-1">
              <Label>Celular</Label>
              <Input
                value={form.celular ?? ''}
                onChange={e => setFiltro('celular', e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>

            {/* E-mail */}
            <div className="col-span-2 space-y-1">
              <Label>E-mail</Label>
              <Input
                value={form.email ?? ''}
                onChange={e => setFiltro('email', e.target.value)}
                placeholder="email@exemplo.com"
                type="email"
              />
            </div>

            {/* CEP */}
            <div className="space-y-1">
              <Label>CEP</Label>
              <Input
                value={form.cep ?? ''}
                onChange={e => setFiltro('cep', e.target.value)}
                onBlur={e => buscarCep(e.target.value)}
                placeholder="00000-000"
              />
            </div>

            {/* Número */}
            <div className="space-y-1">
              <Label>Número</Label>
              <Input
                value={form.numero ?? ''}
                onChange={e => setFiltro('numero', e.target.value)}
                placeholder="123"
              />
            </div>

            {/* Endereço */}
            <div className="col-span-2 space-y-1">
              <Label>Endereço</Label>
              <Input
                value={form.endereco ?? ''}
                onChange={e => setFiltro('endereco', e.target.value)}
                placeholder="Rua, Avenida..."
              />
            </div>

            {/* Complemento */}
            <div className="space-y-1">
              <Label>Complemento</Label>
              <Input
                value={form.complemento ?? ''}
                onChange={e => setFiltro('complemento', e.target.value)}
                placeholder="Apto, Bloco..."
              />
            </div>

            {/* Bairro */}
            <div className="space-y-1">
              <Label>Bairro</Label>
              <Input
                value={form.bairro ?? ''}
                onChange={e => setFiltro('bairro', e.target.value)}
                placeholder="Bairro"
              />
            </div>

            {/* Cidade */}
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input
                value={form.cidade ?? ''}
                onChange={e => setFiltro('cidade', e.target.value)}
                placeholder="Cidade"
              />
            </div>

            {/* UF */}
            <div className="space-y-1">
              <Label>UF</Label>
              <Input
                value={form.uf ?? ''}
                onChange={e => setFiltro('uf', e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="UF"
              />
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleSalvar} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
