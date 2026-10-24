import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojaIdsDoGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { montagensPorMecanico, montagensDetalhadas } from '@/lib/queries/montagens'
import { MontagensFiltros } from './components/montagens-filtros'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Primeiro dia do mês corrente em BRT — mesmo default das outras telas. */
function inicioDoMes(): string {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function MontagensPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; mecanico?: string; loja?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/montagens')) redirect('/dashboard')

  const params = await searchParams
  const dataInicio = params.de ?? inicioDoMes()
  const dataFim = params.ate || undefined

  const lojasGrupo = await listarLojasDoGrupoAtivo(usuario)
  const idsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaSel = params.loja?.split(',').filter(Boolean) ?? []
  // Loja fora do grupo ativo é ignorada — o filtro nunca amplia o escopo.
  const lojaIds = lojaSel.length && lojaSel.every(id => idsGrupo.includes(id)) ? lojaSel : idsGrupo

  const [porMecanico, detalhe] = await Promise.all([
    montagensPorMecanico({ lojaIds, dataInicio, dataFim }),
    montagensDetalhadas({ lojaIds, dataInicio, dataFim, mecanicoId: params.mecanico }),
  ])

  const total = porMecanico.reduce((s, m) => s + m.total, 0)
  const selecionado = params.mecanico
    ? porMecanico.find(m => m.mecanicoId === params.mecanico)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Montagens</h1>
        <p className="text-muted-foreground text-sm">Motos montadas por mecânico</p>
      </div>

      <MontagensFiltros
        lojas={lojasGrupo}
        mecanicos={porMecanico.map(m => ({ id: m.mecanicoId, nome: m.mecanico }))}
        dataInicioInicial={dataInicio}
        dataFimInicial={params.ate ?? ''}
      />

      <div className="bg-card rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="font-semibold text-sm">Total por mecânico</h2>
          <span className="text-sm text-muted-foreground">
            {total} montagem{total !== 1 ? 'ns' : ''} no período
          </span>
        </div>
        {porMecanico.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Nenhuma montagem registrada no período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mecânico</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Montagens</TableHead>
                <TableHead className="text-right">Dias com montagem</TableHead>
                <TableHead className="text-right">Média por dia</TableHead>
                <TableHead>Período</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porMecanico.map(m => (
                <TableRow key={m.mecanicoId}>
                  <TableCell className="font-medium">{m.mecanico}</TableCell>
                  <TableCell className="text-muted-foreground">{m.loja ?? '—'}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{m.total}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{m.diasTrabalhados}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.diasTrabalhados > 0 ? (m.total / m.diasTrabalhados).toFixed(1) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {m.primeira?.split('-').reverse().join('/')} a {m.ultima?.split('-').reverse().join('/')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="bg-card rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="font-semibold text-sm">
            Motos montadas{selecionado ? ` — ${selecionado.mecanico}` : ''}
          </h2>
          {detalhe.length === 500 && (
            <span className="text-xs text-warning">
              mostrando as 500 mais recentes — reduza o período
            </span>
          )}
        </div>
        {detalhe.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nada a listar.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Mecânico</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Chassi</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Loja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalhe.map(d => (
                <TableRow key={d.chassi}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {d.data?.split('-').reverse().join('/')}
                  </TableCell>
                  <TableCell>{d.mecanico}</TableCell>
                  <TableCell className="font-medium">{d.marca} {d.modelo}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.chassi}</TableCell>
                  <TableCell>{d.cor}</TableCell>
                  <TableCell className="text-muted-foreground">{d.loja ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
