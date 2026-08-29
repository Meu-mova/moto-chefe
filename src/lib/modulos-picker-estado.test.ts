import test from 'node:test'
import assert from 'node:assert/strict'
import { estado, alternar } from './modulos-picker-estado'

// 'atendimento' é de GESTORES (admin_geral, admin_socio, aux_adm) — vendedor não tem.
const ITEM_DE_GESTOR = 'atendimento'
const PAPEL_QUE_DA = 'aux_adm'
const PAPEL_QUE_NAO_DA = 'vendedor'

test('desbloquear funciona mesmo quando o papel atual não concede mais o item — bug real corrigido', () => {
  // Item foi bloqueado enquanto o usuário tinha um papel que concedia o
  // item; depois o papel mudou para um que não concede mais.
  const extras: string[] = []
  const bloqueados = [ITEM_DE_GESTOR]

  assert.equal(estado(PAPEL_QUE_NAO_DA, extras, bloqueados, ITEM_DE_GESTOR), 'bloqueado')

  const resultado = alternar(PAPEL_QUE_NAO_DA, extras, bloqueados, ITEM_DE_GESTOR)

  assert.deepEqual(resultado.bloqueados, [], 'o item precisa sair de bloqueados')
  assert.notEqual(
    estado(PAPEL_QUE_NAO_DA, resultado.extras, resultado.bloqueados, ITEM_DE_GESTOR),
    'bloqueado',
    'depois de alternar, o estado não pode continuar "bloqueado"',
  )
})

test('item que o papel concede: alternar bloqueia, alternar de novo desbloqueia', () => {
  let extras: string[] = []
  let bloqueados: string[] = []

  const passo1 = alternar(PAPEL_QUE_DA, extras, bloqueados, ITEM_DE_GESTOR)
  assert.deepEqual(passo1.bloqueados, [ITEM_DE_GESTOR])
  assert.equal(estado(PAPEL_QUE_DA, passo1.extras, passo1.bloqueados, ITEM_DE_GESTOR), 'bloqueado')

  const passo2 = alternar(PAPEL_QUE_DA, passo1.extras, passo1.bloqueados, ITEM_DE_GESTOR)
  assert.deepEqual(passo2.bloqueados, [])
  assert.equal(estado(PAPEL_QUE_DA, passo2.extras, passo2.bloqueados, ITEM_DE_GESTOR), 'papel')
})

test('item que o papel não concede: alternar libera, alternar de novo tira a liberação', () => {
  let extras: string[] = []
  const bloqueados: string[] = []

  const passo1 = alternar(PAPEL_QUE_NAO_DA, extras, bloqueados, ITEM_DE_GESTOR)
  assert.deepEqual(passo1.extras, [ITEM_DE_GESTOR])
  assert.equal(estado(PAPEL_QUE_NAO_DA, passo1.extras, passo1.bloqueados, ITEM_DE_GESTOR), 'liberado')

  const passo2 = alternar(PAPEL_QUE_NAO_DA, passo1.extras, passo1.bloqueados, ITEM_DE_GESTOR)
  assert.deepEqual(passo2.extras, [])
  assert.equal(estado(PAPEL_QUE_NAO_DA, passo2.extras, passo2.bloqueados, ITEM_DE_GESTOR), 'sem')
})

test('estado(): bloqueado ganha de liberado quando o id está nos dois arrays', () => {
  const extras = [ITEM_DE_GESTOR]
  const bloqueados = [ITEM_DE_GESTOR]
  assert.equal(estado(PAPEL_QUE_NAO_DA, extras, bloqueados, ITEM_DE_GESTOR), 'bloqueado')
})
