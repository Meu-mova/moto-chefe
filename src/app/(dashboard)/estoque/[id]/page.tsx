// src/app/(dashboard)/estoque/[id]/page.tsx
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { buscarMoto } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusActions } from './components/status-actions'
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

  const mecanicos = await db
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.papel, 'mecanico'))

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/estoque" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{moto.marca} {moto.modelo}</h1>
          <p className="text-slate-500 text-sm font-mono">{moto.chassi}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
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
            {moto.dataMontagem && (
              <div className="flex justify-between"><span className="text-slate-500">Data Montagem</span><span>{new Date(moto.dataMontagem + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>
            )}
            {moto.mecanicoNome && (
              <div className="flex justify-between"><span className="text-slate-500">Mecânico</span><span>{moto.mecanicoNome}</span></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Alterar Status</CardTitle></CardHeader>
          <CardContent>
            <StatusActions
              motoId={moto.id}
              statusAtual={moto.status}
              disponibilidadeAtual={moto.disponibilidade ?? null}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaIdMoto={moto.lojaId}
              mecanicos={mecanicos}
            />
          </CardContent>
        </Card>
      </div>

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
