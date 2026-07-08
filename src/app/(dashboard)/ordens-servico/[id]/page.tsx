import { notFound } from 'next/navigation'
import { buscarOS, listarItensOS } from '@/lib/queries/ordens-servico'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { usuarios, servicosCatalogo, pecasCatalogo } from '@/lib/db/schema'
import { inArray, eq, asc } from 'drizzle-orm'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OSStatusBar } from './components/os-status-bar'
import { OSItensPanel } from './components/os-itens-panel'
import { OSEditarPanel } from './components/os-editar-panel'
import { OSPagamentoPanel } from './components/os-pagamento-panel'

const statusLabel: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em Andamento', concluida: 'Concluída',
}

export default async function OSDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [os, itens, usuario, mecanicos, servicos, pecas] = await Promise.all([
    buscarOS(id),
    listarItensOS(id),
    getUsuarioLogado(),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, ['mecanico', 'aux_adm', 'admin_geral', 'admin_socio'] as any[])),
    db.select().from(servicosCatalogo).where(eq(servicosCatalogo.ativo, true)).orderBy(asc(servicosCatalogo.nome)),
    db.select().from(pecasCatalogo).where(eq(pecasCatalogo.ativo, true)).orderBy(asc(pecasCatalogo.nome)),
  ])

  if (!os) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && os.lojaId !== usuario.lojaId) notFound()

  const podeEditar = ['admin_geral', 'admin_socio', 'aux_adm', 'mecanico'].includes(usuario.papel)
  const podeFechar = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)

  const motoDesc = os.chassi
    ? `${os.marca ?? ''} ${os.modelo ?? ''}`
    : `${os.marcaExterna ?? ''} ${os.modeloExterno ?? ''}`

  const clienteDesc = os.clienteNome ?? os.clienteNomeExterno ?? null
  const clienteFone = os.clienteTelefone ?? os.clienteFoneExterno ?? null

  const totalServicos = itens.filter(i => i.tipo === 'servico')
    .reduce((a, i) => a + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)
  const totalPecas = itens.filter(i => i.tipo === 'peca')
    .reduce((a, i) => a + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)
  const totalGeral = totalServicos + totalPecas

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/ordens-servico" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} /> Voltar
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">OS #{os.numero}</h1>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Aberta em {format(new Date(os.dataAbertura), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} · {os.lojaNome}
            </p>
          </div>
        </div>
        <Link
          href={`/ordens-servico/${id}/imprimir`}
          target="_blank"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-slate-400 transition-colors"
        >
          <Printer size={15} /> Imprimir OS
        </Link>
      </div>

      {/* Status bar */}
      <OSStatusBar osId={id} status={os.status} podeEditar={podeEditar} papel={usuario.papel} />

      <div className="grid grid-cols-2 gap-4">
        {/* Moto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500 font-medium uppercase tracking-wide">Veículo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold text-base text-slate-800">{motoDesc.trim() || '—'}</p>
            {os.chassi  && <p className="font-mono text-xs text-slate-500">{os.chassi}</p>}
            {os.km      && <p>KM: <span className="font-medium">{os.km.toLocaleString('pt-BR')}</span></p>}
            {os.cor     && <p>Cor: <span className="font-medium">{os.cor}</span></p>}
          </CardContent>
        </Card>

        {/* Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500 font-medium uppercase tracking-wide">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {clienteDesc
              ? <p className="font-semibold text-base text-slate-800">{clienteDesc}</p>
              : <p className="text-slate-400">Sem cliente vinculado</p>
            }
            {clienteFone && <p>Tel: <span className="font-medium">{clienteFone}</span></p>}
            {os.mecanicoNome && <p>Mecânico: <span className="font-medium">{os.mecanicoNome}</span></p>}
            {os.dataPrevisao && (
              <p>Previsão: <span className="font-medium text-amber-700">
                {format(new Date(os.dataPrevisao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </span></p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Descrição e diagnóstico */}
      <OSEditarPanel
        osId={id}
        descricao={os.descricao}
        diagnostico={os.diagnostico ?? ''}
        observacoesFinais={os.observacoesFinais ?? ''}
        mecanicos={mecanicos}
        mecanicoId={os.mecanicoId ?? ''}
        dataPrevisao={os.dataPrevisao ? new Date(os.dataPrevisao).toISOString().slice(0, 16) : ''}
        km={os.km ?? undefined}
        clienteNomeExterno={os.clienteNomeExterno ?? ''}
        clienteFoneExterno={os.clienteFoneExterno ?? ''}
        temCliente={Boolean(os.clienteId)}
        podeEditar={podeEditar}
      />

      {/* Itens */}
      <OSItensPanel osId={id} itens={itens} podeEditar={podeEditar} servicos={servicos} pecas={pecas} />

      {/* Totais e pagamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Totais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Mão de obra</span>
            <span>{totalServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Peças</span>
            <span>{totalPecas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="text-green-700">{totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
        </CardContent>
      </Card>

      {podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status) && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          formaPagamento={os.formaPagamento ?? ''}
        />
      )}
    </div>
  )
}
