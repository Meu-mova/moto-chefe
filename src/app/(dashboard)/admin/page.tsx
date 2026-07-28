import { AdminGuard } from './components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Bike, Settings2, Tags, Megaphone, BarChart3, PackagePlus, ShoppingBag, Tag, FileText, Database, Layers, TrendingDown, Landmark, HandCoins, Headset } from 'lucide-react'

export default async function AdminPage() {
  const usuario = await getUsuarioLogado()
  const isSuperAdmin = usuario.papel === 'admin_geral'
  const grupo = await getGrupoAtivo(usuario)
  const mostrarBancos = grupo.nome === 'Sul de Minas'

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Administração</h1>
          <p className="text-slate-500 text-sm">Gerenciamento do sistema</p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Link href="/financeiro">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <BarChart3 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Financeiro</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Relatórios e resultados</p></CardContent>
            </Card>
          </Link>
          <Link href="/entrada">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <PackagePlus className="text-slate-600" size={20} />
                <CardTitle className="text-base">Entrada</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Registro de entrada de motos</p></CardContent>
            </Card>
          </Link>
          <Link href="/compras">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <ShoppingBag className="text-slate-600" size={20} />
                <CardTitle className="text-base">Compras</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Ordens de compra</p></CardContent>
            </Card>
          </Link>
          <Link href="/precificacao">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Tag className="text-slate-600" size={20} />
                <CardTitle className="text-base">Precificação</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Tabelas de preço e taxas</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/lojas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Building2 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Lojas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar lojas da rede</p></CardContent>
            </Card>
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/grupos">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex-row gap-3 items-center pb-2">
                  <Layers className="text-slate-600" size={20} />
                  <CardTitle className="text-base">Grupos</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-slate-500">Empresas (CNPJs) e integrações</p></CardContent>
              </Card>
            </Link>
          )}
          <Link href="/admin/usuarios">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Users className="text-slate-600" size={20} />
                <CardTitle className="text-base">Usuários</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar usuários e papéis</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/modelos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Bike className="text-slate-600" size={20} />
                <CardTitle className="text-base">Modelos</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar modelos de moto</p></CardContent>
            </Card>
          </Link>
          <Link href="/folha-pagamento">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <HandCoins className="text-slate-600" size={20} />
                <CardTitle className="text-base">Folha de Pagamento</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Salários, comissões, premiação e ajuda de custo</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/categorias-caixa">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Tags className="text-slate-600" size={20} />
                <CardTitle className="text-base">Categorias</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Categorias de caixa e de despesa</p></CardContent>
            </Card>
          </Link>
          <Link href="/despesas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <TrendingDown className="text-slate-600" size={20} />
                <CardTitle className="text-base">Despesas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Despesas operacionais da empresa</p></CardContent>
            </Card>
          </Link>
          {mostrarBancos && (
            <Link href="/admin/bancos">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex-row gap-3 items-center pb-2">
                  <Landmark className="text-slate-600" size={20} />
                  <CardTitle className="text-base">Bancos</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-slate-500">Saldo das contas conectadas (Open Finance)</p></CardContent>
              </Card>
            </Link>
          )}
          <Link href="/admin/comunicados">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Megaphone className="text-slate-600" size={20} />
                <CardTitle className="text-base">Comunicados</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Canal de comunicação interna</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/kommo">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Headset className="text-slate-600" size={20} />
                <CardTitle className="text-base">Kommo (CRM)</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Métricas de atendimento por colaborador</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/bling">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <FileText className="text-slate-600" size={20} />
                <CardTitle className="text-base">Bling NF-e</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Emissão automática de nota fiscal</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/veiculos-historico">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Database className="text-slate-600" size={20} />
                <CardTitle className="text-base">Veículos Histórico</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Importar relação de motos já vendidas</p></CardContent>
            </Card>
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/acoes">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex-row gap-3 items-center pb-2">
                  <Settings2 className="text-slate-600" size={20} />
                  <CardTitle className="text-base">Ações Especiais</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-slate-500">Reatribuição de loja, correções</p></CardContent>
              </Card>
            </Link>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
