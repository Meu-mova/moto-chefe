import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeExcluir, podeGerenciar, recusaDaGravacao } from './gestao-usuarios'

const VALE = 'grupo-vale'
const BH = 'grupo-bh'
const socioDoVale = { id: 'socio-vale', papel: 'admin_socio', gruposVisiveis: [VALE] }

test('sócio gerencia quem é de loja de grupo que ele vê, e não quem é de outro grupo', () => {
  assert.equal(podeGerenciar(socioDoVale, { papel: 'vendedor', grupoDaLoja: VALE }), true)
  assert.equal(podeGerenciar(socioDoVale, { papel: 'vendedor', grupoDaLoja: BH }), false)
})

const cadastro = (extra = {}) => ({
  papel: 'vendedor', grupoDaLoja: VALE as string | null, gruposAcesso: [] as string[], gruposAprovacao: [] as string[],
  modulosExtras: [] as string[], ativo: true, ...extra,
})
type Cadastro = ReturnType<typeof cadastro>
const gravar = (depois: Cadastro = cadastro(), antes: (Cadastro & { id: string }) | null = null) =>
  recusaDaGravacao({ ...socioDoVale, itensLiberaveis: ['estoque'] }, antes, depois)

test('sócio cria vendedor e outro sócio na loja do grupo dele', () => {
  assert.equal(gravar(), null)
  assert.equal(gravar(cadastro({ papel: 'admin_socio' })), null)
})

test('sócio não dá o papel admin_geral', () => {
  assert.match(gravar(cadastro({ papel: 'admin_geral' })) ?? '', /Admin Geral/)
})

test('sócio não põe o usuário em loja nem marca grupo que ele não vê', () => {
  assert.match(gravar(cadastro({ grupoDaLoja: BH })) ?? '', /grupo/)
  assert.match(gravar(cadastro({ grupoDaLoja: null })) ?? '', /loja/)
  assert.match(gravar(cadastro({ papel: 'admin_socio', gruposAcesso: [BH] })) ?? '', /grupo/)
  assert.match(gravar(cadastro({ papel: 'admin_socio', gruposAprovacao: [BH] })) ?? '', /grupo/)
})

test('sócio libera só telas que ele mesmo tem', () => {
  assert.equal(gravar(cadastro({ modulosExtras: ['estoque'] })), null)
  assert.match(gravar(cadastro({ modulosExtras: ['dre'] })) ?? '', /tela/)
})

test('sócio não edita quem hoje é de grupo que ele não vê, nem trazendo para o grupo dele', () => {
  const vendedorDeBh = { id: 'v-bh', ...cadastro({ grupoDaLoja: BH }) }
  assert.match(gravar(cadastro(), vendedorDeBh) ?? '', /alcance/)
})

test('sócio não desativa nem rebaixa a si mesmo, mas edita o resto do próprio cadastro', () => {
  const eu = { id: socioDoVale.id, ...cadastro({ papel: 'admin_socio' }) }
  assert.equal(gravar(cadastro({ papel: 'admin_socio', modulosExtras: ['estoque'] }), eu), null)
  assert.match(gravar(cadastro({ papel: 'admin_socio', ativo: false }), eu) ?? '', /si mesmo/)
  assert.match(gravar(cadastro({ papel: 'vendedor' }), eu) ?? '', /si mesmo/)
})

test('aux_adm não gerencia usuários; admin_geral grava qualquer coisa', () => {
  const aux = { id: 'aux', papel: 'aux_adm', gruposVisiveis: [VALE], itensLiberaveis: [] }
  assert.equal(podeGerenciar(aux, { papel: 'vendedor', grupoDaLoja: VALE }), false)
  assert.match(recusaDaGravacao(aux, null, cadastro()) ?? '', /permissão/)
  const geral = { id: 'geral', papel: 'admin_geral', gruposVisiveis: [], itensLiberaveis: [] }
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'admin_geral', grupoDaLoja: null, modulosExtras: ['dre'] })), null)
})

test('só o admin_geral exclui de vez; o sócio só desativa', () => {
  assert.equal(podeExcluir({ papel: 'admin_geral' }), true)
  assert.equal(podeExcluir({ papel: 'admin_socio' }), false)
})

test('sócio edita quem já tem tela ou grupo que ele não tem, desde que não acrescente', () => {
  const comDre = { id: 'v', ...cadastro({ papel: 'admin_socio', modulosExtras: ['dre'], gruposAprovacao: [BH] }) }
  assert.equal(gravar(cadastro({ papel: 'admin_socio', modulosExtras: ['dre'], gruposAprovacao: [BH] }), comDre), null)
  assert.match(gravar(cadastro({ papel: 'admin_socio', modulosExtras: ['dre', 'caixa'], gruposAprovacao: [BH] }), comDre) ?? '', /tela/)
})
