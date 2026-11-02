'use client'

import { Ban, Download, Ellipsis, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { NotaEmitidaComInutilizacao } from '@/lib/queries/notas-emitidas'
import { temDocumento, type TipoArquivo } from '@/lib/notas-emitidas'
import { cn } from '@/lib/utils'

type Props = {
  nota: NotaEmitidaComInutilizacao
  /** podePedirInutilizacao(papel), a mesma regra do servidor (C1). */
  podeInutilizar: boolean
  /** Outro download em andamento: os itens de baixar esperam. */
  ocupado: boolean
  onVerMotivo: () => void
  onBaixar: (tipo: TipoArquivo) => void
  onInutilizar: () => void
  className?: string
}

/**
 * Menu de ações da nota, o mesmo na linha da tabela e no cartão (#597). Baixar só com
 * documento; "Inutilizar número" só na recusada elegível, para quem pode pedir.
 */
export function AcoesDaNota({ nota, podeInutilizar, ocupado, onVerMotivo, onBaixar, onInutilizar, className }: Props) {
  const doc = temDocumento(nota)
  const inutilizar = podeInutilizar && nota.inutilizacao.tipo === 'pode'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={cn('text-muted-foreground', className)} aria-label={`Ações da nota ${nota.numero ?? ''}`} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {nota.motivoStatus && <DropdownMenuItem onClick={onVerMotivo}><Eye /> Ver motivo completo</DropdownMenuItem>}
        <DropdownMenuItem disabled={!doc || ocupado} onClick={() => onBaixar('pdf')}><Download /> Baixar PDF</DropdownMenuItem>
        <DropdownMenuItem disabled={!doc || ocupado} onClick={() => onBaixar('xml')}><Download /> Baixar XML</DropdownMenuItem>
        {inutilizar && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onInutilizar}><Ban /> Inutilizar número</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
