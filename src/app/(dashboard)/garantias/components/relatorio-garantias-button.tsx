'use client'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

type Loja   = { id: string; nome: string }
type Modelo = { id: string; modelo: string }

type Props = {
  lojas:   Loja[]
  modelos: Modelo[]
  isAdmin: boolean
}

const STATUS_FABRICA_OPTS = [
  'Aguardando Separação',
  'Em Separação',
  'Separado',
  'Aguardando Reposição',
  'Em Exigência',
  'Em auditoria',
  'Em avaliação SAC',
  'Em avaliação do técnico',
  'Em conferência',
  'Pedido enviado',
  'Entregue',
  'Garantia concluída',
  'Aguardando Postagem Reversa',
  'Aguardando devolução',
  'Rejeitado',
  'Cancelado',
]

export function RelatorioGarantiasButton({ lojas, modelos, isAdmin }: Props) {
  const [aberto, setAberto]               = useState(false)
  const [status, setStatus]               = useState('')
  const [lojaId, setLojaId]               = useState('')
  const [modeloId, setModeloId]           = useState('')
  const [statusFabrica, setStatusFabrica] = useState('')
  const [dataInicio, setDataInicio]       = useState('')
  const [dataFim, setDataFim]             = useState('')

  function resetar() {
    setStatus('')
    setLojaId('')
    setModeloId('')
    setStatusFabrica('')
    setDataInicio('')
    setDataFim('')
  }

  function abrirRelatorio() {
    const p = new URLSearchParams()
    if (status)        p.set('status', status)
    if (lojaId)        p.set('lojaId', lojaId)
    if (modeloId)      p.set('modeloId', modeloId)
    if (statusFabrica) p.set('statusFabrica', statusFabrica)
    if (dataInicio)    p.set('dataInicio', dataInicio)
    if (dataFim)       p.set('dataFim', dataFim)
    window.open(`/garantias-relatorio?${p.toString()}`, '_blank')
    setAberto(false)
    resetar()
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { resetar(); setAberto(true) }}
        className="h-9 gap-1.5 text-slate-600"
      >
        <FileText size={15} />
        Relatório
      </Button>

      <Dialog open={aberto} onOpenChange={v => setAberto(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Relatório de Garantias</DialogTitle>
            <p className="text-sm text-slate-500">
              Selecione os filtros e abra o relatório em PDF.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status || '__todos'} onValueChange={(v: string | null) => setStatus(!v || v === '__todos' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos">Todos</SelectItem>
                    <SelectItem value="ativa">Ativas</SelectItem>
                    <SelectItem value="encerrada">Encerradas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Loja</Label>
                  <Select value={lojaId || '__todas'} onValueChange={(v: string | null) => setLojaId(!v || v === '__todas' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todas">Todas</SelectItem>
                      {lojas.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Select value={modeloId || '__todos'} onValueChange={(v: string | null) => setModeloId(!v || v === '__todos' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos os modelos</SelectItem>
                  {modelos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Status na fábrica</Label>
              <Select value={statusFabrica || '__todos'} onValueChange={(v: string | null) => setStatusFabrica(!v || v === '__todos' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos</SelectItem>
                  <SelectItem value="__sem">Sem pedido na fábrica</SelectItem>
                  {STATUS_FABRICA_OPTS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Período de abertura</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={e => setDataInicio(e.target.value)}
                  className="h-9 text-sm flex-1"
                />
                <span className="text-slate-400 text-sm">até</span>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={e => setDataFim(e.target.value)}
                  className="h-9 text-sm flex-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={abrirRelatorio} className="gap-1.5">
              <FileText size={15} />
              Abrir Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
