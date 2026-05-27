// src/app/(dashboard)/estoque/components/moto-table.tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MotoComDetalhes } from '@/lib/queries/motos'

const statusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  faturada:    { label: 'Faturada',    variant: 'secondary' },
  montada:     { label: 'Montada',     variant: 'default' },
  disponivel:  { label: 'Disponível',  variant: 'default' },
  reservada:   { label: 'Reservada',   variant: 'outline' },
  em_garantia: { label: 'Em Garantia', variant: 'destructive' },
  vendida:     { label: 'Vendida',     variant: 'secondary' },
}

export function MotoTable({ motos }: { motos: MotoComDetalhes[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chassi</TableHead>
          <TableHead>Marca / Modelo</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {motos.map(moto => (
          <TableRow key={moto.id}>
            <TableCell className="font-mono text-xs">{moto.chassi}</TableCell>
            <TableCell>{moto.marca} {moto.modelo}</TableCell>
            <TableCell>{moto.categoria}</TableCell>
            <TableCell>{moto.cor}</TableCell>
            <TableCell>{moto.lojaNome}</TableCell>
            <TableCell>
              <Badge variant={statusBadge[moto.status]?.variant ?? 'secondary'}>
                {statusBadge[moto.status]?.label ?? moto.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Link href={`/estoque/${moto.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Ver
              </Link>
            </TableCell>
          </TableRow>
        ))}
        {motos.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
              Nenhuma moto encontrada.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
