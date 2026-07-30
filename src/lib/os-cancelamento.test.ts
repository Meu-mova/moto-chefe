import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeCancelarOS, motivoBloqueioCancelamento, type SituacaoOS } from './os-cancelamento'

const LIVRE: SituacaoOS = {
  jaCancelada: false, temPagamento: false, temConciliacao: false, temAprovacaoPendente: false,
}

test('aux_adm cancela — é quem abre e fecha OS na loja', () => {
  assert.equal(podeCancelarOS('aux_adm'), true)
})

test('admin_geral e admin_socio cancelam', () => {
  assert.equal(podeCancelarOS('admin_geral'), true)
  assert.equal(podeCancelarOS('admin_socio'), true)
})

test('mecânico e vendedor não cancelam', () => {
  assert.equal(podeCancelarOS('mecanico'), false)
  assert.equal(podeCancelarOS('vendedor'), false)
})

test('OS limpa pode ser cancelada', () => {
  assert.equal(motivoBloqueioCancelamento(LIVRE), null)
})

test('pagamento lançado bloqueia', () => {
  assert.match(
    motivoBloqueioCancelamento({ ...LIVRE, temPagamento: true })!,
    /pagamento lançado/,
  )
})

test('conciliação bloqueia e ganha da mensagem de pagamento', () => {
  // OS conciliada sempre tem pagamento; o motivo específico é mais útil.
  assert.match(
    motivoBloqueioCancelamento({ ...LIVRE, temPagamento: true, temConciliacao: true })!,
    /conciliada/,
  )
})

test('aprovação pendente bloqueia', () => {
  assert.match(
    motivoBloqueioCancelamento({ ...LIVRE, temAprovacaoPendente: true })!,
    /aprovação de pagamento pendente/,
  )
})

test('OS já cancelada não cancela de novo', () => {
  assert.match(motivoBloqueioCancelamento({ ...LIVRE, jaCancelada: true })!, /já está cancelada/)
})
