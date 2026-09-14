import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sincronizarGrupo } from '@/lib/sefaz/sincronizar'

// 60s = teto do plano Hobby (Vercel) — não dá pra pedir mais. `sincronizarGrupo`
// (sincronizar.ts) sabe disso: o laço de drenagem por grupo tem orçamento de
// 45s e sai sem armar a trava de 1 hora se estourar, deixando a próxima
// execução continuar de onde parou. Com o cron rodando 1x/dia (vercel.json —
// Hobby não tem cron horário), a drenagem dentro de uma execução é o que
// evita um backlog de 90 dias levar 90 dias pra ser lido.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
    || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ativos = await db.select({ id: grupos.id, nome: grupos.nome })
    .from(grupos).where(eq(grupos.ativo, true))

  const resultados = []
  for (const grupo of ativos) {
    // Um grupo por vez, em série: são conexões TLS com certificados
    // diferentes, e a SEFAZ conta consumo por CNPJ. Paralelizar não ganha nada
    // e atrapalha o diagnóstico quando um deles falha.
    //
    // Com 3 grupos ativos e 60s de teto pra função inteira, o orçamento de
    // 45s por grupo (sincronizar.ts) é folgado demais pra rodar os três até o
    // fim num backlog grande ao mesmo tempo — a função pode ser morta no meio
    // do 2º ou 3º grupo. Isso é aceitável: cada iteração do laço de
    // drenagem já commitou o que conseguiu antes de ser morta (nada se
    // perde), e a próxima execução diária continua de onde parou, grupo por
    // grupo. Não é um caminho de perda de dado, só de backlog grande demorar
    // mais de um dia pra esvaziar.
    try {
      resultados.push({ grupo: grupo.nome, ...(await sincronizarGrupo(grupo)) })
    } catch (e) {
      // sincronizarGrupo já trata falha de rede e de certificado internamente
      // (vira status 'erro' sem lançar); isto aqui cobre o que escapa desse
      // try interno — por exemplo um erro no UPSERT de reivindicação da
      // janela (reivindicarJanela, em sincronizar.ts). Sem este try/catch, um
      // grupo com problema aborta o `for` inteiro: os grupos seguintes nem
      // são tentados e o JSON já calculado se perde num 500. O isolamento
      // entre CNPJs é premissa do projeto — um grupo quebrado não pode
      // impedir os outros de sincronizar.
      const erro = e instanceof Error ? e.message : 'Falha inesperada ao sincronizar o grupo'
      resultados.push({ grupo: grupo.nome, status: 'erro' as const, documentos: 0, erro })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
