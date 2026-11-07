import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoDoArquivoValido, motivoQueImpedeArquivar, podeArquivarMotos, recusaDoLote, SEM_PENDENCIA, type PendenciasDaMoto } from './arquivar-moto-regras'

const com = (p: Partial<PendenciasDaMoto>): PendenciasDaMoto => ({ ...SEM_PENDENCIA, ...p })

test('sócio e admin geral arquivam (admin_rede chega como admin_socio)', () => {
  assert.equal(podeArquivarMotos('admin_socio'), true)
  assert.equal(podeArquivarMotos('admin_geral'), true)
})

test('quem opera a loja e os demais papéis não arquivam', () => {
  for (const papel of ['aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo', 'admin_rede']) {
    assert.equal(podeArquivarMotos(papel), false, papel)
  }
})

test('moto sem pendência, inclusive a marcada vendida sem venda (golpe), arquiva', () => {
  assert.equal(motivoQueImpedeArquivar(SEM_PENDENCIA), null)
})

test('cada pendência recusa com a frase que diz o que fazer', () => {
  assert.equal(motivoQueImpedeArquivar(com({ temVenda: true })), 'Tem venda registrada. Cancele a venda antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ reservaAtiva: true })), 'Tem reserva em aberto. Cancele ou finalize a reserva antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ pedidoPendente: true })), 'Tem pedido de venda em aberto. Efetive ou cancele o pedido antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ aprovacaoPendente: true })), 'Tem venda aguardando aprovação. Aprove ou recuse antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ transferenciaPendente: true })), 'Tem transferência em aberto. Aceite ou recuse antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ osAberta: { numero: 42 } })), 'Feche a OS nº 42 antes de arquivar.')
  assert.equal(motivoQueImpedeArquivar(com({ garantiaAtiva: true })), 'Tem garantia ativa. Encerre a garantia antes de arquivar.')
})

test('OS aberta sem número ainda recusa', () => {
  assert.equal(motivoQueImpedeArquivar(com({ osAberta: { numero: null } })), 'Feche a OS aberta antes de arquivar.')
})

test('com várias pendências, a venda vem primeiro', () => {
  assert.equal(motivoQueImpedeArquivar(com({ garantiaAtiva: true, temVenda: true })), 'Tem venda registrada. Cancele a venda antes de arquivar.')
})

test('lote: motivo em branco recusa antes de olhar as motos', () => {
  assert.equal(recusaDoLote({ motivo: '   ', motos: [{ chassi: 'A', pendencias: SEM_PENDENCIA }] }), 'Escreva o motivo do arquivamento.')
})

test('lote vazio recusa', () => {
  assert.equal(recusaDoLote({ motivo: 'golpe', motos: [] }), 'Escolha ao menos uma moto.')
})

test('lote com uma moto travada recusa o lote inteiro, dizendo qual', () => {
  assert.equal(
    recusaDoLote({ motivo: 'golpe', motos: [{ chassi: 'LIVRE1', pendencias: SEM_PENDENCIA }, { chassi: 'RES1', pendencias: com({ reservaAtiva: true }) }] }),
    'RES1: Tem reserva em aberto. Cancele ou finalize a reserva antes de arquivar.',
  )
})

test('lote só com motos livres e motivo passa', () => {
  assert.equal(recusaDoLote({ motivo: 'golpe', motos: [{ chassi: 'LIVRE1', pendencias: SEM_PENDENCIA }] }), null)
})

test('motivo: vale qualquer texto; só espaços não', () => {
  assert.equal(motivoDoArquivoValido('golpe'), true)
  assert.equal(motivoDoArquivoValido('  x '), true)
  assert.equal(motivoDoArquivoValido(''), false)
  assert.equal(motivoDoArquivoValido(' \n\t '), false)
})
