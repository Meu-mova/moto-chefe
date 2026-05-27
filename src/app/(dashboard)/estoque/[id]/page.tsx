// src/app/(dashboard)/estoque/[id]/page.tsx
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { buscarMoto } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusActions } from './components/status-actions'
import { HistoricoTab } from './components/historico-tab'
import { statusLabel, type Status } from '@/lib/estado-moto'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function MotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [moto, usuario] = await Promise.all([buscarMoto(id), getUsuarioLogado()])

  if (!moto) notFound()

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
            <div className="flex justify-between"><span className="text-slate-500">Loja</span><span>{moto.lojaNome}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cor</span><span>{moto.cor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Categoria</span><span>{moto.categoria}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Potência</span><span>{moto.potenciaW}W</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Motor</span><span>{moto.motor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Vel. Máx.</span><span>{moto.velocidadeMax} km/h</span></div>
            <div className="flex justify-between"><span className="text-slate-500">NF Entrada</span><span>{moto.notaFiscalEntrada}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Alterar Status</CardTitle></CardHeader>
          <CardContent>
            <StatusActions
              motoId={moto.id}
              statusAtual={moto.status}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaIdMoto={moto.lojaId}
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
              <HistoricoTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="os">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 3.
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="garantias">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 3.
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="venda">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 2.
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
