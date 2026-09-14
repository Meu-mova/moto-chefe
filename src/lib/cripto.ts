import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM porque o que é guardado aqui é certificado digital: além de
// secreto, precisa ser à prova de adulteração. GCM autentica — um blob mexido
// no banco falha em vez de devolver bytes corrompidos que viram um .pfx
// inválido três camadas adiante, num erro que não diz nada.

function chave(): Buffer {
  const hex = process.env.CERT_MASTER_KEY
  if (!hex) throw new Error('CERT_MASTER_KEY não configurada')
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 32) throw new Error('CERT_MASTER_KEY precisa ter 32 bytes em hex (64 caracteres)')
  return bytes
}

/** `iv:tag:dados`, tudo em base64, numa string só — cabe numa coluna text. */
export function cifrar(conteudo: string | Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([cipher.update(Buffer.from(conteudo)), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), dados.toString('base64')].join(':')
}

export function decifrar(pacote: string): Buffer {
  const [iv, tag, dados] = pacote.split(':')
  if (!iv || !tag || !dados) throw new Error('Pacote cifrado malformado')
  const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()])
}
