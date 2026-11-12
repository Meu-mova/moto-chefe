import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rodarTodosOsGrupos } from './rodada'
import { ErroMercadoPago } from './cliente'
import { RecusaUsuario } from '@/lib/resultado-action'

const ok = { importadas: 1, duplicadas: 0, conciliadas: 0, pixNovos: 0, estornos: 0, ignorados: 0 }
const grupos = async () => [{ id: 'g1', nome: 'Sul' }, { id: 'g2', nome: 'BH' }]

test('grupo com 401 não impede o seguinte', async () => {
  const r = await rodarTodosOsGrupos({
    grupos,
    importar: async (id) => {
      if (id === 'g1') throw new ErroMercadoPago('Token recusado', 401)
      return ok
    },
  })
  assert.deepEqual(r, [
    { grupo: 'Sul', ok: false, erro: 'Token recusado' },
    { grupo: 'BH', ok: true, resultado: ok },
  ])
})

test('erro desconhecido vira "erro interno" sem vazar a mensagem; RecusaUsuario mantém a mensagem', async () => {
  const r = await rodarTodosOsGrupos({
    grupos,
    importar: async (id) => {
      if (id === 'g1') throw new Error('token abc123 falhou')
      throw new RecusaUsuario('Sem credencial')
    },
  })
  assert.equal(r[0].erro, 'erro interno')
  assert.equal(r[1].erro, 'Sem credencial')
})
