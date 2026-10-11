import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buscarClientePorIdAction, buscarHistoricoClienteAction } from '../actions'
import { ClienteForm } from '../components/cliente-form'

type Props = {
  params: Promise<{ id: string }>
}

function formatarCpfCnpj(v: string | null | undefined) {
  if (!v) return '—'
  const n = v.replace(/\D/g, '')
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

function formatarMoeda(v: unknown) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: unknown) {
  if (!d) return '—'
  return new Date(d as string).toLocaleDateString('pt-BR')
}

function formatarFormaPagamento(fp: string | null | undefined) {
  if (!fp) return '—'
  return fp.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const osStatusLabel: Record<string, string> = {
  aberta: 'Aberta',
  oficina: 'Oficina',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  pendente_pagamento: 'Pendente de Pagamento',
  concluida: 'Concluída',
}

const osStatusVariant: Record<string, 'outline' | 'secondary' | 'default'> = {
  aberta: 'outline',
  oficina: 'outline',
  em_andamento: 'secondary',
  finalizada: 'secondary',
  pendente_pagamento: 'secondary',
  concluida: 'default',
}

export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const usuario = await getUsuarioLogado()
  // Pergunta pela rota do PAI: a tabela não tem item por id, e href dinâmico
  // não casaria com nada — barraria todo mundo.
  if (!usuarioPodeAcessar(usuario, '/clientes')) redirect('/dashboard')

  const cliente = await buscarClientePorIdAction(id)
  if (!cliente) notFound()

  const historico = await buscarHistoricoClienteAction(id, cliente.cpfCnpj ?? null)

  const enderecoCompleto = [
    cliente.endereco,
    cliente.numero ? `nº ${cliente.numero}` : null,
    cliente.complemento,
    cliente.bairro,
    cliente.cidade,
    cliente.uf,
    cliente.cep,
  ].filter(Boolean).join(', ')

  const clienteInicial = {
    id: cliente.id,
    nome: cliente.nome,
    tipoPessoa: cliente.tipoPessoa,
    cpfCnpj: cliente.cpfCnpj,
    sexo: cliente.sexo,
    email: cliente.email,
    celular: cliente.celular,
    endereco: cliente.endereco,
    numero: cliente.numero,
    complemento: cliente.complemento,
    bairro: cliente.bairro,
    cep: cliente.cep,
    cidade: cliente.cidade,
    uf: cliente.uf,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{cliente.nome}</h1>
          <p className="text-sm text-muted-foreground">{formatarCpfCnpj(cliente.cpfCnpj)}</p>
        </div>
        <ClienteForm
          trigger={<Button>Editar</Button>}
          clienteInicial={clienteInicial}
        />
      </div>

      {/* Contato + Endereço */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tipo</span>
              <Badge variant="outline">
                {cliente.tipoPessoa === 'juridica' ? 'PJ' : 'PF'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Celular</span>
              <span>{cliente.celular ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">E-mail</span>
              <span>{cliente.email ?? '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-slate-700">{enderecoCompleto || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.vendas.length === 0 && historico.os.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="space-y-3">
              {historico.vendas.map(v => (
                <div key={v.id} className="flex items-start justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Venda #{v.numero} — {v.marca} {v.modelo}</p>
                    <p className="text-xs text-slate-500">
                      Chassi: {v.chassi ?? '—'} · {formatarData(v.dataVenda)} · {formatarFormaPagamento(v.formaPagamento)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{formatarMoeda(v.valor)}</span>
                </div>
              ))}
              {historico.os.map(o => (
                <Link key={o.id} href={`/ordens-servico/${o.id}`}
                  className="flex items-start justify-between rounded-lg border p-3 hover:border-slate-400 hover:shadow-sm transition-all">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      {o.numero && <span className="text-xs font-bold text-slate-500">OS #{o.numero}</span>}
                      <Badge variant={osStatusVariant[o.status ?? 'aberta'] ?? 'outline'}>
                        {osStatusLabel[o.status ?? 'aberta'] ?? o.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">
                      {o.marca && o.modelo ? `${o.marca} ${o.modelo}` : 'Moto externa'}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-1">{o.descricao ?? '—'}</p>
                    <p className="text-xs text-slate-400">Aberta em {formatarData(o.dataAbertura)}</p>
                  </div>
                  {o.valorTotal && parseFloat(String(o.valorTotal)) > 0 && (
                    <span className="text-sm font-semibold text-green-700 shrink-0">
                      {formatarMoeda(o.valorTotal)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
