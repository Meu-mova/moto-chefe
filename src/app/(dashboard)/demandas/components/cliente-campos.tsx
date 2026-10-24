'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Search, UserCheck, UserX, Loader2 } from 'lucide-react'
import { buscarClientePorCpfAction } from '../../vendas/actions'
import { lerDocumentoCliente, soDigitosDoc, tipoPessoaSeCompleto } from '@/lib/documento'
import { DocumentoClienteInput, TipoPessoaEtiqueta } from '@/components/documento-cliente'

export type ClienteForm = {
  clienteNome: string
  clienteCpf: string
  clienteCelular: string
  clienteEmail: string
  clienteCep: string
  clienteLogradouro: string
  clienteNumero: string
  clienteComplemento: string
  clienteBairro: string
  clienteCidade: string
  clienteEstado: string
}

export const CLIENTE_VAZIO: ClienteForm = {
  clienteNome: '', clienteCpf: '', clienteCelular: '', clienteEmail: '',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '',
  clienteBairro: '', clienteCidade: '', clienteEstado: '',
}

export function clienteCompleto(v: ClienteForm): boolean {
  return !!(v.clienteNome.trim() && lerDocumentoCliente(v.clienteCpf).ok && v.clienteCelular.trim())
}

export function ClienteCampos({ value, onChange }: { value: ClienteForm; onChange: React.Dispatch<React.SetStateAction<ClienteForm>> }) {
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [status, setStatus] = useState<'encontrado' | 'nao-encontrado' | null>(null)

  // Atualização funcional, não `{ ...value, ...patch }`: as buscas de CPF e CEP
  // são disparadas no mesmo render em que o campo muda, então o `value` que elas
  // enxergam é o de ANTES da última tecla. Mesclar contra ele devolvia o campo ao
  // estado anterior — o CPF perdia o último dígito e o botão nunca habilitava.
  const set = (patch: Partial<ClienteForm>) => onChange(prev => ({ ...prev, ...patch }))

  function handleDocumento(mascarado: string) {
    set({ clienteCpf: mascarado })
    setStatus(null)
    if (tipoPessoaSeCompleto(mascarado)) buscarClientePorCpf(soDigitosDoc(mascarado))
  }

  async function buscarClientePorCpf(cpfDigits: string) {
    setBuscandoCliente(true)
    try {
      const r = await buscarClientePorCpfAction(cpfDigits)
      if (r) {
        const cepDigits = (r.cep ?? '').replace(/\D/g, '')
        set({
          clienteNome: r.nome ?? '',
          clienteCelular: r.celular ?? '',
          clienteEmail: r.email ?? '',
          clienteCep: cepDigits.length === 8 ? cepDigits.replace(/(\d{5})(\d{3})/, '$1-$2') : '',
          clienteLogradouro: r.logradouro ?? '',
          clienteNumero: r.numero ?? '',
          clienteComplemento: r.complemento ?? '',
          clienteBairro: r.bairro ?? '',
          clienteCidade: r.cidade ?? '',
          clienteEstado: r.estado ?? '',
        })
        setStatus('encontrado')
      } else {
        setStatus('nao-encontrado')
      }
    } catch {
      // silencioso
    } finally {
      setBuscandoCliente(false)
    }
  }

  function handleCelular(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    set({ clienteCelular: d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2') })
  }

  function handleCep(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8)
    set({ clienteCep: d.replace(/(\d{5})(\d{1,3})$/, '$1-$2') })
    if (d.length === 8) buscarCepDigits(d)
  }

  async function buscarCepDigits(digits: string) {
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) return
      set({
        clienteLogradouro: data.logradouro ?? '',
        clienteBairro: data.bairro ?? '',
        clienteCidade: data.localidade ?? '',
        clienteEstado: data.uf ?? '',
      })
    } catch {
      // silencioso
    } finally {
      setBuscandoCep(false)
    }
  }

  const juridica = tipoPessoaSeCompleto(value.clienteCpf) === 'juridica'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 h-5">
        {buscandoCliente && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        {!buscandoCliente && status === 'encontrado' && (
          <span className="flex items-center gap-1 text-xs text-success bg-success/10 border border-success/30 rounded px-1.5 py-0.5">
            <UserCheck size={11} /> Dados carregados do cadastro
          </span>
        )}
        {!buscandoCliente && status === 'nao-encontrado' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
            <UserX size={11} /> Novo cliente — preencha os dados abaixo
          </span>
        )}
        <TipoPessoaEtiqueta documento={value.clienteCpf} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>CPF/CNPJ <span className="text-destructive">*</span></Label>
          <DocumentoClienteInput value={value.clienteCpf} onChange={handleDocumento} ocultarValido={buscandoCliente} />
        </div>
        <div className="space-y-1">
          <Label>Celular <span className="text-destructive">*</span></Label>
          <Input value={value.clienteCelular} onChange={e => handleCelular(e.target.value)} placeholder="(00) 00000-0000" />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>{juridica ? 'Razão social' : 'Nome completo'} <span className="text-destructive">*</span></Label>
          <Input value={value.clienteNome} onChange={e => set({ clienteNome: e.target.value })} placeholder={juridica ? 'Razão social da empresa' : 'Nome completo do cliente'} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>E-mail</Label>
          <Input type="email" value={value.clienteEmail} onChange={e => set({ clienteEmail: e.target.value })} placeholder="email@exemplo.com" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>CEP</Label>
          <div className="flex gap-2">
            <Input value={value.clienteCep} onChange={e => handleCep(e.target.value)} placeholder="00000-000" />
            <Button type="button" variant="outline" size="icon" disabled={buscandoCep} title="Buscar CEP"
              onClick={() => buscarCepDigits(value.clienteCep.replace(/\D/g, ''))}>
              {buscandoCep ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <Input value={value.clienteEstado} onChange={e => set({ clienteEstado: e.target.value.toUpperCase().slice(0, 2) })} placeholder="SP" maxLength={2} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>Logradouro</Label>
          <Input value={value.clienteLogradouro} onChange={e => set({ clienteLogradouro: e.target.value })} placeholder="Rua, Avenida..." />
        </div>
        <div className="space-y-1">
          <Label>Número</Label>
          <Input value={value.clienteNumero} onChange={e => set({ clienteNumero: e.target.value })} placeholder="123" />
        </div>
        <div className="space-y-1">
          <Label>Complemento</Label>
          <Input value={value.clienteComplemento} onChange={e => set({ clienteComplemento: e.target.value })} placeholder="Apto, Bloco..." />
        </div>
        <div className="space-y-1">
          <Label>Bairro</Label>
          <Input value={value.clienteBairro} onChange={e => set({ clienteBairro: e.target.value })} placeholder="Bairro" />
        </div>
        <div className="space-y-1">
          <Label>Cidade</Label>
          <Input value={value.clienteCidade} onChange={e => set({ clienteCidade: e.target.value })} placeholder="Cidade" />
        </div>
      </div>
    </div>
  )
}
