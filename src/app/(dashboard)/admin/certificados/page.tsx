import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { certificadosDigitais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { UploadForm } from './components/upload-form'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

const DIAS_DE_AVISO = 30

export default async function CertificadosPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/certificados')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [atual] = await db.select({
    titular: certificadosDigitais.titular,
    cnpj: certificadosDigitais.cnpj,
    uf: certificadosDigitais.uf,
    validoAte: certificadosDigitais.validoAte,
  }).from(certificadosDigitais).where(eq(certificadosDigitais.grupoId, grupo.id)).limit(1)

  const diasRestantes = atual
    ? Math.floor((atual.validoAte.getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certificado digital — {grupo.nome}</h1>
        <p className="text-muted-foreground text-sm">
          O certificado A1 é a credencial que o MOVA usa para falar com a SEFAZ. Ele fica
          guardado cifrado no nosso banco e não é enviado a nenhum terceiro.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2">
          {atual ? (
            <>
              <p className="text-sm"><strong>{atual.titular}</strong> — CNPJ {atual.cnpj} — {atual.uf}</p>
              <p className="text-sm text-muted-foreground">
                Válido até {atual.validoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {diasRestantes !== null && ` (${diasRestantes} dias)`}
              </p>
              {diasRestantes !== null && diasRestantes <= DIAS_DE_AVISO && (
                <p className="flex gap-2 text-sm text-warning bg-warning/10 rounded p-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Vence em {diasRestantes} dias. Quando vencer, o radar de notas para de
                    sincronizar — envie o novo por esta tela, sem precisar de deploy.
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum certificado cadastrado para este grupo.</p>
          )}
        </CardContent>
      </Card>

      <UploadForm ufAtual={atual?.uf ?? null} />
    </div>
  )
}
