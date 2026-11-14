// O "Alterar entrega" (#895) abre a Entrega gravada no formulário e a devolve igual se nada mudar.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { EntregaVenda } from '@/lib/notagateway/entrega'
import { ENTREGA_DO_FORMULARIO_INICIAL, entregaDoFormulario, formularioDaEntrega } from './entrega-campos'

const ENTREGAR: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua A', numero: '1', complemento: 'casa', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: null,
}

test('ida e volta: retira, entregar, com frete e com outra pessoa recebendo saem iguais', () => {
  for (const e of [
    { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' },
    ENTREGAR,
    { ...ENTREGAR, frete: 350 },
    { ...ENTREGAR, recebe: { nome: 'Maria', cpfCnpj: '529.982.247-25' } },
  ] as EntregaVenda[]) assert.deepEqual(entregaDoFormulario(formularioDaEntrega(e)), e)
})

test('o frete gravado abre ligado e com o valor como o campo de moeda devolve ("350.00")', () => {
  const f = formularioDaEntrega({ ...ENTREGAR, frete: 350 })
  assert.deepEqual([f.comFrete, f.frete], [true, '350.00'])
})

test('venda antiga sem Entrega abre o formulário vazio', () => {
  assert.deepEqual(formularioDaEntrega(null), ENTREGA_DO_FORMULARIO_INICIAL)
})
