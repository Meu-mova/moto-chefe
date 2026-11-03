// Arquivo de comprovante (foto ou PDF) que sobe para o bucket privado 'comprovantes':
// saída de caixa e sinal de demanda. Uma regra só para o que se aceita.

export const BUCKET_COMPROVANTES = 'comprovantes'

export const TAMANHO_MAX_COMPROVANTE = 10 * 1024 * 1024

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

/** Para o `accept` do <input type="file">. */
export const ACCEPT_COMPROVANTE = Object.keys(EXTENSAO).join(',')

/** Extensão do arquivo se ele é aceito; senão a frase que a tela mostra. */
export function conferirComprovante(arquivo: { type: string; size: number } | null | undefined): { ok: true; ext: string } | { ok: false; erro: string } {
  if (!arquivo || arquivo.size === 0) return { ok: false, erro: 'Arquivo não enviado' }
  const ext = EXTENSAO[arquivo.type]
  if (!ext) return { ok: false, erro: 'Formato não suportado. Envie JPG, PNG, WebP ou PDF.' }
  if (arquivo.size > TAMANHO_MAX_COMPROVANTE) return { ok: false, erro: 'Arquivo muito grande. Máximo: 10MB.' }
  return { ok: true, ext }
}
