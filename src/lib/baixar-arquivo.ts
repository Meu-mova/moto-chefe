/**
 * Entrega o arquivo ao navegador como download. Só em Client Component (usa `document`).
 * `conteudo` é o Blob ou uma URL que já aponta para o arquivo (ex.: `data:`).
 */
export function baixarArquivo(nome: string, conteudo: Blob | string) {
  const url = typeof conteudo === 'string' ? conteudo : URL.createObjectURL(conteudo)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  if (typeof conteudo !== 'string') URL.revokeObjectURL(url)
}
