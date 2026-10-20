import { notFound, redirect } from 'next/navigation'
import { buscarOS, listarItensOS } from '@/lib/queries/ordens-servico'
import { pagamentosEfetivosOS } from '@/lib/conciliacao-status'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { db } from '@/lib/db'
import { usuarios, servicosCatalogo, pecasCatalogo, aprovacoesVenda } from '@/lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { Printer, Ban } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OSStatusBar } from './components/os-status-bar'
import { OSItensPanel } from './components/os-itens-panel'
import { OSEditarPanel } from './components/os-editar-panel'
import { OSPagamentoPanel } from './components/os-pagamento-panel'
import { OSConciliacaoPanel } from './components/os-conciliacao-panel'
import { ExcluirOSButton } from './components/excluir-os-button'
import { CancelarOSButton } from './components/cancelar-os-button'
import { OSTemposPanel } from './components/os-tempos-panel'
import { motivoBloqueioCancelamento, podeCancelarOS } from '@/lib/os-cancelamento'

const statusLabel: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em Andamento', concluida: 'Concluída',
}

export default async function OSDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [os, itens, usuario, mecanicos, servicos, pecas, aprovacaoPendente] = await Promise.all([
    buscarOS(id),
    listarItensOS(id),
    getUsuarioLogado(),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.papel, 'mecanico')),
    db.select().from(servicosCatalogo).where(eq(servicosCatalogo.ativo, true)).orderBy(asc(servicosCatalogo.nome)),
    db.select().from(pecasCatalogo).where(eq(pecasCatalogo.ativo, true)).orderBy(asc(pecasCatalogo.nome)),
    db.$count(aprovacoesVenda, and(eq(aprovacoesVenda.osId, id), eq(aprovacoesVenda.status, 'pendente'))).then(n => n > 0),
  ])

  // Rota do PAI: a tabela não tem item por id.
  if (!usuarioPodeAcessar(usuario, '/ordens-servico')) redirect('/dashboard')

  if (!os) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && os.lojaId !== usuario.lojaId) notFound()

  const podeEditar = ['admin_geral', 'admin_socio', 'aux_adm', 'mecanico'].includes(usuario.papel)
  const podeFechar = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const podeCancelar = podeCancelarOS(usuario.papel)

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
  const pagamentosOS = pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal)

  const cancelada    = os.status === 'cancelada'
  const conciliada   = Number(os.conciliadoValor) > 0 || Number(os.pixConciliadoValor) > 0
  const temPagamento = Boolean(os.formaPagamento) || (os.pagamentos?.length ?? 0) > 0 || os.status === 'concluida'

  // Mesma função que a action usa, para a tela nunca prometer (nem esconder) algo
  // diferente do que o servidor faria. Ver src/lib/os-cancelamento.ts.
  const bloqueioCancelamento = motivoBloqueioCancelamento({
    jaCancelada:          cancelada,
    temPagamento,
    temConciliacao:       conciliada,
    temAprovacaoPendente: aprovacaoPendente,
  })

  return (
    <div className="max-w-4xl space-y-5 has-[[data-barra-fixa]]:pb-20 lg:has-[[data-barra-fixa]]:pb-0">
      {/* Header. A folga embaixo (has-[[data-barra-fixa]]) só existe quando o botão de avançar
          fica fixo no rodapé do celular; sem ela, o fim da página ficaria atrás dele. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">OS #{os.numero}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aberta em {format(new Date(os.dataAbertura), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} · {os.lojaNome}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/ordens-servico/${id}/imprimir`}
            target="_blank"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-input rounded-lg px-3 py-1.5 hover:border-ring transition-colors"
          >
            <Printer size={15} /> Imprimir OS
          </Link>
          {podeCancelar && !cancelada && (
            <CancelarOSButton osId={id} numero={os.numero} bloqueio={bloqueioCancelamento} />
          )}
          {isAdmin && <ExcluirOSButton osId={id} numero={os.numero} />}
        </div>
      </div>

      {cancelada && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <Ban size={16} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-warning">OS cancelada</p>
            <p className="text-warning">{os.motivoCancelamento}</p>
            <p className="mt-0.5 text-xs text-warning">
              {os.canceladaPorNome ?? '—'}
              {os.canceladaEm && ` · ${format(new Date(os.canceladaEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
            </p>
          </div>
        </div>
      )}

      {/* Status bar */}
      {!cancelada && (
        <OSStatusBar osId={id} status={os.status} podeEditar={podeEditar} papel={usuario.papel} />
      )}

      {/* Tempos por etapa */}
      <OSTemposPanel
        dataAbertura={new Date(os.dataAbertura)}
        oficinaEm={os.oficinaEm ? new Date(os.oficinaEm) : null}
        emAndamentoEm={os.emAndamentoEm ? new Date(os.emAndamentoEm) : null}
        finalizadaEm={os.finalizadaEm ? new Date(os.finalizadaEm) : null}
        pendentePagamentoEm={os.pendentePagamentoEm ? new Date(os.pendentePagamentoEm) : null}
        dataConclusao={os.dataConclusao ? new Date(os.dataConclusao) : null}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Moto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Veículo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold text-base text-foreground">{motoDesc.trim() || '—'}</p>
            {os.chassi  && <p className="font-mono text-xs text-muted-foreground">{os.chassi}</p>}
            {os.km      && <p>KM: <span className="font-medium">{os.km.toLocaleString('pt-BR')}</span></p>}
            {os.cor     && <p>Cor: <span className="font-medium">{os.cor}</span></p>}
          </CardContent>
        </Card>

        {/* Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {clienteDesc
              ? <p className="font-semibold text-base text-foreground">{clienteDesc}</p>
              : <p className="text-muted-foreground">Sem cliente vinculado</p>
            }
            {clienteFone && <p>Tel: <span className="font-medium">{clienteFone}</span></p>}
            {os.mecanicoNome && <p>Mecânico: <span className="font-medium">{os.mecanicoNome}</span></p>}
            {os.dataPrevisao && (
              <p>Previsão: <span className="font-medium text-warning">
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
        podeEditar={podeEditar && !cancelada}
      />

      {/* Itens — depois de conciliada o valor não pode mais mudar, senão descasa do extrato */}
      <OSItensPanel
        osId={id}
        itens={itens}
        podeEditar={podeEditar && !cancelada && !conciliada}
        servicos={servicos}
        pecas={pecas}
      />

      {/* Totais e pagamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Totais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mão de obra</span>
            <span>{totalServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Peças</span>
            <span>{totalPecas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="text-primary-text">{totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
        </CardContent>
      </Card>

      {podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status) && (
        <OSPagamentoPanel
          osId={id}
          valorTotal={os.valorTotal ? parseFloat(os.valorTotal) : totalGeral}
          valorServicos={totalServicos}
          pagamentosIniciais={pagamentosOS}
          jaPago={os.status === 'concluida'}
          aprovacaoPendente={aprovacaoPendente}
        />
      )}

      {podeFechar && os.status === 'concluida' && pagamentosOS.length > 0 && (
        <OSConciliacaoPanel
          osId={id}
          osNumero={os.numero}
          pagamentos={pagamentosOS}
          papel={usuario.papel}
        />
      )}
    </div>
  )
}
