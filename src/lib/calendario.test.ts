import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeVerEvento, podeEditarEvento, ocorrenciasNoIntervalo } from './calendario'

const u = (papel: string, id = 'u1', lojaId: string | null = 'loja-a') => ({ id, papel, lojaId })
const semParticipantes = new Set<string>()

// ─── podeVerEvento ─────────────────────────────────────────────────────────────

test('criador sempre vê o próprio evento, mesmo restrito', () => {
  const e = { visibilidade: 'socios', lojaId: null, criadoPor: 'u1' }
  assert.equal(podeVerEvento(u('vendedor', 'u1'), e, semParticipantes), true)
})

test('sócios veem tudo', () => {
  const e = { visibilidade: 'usuarios', lojaId: null, criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('admin_geral', 'x'), e, semParticipantes), true)
  assert.equal(podeVerEvento(u('admin_socio', 'x'), e, semParticipantes), true)
})

test('grupo: todos veem', () => {
  const e = { visibilidade: 'grupo', lojaId: null, criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('vendedor', 'x'), e, semParticipantes), true)
  assert.equal(podeVerEvento(u('mecanico', 'x'), e, semParticipantes), true)
})

test('loja: só quem é da mesma loja', () => {
  const e = { visibilidade: 'loja', lojaId: 'loja-a', criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('vendedor', 'x', 'loja-a'), e, semParticipantes), true)
  assert.equal(podeVerEvento(u('vendedor', 'x', 'loja-b'), e, semParticipantes), false)
  assert.equal(podeVerEvento(u('vendedor', 'x', null), e, semParticipantes), false)
})

test('socios: barra não-sócio (aux_adm inclusive)', () => {
  const e = { visibilidade: 'socios', lojaId: null, criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('aux_adm', 'x'), e, semParticipantes), false)
  assert.equal(podeVerEvento(u('vendedor', 'x'), e, semParticipantes), false)
})

test('gestao: inclui aux_adm, barra vendedor/mecanico', () => {
  const e = { visibilidade: 'gestao', lojaId: null, criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('aux_adm', 'x'), e, semParticipantes), true)
  assert.equal(podeVerEvento(u('vendedor', 'x'), e, semParticipantes), false)
  assert.equal(podeVerEvento(u('mecanico', 'x'), e, semParticipantes), false)
})

test('usuarios: só quem está na lista', () => {
  const e = { visibilidade: 'usuarios', lojaId: null, criadoPor: 'outro' }
  assert.equal(podeVerEvento(u('vendedor', 'u2'), e, new Set(['u2', 'u3'])), true)
  assert.equal(podeVerEvento(u('vendedor', 'u9'), e, new Set(['u2', 'u3'])), false)
})

// ─── podeEditarEvento ──────────────────────────────────────────────────────────

test('edita/exclui: criador ou sócio; aux_adm não mexe em alheio', () => {
  const e = { criadoPor: 'dono' }
  assert.equal(podeEditarEvento(u('vendedor', 'dono'), e), true)
  assert.equal(podeEditarEvento(u('admin_socio', 'x'), e), true)
  assert.equal(podeEditarEvento(u('aux_adm', 'x'), e), false)
  assert.equal(podeEditarEvento(u('vendedor', 'x'), e), false)
})

// ─── ocorrenciasNoIntervalo ────────────────────────────────────────────────────

test('nenhuma: dentro e fora da janela', () => {
  const e = { data: '2026-08-10', recorrencia: 'nenhuma' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-08-01', '2026-08-31'), ['2026-08-10'])
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-09-01', '2026-09-30'), [])
})

test('anual: aparece todo ano no mês/dia da âncora', () => {
  const e = { data: '1990-03-10', recorrencia: 'anual' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-03-01', '2026-03-31'), ['2026-03-10'])
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-04-01', '2026-04-30'), [])
})

test('anual 29/02 cai para 28/02 em ano não bissexto', () => {
  const e = { data: '2000-02-29', recorrencia: 'anual' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2027-02-01', '2027-02-28'), ['2027-02-28']) // 2027 não bissexto
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2028-02-01', '2028-02-29'), ['2028-02-29']) // 2028 bissexto
})

test('mensal: todo mês no dia da âncora', () => {
  const e = { data: '2026-01-05', recorrencia: 'mensal' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-01-01', '2026-03-31'),
    ['2026-01-05', '2026-02-05', '2026-03-05'])
})

test('mensal dia 31 cai para o último dia dos meses curtos', () => {
  const e = { data: '2026-01-31', recorrencia: 'mensal' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-01-01', '2026-04-30'),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
})

test('recorrente não aparece antes da âncora', () => {
  const e = { data: '2026-06-05', recorrencia: 'mensal' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-01-01', '2026-06-30'), ['2026-06-05'])
})

test('janela invertida devolve vazio', () => {
  const e = { data: '2026-08-10', recorrencia: 'nenhuma' }
  assert.deepEqual(ocorrenciasNoIntervalo(e, '2026-08-31', '2026-08-01'), [])
})
