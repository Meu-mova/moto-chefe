// src/app/(auth)/login/page.tsx
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Gestão de Estoque</CardTitle>
          <p className="text-center text-sm text-slate-500">Motos Elétricas</p>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && (
              <p className="text-sm text-red-600">Email ou senha inválidos.</p>
            )}
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
