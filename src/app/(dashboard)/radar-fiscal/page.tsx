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
import { AtualizarSefaz } from './components/atualizar-sefaz'
import { podeConsultar } from '@/lib/sefaz/nsu'

// cStat "bom" é só um destes dois: 138 (documento localizado) ou 137 (nenhum
// documento — fila em dia). Qualquer outro (656 — consumo indevido, rejeição,
// etc.) significa que a sincronização não está fluindo normal, mesmo que
// `ultimo_erro` esteja nulo — foi exatamente o caso real de hoje: cStat 656
// gravado com sucesso (o INSERT não falhou), `ultimo_erro` nulo, e a tela
// não dizia nada de errado.
// A atualização (actions.ts) roda `sincronizarGrupo` neste mesmo segmento, e o
// laço de drenagem tem orçamento de 45s. Com o padrão da plataforma a action
// morreria antes de terminar um backlog — e morrer no meio não perde nota
// (cada iteração commita), mas devolve erro na cara de quem clicou. 60s é o
// teto do plano Hobby.
export const maxDuration = 60

const CSTAT_BONS = new Set([CSTAT_DOCUMENTO_LOCALIZADO, CSTAT_NENHUM_DOCUMENTO])

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

  // C3(b): sinaliza "a SEFAZ recusou" quando o último cStat não é dos bons —
  // independente de `ultimo_erro`, que só é preenchido em falha de rede/
  // certificado, não em cStat de rejeição (a chamada "deu certo", só que a
  // SEFAZ recusou/bloqueou). Sem `sync` (grupo nunca sincronizou), o card
  // "Última sincronização" abaixo já diz "ainda não rodou" — não duplica aqui.
  //
  // O tempo desde a última leitura NÃO entra mais nesta conta: não existe mais
  // cron, a consulta só sai quando alguém clica, e ficar dias sem clicar é uso
  // normal — não é sintoma de nada quebrado. Alertar por tempo aqui viraria um
  // banner vermelho permanente, que é como um aviso deixa de ser lido.
  const sefazRecusou = sync != null && (sync.ultimoCstat == null || !CSTAT_BONS.has(sync.ultimoCstat))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Recebidas — {grupo.nome}</h1>
        <p className="text-muted-foreground text-sm">
          Toda NF-e emitida contra o CNPJ do grupo, direto da SEFAZ. A consulta não roda sozinha:
          ela sai quando você clica em &quot;Atualizar leitura da SEFAZ&quot;, e alcança os últimos
          90 dias — nota mais antiga que isso a SEFAZ não distribui mais.
        </p>
      </div>

      <RadarFiltros deInicial={de} ateInicial={ate} emitenteInicial={emitente} buscaInicial={busca} />

      {periodoInvalido && (
        <p className="flex gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Período informado na URL é inválido — ignorado. Mostrando o período padrão.</span>
        </p>
      )}

      {sync?.ultimoErro && (
        <p className="flex gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Última sincronização falhou: {sync.ultimoErro}</span>
        </p>
      )}

      {sefazRecusou && sync && (
        <p className="flex gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            A SEFAZ respondeu cStat {sync.ultimoCstat ?? '—'} em{' '}
            {sync.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, que não é um
            retorno normal (137/138) — a última leitura não trouxe nada. A tela pode estar desatualizada
            até isso ser resolvido.
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Notas no período</p>
          <p className="text-xl font-bold mt-1">{notas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Não lançadas</p>
          <p className="text-xl font-bold text-warning mt-1">{pendentes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Última sincronização</p>
          <p className="text-sm mt-1 text-foreground">
            {sync?.atualizadoEm
              ? sync.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
              : 'ainda não rodou'}
          </p>
          <div className="mt-3">
            <AtualizarSefaz
              proximaConsultaEmIso={sync?.proximaConsultaEm?.toISOString() ?? null}
              liberadoNoServidor={podeConsultar({ proximaConsultaEm: sync?.proximaConsultaEm ?? null }, new Date())}
            />
          </div>
        </CardContent></Card>
      </div>

      <p className="text-xs text-muted-foreground">
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
                  <TableCell className="pl-4 text-sm text-muted-foreground whitespace-nowrap">
                    {n.dataEmissao.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{n.emitenteNome}</p>
                    <p className="text-xs text-muted-foreground">{n.emitenteCnpj}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(n.valor)}</TableCell>
                  {/* A chave de 44 dígitos não diz nada pra quem olha — o número é o que
                      aparece no documento, no e-mail do fornecedor e no cadastro da moto.
                      A chave continua acessível no title (mouse por cima), pra consultar
                      no portal da SEFAZ ou conferir. */}
                  <TableCell className="font-mono text-xs text-muted-foreground" title={n.chave}>
                    {n.numeroNota}
                  </TableCell>
                  <TableCell className="pr-4">
                    {n.situacao === 'cancelada'
                      ? <Badge variant="secondary" className="text-xs">Cancelada</Badge>
                      : n.jaLancada
                        ? <Badge variant="outline" className="text-xs border-success/50 text-success bg-success/10">Já lançada</Badge>
                        : <Badge variant="outline" className="text-xs border-warning/50 text-warning bg-warning/10">Não lançada</Badge>}
                  </TableCell>
                  <TableCell className="pr-4">
                    <NotaDownloads chave={n.chave} temXml={n.temXml} />
                  </TableCell>
                </TableRow>
              ))}
              {notas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
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
