'use server'
import { randomUUID } from 'node:crypto'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { adesoesMova } from '@/lib/db/schema'
import { cifrar } from '@/lib/cripto'
import { enviarEmail } from '@/lib/email'
import { adesaoSchema, validarArquivoCnpj, validarArquivoCert, emailNovaAdesao } from '@/lib/adesao'

// Para onde vai o aviso de nova adesão; mesma env que já existia para os leads.
const EMAIL_EQUIPE = process.env.LEADS_EMAIL_TO || 'contato@meumova.com'

export type ResultadoAdesao = { ok: true } | { ok: false; erro: string }

export async function registrarAdesaoAction(form: FormData): Promise<ResultadoAdesao> {
  // Isca para robô: campo escondido que gente não preenche. Responde ok sem gravar nada.
  if (form.get('site')) return { ok: true }

  let usuarios: unknown
  try { usuarios = JSON.parse(String(form.get('usuarios') ?? '[]')) } catch { usuarios = [] }
  const parsed = adesaoSchema.safeParse({
    loja: form.get('loja'), responsavel: form.get('responsavel'), celular: form.get('celular'),
    certSenha: form.get('certSenha'), storeLogin: form.get('storeLogin'), storeSenha: form.get('storeSenha'),
    usuarios,
  })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Confira os dados e tente de novo.' }
  const dados = parsed.data

  const cnpj = form.get('cnpj')
  const cert = form.get('cert')
  if (!(cnpj instanceof File)) return { ok: false, erro: 'Anexe o cartão de CNPJ' }
  if (!(cert instanceof File)) return { ok: false, erro: 'Anexe o certificado digital' }
  const certBytes = new Uint8Array(await cert.arrayBuffer())
  const vCnpj = validarArquivoCnpj(cnpj)
  if (!vCnpj.ok) return { ok: false, erro: vCnpj.erro }
  const vCert = validarArquivoCert(cert.name, certBytes)
  if (!vCert.ok) return { ok: false, erro: vCert.erro }

  const id = randomUUID()
  const caminho = `${id}/cnpj.${vCnpj.extensao}`
  const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const up = await admin.storage.from('adesoes').upload(caminho, Buffer.from(await cnpj.arrayBuffer()), { contentType: cnpj.type })
  if (up.error) {
    console.error('registrarAdesaoAction: upload falhou', up.error.message)
    return { ok: false, erro: 'Não deu para enviar o cartão de CNPJ agora. Tente de novo em instantes.' }
  }

  try {
    await db.insert(adesoesMova).values({
      id,
      loja: dados.loja,
      responsavel: dados.responsavel,
      celular: dados.celular,
      cnpjArquivoPath: caminho,
      certArquivo: cifrar(Buffer.from(certBytes)),
      certSenha: cifrar(dados.certSenha),
      storeLogin: dados.storeLogin,
      storeSenha: cifrar(dados.storeSenha),
      usuarios: dados.usuarios,
    })
  } catch (e) {
    console.error('registrarAdesaoAction: insert falhou', e instanceof Error ? e.message : e)
    // Sem a linha no banco o arquivo ficaria órfão no bucket.
    await admin.storage.from('adesoes').remove([caminho])
    return { ok: false, erro: 'Não deu para registrar agora. Tente de novo em instantes.' }
  }

  // Best-effort: o pedido já está salvo; falha de e-mail não derruba a confirmação na tela.
  const aviso = emailNovaAdesao({ id, loja: dados.loja, responsavel: dados.responsavel, celular: dados.celular, usuarios: dados.usuarios.length })
  await enviarEmail({ para: EMAIL_EQUIPE, assunto: aviso.assunto, texto: aviso.texto })

  return { ok: true }
}
