import { AdminGuard } from '../components/admin-guard'
import { getBlingStatusAction, getBlingAuthUrlAction } from './actions'
import { BlingConnectButton } from './components/bling-connect-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default async function BlingPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const params = await searchParams
  const status  = await getBlingStatusAction()
  const authUrl = await getBlingAuthUrlAction()

  return (
    <AdminGuard>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={22} /> Bling NF-e
          </h1>
          <p className="text-slate-500 text-sm">Integração para emissão automática de NF-e de saída</p>
        </div>

        {params.ok && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 size={16} /> Conta Bling conectada com sucesso!
          </div>
        )}
        {params.erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle size={16} />
            {params.erro === 'acesso_negado' ? 'Autorização negada no Bling.' : 'Erro ao obter tokens. Tente novamente.'}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status da conexão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {status.conectado ? (
                <CheckCircle2 className="text-green-500" size={20} />
              ) : (
                <XCircle className="text-slate-400" size={20} />
              )}
              <div>
                <p className="font-medium text-sm">
                  {status.conectado ? 'Conta conectada' : 'Não conectado'}
                </p>
                {status.atualizadoEm && (
                  <p className="text-xs text-slate-500">
                    Última atualização: {format(new Date(status.atualizadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>

            <BlingConnectButton conectado={status.conectado} authUrl={authUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-requisitos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Antes de conectar, verifique:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
              <li>Acesse o <strong>Portal do Desenvolvedor Bling</strong> → Aplicações → criar app com URL de retorno: <code className="bg-slate-100 px-1 rounded text-xs">https://moto-chefe.vercel.app/api/bling/callback</code></li>
              <li>Adicione as variáveis <code className="bg-slate-100 px-1 rounded text-xs">BLING_CLIENT_ID</code> e <code className="bg-slate-100 px-1 rounded text-xs">BLING_CLIENT_SECRET</code> no Vercel (Settings → Environment Variables)</li>
              <li>Configure o <strong>código do produto Bling</strong> em cada modelo em Admin → Modelos</li>
              <li>Certifique-se que o certificado digital está ativo no Bling</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
