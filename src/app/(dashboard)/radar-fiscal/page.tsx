import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { nfeDfeSync } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { listarNotasRecebidas } from '@/lib/queries/nfe-recebidas'
import { CSTAT_DOCUMENTO_LOCALIZADO, CSTAT_NENHUM_DOCUMENTO } from '@/lib/sefaz/nsu'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Radar } from 'lucide-react'
import { RadarFiltros } from './components/radar-filtros'
import { NotaDownloads } from './components/nota-downloads'

// cStat "bom" é só um destes dois: 138 (documento localizado) ou 137 (nenhum
// documento — fila em dia). Qualquer outro (656 — consumo indevido, rejeição,
// etc.) significa que a sincronização não está fluindo normal, mesmo que
// `ultimo_erro` esteja nulo — foi exatamente o caso real de hoje: cStat 656
// gravado com sucesso (o INSERT não falhou), `ultimo_erro` nulo, e a tela
// não dizia nada de errado.
const CSTAT_BONS = new Set([CSTAT_DOCUMENTO_LOCALIZADO, CSTAT_NENHUM_DOCUMENTO])
// O cron roda 1x/dia (0 11 * * *, 8h de Brasília — plano Hobby só tem 1 cron
// por dia) e `atualizado_em` é carimbado no INÍCIO da execução. Com isso o
// intervalo normal entre dois carimbos já é ~24h cravado — um limiar de 24h
// pintava o banner quase todo dia mesmo sem nada errado, só pelo cron ter
// rodado um pouco mais tarde que ontem. 30h dá folga pra variação normal do
// horário do cron sem deixar de avisar quando realmente parou.
const HORAS_PARA_CONSIDERAR_PARADA = 30

const brl = (v: string | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type SearchParams = { de?: string; ate?: string; emitente?: string; busca?: string; pendentes?: string }

export default async function RadarFiscalPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/radar-fiscal')) redirect('/dashboard')

  const params = await searchParams
  // AAAA-MM-DD ou nada — formato solto (não validado a fundo) só vira filtro
  // quando os dois lados do período vêm preenchidos; qualquer coisa fora
  // desse formato (ou dentro do formato mas inexistente no calendário, tipo
  // "9999-99-99" ou "2026-02-30") cai no ::timestamptz do banco e quebraria
  // a página inteira — Server Component sem try/catch. Regra da casa é
  // avisar, não travar: data ruim ignora o filtro (some do período aplicado,
  // não derruba a tela) em vez de propagar o erro do Postgres. Uma URL colada
  // à mão é o jeito real disso acontecer; o <input type="date"> não produz.
  function dataValida(v?: string): v is string {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
    const [ano, mes, dia] = v.split('-').map(Number)
    if (mes < 1 || mes > 12) return false
    // Dia 0 do mês seguinte = último dia do mês corrente (em UTC, sem fuso
    // interferindo) — cobre fevereiro e ano bissexto sem tabela de dias fixa.
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    return dia >= 1 && dia <= diasNoMes
  }
  const deBruta = params.de
  const ateBruta = params.ate
  const de = dataValida(deBruta) ? deBruta : ''
  const ate = dataValida(ateBruta) ? ateBruta : ''
  const periodoInvalido = (deBruta !== undefined && !dataValida(deBruta)) || (ateBruta !== undefined && !dataValida(ateBruta))
  const emitente = params.emitente ?? ''
  const busca = params.busca ?? ''
  const soNaoLancadas = params.pendentes === '1'

  const grupo = await getGrupoAtivo(usuario)
  const [notas, [sync]] = await Promise.all([
    listarNotasRecebidas(grupo.id, {
      de: de || undefined,
      ate: ate || undefined,
      emitente: emitente || undefined,
      busca: busca || undefined,
      soNaoLancadas,
    }),
    db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, grupo.id)).limit(1),
  ])

  const pendentes = notas.filter(n => !n.jaLancada && n.situacao !== 'cancelada')

  // C3(b): sinaliza "sincronização parada" quando o último cStat não é dos
  // bons OU quando faz mais de 24h que não roda — as duas coisas
  // independentes de `ultimo_erro`, que só é preenchido em falha de rede/
  // certificado, não em cStat de rejeição (a chamada "deu certo", só que a
  // SEFAZ recusou/bloqueou). Sem `sync` (grupo nunca sincronizou), o card
  // "Última sincronização" abaixo já diz "ainda não rodou" — não duplica aqui.
  const horasDesdeAtualizacao = sync
    ? (Date.now() - sync.atualizadoEm.getTime()) / (60 * 60 * 1000)
    : null
  const sincronizacaoParada = sync != null && (
    sync.ultimoCstat == null ||
    !CSTAT_BONS.has(sync.ultimoCstat) ||
    (horasDesdeAtualizacao !== null && horasDesdeAtualizacao > HORAS_PARA_CONSIDERAR_PARADA)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Recebidas — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Toda NF-e emitida contra o CNPJ do grupo, direto da SEFAZ. A consulta roda uma vez por
          dia e alcança os últimos 90 dias — nota mais antiga que isso a SEFAZ não distribui mais.
        </p>
      </div>

      <RadarFiltros deInicial={de} ateInicial={ate} emitenteInicial={emitente} buscaInicial={busca} />

      {periodoInvalido && (
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Período informado na URL é inválido — ignorado. Mostrando o período padrão.</span>
        </p>
      )}

      {sync?.ultimoErro && (
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Última sincronização falhou: {sync.ultimoErro}</span>
        </p>
      )}

      {sincronizacaoParada && sync && (
        <p className="flex gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Sincronização parada — a SEFAZ respondeu cStat {sync.ultimoCstat ?? '—'} em{' '}
            {sync.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, e não é um retorno
            normal (137/138) ou já faz mais de {HORAS_PARA_CONSIDERAR_PARADA}h sem rodar. A tela pode estar
            desatualizada até isso ser resolvido.
          </span>
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

      <p className="text-xs text-slate-400">
        &quot;Já lançada&quot; casa pelo número da nota (não pelo CNPJ do emitente) com o que está registrado no
        estoque — duas notas de emitentes diferentes com o mesmo número podem marcar &quot;já lançada&quot; por
        engano, escondendo uma nota pendente de verdade.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Emissão</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Número</TableHead>
                <TableHead className="pr-4">Situação</TableHead>
                <TableHead className="pr-4">Baixar</TableHead>
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
                  {/* A chave de 44 dígitos não diz nada pra quem olha — o número é o que
                      aparece no documento, no e-mail do fornecedor e no cadastro da moto.
                      A chave continua acessível no title (mouse por cima), pra consultar
                      no portal da SEFAZ ou conferir. */}
                  <TableCell className="font-mono text-xs text-slate-500" title={n.chave}>
                    {n.numeroNota}
                  </TableCell>
                  <TableCell className="pr-4">
                    {n.situacao === 'cancelada'
                      ? <Badge variant="secondary" className="text-xs">Cancelada</Badge>
                      : n.jaLancada
                        ? <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">Já lançada</Badge>
                        : <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">Não lançada</Badge>}
                  </TableCell>
                  <TableCell className="pr-4">
                    <NotaDownloads chave={n.chave} temXml={n.temXml} />
                  </TableCell>
                </TableRow>
              ))}
              {notas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12">
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
