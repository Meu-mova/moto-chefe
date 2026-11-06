export class EsperaEsgotada extends Error {
  constructor(esperaMaxMs: number) {
    super(`esperou mais de ${esperaMaxMs} ms por uma vaga`)
    this.name = 'EsperaEsgotada'
  }
}

/**
 * Deixa no máximo `limite` tarefas rodando ao mesmo tempo; as outras esperam na ordem de chegada.
 * Quem espera mais que `esperaMaxMs` desiste com `EsperaEsgotada` e não roda depois.
 */
export function criarFila(limite: number, esperaMaxMs: number) {
  let rodando = 0
  let fila: Array<() => void> = []

  const liberar = () => {
    const [proxima, ...resto] = fila
    fila = resto
    if (proxima) proxima()
    else rodando--
  }

  const esperarVaga = () =>
    new Promise<void>((entrar, desistir) => {
      const vez = () => { clearTimeout(relogio); entrar() }
      const relogio = setTimeout(() => {
        fila = fila.filter(f => f !== vez)
        desistir(new EsperaEsgotada(esperaMaxMs))
      }, esperaMaxMs)
      fila = [...fila, vez]
    })

  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (rodando < limite) rodando++
    else await esperarVaga() // a vaga passa direto de quem saiu para quem entra
    try {
      return await tarefa()
    } finally {
      liberar()
    }
  }
}
