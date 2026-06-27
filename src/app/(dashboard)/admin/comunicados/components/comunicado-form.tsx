'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { criarComunicadoAction } from '../actions'

export function ComunicadoForm() {
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [agendar, setAgendar] = useState(false)
  const [dataPostagem, setDataPostagem] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

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
        dataPostagem: agendar ? dataPostagem : null,
      })
      setTitulo('')
      setConteudo('')
      setAtivo(true)
      setAgendar(false)
      setDataPostagem('')
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

      <div className="space-y-3 border rounded-lg p-3 bg-slate-50">
        <p className="text-sm font-medium text-slate-700">Postagem</p>
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
          className="h-4 w-4 rounded border-slate-300"
        />
        <Label htmlFor="ativo" className="cursor-pointer">Publicar (ativo)</Label>
      </div>

      {erro && <p className="text-sm text-red-500">{erro}</p>}
      {sucesso && <p className="text-sm text-green-600">Comunicado criado com sucesso!</p>}
      <Button type="submit" disabled={loading}>
        {loading ? 'Salvando...' : 'Criar Comunicado'}
      </Button>
    </form>
  )
}
