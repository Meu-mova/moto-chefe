import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarSaldosBancarios } from '@/lib/mcpai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function fmt(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function BancosConteudo() {
  const resultado = await buscarSaldosBancarios()

  if (!resultado.ok) {
    return <p className="text-sm text-red-600">Não foi possível buscar os saldos: {resultado.erro}</p>
  }

  if (resultado.contas.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma conta conectada.</p>
  }

  const comSaldo = resultado.contas.filter(c => c.saldo != null)
  const algumIndisponivel = comSaldo.length < resultado.contas.length
  const total = comSaldo.reduce((s, c) => s + Number(c.saldo), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Total</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">{fmt(String(total))}</p>
          {algumIndisponivel && (
            <p className="text-xs text-amber-600 mt-1">
              Total parcial — uma ou mais contas estão com saldo indisponível no momento.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resultado.contas.map(c => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.banco}</CardTitle>
              <p className="text-xs text-slate-400">Conta Corrente — {c.numero}</p>
            </CardHeader>
            <CardContent>
              {c.saldo != null ? (
                <p className="text-xl font-bold">{fmt(c.saldo)}</p>
              ) : (
                <p className="text-sm text-amber-600">Saldo indisponível no momento — tente recarregar.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default async function BancosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bancos</h1>
          <p className="text-slate-500 text-sm">Saldo das contas conectadas via Open Finance</p>
        </div>

        {grupo.nome !== 'Sul de Minas' ? (
          <p className="text-sm text-slate-500">
            Esta integração está disponível apenas para o grupo Sul de Minas. Troque o grupo ativo para visualizar.
          </p>
        ) : (
          <BancosConteudo />
        )}
      </div>
    </AdminGuard>
  )
}
