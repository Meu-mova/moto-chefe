import { AdminGuard } from './components/admin-guard'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Bike, Settings2 } from 'lucide-react'

export default async function AdminPage() {
  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Administração</h1>
          <p className="text-slate-500 text-sm">Gerenciamento do sistema</p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Link href="/admin/lojas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Building2 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Lojas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar lojas da rede</p></CardContent>
            </Card>
          </Link>
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
          <Link href="/admin/acoes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Settings2 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Ações Especiais</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Reatribuição de loja, correções</p></CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </AdminGuard>
  )
}
