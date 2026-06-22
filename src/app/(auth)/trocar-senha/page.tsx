import { trocarSenhaAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ERRORS: Record<string, string> = {
  mismatch: 'As senhas não coincidem.',
  short: 'A senha deve ter pelo menos 8 caracteres.',
  '1': 'Erro ao atualizar a senha. Tente novamente.',
}

export default async function TrocarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const mensagem = error ? ERRORS[error] ?? 'Erro desconhecido.' : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">MOVA</CardTitle>
          <p className="text-center text-sm text-slate-500">
            Por segurança, defina uma nova senha para continuar.
          </p>
        </CardHeader>
        <CardContent>
          <form action={trocarSenhaAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova_senha">Nova senha</Label>
              <Input
                id="nova_senha"
                name="nova_senha"
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar_senha">Confirmar nova senha</Label>
              <Input
                id="confirmar_senha"
                name="confirmar_senha"
                type="password"
                required
                minLength={8}
              />
            </div>
            {mensagem && (
              <p className="text-sm text-red-600">{mensagem}</p>
            )}
            <Button type="submit" className="w-full">Redefinir senha</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
