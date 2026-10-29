import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitesDaTela, podeExcluir, podeGerenciar, recusaDaGravacao } from './gestao-usuarios'

const VALE = 'grupo-vale'
const BH = 'grupo-bh'
const socioDoVale = { id: 'socio-vale', papel: 'admin_socio', gruposVisiveis: [VALE] }
const alvo = (grupoDaLoja: string | null, papel = 'vendedor') => ({ papel, grupoDaLoja, gruposAcesso: [], gruposAprovacao: [] })

test('sócio gerencia quem é de loja de grupo que ele vê, e não quem é de outro grupo', () => {
  assert.equal(podeGerenciar(socioDoVale, alvo(VALE)), true)
  assert.equal(podeGerenciar(socioDoVale, alvo(BH)), false)
})

const cadastro = (extra = {}) => ({
  papel: 'vendedor', grupoDaLoja: VALE as string | null, gruposAcesso: [] as string[], gruposAprovacao: [] as string[],
  modulosExtras: [] as string[], modulosBloqueados: [] as string[], aprovaPagamentoSensivel: false, ativo: true, ...extra,
})
type Cadastro = ReturnType<typeof cadastro>
const gravar = (depois: Cadastro = cadastro(), antes: (Cadastro & { id: string }) | null = null) =>
  recusaDaGravacao({ ...socioDoVale, gruposAprovacao: [VALE], itensLiberaveis: ['estoque'], aprovaPagamentoSensivel: false }, antes, depois)

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
  const aux = { id: 'aux', papel: 'aux_adm', gruposVisiveis: [VALE], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.equal(podeGerenciar(aux, alvo(VALE)), false)
  assert.match(recusaDaGravacao(aux, null, cadastro()) ?? '', /permissão/)
  const geral = { id: 'geral', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'admin_geral', grupoDaLoja: null, modulosExtras: ['dre'] })), null)
})

test('só o admin_geral exclui de vez; o sócio só desativa', () => {
  assert.equal(podeExcluir({ papel: 'admin_geral' }), true)
  assert.equal(podeExcluir({ papel: 'admin_socio' }), false)
})

test('sócio edita quem já tem tela que ele não tem, desde que não acrescente', () => {
  const comDre = { id: 'v', ...cadastro({ modulosExtras: ['dre'] }) }
  assert.equal(gravar(cadastro({ modulosExtras: ['dre'] }), comDre), null)
  assert.match(gravar(cadastro({ modulosExtras: ['dre', 'caixa'] }), comDre) ?? '', /tela/)
})

test('sócio não alcança quem vê grupo que ele não vê, nem sendo da loja dele', () => {
  // Trocar a senha de um sócio com mais grupos daria ao gestor esses grupos.
  assert.equal(podeGerenciar(socioDoVale, { papel: 'admin_socio', grupoDaLoja: VALE, gruposAcesso: [BH], gruposAprovacao: [] }), false)
  assert.equal(podeGerenciar(socioDoVale, { papel: 'admin_socio', grupoDaLoja: VALE, gruposAcesso: [], gruposAprovacao: [BH] }), false)
})

test('sócio alcança e cria outro sócio sem loja, só com grupo que ele vê', () => {
  assert.equal(podeGerenciar(socioDoVale, { papel: 'admin_socio', grupoDaLoja: null, gruposAcesso: [VALE], gruposAprovacao: [] }), true)
  assert.equal(gravar(cadastro({ papel: 'admin_socio', grupoDaLoja: null, gruposAcesso: [VALE] })), null)
  assert.match(gravar(cadastro({ grupoDaLoja: null })) ?? '', /loja/)
})

test('sócio só dá aprovação de pagamento sensível se ele mesmo aprova', () => {
  const semPoder = { ...socioDoVale, gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.match(recusaDaGravacao(semPoder, null, cadastro({ papel: 'admin_socio', aprovaPagamentoSensivel: true })) ?? '', /pagamento/)
  assert.equal(recusaDaGravacao({ ...semPoder, aprovaPagamentoSensivel: true }, null, cadastro({ papel: 'admin_socio', aprovaPagamentoSensivel: true })), null)
})

test('sócio não alcança um admin_geral, mesmo com loja de grupo que ele vê', () => {
  assert.equal(podeGerenciar(socioDoVale, alvo(VALE, 'admin_geral')), false)
  assert.equal(gravar(cadastro(), { ...cadastro({ papel: 'admin_geral' }), id: 'geral' }), 'Usuário fora do seu alcance')
})

test('sócio bloqueia qualquer tela, mas só desbloqueia a que ele mesmo tem', () => {
  const bloqueado = (ids: string[]) => ({ id: 'v', ...cadastro({ modulosBloqueados: ids }) })
  assert.equal(gravar(cadastro({ modulosBloqueados: ['financeiro'] }), bloqueado([])), null, 'bloquear: livre')
  assert.equal(gravar(cadastro(), bloqueado(['estoque'])), null, 'desbloquear tela que ele tem')
  assert.match(gravar(cadastro(), bloqueado(['financeiro'])) ?? '', /telas que você mesmo tem/, 'desbloquear tela que ele não tem')
})

test('sócio só dá aprovação em grupo onde ele mesmo aprova', () => {
  const socioDeDoisGrupos = { id: 's', papel: 'admin_socio', gruposVisiveis: [VALE, BH], gruposAprovacao: [VALE], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  const socioNovo = (gruposAprovacao: string[]) => cadastro({ papel: 'admin_socio', grupoDaLoja: VALE, gruposAcesso: [BH], gruposAprovacao })
  assert.equal(recusaDaGravacao(socioDeDoisGrupos, null, socioNovo([VALE])), null)
  assert.match(recusaDaGravacao(socioDeDoisGrupos, null, socioNovo([BH])) ?? '', /aprova/)
})

test('limites da tela: sócio não vê o papel admin_geral nem o Excluir', () => {
  const l = limitesDaTela({ ...socioDoVale, gruposAprovacao: [], itensLiberaveis: ['estoque'], aprovaPagamentoSensivel: false })
  assert.equal(l.podeExcluir, false)
  assert.equal(l.papeis.includes('admin_geral'), false)
  assert.equal(l.papeis.includes('admin_socio'), true)
  assert.equal(l.papeis.includes('cargo'), false, 'cargos escondidos na v1.14.0 (#449)')
  assert.deepEqual(l.itensLiberaveis, ['estoque'])
  assert.deepEqual(l.gruposAprovacao, [], 'aprovação só nos grupos onde ele aprova')
  assert.equal(l.travaASiMesmo, true, 'não desativa nem troca o próprio papel')
  const g = limitesDaTela({ id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.equal(g.podeExcluir, true)
  assert.equal(g.papeis.includes('admin_geral'), true)
  assert.equal(g.itensLiberaveis, null)
  assert.equal(g.gruposAprovacao, null)
  assert.equal(g.travaASiMesmo, false)
})

test('cargos escondidos na v1.14.0: ninguém grava usuário com a função cargo (#449)', () => {
  const geral = { id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.equal(limitesDaTela(geral).papeis.includes('cargo'), false)
  assert.equal(gravar(cadastro({ papel: 'cargo' })), 'Função indisponível')
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'cargo' })), 'Função indisponível')
})

test('admin_rede (#517): sócio não dá o papel nem gerencia quem o tem; a tela não oferece', () => {
  assert.match(gravar(cadastro({ papel: 'admin_rede' })) ?? '', /Admin de Rede/)
  assert.equal(podeGerenciar(socioDoVale, alvo(VALE, 'admin_rede')), false)
  const limitesSocio = limitesDaTela({ ...socioDoVale, gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.ok(!limitesSocio.papeis.includes('admin_rede'))
  const limitesGeral = limitesDaTela({ id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.ok(limitesGeral.papeis.includes('admin_rede'))
})
