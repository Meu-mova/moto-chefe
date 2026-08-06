'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { salvarNomeCanalAction } from '../actions'

type Canal = {
  sourceId: number
  origem: string | null
  perfil: string | null
  nome: string | null
  rotulo: string
  leads90: number
  funilPrincipal: string | null
}

function LinhaCanal({ canal }: { canal: Canal }) {
  const [nome, setNome] = useState(canal.nome ?? '')
  const [pending, startTransition] = useTransition()
  const mudou = (canal.nome ?? '') !== nome

  function salvar() {
    startTransition(async () => {
      try {
        await salvarNomeCanalAction(canal.sourceId, nome)
        toast.success(nome.trim() ? 'Canal renomeado' : 'Nome removido — volta ao automático')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{canal.rotulo}</TableCell>
      <TableCell className="text-slate-500 text-xs whitespace-nowrap">
        {canal.funilPrincipal ? `mais em ${canal.funilPrincipal}` : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">{canal.leads90.toLocaleString('pt-BR')}</TableCell>
      <TableCell>
        <div className="flex gap-2 items-center">
          <Input
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && mudou) salvar() }}
            placeholder={canal.rotulo}
            className="h-8"
          />
          <Button size="sm" variant={mudou ? 'default' : 'outline'} disabled={pending || !mudou} onClick={salvar}>
            {pending ? '...' : 'Salvar'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function CanaisTable({ canais }: { canais: Canal[] }) {
  const semNome = canais.filter(c => !c.nome && !c.perfil && c.leads90 > 0).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        O Kommo não devolve o nome do canal pela API — o sistema deduz o perfil quando consegue
        (Instagram, Facebook e alguns WhatsApp). O que ficou só com número, batize aqui: a coluna
        <strong> onde mais aparece</strong> é a pista de qual loja é aquele número.
        Deixar em branco volta ao nome automático.
      </p>
      {semNome > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {semNome} canal(is) com movimento nos últimos 90 dias ainda sem nome — no relatório aparecem
          como &quot;Canal 57985&quot;.
        </p>
      )}
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead>Onde mais aparece</TableHead>
              <TableHead className="text-right">Leads (90d)</TableHead>
              <TableHead className="w-96">Nome no relatório</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {canais.map(c => <LinhaCanal key={c.sourceId} canal={c} />)}
            {canais.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  Nenhum canal catalogado ainda — abra o Marketing e use &quot;Atualizar agora&quot;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
