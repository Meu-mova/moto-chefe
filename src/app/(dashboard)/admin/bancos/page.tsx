import { AdminGuard, exigirAcessoPagina } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarSaldosBancarios } from '@/lib/mcpai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function fmt(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function BancosConteudo({ grupo }: { grupo: { nome: string; cnpj: string } }) {
  const resultado = await buscarSaldosBancarios(grupo.cnpj)

  if (!resultado.ok) {
    return <p className="text-sm text-destructive">Não foi possível buscar os saldos: {resultado.erro}</p>
  }

  if (resultado.contas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma conta do {grupo.nome} conectada ao Open Finance.
      </p>
    )
  }

  const comSaldo = resultado.contas.filter(c => c.saldo != null)
  const algumIndisponivel = comSaldo.length < resultado.contas.length
  const total = comSaldo.reduce((s, c) => s + Number(c.saldo), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo Total</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-success">{fmt(String(total))}</p>
          {algumIndisponivel && (
            <p className="text-xs text-warning mt-1">
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
              <p className="text-xs text-muted-foreground">Conta Corrente — {c.numero}</p>
            </CardHeader>
            <CardContent>
              {c.saldo != null ? (
                <p className="text-xl font-bold">{fmt(c.saldo)}</p>
              ) : (
                <p className="text-sm text-warning">Saldo indisponível no momento — tente recarregar.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default async function BancosPage() {
  await exigirAcessoPagina('/admin/bancos')
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  return (
    <AdminGuard href="/admin/bancos">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bancos</h1>
          {/* O grupo no subtítulo é proposital: o mcp.ai devolve as contas de
              todos os CNPJs conectados de uma vez, e uma conta de outra bandeira
              somando no total passou despercebida justamente por não ter de quem
              a tela era. */}
          <p className="text-muted-foreground text-sm">
            Saldo das contas do <b>{grupo.nome}</b> conectadas via Open Finance
          </p>
        </div>

        <BancosConteudo grupo={grupo} />
      </div>
    </AdminGuard>
  )
}
