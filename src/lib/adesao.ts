import { z } from 'zod'
import { emailValido } from '@/lib/email'

// Papéis que o formulário público oferece para os usuários da loja. admin_geral fica de fora
// de propósito: é a conta da equipe MOVA, ninguém pede isso num formulário aberto.
export const PAPEIS_ADESAO = [
  { valor: 'admin_socio', rotulo: 'Sócio' },
  { valor: 'aux_adm', rotulo: 'Auxiliar administrativo' },
  { valor: 'vendedor', rotulo: 'Vendedor' },
  { valor: 'mecanico', rotulo: 'Mecânico' },
  { valor: 'motorista', rotulo: 'Motorista' },
] as const
const VALORES_PAPEL = PAPEIS_ADESAO.map(p => p.valor) as [string, ...string[]]

export const LIMITE_CNPJ_BYTES = 5 * 1024 * 1024
export const LIMITE_CERT_BYTES = 512 * 1024
const MIME_CNPJ: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}

export const usuarioAdesaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome de cada usuário'),
  email: z.string().trim().refine(emailValido, 'E-mail de usuário inválido'),
  papel: z.enum(VALORES_PAPEL, { message: 'Escolha a função de cada usuário' }),
})

export const storeLoginValido = (v: string) => emailValido(v.trim())

export const adesaoSchema = z.object({
  loja: z.string().trim().min(2, 'Informe o nome da loja'),
  responsavel: z.string().trim().min(2, 'Informe o responsável'),
  celular: z.string().trim().refine(v => /^\d{10,11}$/.test(v.replace(/\D/g, '')), 'Celular inválido (com DDD)'),
  certSenha: z.string().min(1, 'Informe a senha do certificado'),
  // É o e-mail da conta no portal da fábrica; texto livre já chegou como "marlon" e a fábrica recusou (#292).
  storeLogin: z.string().trim().refine(storeLoginValido, 'Informe o e-mail de acesso ao motochefe.store'),
  storeSenha: z.string().min(1, 'Informe a senha do motochefe.store'),
  usuarios: z.array(usuarioAdesaoSchema).min(1, 'Inclua ao menos um usuário').max(20, 'No máximo 20 usuários'),
})
export type DadosAdesao = z.infer<typeof adesaoSchema>

type ArquivoValido = { ok: true; extensao: string } | { ok: false; erro: string }

/** Cartão CNPJ: PDF ou imagem, até 5 MB. */
export function validarArquivoCnpj(arquivo: { type: string; size: number }): ArquivoValido {
  if (arquivo.size === 0) return { ok: false, erro: 'Anexe o cartão de CNPJ' }
  if (arquivo.size > LIMITE_CNPJ_BYTES) return { ok: false, erro: 'Cartão de CNPJ maior que 5 MB' }
  const extensao = MIME_CNPJ[arquivo.type]
  if (!extensao) return { ok: false, erro: 'Cartão de CNPJ precisa ser PDF ou imagem (JPG, PNG, WebP)' }
  return { ok: true, extensao }
}

/**
 * Certificado A1 (.pfx/.p12). Além do nome e do tamanho, confere o primeiro byte: um PKCS#12
 * é uma sequência DER e começa em 0x30, então barra arquivo renomeado que não é certificado.
 */
export function validarArquivoCert(nome: string, bytes: Uint8Array): ArquivoValido {
  if (bytes.length === 0) return { ok: false, erro: 'Anexe o certificado digital' }
  if (bytes.length > LIMITE_CERT_BYTES) return { ok: false, erro: 'Certificado maior que 512 KB' }
  if (!/\.(pfx|p12)$/i.test(nome) || bytes[0] !== 0x30) {
    return { ok: false, erro: 'O certificado precisa ser um arquivo A1 (.pfx ou .p12)' }
  }
  return { ok: true, extensao: nome.split('.').pop()!.toLowerCase() }
}

/** Aviso à equipe. Sem nenhum segredo: só o suficiente para saber quem pediu e onde achar. */
export function emailNovaAdesao(a: { id: string; loja: string; responsavel: string; celular: string; usuarios: number }) {
  return {
    assunto: `Nova adesão ao MOVA: ${a.loja}`,
    texto: [
      'Nova solicitação de adesão pela página /adesao:',
      '',
      `Loja: ${a.loja}`,
      `Responsável: ${a.responsavel}`,
      `Celular: ${a.celular}`,
      `Usuários informados: ${a.usuarios}`,
      `Protocolo: ${a.id}`,
      '',
      'Os documentos e as senhas ficam cifrados no banco (tabela adesoes_mova).',
    ].join('\n'),
  }
}
