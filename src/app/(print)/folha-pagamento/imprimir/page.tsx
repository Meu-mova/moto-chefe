import { redirect } from 'next/navigation'
import { mesBrt } from '@/lib/data-venda'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { buscarDadosFolha, agregarFolha } from '@/lib/queries/folha'

const ADMINS = ['admin_geral', 'admin_socio']

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function formatCpf(cpf: string) {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

export default async function FolhaImprimirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  // Mesmo gate da tela. Rota de impressão sem gate é rota aberta.
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? mesBrt()
  const lojaParam = params.loja ?? ''
  const lojaIds = lojaParam && lojaIdsGrupo.includes(lojaParam) ? [lojaParam] : lojaIdsGrupo

  const dados = await buscarDadosFolha({ mes: mesParam, lojaIds, lojaIdsGrupo, grupoId: grupo.id })
  const folha = agregarFolha(dados)

  const ids = folha.ativos.map(f => f.id)
  const cpfs = ids.length
    ? await db.select({ usuarioId: usuariosDados.usuarioId, cpf: usuariosDados.cpf })
        .from(usuariosDados).where(inArray(usuariosDados.usuarioId, ids))
    : []
  const cpfPorUsuario = new Map(cpfs.map(c => [c.usuarioId, c.cpf]))

  const nomeLoja = lojaParam
    ? (dados.lojas.find(l => l.id === lojaParam)?.nome ?? 'Loja')
    : 'Todas as lojas'
  const mesExtenso = new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <div className="p-8 text-[11px] text-black">
      <style>{`@page { size: A4 portrait; margin: 12mm } @media print { .nao-imprime { display: none } }`}</style>

      <header className="mb-4">
        <h1 className="text-lg font-bold">Folha de pagamento — {grupo.nome}</h1>
        <p className="capitalize">{mesExtenso} · {nomeLoja}</p>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1">Funcionário</th>
            <th className="py-1">CPF</th>
            <th className="py-1 text-right">Base comissão</th>
            <th className="py-1 text-right">Salário</th>
            <th className="py-1 text-right">Comissão</th>
            <th className="py-1 text-right">Premiação</th>
            <th className="py-1 text-right">Ajuda de custo</th>
            <th className="py-1 text-right">Adiantamento</th>
            <th className="py-1 text-right">Total a pagar</th>
          </tr>
        </thead>
        <tbody>
          {folha.ativos.map(f => {
            const cpf = cpfPorUsuario.get(f.id)
            return (
              <tr key={f.id} className="border-b border-slate-300">
                <td className="py-1">{f.nome}<span className="text-slate-500"> · {f.lojaNome}</span></td>
                {/* Quem ainda não preencheu o cadastro sai com "—": o papel sinaliza
                    quem falta, em vez de esconder a pessoa da folha. */}
                <td className="py-1">{cpf ? formatCpf(cpf) : '—'}</td>
                <td className="py-1 text-right">{f.baseComissao > 0 ? fmt(f.baseComissao) : '—'}</td>
                <td className="py-1 text-right">{fmt(f.salario)}</td>
                <td className="py-1 text-right">{f.comissao > 0 ? fmt(f.comissao) : '—'}</td>
                <td className="py-1 text-right">{f.premiacao > 0 ? fmt(f.premiacao) : '—'}</td>
                <td className="py-1 text-right">{f.ajudaCusto > 0 ? fmt(f.ajudaCusto) : '—'}</td>
                <td className="py-1 text-right">
                  {f.adiantamento > 0 ? '-' + fmt(f.adiantamento) : '—'}
                  {f.adiantamentoFixo > 0 && f.adiantamentoEventual > 0 && (
                    <span className="block text-slate-500">
                      (fixo {fmt(f.adiantamentoFixo)} + {fmt(f.adiantamentoEventual)})
                    </span>
                  )}
                </td>
                <td className="py-1 text-right font-semibold">{fmt(f.totalPagar)}</td>
              </tr>
            )
          })}
          {folha.ativos.length === 0 && (
            <tr><td colSpan={9} className="py-6 text-center text-slate-500">Nenhum funcionário ativo neste recorte.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1" colSpan={3}>Totais</td>
            <td className="py-1 text-right">{fmt(folha.totais.salarios)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.comissoes)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.premiacoes)}</td>
            <td className="py-1 text-right">{fmt(folha.totais.ajudaCusto)}</td>
            <td className="py-1 text-right">{folha.totais.adiantamentos > 0 ? '-' + fmt(folha.totais.adiantamentos) : '—'}</td>
            <td className="py-1 text-right">{fmt(folha.totais.geral)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Não é enfeite: a base usa o líquido das transações JÁ conciliadas, então o
          mesmo mês impresso hoje e semana que vem pode dar números diferentes.
          Quem recebe o papel precisa saber que é uma fotografia. */}
      <p className="mt-4 text-slate-500">
        Emitido em {emitidoEm}. O valor de comissão usa o líquido das vendas em cartão já
        conciliadas — conciliações posteriores alteram a base deste mês.
      </p>

      {/* Sem botão: esta é uma Server Component e onClick não existe aqui —
          passar um handler daria erro de build. Ctrl+P resolve. */}
      <p className="nao-imprime mt-6 text-slate-400">Use Ctrl+P para imprimir ou salvar em PDF.</p>
    </div>
  )
}
