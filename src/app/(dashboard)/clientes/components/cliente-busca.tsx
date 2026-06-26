'use client'

import React, { useRef, useState, useEffect } from 'react'
import { Loader2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { buscarClientesAction, criarClienteAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function formatarCpfCnpj(v: string | null | undefined): string {
  if (!v) return ''
  const digits = v.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return v
}

type ResultadoBusca = {
  id: string
  nome: string
  cpfCnpj: string | null
  celular: string | null
}

type Props = {
  onSelect: (id: string, nome: string, cpfCnpj: string | null) => void
  clienteSelecionado?: { id: string; nome: string } | null
  onClear?: () => void
  label?: string
}

export function ClienteBusca({
  onSelect,
  clienteSelecionado,
  onClear,
  label = 'Cliente',
}: Props) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)

  const [novoOpen, setNovoOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCelular, setNovoCelular] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [novoTipo, setNovoTipo] = useState<'fisica' | 'juridica'>('fisica')
  const [salvando, setSalvando] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setTermo(val)
    setAberto(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (val.length >= 3) {
      debounceRef.current = setTimeout(async () => {
        setBuscando(true)
        try {
          const res = await buscarClientesAction(val)
          setResultados(res)
          setAberto(true)
        } catch {
          // silencia erro de busca
        } finally {
          setBuscando(false)
        }
      }, 300)
    } else {
      setResultados([])
    }
  }

  function handleSelect(r: ResultadoBusca) {
    onSelect(r.id, r.nome, r.cpfCnpj)
    setTermo('')
    setResultados([])
    setAberto(false)
  }

  async function handleSalvarNovo() {
    if (!novoNome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    setSalvando(true)
    try {
      const id = await criarClienteAction({
        nome: novoNome.trim(),
        tipoPessoa: novoTipo,
        cpfCnpj: novoCpf.trim() || null,
        celular: novoCelular.trim() || null,
        sexo: 'nao_identificado',
      })
      onSelect(id, novoNome.trim(), novoCpf.trim() || null)
      setNovoOpen(false)
      setNovoNome('')
      setNovoCelular('')
      setNovoCpf('')
      setNovoTipo('fisica')
      toast.success('Cliente cadastrado com sucesso')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar cliente')
    } finally {
      setSalvando(false)
    }
  }

  if (clienteSelecionado) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/50 px-2.5 py-1 text-sm">
        <span className="flex-1 truncate">{clienteSelecionado.nome}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remover cliente"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={termo}
          onChange={handleChange}
          placeholder={`Buscar ${label} por nome ou CPF/CNPJ...`}
          autoComplete="off"
        />
        {buscando && (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover text-popover-foreground shadow-md">
          {resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum cliente encontrado
            </p>
          ) : (
            resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-semibold">{r.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {r.cpfCnpj ? formatarCpfCnpj(r.cpfCnpj) : 'Sem CPF/CNPJ'}
                  {r.celular ? ` · ${r.celular}` : ''}
                </span>
              </button>
            ))
          )}
          <div className="border-t">
            <button
              type="button"
              onClick={() => {
                setNovoOpen(true)
                setAberto(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <UserPlus className="size-4" />
              Cadastrar novo cliente
            </button>
          </div>
        </div>
      )}

      <Dialog open={novoOpen} onOpenChange={(open) => setNovoOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar novo cliente</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="novo-nome">Nome *</Label>
              <Input
                id="novo-nome"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome completo"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="novo-tipo">Tipo de pessoa</Label>
              <Select
                value={novoTipo}
                onValueChange={(v) => setNovoTipo(v as 'fisica' | 'juridica')}
              >
                <SelectTrigger id="novo-tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Pessoa Física</SelectItem>
                  <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="novo-cpf">CPF/CNPJ</Label>
              <Input
                id="novo-cpf"
                value={novoCpf}
                onChange={(e) => setNovoCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="novo-celular">Celular</Label>
              <Input
                id="novo-celular"
                value={novoCelular}
                onChange={(e) => setNovoCelular(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNovoOpen(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button onClick={handleSalvarNovo} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
