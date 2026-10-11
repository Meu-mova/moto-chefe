// src/app/(auth)/login/page.tsx
import { loginAction } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CampoSenha } from '@/components/auth/campo-senha'
import { BotaoEnviar } from '@/components/auth/botao-enviar'

const ERROS: Record<string, string> = {
  indisponivel: 'Não foi possível falar com o serviço de login agora. Espere um pouco e tente de novo — sua senha está certa.',
  inativo: 'Esta conta foi desativada. Fale com o administrador.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const mensagem = error ? ERROS[error] ?? 'E-mail ou senha inválidos.' : null

  return (
    <>
      <h1 className="text-xl font-semibold">Entrar</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Gestão em mobilidade elétrica</p>
      <form action={loginAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="seu@email.com" className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <CampoSenha id="password" name="password" required autoComplete="current-password" />
        </div>
        {mensagem && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{mensagem}</p>
        )}
        <BotaoEnviar enviando="Entrando…">Entrar</BotaoEnviar>
      </form>
    </>
  )
}
