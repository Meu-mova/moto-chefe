'use server'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { adesoesMova } from '@/lib/db/schema'
import { cifrar } from '@/lib/cripto'
import { enviarEmail } from '@/lib/email'
import { adesaoSchema, validarArquivoCnpj, validarArquivoCert, emailNovaAdesao } from '@/lib/adesao'
import { colunasFiscais } from '@/lib/adesao-fiscal'
import { consultarEmpresaReceita, type EmpresaReceita } from '@/lib/brasilapi-cnpj'
import { ERRO_MUITAS_TENTATIVAS, permitirTentativa } from '@/lib/limite-tentativas'
import { lerDadosDoPfx } from '@/lib/sefaz/certificado'
import { ipDoPedido } from '@/lib/ip-do-pedido'

// Para onde vai o aviso de nova adesão; mesma env que já existia para os leads.
const EMAIL_EQUIPE = process.env.LEADS_EMAIL_TO || 'contato@meumova.com'

export type ResultadoAdesao = { ok: true } | { ok: false; erro: string }

// node-forge não separa senha errada de arquivo estragado; a frase também não diz qual dos dois.
const ERRO_CERTIFICADO = 'Não deu para abrir o certificado. Confira o arquivo e a senha.'

const ipDaRequisicao = async () => ipDoPedido(await headers())

/** Abre o A1 no servidor e devolve o CNPJ; null para senha errada ou arquivo inválido. */
async function cnpjDoCertificado(cert: FormDataEntryValue | null, senha: string): Promise<{ cnpj: string; titular: string } | null> {
  if (!(cert instanceof File)) return null
  const bytes = new Uint8Array(await cert.arrayBuffer())
  if (!validarArquivoCert(cert.name, bytes).ok) return null
  try {
    const { cnpj, titular } = lerDadosDoPfx(Buffer.from(bytes), senha)
    return { cnpj, titular }
  } catch {
    return null
  }
}

export type ResultadoConsultaEmpresa =
  | { ok: true; cnpj: string; empresa: EmpresaReceita | null; receita: 'achou' | 'nao_encontrado' | 'sem_resposta'; avisoRazao: string | null }
  | { ok: false; erro: string }

/**
 * Passo "Sua empresa" (#588): o CNPJ sai do A1, nunca do que a pessoa digita, e a Receita
 * (BrasilAPI) pré-preenche. Receita fora do ar devolve empresa null e a tela segue em branco.
 */
export async function consultarEmpresaAction(form: FormData): Promise<ResultadoConsultaEmpresa> {
  if (form.get('site')) return { ok: true, cnpj: '', empresa: null, receita: 'sem_resposta', avisoRazao: null }
  if (!(await permitirTentativa('consultar_empresa', await ipDaRequisicao()))) return { ok: false, erro: ERRO_MUITAS_TENTATIVAS }

  const lido = await cnpjDoCertificado(form.get('cert'), String(form.get('certSenha') ?? ''))
  if (!lido) return { ok: false, erro: ERRO_CERTIFICADO }

  const resposta = await consultarEmpresaReceita(lido.cnpj)
  const empresa = resposta === 'nao_encontrado' ? null : resposta
  const receita = resposta === 'nao_encontrado' ? 'nao_encontrado' : resposta ? 'achou' : 'sem_resposta'
  const normal = (v: string) => v.toUpperCase().replace(/\s+/g, ' ').trim()
  const avisoRazao = empresa?.razaoSocial && normal(empresa.razaoSocial) !== normal(lido.titular)
    ? `Seu certificado está com outro nome (${lido.titular}). Usamos o da Receita, que é o atual.`
    : null
  return { ok: true, cnpj: lido.cnpj, empresa, receita, avisoRazao }
}

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
  // Conta depois do formato (erro de digitação não trava a pessoa) e antes de abrir o A1,
  // que é o que serviria para testar senhas.
  if (!(await permitirTentativa('registrar_adesao', await ipDaRequisicao()))) return { ok: false, erro: ERRO_MUITAS_TENTATIVAS }
  const doCert = await cnpjDoCertificado(cert, dados.certSenha)
  if (!doCert) return { ok: false, erro: ERRO_CERTIFICADO }
  let entradaFiscal: unknown
  try { entradaFiscal = JSON.parse(String(form.get('fiscal') ?? '{}')) } catch { entradaFiscal = {} }
  const fiscal = colunasFiscais(entradaFiscal, doCert.cnpj)
  if (!fiscal.ok) return { ok: false, erro: fiscal.erro }

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
      ...fiscal.colunas,
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
