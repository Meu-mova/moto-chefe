import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarFaturasCartao, type CartaoDoGrupo } from '@/lib/mcpai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CartoesFiltros } from './components/cartoes-filtros'
import type { Fatura } from '@/lib/cartao-fatura'

// Fatura de cartão de crédito, direto do Open Finance — não passa pelo banco de
// dados. É consulta ao vivo mesmo: o mcp.ai é a fonte, e guardar cópia aqui só
// criaria uma segunda verdade para conciliar. Ver src/lib/cartao-fatura.ts para
// a regra de a que fatura cada compra pertence, que é a parte difícil.

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

/** '2026-09' → 'setembro de 2026' */
function rotuloMes(ref: string) {
  return new Date(`${ref}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function rotuloFatura(f: Fatura) {
  if (f.vencimento) return `vence ${fmtData(f.vencimento)} — ${fmt(f.totalBanco ?? f.totalGasto)}`
  return `${rotuloMes(f.ref)} (em aberto) — ${fmt(f.totalGasto)} parcial`
}

function ResumoCartao({ c, ativo }: { c: CartaoDoGrupo; ativo: boolean }) {
  const pct = c.limite && c.usado != null ? Math.min(100, (c.usado / c.limite) * 100) : null
  return (
    <Card className={ativo ? 'border-slate-400' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{c.banco}</CardTitle>
        <p className="text-xs text-slate-400">{c.nome} · final {c.final}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-xl font-bold">{c.usado != null ? fmt(c.usado) : '—'}</p>
        <p className="text-xs text-slate-500">
          usado de {c.limite != null ? fmt(c.limite) : '—'}
          {c.limite != null && c.usado != null && ` · sobram ${fmt(c.limite - c.usado)}`}
        </p>
        {pct != null && (
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TabelaLancamentos({ fatura }: { fatura: Fatura }) {
  return (
    <div className="space-y-4">
      {fatura.cartoes.map(bloco => (
        <div key={bloco.cartao ?? 'sem-cartao'} className="bg-white border rounded-lg overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b">
            <div>
              <p className="font-semibold text-sm">
                {bloco.cartao ? `Cartão final ${bloco.cartao}` : 'Sem cartão identificado'}
              </p>
              <p className="text-xs text-slate-400">
                {bloco.lancamentos.length} lançamento{bloco.lancamentos.length === 1 ? '' : 's'}
                {bloco.totalCredito > 0 && ` · ${fmt(bloco.totalCredito)} em pagamentos e estornos`}
              </p>
            </div>
            <p className="text-lg font-bold whitespace-nowrap">{fmt(bloco.totalGasto)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {bloco.lancamentos.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-1.5 text-xs text-slate-400 whitespace-nowrap w-20">{fmtData(l.data)}</td>
                    <td className="px-2 py-1.5">
                      {l.descricao}
                      {l.pendente && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-600">pendente</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-400 whitespace-nowrap">{l.categoria ?? ''}</td>
                    <td className={`px-4 py-1.5 text-right whitespace-nowrap ${l.valor < 0 ? 'text-emerald-700' : ''}`}>
                      {fmt(l.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

async function CartoesConteudo({ grupo, contaParam, faturaParam }: {
  grupo: { nome: string; cnpj: string }
  contaParam: string
  faturaParam: string
}) {
  const resultado = await buscarFaturasCartao(grupo.cnpj)

  if (!resultado.ok) {
    return <p className="text-sm text-red-600">Não foi possível buscar as faturas: {resultado.erro}</p>
  }
  if (resultado.cartoes.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nenhum cartão de crédito do {grupo.nome} conectado ao Open Finance.
      </p>
    )
  }

  // Param inválido (link velho, cartão que saiu da conexão) cai no primeiro em
  // vez de dar tela vazia.
  const conta = resultado.cartoes.find(c => c.accountId === contaParam) ?? resultado.cartoes[0]
  const fatura = conta.faturas.find(f => f.ref === faturaParam) ?? conta.faturas[0]

  const divergencia = fatura && fatura.totalBanco != null
    ? Math.abs(fatura.totalBanco - fatura.totalGasto)
    : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resultado.cartoes.map(c => (
          <ResumoCartao key={c.accountId} c={c} ativo={c.accountId === conta.accountId} />
        ))}
      </div>

      <CartoesFiltros
        contas={resultado.cartoes.map(c => ({ accountId: c.accountId, rotulo: `${c.banco} · final ${c.final}` }))}
        faturas={conta.faturas.map(f => ({ ref: f.ref, rotulo: rotuloFatura(f) }))}
        contaAtual={conta.accountId}
        faturaAtual={fatura?.ref ?? ''}
      />

      {!fatura ? (
        <p className="text-sm text-slate-400">Este cartão não tem lançamento nenhum no período que o banco devolve.</p>
      ) : (
        <>
          {/* Dois números, sempre lado a lado e nomeados: o do banco é o
              oficial, o somado é o que dá para conferir item a item. O próprio
              provedor avisa que somar lançamento não reproduz a fatura
              ("billid_sum_diverges_from_total") e que o totalAmount do banco é
              que vale — então a tela mostra os dois e diz qual é qual, em vez de
              escolher um e parecer errada. */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-l-2 border-slate-200 pl-3">
            {fatura.totalBanco != null && (
              <p className="text-sm">
                <span className="text-slate-500">Total da fatura (banco): </span>
                <b>{fmt(fatura.totalBanco)}</b>
              </p>
            )}
            <p className="text-sm">
              <span className="text-slate-500">Soma dos lançamentos: </span>
              <b>{fmt(fatura.totalGasto)}</b>
            </p>
            {fatura.fechamento && (
              <p className="text-xs text-slate-400">fechou em {fmtData(fatura.fechamento)}</p>
            )}
          </div>

          {fatura.totalBanco == null ? (
            <p className="text-xs text-slate-500 bg-slate-50 border rounded-md px-3 py-2">
              Fatura ainda aberta: o banco só publica o total quando ela fecha, então o valor acima é
              <b> parcial</b> — é a soma das compras já lançadas neste ciclo.
            </p>
          ) : divergencia > 0.01 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              A soma dos lançamentos fica {fmt(divergencia)} abaixo do total da fatura. Vale o número do banco:
              parcelas de compras de meses anteriores e encargos entram na fatura sem virar lançamento novo,
              então a lista abaixo mostra o que foi comprado no ciclo, não a composição inteira da fatura.
            </p>
          )}

          <TabelaLancamentos fatura={fatura} />
        </>
      )}
    </div>
  )
}

export default async function CartoesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/cartoes')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const params = await searchParams
  const contaParam = params.conta ?? ''
  const faturaParam = params.fatura ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cartões de Crédito</h1>
        {/* O grupo no subtítulo pelo mesmo motivo de /admin/bancos: o mcp.ai
            devolve os cartões de todos os CNPJs conectados de uma vez. */}
        <p className="text-slate-500 text-sm">
          Faturas dos cartões do <b>{grupo.nome}</b>, lançamento a lançamento, via Open Finance
        </p>
      </div>

      {/* A busca são cinco idas ao mcp.ai e leva alguns segundos. Com Suspense o
          título aparece na hora, em vez de a página inteira ficar em branco. */}
      <Suspense
        key={`${contaParam}|${faturaParam}`}
        fallback={<p className="text-sm text-slate-400">Buscando as faturas no banco…</p>}
      >
        <CartoesConteudo grupo={grupo} contaParam={contaParam} faturaParam={faturaParam} />
      </Suspense>
    </div>
  )
}
