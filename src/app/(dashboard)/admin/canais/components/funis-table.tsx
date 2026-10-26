'use client'
import { useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { definirGrupoFunilAction } from '../actions'

type Funil = { pipelineId: string; funil: string; leads: number; leads90: number; grupoId: string | null }
type Grupo = { id: string; nome: string }

export function FunisTable({ funis, grupos }: { funis: Funil[]; grupos: Grupo[] }) {
  const [pending, startTransition] = useTransition()
  const semGrupo = funis.filter(f => !f.grupoId && f.leads90 > 0)

  function alterar(pipelineId: string, valor: string) {
    startTransition(async () => {
      try {
        await definirGrupoFunilAction(pipelineId, valor || null)
        toast.success('Funil reclassificado')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        É daqui que o relatório de Marketing tira o grupo de cada lead — e não do vendedor responsável,
        que deixa de fora todo lead de funil sem vendedor cadastrado no Mova. Funil sem grupo não entra
        em relatório nenhum.
      </p>
      {semGrupo.length > 0 && (
        <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded px-3 py-2">
          {semGrupo.length} funil(is) com movimento recente e sem grupo:{' '}
          {semGrupo.map(f => f.funil).join(', ')}.
        </p>
      )}
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funil (Kommo)</TableHead>
              <TableHead className="text-right">Leads (90d)</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-64">Grupo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funis.map(f => (
              <TableRow key={f.pipelineId} className={!f.grupoId ? 'bg-warning/5' : undefined}>
                <TableCell className="font-medium">{f.funil}</TableCell>
                <TableCell className="text-right tabular-nums">{f.leads90.toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.leads.toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  {/* <select> nativo: value é uuid e o label é o nome — caso em que
                      o <Select> do base-ui mostra o uuid cru na tela. */}
                  <select
                    className="h-9 w-full rounded-md border px-2 text-sm bg-card"
                    defaultValue={f.grupoId ?? ''}
                    disabled={pending}
                    onChange={e => alterar(f.pipelineId, e.target.value)}
                  >
                    <option value="">— não classificado —</option>
                    {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
