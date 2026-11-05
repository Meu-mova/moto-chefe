'use client'
import { useState, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Printer } from 'lucide-react'

/**
 * Parte comum aos dois padrões do simulador: escolha do modelo, cabeçalho com foto e nome, e a
 * abertura da impressão. Cada padrão entrega só o miolo (cards, frete, tabelas) e o HTML do papel.
 */

type ModeloBase = { id: string; nome: string; imagemUrl: string | null }

export function SimuladorCasco<M extends ModeloBase>({ modelos, children }: {
  modelos: M[]
  children: (modelo: M) => ReactNode
}) {
  const [modeloId, setModeloId] = useState('')
  const modelo = modelos.find(m => m.id === modeloId) ?? null

  return (
    <>
      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-6">
        <div className="sm:max-w-sm space-y-1.5">
          <Label className="text-sm font-medium text-foreground">Selecione o modelo</Label>
          <Select value={modeloId} onValueChange={v => setModeloId(v ?? '')}>
            <SelectTrigger className="h-11 text-base w-full">
              <span className={modelo ? 'text-foreground' : 'text-muted-foreground'}>
                {modelo?.nome ?? 'Escolha um modelo...'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {modelos.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {modelo ? (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="border-b bg-muted flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4">
            {modelo.imagemUrl && (
              <img
                src={modelo.imagemUrl}
                alt={modelo.nome}
                className="h-16 w-24 sm:h-24 sm:w-36 object-contain rounded-lg bg-card border p-1 shrink-0"
              />
            )}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">{modelo.nome}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Condições de pagamento</p>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-6">{children(modelo)}</div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm flex items-center justify-center py-24 text-muted-foreground">
          <p>Selecione um modelo acima para ver as condições</p>
        </div>
      )}
    </>
  )
}

export function BotaoImprimir({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <Button onClick={onClick} variant="outline" className={`gap-2 ${className}`}>
      <Printer size={16} />
      Imprimir / Salvar PDF
    </Button>
  )
}

// A janela da simulação não carrega o globals.css: cada var(--x) usada na folha recebe o valor
// lido de um .tema-claro, para o papel sair claro mesmo com o escuro ligado na tela.
function comPaletaClara(html: string) {
  const nomes = [...new Set(Array.from(html.matchAll(/var\(--([\w-]+)\)/g), (m) => m[1]))]
  const sonda = document.createElement('div')
  sonda.className = 'tema-claro'
  document.body.appendChild(sonda)
  const estilo = getComputedStyle(sonda)
  const declaracoes = nomes.map((nome) => `--${nome}: ${estilo.getPropertyValue(`--${nome}`).trim()};`).join(' ')
  sonda.remove()
  return html.replace('<style>', `<style>\n    :root { ${declaracoes} }`)
}

export function abrirImpressao(html: string) {
  const blob = new Blob([comPaletaClara(html)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=780,height=960')
  win?.focus()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
