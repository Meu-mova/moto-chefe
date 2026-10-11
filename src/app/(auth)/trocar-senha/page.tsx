import { trocarSenhaAction } from './actions'
import { Label } from '@/components/ui/label'
import { CampoSenha } from '@/components/auth/campo-senha'
import { BotaoEnviar } from '@/components/auth/botao-enviar'

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
    <>
      <h1 className="text-xl font-semibold">Nova senha</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Por segurança, defina uma nova senha para continuar.</p>
      <form action={trocarSenhaAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nova_senha">Nova senha</Label>
          <CampoSenha id="nova_senha" name="nova_senha" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmar_senha">Confirmar nova senha</Label>
          <CampoSenha id="confirmar_senha" name="confirmar_senha" required minLength={8} autoComplete="new-password" />
        </div>
        {mensagem && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{mensagem}</p>
        )}
        <BotaoEnviar enviando="Salvando…">Redefinir senha</BotaoEnviar>
      </form>
    </>
  )
}
