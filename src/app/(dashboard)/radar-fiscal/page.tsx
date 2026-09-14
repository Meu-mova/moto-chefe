import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { nfeDfeSync } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { listarNotasRecebidas } from '@/lib/queries/nfe-recebidas'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Radar } from 'lucide-react'

const brl = (v: string | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function RadarFiscalPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/radar-fiscal')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [notas, [sync]] = await Promise.all([
    listarNotasRecebidas(grupo.id),
    db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, grupo.id)).limit(1),
  ])

  const pendentes = notas.filter(n => !n.jaLancada && n.situacao !== 'cancelada')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Recebidas — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Toda NF-e emitida contra o CNPJ do grupo, direto da SEFAZ. A consulta roda de hora em
          hora e alcança os últimos 90 dias — nota mais antiga que isso a SEFAZ não distribui mais.
        </p>
      </div>

      {sync?.ultimoErro && (
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Última sincronização falhou: {sync.ultimoErro}</span>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Notas no período</p>
          <p className="text-xl font-bold mt-1">{notas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Não lançadas</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{pendentes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Última sincronização</p>
          <p className="text-sm mt-1 text-slate-700">
            {sync?.atualizadoEm
              ? sync.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
              : 'ainda não rodou'}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Emissão</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead className="pr-4">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map(n => (
                <TableRow key={n.chave}>
                  <TableCell className="pl-4 text-sm text-slate-500 whitespace-nowrap">
                    {n.dataEmissao.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{n.emitenteNome}</p>
                    <p className="text-xs text-slate-400">{n.emitenteCnpj}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(n.valor)}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-400">{n.chave}</TableCell>
                  <TableCell className="pr-4">
                    {n.situacao === 'cancelada'
                      ? <Badge variant="secondary" className="text-xs">Cancelada</Badge>
                      : n.jaLancada
                        ? <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">Já lançada</Badge>
                        : <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">Não lançada</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {notas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-12">
                    <Radar size={32} className="mx-auto mb-2 opacity-20" />
                    Nenhuma nota recebida no período
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
