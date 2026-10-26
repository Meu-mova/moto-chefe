'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { criarComunicadoAction } from '../actions'

const PAPEIS = [
  { value: 'admin_geral',  label: 'Admin Geral' },
  { value: 'admin_socio',  label: 'Admin / Sócio' },
  { value: 'aux_adm',      label: 'Aux. Administrativo' },
  { value: 'vendedor',     label: 'Vendedor' },
  { value: 'mecanico',     label: 'Mecânico' },
  { value: 'motorista',    label: 'Motorista' },
]

export function ComunicadoForm() {
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [agendar, setAgendar] = useState(false)
  const [dataPostagem, setDataPostagem] = useState('')
  const [papeisSelecionados, setPapeisSelecionados] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  function togglePapel(papel: string) {
    setPapeisSelecionados(prev =>
      prev.includes(papel) ? prev.filter(p => p !== papel) : [...prev, papel]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSucesso(false)
    if (agendar && !dataPostagem) {
      setErro('Informe a data e hora de postagem')
      return
    }
    setLoading(true)
    try {
      await criarComunicadoAction({
        titulo,
        conteudo,
        ativo,
        papeis: papeisSelecionados,
        dataPostagem: agendar ? dataPostagem : null,
      })
      setTitulo('')
      setConteudo('')
      setAtivo(true)
      setAgendar(false)
      setDataPostagem('')
      setPapeisSelecionados([])
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Título</Label>
        <Input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="Ex: Novo procedimento de venda"
          required
        />
      </div>
      <div className="space-y-1">
        <Label>Mensagem</Label>
        <Textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          rows={5}
          placeholder="Escreva a mensagem completa..."
          required
        />
      </div>

      <div className="space-y-2 border rounded-lg p-3 bg-muted">
        <p className="text-sm font-medium text-foreground">Destinatários</p>
        <p className="text-xs text-muted-foreground">
          {papeisSelecionados.length === 0
            ? 'Nenhuma função selecionada — enviará para todos os usuários'
            : `Apenas: ${papeisSelecionados.map(p => PAPEIS.find(r => r.value === p)?.label ?? p).join(', ')}`}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {PAPEIS.map(p => {
            const selecionado = papeisSelecionados.includes(p.value)
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePapel(p.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selecionado
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-input hover:border-info/50'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 border rounded-lg p-3 bg-muted">
        <p className="text-sm font-medium text-foreground">Postagem</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!agendar}
              onChange={() => setAgendar(false)}
              className="h-4 w-4"
            />
            <span className="text-sm">Postar agora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={agendar}
              onChange={() => setAgendar(true)}
              className="h-4 w-4"
            />
            <span className="text-sm">Agendar para</span>
          </label>
        </div>
        {agendar && (
          <Input
            type="datetime-local"
            value={dataPostagem}
            onChange={e => setDataPostagem(e.target.value)}
            className="max-w-xs"
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="ativo"
          checked={ativo}
          onChange={e => setAtivo(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="ativo" className="cursor-pointer">Publicar (ativo)</Label>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {sucesso && <p className="text-sm text-success">Comunicado criado com sucesso!</p>}
      <Button type="submit" disabled={loading}>
        {loading ? 'Salvando...' : 'Criar Comunicado'}
      </Button>
    </form>
  )
}
