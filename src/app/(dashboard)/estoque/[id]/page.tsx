// src/app/(dashboard)/estoque/[id]/page.tsx
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { buscarMoto } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, getGrupoIdDaLoja, podeAprovarVendaBaixoValor, podeAprovarPagamentoSensivel, podeTransferirEntreGrupos, listarTodasLojasAtivas } from '@/lib/grupo'
import { db } from '@/lib/db'
import { modelos, usuarios, precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MotoActions } from './components/moto-actions'
import { AprovacaoVendaCard } from './components/aprovacao-venda-card'
import { EditarMotoButton } from './components/editar-moto-button'
import { HistoricoTab } from './components/historico-tab'
import { VendaTab } from './components/venda-tab'
import { OSTab } from './components/os-tab'
import { GarantiasTab } from './components/garantias-tab'
import { statusLabel, disponibilidadeLabel, type Status, type Disponibilidade } from '@/lib/estado-moto'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function MotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [moto, usuario] = await Promise.all([buscarMoto(id), getUsuarioLogado()])

  if (!moto) notFound()

  const grupoIdDaMoto = await getGrupoIdDaLoja(moto.lojaId)
  const podeAprovarValorMinimo = await podeAprovarVendaBaixoValor(usuario, moto.lojaId)
  const podeAprovarSensivel = podeAprovarPagamentoSensivel(usuario)
  const tipoAprovacaoPendente = (moto.aprovacaoPendenteTipo ?? 'valor_minimo') as 'valor_minimo' | 'pagamento_sensivel'
  const podeAprovarAprovacao = tipoAprovacaoPendente === 'pagamento_sensivel' ? podeAprovarSensivel : podeAprovarValorMinimo
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const acessoMultiGrupo = isAdmin && podeTransferirEntreGrupos(usuario)

  const [mecanicos, lojasOpts, lojasTransferencia, usuariosOpts, modelosOpts, precRow, taxasRow] = await Promise.all([
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'mecanico')),
    listarLojasDoGrupoAtivo(usuario),
    // Igual a /transferencias e /estoque: destino do botão "Transferir" inclui todos
    // os grupos só pra quem tem a exceção; lojasOpts (filtro/editar) segue por grupo.
    acessoMultiGrupo ? listarTodasLojasAtivas() : listarLojasDoGrupoAtivo(usuario),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).orderBy(usuarios.nome),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
    db.select({ valorMinimo: precificacao.valorMinimo })
      .from(precificacao)
      .where(and(eq(precificacao.nome, moto.modelo), eq(precificacao.ativo, true), eq(precificacao.grupoId, grupoIdDaMoto)))
      .limit(1),
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupoIdDaMoto)),
  ])

  const precoMinimoPix = precRow[0] ? parseFloat(precRow[0].valorMinimo) : null
  const taxasVenda = taxasRow[0]
    ? {
        taxasCartao: taxasRow[0].taxasCartao as Record<string, number>,
        taxasDebito: (taxasRow[0].taxasDebito ?? {}) as Record<string, number>,
        taxasLink: taxasRow[0].taxasLink as Record<string, number>,
        taxasFinanciamento: taxasRow[0].taxasFinanciamento as Record<string, number>,
      }
    : null

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/estoque" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{moto.marca} {moto.modelo}</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Informações</CardTitle>
            {['admin_geral', 'admin_socio'].includes(usuario.papel) && (
              <EditarMotoButton
                moto={{
                  id: moto.id,
                  chassi: moto.chassi,
                  cor: moto.cor,
                  motor: moto.motor,
                  modeloId: moto.modeloId,
                  lojaId: moto.lojaId,
                  notaFiscalEntrada: moto.notaFiscalEntrada,
                  status: moto.status,
                  disponibilidade: moto.disponibilidade,
                }}
                lojas={lojasOpts}
                modelos={modelosOpts}
              />
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Chassi</span><span className="font-mono text-xs">{moto.chassi}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge>{statusLabel[moto.status as Status] ?? moto.status}</Badge></div>
            {moto.disponibilidade && (
              <div className="flex justify-between"><span className="text-slate-500">Disponibilidade</span><Badge variant="outline">{disponibilidadeLabel[moto.disponibilidade as Disponibilidade] ?? moto.disponibilidade}</Badge></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">Loja</span><span>{moto.lojaNome}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cor</span><span>{moto.cor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Categoria</span><span>{moto.categoria}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Potência</span><span>{moto.potenciaW}W</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Motor</span><span>{moto.motor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">NF Entrada</span><span>{moto.notaFiscalEntrada}</span></div>
            {moto.precoCompra && ['admin_geral', 'admin_socio'].includes(usuario.papel) && (
              <div className="flex justify-between"><span className="text-slate-500">Preço de Compra</span><span className="font-medium text-green-700">R$ {Number(moto.precoCompra).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            )}
            {moto.dataMontagem && (
              <div className="flex justify-between"><span className="text-slate-500">Data Montagem</span><span>{new Date(moto.dataMontagem + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>
            )}
            {moto.mecanicoNome && (
              <div className="flex justify-between"><span className="text-slate-500">Mecânico</span><span>{moto.mecanicoNome}</span></div>
            )}
          </CardContent>
        </Card>

        <MotoActions
        moto={moto}
        papel={usuario.papel}
        vendedorId={usuario.id}
        vendedorNome={usuario.nome}
        usuarios={usuariosOpts}
        mecanicos={mecanicos}
        lojas={lojasTransferencia}
        lojaUsuarioId={usuario.lojaId ?? null}
        precoMinimoPix={precoMinimoPix}
        taxasVenda={taxasVenda}
        podeAprovarPagamentoSensivel={podeAprovarSensivel}
      />
      </div>

      {moto.disponibilidade === 'aguardando_aprovacao' && moto.aprovacaoPendenteId && (
        <AprovacaoVendaCard
          aprovacaoId={moto.aprovacaoPendenteId}
          valor={parseFloat(moto.aprovacaoPendenteValor ?? '0')}
          motivo={moto.aprovacaoPendenteMotivo ?? ''}
          vendedorNome={usuariosOpts.find(u => u.id === moto.aprovacaoPendenteVendedorId)?.nome ?? 'Desconhecido'}
          dataSolicitacao={moto.aprovacaoPendenteDataSolicitacao ?? new Date().toISOString()}
          tipo={tipoAprovacaoPendente}
          podeAprovar={podeAprovarAprovacao}
        />
      )}

      <Tabs defaultValue="historico">
        <TabsList>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="os">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="garantias">Garantias</TabsTrigger>
          <TabsTrigger value="venda">Dados da Venda</TabsTrigger>
        </TabsList>
        <TabsContent value="historico">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <HistoricoTab motoId={moto.id} notaFiscalEntrada={moto.notaFiscalEntrada} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="os">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <OSTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="garantias">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <GarantiasTab motoId={moto.id} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="venda">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <VendaTab motoId={moto.id} papel={usuario.papel} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
