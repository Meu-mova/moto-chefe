import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { criarFila, EsperaEsgotada } from './limitar-concorrencia'

// Tarefa que só termina quando o teste manda.
function tarefaControlada() {
  let terminar!: () => void
  let falhar!: (e: Error) => void
  const fim = new Promise<void>((ok, erro) => { terminar = ok; falhar = erro })
  return { fim, terminar: () => terminar(), falhar: (e: Error) => falhar(e) }
}
const umTique = () => new Promise(r => setImmediate(r))

test('nunca roda mais tarefas ao mesmo tempo do que o limite', async () => {
  const naFila = criarFila(2, 10_000)
  let rodando = 0
  let maximo = 0
  const controles = Array.from({ length: 5 }, tarefaControlada)
  const resultados = controles.map(c => naFila(async () => {
    rodando++; maximo = Math.max(maximo, rodando)
    await c.fim
    rodando--
  }))
  for (const c of controles) { await umTique(); c.terminar() }
  await Promise.all(resultados)
  assert.equal(maximo, 2)
})

test('quem espera entra na ordem de chegada', async () => {
  const naFila = criarFila(1, 10_000)
  const ordem: number[] = []
  const primeira = tarefaControlada()
  const p0 = naFila(async () => { await primeira.fim; ordem.push(0) })
  const outras = [1, 2, 3].map(n => naFila(async () => { ordem.push(n) }))
  primeira.terminar()
  await Promise.all([p0, ...outras])
  assert.deepEqual(ordem, [0, 1, 2, 3])
})

test('tarefa que falha devolve o erro e libera a vaga', async () => {
  const naFila = criarFila(1, 10_000)
  const falha = naFila(async () => { throw new Error('consulta quebrou') })
  const seguinte = naFila(async () => 'rodou')
  await assert.rejects(falha, /consulta quebrou/)
  assert.equal(await seguinte, 'rodou')
})

test('desiste depois da espera máxima e a tarefa desistida nunca roda', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const naFila = criarFila(1, 10_000)
    const ocupando = tarefaControlada()
    const p0 = naFila(() => ocupando.fim)
    let rodouDesistida = false
    const desistida = naFila(async () => { rodouDesistida = true })
    mock.timers.tick(10_000)
    await assert.rejects(desistida, EsperaEsgotada)
    ocupando.terminar()
    await p0
    assert.equal(await naFila(async () => 'vaga livre'), 'vaga livre')
    assert.equal(rodouDesistida, false)
  } finally {
    mock.timers.reset()
  }
})
