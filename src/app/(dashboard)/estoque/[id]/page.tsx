// src/app/(dashboard)/estoque/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { buscarMoto } from '@/lib/queries/motos'
import { motoTemVenda } from '@/lib/motos-vendidas-sem-venda'
import { getUsuarioLogado, temPapel } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojasAtivasDaConta } from '@/lib/conta'
import { listarLojasDoGrupoAtivo, getGrupoIdDaLoja, podeAprovarVendaBaixoValor, podeAprovarPagamentoSensivelNaLoja, podeTransferirEntreGrupos, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MotoActions } from './components/moto-actions'
import { AprovacaoVendaCard } from './components/aprovacao-venda-card'
import { EditarMotoButton } from './components/editar-moto-button'
import { CorrigirPrecoCompraButton } from './components/corrigir-preco-compra-button'
import { HistoricoTab } from './components/historico-tab'
import { VendaTab } from './components/venda-tab'
import { listarDemandasComSinalAbertas } from '@/lib/queries/demandas'
import { listarOrigensAtivasDoGrupo } from '@/lib/queries/origens-venda'
import { OSTab } from './components/os-tab'
import { GarantiasTab } from './components/garantias-tab'
import { potenciaNaTela } from '@/lib/gestao-modelos'
import { statusLabel, disponibilidadeLabel, type Status, type Disponibilidade } from '@/lib/estado-moto'

export default async function MotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [moto, usuario] = await Promise.all([buscarMoto(id), getUsuarioLogado()])
  // Rota do PAI: a tabela não tem item por id.
  if (!usuarioPodeAcessar(usuario, '/estoque')) redirect('/dashboard')

  // Moto de grupo que o usuário não vê: 404, como id inexistente (não revela que existe).
  if (!moto) notFound()
  const [podeAbrir, grupoIdDaMoto] = await Promise.all([
    podeAbrirRegistroDaLoja(usuario, moto.lojaId),
    getGrupoIdDaLoja(moto.lojaId),
  ])
  if (!podeAbrir) notFound()
  const podeAprovarValorMinimo = await podeAprovarVendaBaixoValor(usuario, moto.lojaId)
  const podeAprovarSensivel = await podeAprovarPagamentoSensivelNaLoja(usuario, moto.lojaId)
  const tipoAprovacaoPendente = (moto.aprovacaoPendenteTipo ?? 'valor_minimo') as 'valor_minimo' | 'pagamento_sensivel'
  const podeAprovarAprovacao = tipoAprovacaoPendente === 'pagamento_sensivel' ? podeAprovarSensivel : podeAprovarValorMinimo
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const acessoMultiGrupo = isAdmin && await podeTransferirEntreGrupos(usuario)

  const [mecanicos, lojasOpts, lojasTransferencia, usuariosOpts, modelosOpts, precRow, taxasRow] = await Promise.all([
    listarUsuariosDoGrupo(grupoIdDaMoto, { papeis: ['mecanico'] }),
    listarLojasDoGrupoAtivo(usuario),
    // Igual a /transferencias e /estoque: destino do botão "Transferir" inclui todos
    // os grupos só pra quem tem a exceção; lojasOpts (filtro/editar) segue por grupo.
    acessoMultiGrupo ? listarLojasAtivasDaConta(usuario) : listarLojasDoGrupoAtivo(usuario),
    listarUsuariosDoGrupo(grupoIdDaMoto),
    // O modelo atual da moto fica na lista mesmo se a marca estiver escondida para a Conta.
    contaDoGrupoAtivo(usuario).then(c => listarModelosDaConta(c)).then(lista =>
      lista.some(m => m.id === moto.modeloId) || !moto.modeloId ? lista : [...lista, { id: moto.modeloId, modelo: moto.modelo }]),
    db.select({ valorMinimo: precificacao.valorMinimo })
      .from(precificacao)
      .where(and(eq(precificacao.nome, moto.modelo), eq(precificacao.ativo, true), eq(precificacao.grupoId, grupoIdDaMoto)))
      .limit(1),
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupoIdDaMoto)),
  ])

  // Origem da venda: catálogo do grupo da loja da MOTO, que é contra quem a
  // action valida — não o grupo ativo do usuário.
  const origens = await listarOrigensAtivasDoGrupo(grupoIdDaMoto)

  // Demandas abertas com sinal do mesmo modelo/loja — candidatas a vínculo na venda
  const demandasCompativeis = moto.modeloId
    ? (await listarDemandasComSinalAbertas([moto.lojaId])).filter(d => d.modeloId === moto.modeloId)
    : []

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
                temVenda={await motoTemVenda(moto.id)}
              />
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Chassi</span><span className="font-mono text-xs">{moto.chassi}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge>{statusLabel[moto.status as Status] ?? moto.status}</Badge></div>
            {moto.disponibilidade && (
              <div className="flex justify-between"><span className="text-muted-foreground">Disponibilidade</span><Badge variant="outline">{disponibilidadeLabel[moto.disponibilidade as Disponibilidade] ?? moto.disponibilidade}</Badge></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Loja</span><span>{moto.lojaNome}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cor</span><span>{moto.cor}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><span>{moto.categoria}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Potência</span><span>{potenciaNaTela(moto.potenciaW)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Motor</span><span>{moto.motor}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">NF Entrada</span><span>{moto.notaFiscalEntrada}</span></div>
            {['admin_geral', 'admin_socio'].includes(usuario.papel) && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Preço de Compra</span>
                <span className="flex items-center gap-1">
                  {moto.precoCompra
                    ? <span className="font-medium text-success">R$ {Number(moto.precoCompra).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    : <span className="text-muted-foreground">Sem preço</span>}
                  {/* Vendida mantém o preço que entrou no custo da venda (#514). */}
                  {moto.status !== 'vendida' && <CorrigirPrecoCompraButton motoId={moto.id} precoAtual={moto.precoCompra} />}
                </span>
              </div>
            )}
            {moto.dataMontagem && (
              <div className="flex justify-between"><span className="text-muted-foreground">Data Montagem</span><span>{new Date(moto.dataMontagem + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>
            )}
            {moto.mecanicoNome && (
              <div className="flex justify-between"><span className="text-muted-foreground">Mecânico</span><span>{moto.mecanicoNome}</span></div>
            )}
          </CardContent>
        </Card>

        <MotoActions
        moto={moto}
        papel={usuario.papel}
        isVendedor={temPapel(usuario, 'vendedor')}
        vendedorId={usuario.id}
        vendedorNome={usuario.nome}
        usuarios={usuariosOpts}
        mecanicos={mecanicos}
        lojas={lojasTransferencia}
        lojaUsuarioId={usuario.lojaId ?? null}
        precoMinimoPix={precoMinimoPix}
        taxasVenda={taxasVenda}
        podeAprovarPagamentoSensivel={podeAprovarSensivel}
        demandasCompativeis={demandasCompativeis}
        origens={origens}
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
            <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
              <HistoricoTab motoId={moto.id} notaFiscalEntrada={moto.notaFiscalEntrada} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="os">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
              <OSTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="garantias">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
              <GarantiasTab motoId={moto.id} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="venda">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
              <VendaTab motoId={moto.id} papel={usuario.papel} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
