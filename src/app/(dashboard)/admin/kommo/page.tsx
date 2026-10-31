import { AdminGuard, exigirAcessoPagina } from '../components/admin-guard'
import { getKommoStatusAction } from './actions'
import { KommoConnectButton } from './components/kommo-connect-button'
import { KommoCredenciaisForm } from './components/kommo-credenciais-form'
import { KommoTokenForm } from './components/kommo-token-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, Headset } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const ERROS: Record<string, string> = {
  sem_permissao: 'Acesso restrito ao Admin Geral.',
  sem_credenciais: 'Salve o Client ID e o Client Secret antes de conectar.',
  sem_subdominio: 'Não foi possível identificar o subdomínio da conta. Preencha o subdomínio e tente de novo.',
  state_invalido: 'Sessão de conexão expirada. Tente conectar novamente.',
  acesso_negado: 'Autorização negada no Kommo.',
  token: 'Erro ao obter os tokens do Kommo. Confira as credenciais e tente novamente.',
}

export default async function KommoPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirAcessoPagina('/admin/kommo')
  const params = await searchParams
  const status = await getKommoStatusAction()

  return (
    <AdminGuard href="/admin/kommo">
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headset size={22} /> Kommo (CRM)
          </h1>
          <p className="text-muted-foreground text-sm">Integração para métricas de atendimento por colaborador</p>
        </div>

        {params.ok && (
          <div className="bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success flex items-center gap-2">
            <CheckCircle2 size={16} /> Conta Kommo conectada com sucesso!
          </div>
        )}
        {params.erro && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <XCircle size={16} /> {ERROS[params.erro] ?? 'Erro na conexão. Tente novamente.'}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Status da conexão</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {status.conectado ? <CheckCircle2 className="text-success" size={20} /> : <XCircle className="text-muted-foreground" size={20} />}
              <div>
                <p className="font-medium text-sm">
                  {status.conectado ? `Conectado${status.subdominio ? ` — ${status.subdominio}.kommo.com` : ''}` : 'Não conectado'}
                </p>
                {status.atualizadoEm && (
                  <p className="text-xs text-muted-foreground">
                    Última atualização: {format(new Date(status.atualizadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>
            <KommoConnectButton conectado={status.conectado} temCredenciais={status.temCredenciais} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conectar por token de longa duração</CardTitle>
            <p className="text-xs text-muted-foreground">Método mais simples — cole o token da integração privada (Kommo → sua integração → aba Chaves e escopos).</p>
          </CardHeader>
          <CardContent>
            <KommoTokenForm subdominio={status.subdominio} />
          </CardContent>
        </Card>

        <details className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">Alternativa: conectar por OAuth (Client ID/Secret)</summary>
          <div className="border-t p-4">
            <KommoCredenciaisForm subdominio={status.subdominio} temCredenciais={status.temCredenciais} />
          </div>
        </details>

        <Card>
          <CardHeader><CardTitle className="text-base">Como configurar no Kommo</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>No Kommo: <strong>Configurações → Integrações → criar integração</strong> (privada).</li>
              <li>No campo <strong>Redirect URL</strong>, cole exatamente: <code className="bg-muted px-1 rounded text-xs break-all">{status.redirectUri}</code></li>
              <li>Marque os escopos de acesso (leads, contatos, eventos, usuários).</li>
              <li>Copie o <strong>Client ID (ID da integração)</strong> e a <strong>chave secreta</strong> e salve acima.</li>
              <li>Clique em <strong>Conectar ao Kommo</strong> e autorize.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
