// Comprovante de transferência, variante C aprovada (#877).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Comprovante } from './comprovante'
import type { ComprovanteTransferencia } from '@/lib/transferencia-tela'

const aceita: ComprovanteTransferencia = {
  empresa: 'Empresa Exemplo Ltda',
  cnpj: '00.000.000/0001-00',
  data: '13/11/2026',
  status: 'Aceita',
  moto: 'JETMAX · CINZA · chassi LYDAE0000T0000001 · motor MOTOR0000000001',
  origem: 'Loja Centro',
  destino: 'Loja Norte',
  solicitado: 'Ana Exemplo · 13/11/2026 09:12',
  resposta: { rotulo: 'Aprovado por', texto: 'Bruno Exemplo · 13/11/2026 10:40' },
  observacao: 'Levar com carregador.',
}

const texto = (c: ComprovanteTransferencia) => {
  const html = renderToStaticMarkup(createElement(Comprovante, { c }))
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

test('cabeçalho e dados: título, empresa com CNPJ, data, status, moto, origem e destino, pedido e aprovação, observação', () => {
  const t = texto(aceita)
  for (const trecho of [
    'COMPROVANTE DE TRANSFERÊNCIA', 'Empresa Exemplo Ltda · CNPJ 00.000.000/0001-00', '13/11/2026', 'Status: Aceita',
    'JETMAX · CINZA · chassi LYDAE0000T0000001 · motor MOTOR0000000001', 'Loja Centro → Loja Norte',
    'Solicitado por Ana Exemplo · 13/11/2026 09:12', 'Aprovado por Bruno Exemplo · 13/11/2026 10:40',
    'Observação Levar com carregador.',
  ]) assert.ok(t.includes(trecho), `falta: ${trecho}`)
})

test('conferência na chegada: as seis caixas para marcar à mão, linhas de anotações e as duas assinaturas', () => {
  const html = renderToStaticMarkup(createElement(Comprovante, { c: aceita }))
  const t = texto(aceita)
  const itens = ['Chave (quantidade: ___)', 'Carregador', 'Manual', 'Retrovisores', 'Sem avarias', 'Com avarias (descrever abaixo)']
  for (const item of itens) assert.ok(t.includes(item), `falta: ${item}`)
  assert.equal(html.match(/class="caixa"/g)?.length, itens.length, 'uma caixa por item')
  assert.ok(t.includes('Conferência na chegada') && t.includes('Anotações'))
  assert.equal(html.match(/class="linha"/g)?.length, 3, 'três linhas para anotar')
  assert.ok(t.includes('Entregue por (loja de origem)'))
  assert.ok(t.includes('Recebido e conferido por (loja de destino)'))
})

test('pendente e sem observação: as linhas de resposta e de observação não aparecem', () => {
  const t = texto({ ...aceita, status: 'Pendente', resposta: null, observacao: null })
  assert.ok(t.includes('Status: Pendente'))
  assert.ok(!t.includes('Aprovado por') && !t.includes('Recusado por'))
  assert.ok(!t.includes('Observação'))
})

test('texto do comprovante sem travessão', () => {
  assert.ok(!renderToStaticMarkup(createElement(Comprovante, { c: aceita })).includes('—'))
})
