import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { contaDoGrupoAtivo, getGrupoAtivo, listarLojaIdsDoGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { listarMotos } from '@/lib/queries/motos'
import { precosParaImpressao } from '@/lib/queries/showroom-precos'
import { filtrosDoShowroom, type ParamsShowroom } from '@/lib/showroom-filtros'
import { agruparPorModelo } from '@/lib/showroom-impressao'
import { disponibilidadeLabel, statusLabel_legado } from '@/lib/estado-moto'
import { PrintButtons } from '../../relatorio-fabrica/imprimir/print-buttons'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })


export default async function EstoqueImprimirPage({ searchParams }: { searchParams: Promise<ParamsShowroom> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/estoque')) redirect('/dashboard')

  const params = await searchParams
  const [lojaIdsGrupo, lojasDoGrupo, grupo, contaId] = await Promise.all([
    listarLojaIdsDoGrupoAtivo(usuario),
    listarLojasDoGrupoAtivo(usuario),
    getGrupoAtivo(usuario),
    contaDoGrupoAtivo(usuario),
  ])
  const filtros = filtrosDoShowroom(params, usuario, lojaIdsGrupo)
  const lista = await listarMotos({ ...filtros, contaId })

  const precos = await precosParaImpressao(usuario.papel, lista.map(m => m.id), filtros.lojaId)
  const { grupos, quantidade, total } = agruparPorModelo(lista, precos)

  const nomesLojas = lojasDoGrupo.filter(l => filtros.lojaId.includes(l.id)).map(l => l.nome)
  const ativos = [
    filtros.status.length ? `Status: ${filtros.status.map(s => statusLabel_legado[s] ?? s).join(', ')}` : null,
    filtros.disponibilidade ? `Disponibilidade: ${filtros.disponibilidade.map(d => disponibilidadeLabel[d as keyof typeof disponibilidadeLabel] ?? d).join(', ')}` : null,
    filtros.cor.length ? `Cor: ${filtros.cor.join(', ')}` : null,
    filtros.modeloId.length ? `${filtros.modeloId.length} modelo(s) filtrado(s)` : null,
    filtros.chassiBusca ? `Busca: ${filtros.chassiBusca}` : null,
    filtros.apenasTransferencia ? 'Só com transferência pendente' : null,
  ].filter(Boolean)
  const agora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      <style>{`
        .page-wrap { max-width: 900px; margin: 0 auto; padding: 32px 24px; font-family: 'Geist', -apple-system, Arial, sans-serif; }
        .actions-bar { display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 24px; }
        .btn { padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
          border: 1.5px solid var(--border); background: var(--card); color: var(--foreground); }
        .btn-primary { background: var(--foreground); color: var(--card); border-color: var(--foreground); }
        .cab { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 3px solid var(--foreground); }
        .titulo { font-size: 18px; font-weight: 700; }
        .sub { font-size: 12px; color: var(--muted-foreground); margin-top: 3px; }
        .filtros { background: var(--muted); border-radius: 8px; padding: 8px 14px; font-size: 12px; color: var(--muted-foreground); margin: 14px 0; }
        .grupo { margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
        .grupo h3 { display: flex; justify-content: space-between; font-size: 14px; border-bottom: 2px solid var(--foreground); padding-bottom: 3px; }
        .marca { color: var(--muted-foreground); font-weight: 400; font-size: 12px; margin-left: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        td { padding: 6px 4px; border-bottom: 1px solid var(--border); }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .mono { font-family: ui-monospace, monospace; font-size: 12px; }
        .total { display: flex; justify-content: flex-end; gap: 24px; font-weight: 700; margin-top: 14px; padding-top: 8px; border-top: 2px solid var(--foreground); }
        .vazio { text-align: center; padding: 48px; color: var(--muted-foreground); }
        @media print {
          .actions-bar { display: none !important; }
          .page-wrap { padding: 0; max-width: 100%; }
          .filtros { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 14mm 12mm; size: A4 portrait; }
        }
      `}</style>
      <div className="page-wrap">
        <PrintButtons />
        <div className="cab">
          <div>
            <div className="titulo">Showroom: motos filtradas</div>
            <div className="sub">{grupo.nome} · {nomesLojas.length ? nomesLojas.join(', ') : 'Nenhuma loja'}</div>
          </div>
          <div className="sub" style={{ textAlign: 'right' }}>Impresso em {agora}<br />por {usuario.nome}</div>
        </div>
        <div className="filtros">{ativos.length ? ativos.join(' · ') : 'Sem filtros: todas as motos em estoque'}</div>

        {grupos.length === 0 ? (
          <div className="vazio">Nenhuma moto com estes filtros.</div>
        ) : grupos.map(g => (
          <div key={`${g.marca}|${g.modelo}`} className="grupo">
            <h3>
              <span>{g.modelo}<span className="marca">{g.marca}</span> · {g.quantidade} {g.quantidade === 1 ? 'moto' : 'motos'}</span>
              {g.subtotal !== null && <span>{fmt(g.subtotal)}</span>}
            </h3>
            <table>
              <tbody>
                {g.motos.map(m => (
                  <tr key={m.chassi}>
                    <td style={{ width: '22%' }}>{m.cor}</td>
                    <td className="mono">{m.chassi}</td>
                    <td>{statusLabel_legado[m.status] ?? m.status}</td>
                    <td>{m.lojaNome}</td>
                    {m.preco !== null && <td className="num">{fmt(m.preco)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="total">
          <span>{quantidade} {quantidade === 1 ? 'moto' : 'motos'}</span>
          {total !== null && <span>Total de compra: {fmt(total)}</span>}
        </div>
      </div>
    </>
  )
}
