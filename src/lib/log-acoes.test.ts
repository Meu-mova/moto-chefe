import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDePermissaoAlterados, detalheDaMudancaDePermissao, origemDaRequisicao, permissoesDe, registrarAcaoSensivelSemFalhar } from './log-acoes'

test('IP é o primeiro do x-forwarded-for; user agent vem cortado', () => {
  const h = new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'a'.repeat(600) })
  const o = origemDaRequisicao(h)
  assert.equal(o.ip, '200.1.2.3')
  assert.equal(o.userAgent?.length, 500)
})

test('sem cabeçalhos, IP e user agent ficam nulos', () => {
  assert.deepEqual(origemDaRequisicao(new Headers()), { ip: null, userAgent: null })
})

test('x-real-ip quando não há x-forwarded-for', () => {
  assert.equal(origemDaRequisicao(new Headers({ 'x-real-ip': '177.0.0.9' })).ip, '177.0.0.9')
})

test('permissão: só os campos que mudaram, sem depender da ordem dos grupos', () => {
  const antes = { papel: 'vendedor', lojaId: 'l1', gruposAcesso: ['a', 'b'], gruposAprovacao: [], aprovaPagamentoSensivel: false, modulosExtras: [], modulosBloqueados: [], cargoId: null }
  assert.deepEqual(camposDePermissaoAlterados(antes, { ...antes, gruposAcesso: ['b', 'a'] }), [])
  assert.deepEqual(camposDePermissaoAlterados(antes, { ...antes, papel: 'aux_adm', modulosExtras: ['caixa'] }), ['papel', 'modulosExtras'])
})

const cadastro = { papel: 'vendedor', lojaId: 'l1', gruposAcesso: [], gruposAprovacao: [], aprovaPagamentoSensivel: false, modulosExtras: [], modulosBloqueados: [], cargoId: null }
const NOMES = { a: 'Gerente', b: 'Caixa' }

test('trocar o usuário de um cargo para outro conta como mudança, mesmo com o papel igual a cargo (#616)', () => {
  const noA = { ...cadastro, papel: 'cargo', cargoId: 'a' }
  assert.deepEqual(camposDePermissaoAlterados(permissoesDe(noA), permissoesDe({ ...noA, cargoId: 'b' })), ['cargoId'])
  assert.deepEqual(camposDePermissaoAlterados(permissoesDe(noA), permissoesDe({ ...noA, nome: 'outro' } as typeof noA)), [], 'o que não é permissão não entra')
})

test('o detalhe do log diz qual cargo, pelo nome (#616)', () => {
  const noA = { ...cadastro, papel: 'cargo', cargoId: 'a' }
  assert.deepEqual(detalheDaMudancaDePermissao(noA, { ...noA, cargoId: 'b' }, ['cargoId'], NOMES),
    { acao: 'alterado', campos: ['cargoId'], cargoAntes: 'Gerente', cargo: 'Caixa' })
  assert.deepEqual(detalheDaMudancaDePermissao(cadastro, { ...cadastro, papel: 'cargo', cargoId: 'a' }, ['papel', 'cargoId'], NOMES),
    { acao: 'alterado', campos: ['papel', 'cargoId'], papelAntes: 'vendedor', papel: 'cargo', cargo: 'Gerente' })
  assert.deepEqual(detalheDaMudancaDePermissao(cadastro, { ...cadastro, papel: 'aux_adm' }, ['papel'], NOMES),
    { acao: 'alterado', campos: ['papel'], papelAntes: 'vendedor', papel: 'aux_adm' }, 'sem cargo, o detalhe é o de sempre')
})

test('registrarAcaoSensivelSemFalhar grava pelo executor recebido e, se ele falhar, só avisa no console (#597)', async () => {
  const gravadas: Record<string, unknown>[] = []
  const executor = (falha?: Error) => ({
    insert: () => ({ values: (v: Record<string, unknown>) => ({ onConflictDoNothing: async () => { if (falha) throw falha; gravadas.push(v) } }) }),
    select: () => { throw new Error('não deveria consultar: grupo e Conta já vêm no registro') },
    delete: () => { throw new Error('não usado') },
  }) as unknown as Parameters<typeof registrarAcaoSensivelSemFalhar>[1]
  const acao = { tipo: 'nf_emitida' as const, usuarioId: 'u1', grupoId: null, contaId: 'c1', detalhe: { etapa: 'inutilizacao' } }

  await registrarAcaoSensivelSemFalhar(acao, executor())
  assert.equal(gravadas.length, 1)
  assert.deepEqual([gravadas[0].tipo, gravadas[0].usuarioId, gravadas[0].contaId, gravadas[0].detalhe], ['nf_emitida', 'u1', 'c1', { etapa: 'inutilizacao' }])

  const erro = mock.method(console, 'error', () => {})
  try {
    await assert.doesNotReject(registrarAcaoSensivelSemFalhar(acao, executor(new Error('banco caiu'))))
    assert.match(erro.mock.calls[0].arguments.join(' '), /falha ao registrar nf_emitida.*banco caiu/)
  } finally {
    erro.mock.restore()
  }
})
