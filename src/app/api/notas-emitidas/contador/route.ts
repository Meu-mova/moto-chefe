import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { emailValido, enviarEmail } from '@/lib/email'
import { registrarAcaoSensivelSemFalhar } from '@/lib/log-acoes'
import { periodoEmissao } from '@/lib/notas-emitidas'
import { VALIDADE_LINK_DIAS, enviarAoContador } from '@/lib/notas-contador'
import { notasParaContador, salvarEmailDoContador } from '@/lib/queries/notas-contador'

// Route Handler e não Server Action: o zip de um mês leva minutos e Server Action trava as outras (hotfix v1.2.2).
export const maxDuration = 300
// Folga para subir o zip, se for por link, e mandar o e-mail.
const PRAZO_DOWNLOADS_MS = 220_000
export const dynamic = 'force-dynamic'

const BUCKET = 'notas-contador'

async function baixar(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
}

type Storage = ReturnType<typeof createSupabaseAdmin>['storage']

// O link vence em 7 dias, mas o zip (XML com CPF de cliente) ficaria no bucket para sempre: cada envio apaga os vencidos do grupo.
async function apagarVencidos(storage: Storage, grupoId: string) {
  const { data } = await storage.from(BUCKET).list(grupoId, { limit: 1000 })
  const limite = Date.now() - VALIDADE_LINK_DIAS * 24 * 60 * 60 * 1000
  const vencidos = (data ?? []).filter(o => o.created_at && Date.parse(o.created_at) < limite).map(o => `${grupoId}/${o.name}`)
  if (vencidos.length > 0) await storage.from(BUCKET).remove(vencidos)
}

async function publicar(grupoId: string, zip: Uint8Array): Promise<string | null> {
  const storage = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
  const caminho = `${grupoId}/${randomUUID()}.zip`
  const subir = () => storage.from(BUCKET).upload(caminho, zip, { contentType: 'application/zip' })
  let { error } = await subir()
  if (error) {
    // Bucket criado aqui e não na migração: o Postgres descartável do CI não tem o schema do Storage.
    await storage.createBucket(BUCKET, { public: false })
    ;({ error } = await subir())
  }
  if (error) {
    console.error('[notas-contador] falha ao subir o zip:', error.message)
    return null
  }
  await apagarVencidos(storage, grupoId)
  const { data, error: erroLink } = await storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_LINK_DIAS * 24 * 60 * 60)
  if (erroLink || !data) return null
  return data.signedUrl
}

const ERROS = {
  sem_notas: [404, 'Nenhuma nota autorizada ou cancelada de produção neste período.'],
  link: [502, 'Não deu para gerar o link do arquivo. Tente de novo.'],
  email: [502, 'O e-mail não saiu. Tente de novo em alguns minutos.'],
} as const

/** "Enviar ao contador" (#402): produção, autorizadas e canceladas do período, do grupo ativo; grava o e-mail no grupo. */
export async function POST(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  }
  if (!usuarioPodeAcessar(usuario, '/notas-emitidas')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const email = typeof corpo.email === 'string' ? corpo.email.trim() : ''
  if (!emailValido(email)) return NextResponse.json({ error: 'E-mail do contador inválido.' }, { status: 400 })
  const periodo = periodoEmissao({
    de: typeof corpo.de === 'string' ? corpo.de : undefined,
    ate: typeof corpo.ate === 'string' ? corpo.ate : undefined,
  })

  const grupo = await grupoAtivoDaRequisicao(usuario)
  const doGrupo = { grupoId: grupo.id, contaId: usuario.papel === 'admin_geral' ? null : grupo.contaId }
  if (!(await salvarEmailDoContador({ ...doGrupo, email }))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const inicio = Date.now()
  const r = await enviarAoContador({
    grupo: grupo.nome, ...periodo,
    notas: await notasParaContador({ ...doGrupo, ...periodo }),
    tempoEsgotado: () => Date.now() - inicio > PRAZO_DOWNLOADS_MS,
  }, {
    baixar,
    publicar: zip => publicar(grupo.id, zip),
    enviar: async e => (await enviarEmail({ para: email, assunto: e.assunto, texto: e.texto, anexos: e.anexo ? [e.anexo] : undefined })).status === 'enviado',
  })
  if (!r.ok) {
    const [status, error] = ERROS[r.erro]
    return NextResponse.json({ error }, { status })
  }

  await registrarAcaoSensivelSemFalhar({
    tipo: 'notas_enviadas_contador', usuarioId: usuario.id, grupoId: grupo.id,
    detalhe: { para: email, ...periodo, notas: r.notas, modo: r.modo, faltaram: r.faltaram },
  })
  return NextResponse.json(r)
}
