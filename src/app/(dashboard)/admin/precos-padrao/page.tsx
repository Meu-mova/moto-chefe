import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarTabelaPadrao } from '@/lib/tabela-preco-padrao'
import { hojeBrt } from '@/lib/data-venda'
import { CarregarTabelaClient } from './carregar-client'

const brl = (v: string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function PrecosPadraoPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/precos-padrao')) redirect('/dashboard')

  const tabela = await listarTabelaPadrao()
  const competencia = tabela[0]?.competencia

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Preços MotoChefe</h1>
        <p className="text-muted-foreground text-sm">
          Preço de venda sugerido pela MotoChefe, à vista. Preenche a Precificação dos grupos só nos modelos que ainda não têm preço.
        </p>
      </div>

      <CarregarTabelaClient mesAtual={hojeBrt().slice(0, 7)} />

      <div className="space-y-2">
        <h2 className="font-semibold">
          {competencia ? `Tabela carregada (${competencia}): ${tabela.length} modelos` : 'Nenhuma tabela carregada'}
        </h2>
        {tabela.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr><th className="text-left p-2">Marca</th><th className="text-left p-2">Modelo</th><th className="text-right p-2">Preço</th></tr>
              </thead>
              <tbody>
                {tabela.map(l => (
                  <tr key={l.modeloId} className="border-t border-border">
                    <td className="p-2">{l.marca}</td><td className="p-2">{l.modelo}</td><td className="p-2 text-right tabular-nums">{brl(l.preco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
