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
  assert.match(gravar(cadastro(), vendedorDeBh) ?? '', /não encontrado/)
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
  assert.match(gravar(cadastro({ papel: 'admin_socio', grupoDaLoja: null })) ?? '', /loja/, 'sócio sem loja e sem grupo')
})

test('sócio só dá aprovação de pagamento sensível se ele mesmo aprova', () => {
  const semPoder = { ...socioDoVale, gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.match(recusaDaGravacao(semPoder, null, cadastro({ papel: 'admin_socio', aprovaPagamentoSensivel: true })) ?? '', /pagamento/)
  assert.equal(recusaDaGravacao({ ...semPoder, aprovaPagamentoSensivel: true }, null, cadastro({ papel: 'admin_socio', aprovaPagamentoSensivel: true })), null)
})

test('sócio não alcança um admin_geral, mesmo com loja de grupo que ele vê', () => {
  assert.equal(podeGerenciar(socioDoVale, alvo(VALE, 'admin_geral')), false)
  assert.equal(gravar(cadastro(), { ...cadastro({ papel: 'admin_geral' }), id: 'geral' }), 'Usuário não encontrado')
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
  assert.equal(l.papeis.includes('cargo'), false, 'só o admin_geral atribui cargo (#616)')
  assert.equal(l.podeCargos, false)
  assert.deepEqual(l.itensLiberaveis, ['estoque'])
  assert.deepEqual(l.gruposAprovacao, [], 'aprovação só nos grupos onde ele aprova')
  assert.equal(l.travaASiMesmo, true, 'não desativa nem troca o próprio papel')
  const g = limitesDaTela({ id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.equal(g.podeExcluir, true)
  assert.equal(g.papeis.includes('cargo'), true)
  assert.equal(g.podeCargos, true)
  assert.equal(g.papeis.includes('admin_geral'), true)
  assert.equal(g.itensLiberaveis, null)
  assert.equal(g.gruposAprovacao, null)
  assert.equal(g.travaASiMesmo, false)
})

test('sem a permissão de cargos, o sócio mantém o cargo de quem já tem, sem trocar (#616, #617)', () => {
  const geral = { id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'cargo', cargoId: 'c1' })), null)
  const RECUSA = 'Só quem gerencia cargos atribui cargo'
  assert.equal(gravar(cadastro({ papel: 'cargo', cargoId: 'c1' })), RECUSA, 'usuário novo')
  assert.equal(gravar(cadastro({ papel: 'cargo', cargoId: 'c1' }), { id: 'u', ...cadastro() }), RECUSA, 'vendedor passando a cargo')
  const comCargo = { id: 'u', ...cadastro({ papel: 'cargo', cargoId: 'c1' }) }
  assert.equal(gravar(cadastro({ papel: 'cargo', cargoId: 'c1', modulosBloqueados: ['estoque'] }), comCargo), null, 'salva os outros campos')
  assert.equal(gravar(cadastro({ papel: 'cargo', cargoId: 'c2' }), comCargo), RECUSA, 'trocando de cargo')
  assert.equal(gravar(cadastro({ papel: 'vendedor' }), comCargo), null, 'saindo do cargo para papel fixo')
})

// #506: a recusa agora aparece na tela; não pode revelar que o registro existe em outra Conta.
test('usuário de outra Conta recebe a mesma frase que usuário inexistente', () => {
  assert.equal(gravar(cadastro(), { ...cadastro({ grupoDaLoja: BH }), id: 'de-outra-conta' }), 'Usuário não encontrado')
})

test('loja de outra Conta recebe a mesma frase que loja inexistente', () => {
  assert.equal(gravar(cadastro({ lojaPedida: true, grupoDaLoja: BH })), 'Loja não encontrada')
  assert.equal(gravar(cadastro({ lojaPedida: true, grupoDaLoja: null })), 'Loja não encontrada')
  assert.equal(gravar(cadastro({ lojaPedida: true, grupoDaLoja: null, papel: 'admin_socio', gruposAcesso: [VALE] })), 'Loja não encontrada')
  assert.equal(gravar(cadastro({ lojaPedida: false, grupoDaLoja: null })), 'Escolha a loja do usuário')
})

test('admin_rede (#517): sócio não dá o papel nem gerencia quem o tem; a tela não oferece', () => {
  assert.match(gravar(cadastro({ papel: 'admin_rede' })) ?? '', /Admin de Rede/)
  assert.equal(podeGerenciar(socioDoVale, alvo(VALE, 'admin_rede')), false)
  const limitesSocio = limitesDaTela({ ...socioDoVale, gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.ok(!limitesSocio.papeis.includes('admin_rede'))
  const limitesGeral = limitesDaTela({ id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  assert.ok(limitesGeral.papeis.includes('admin_rede'))
})

test('Entrada (#488): o sócio libera para aux_adm do grupo dele; para outra função é recusado, mesmo pelo admin_geral', () => {
  const socio = { ...socioDoVale, gruposAprovacao: [VALE], itensLiberaveis: ['entrada'], aprovaPagamentoSensivel: false }
  assert.equal(recusaDaGravacao(socio, null, cadastro({ papel: 'aux_adm', modulosExtras: ['entrada'] })), null)
  assert.match(recusaDaGravacao(socio, null, cadastro({ papel: 'vendedor', modulosExtras: ['entrada'] })) ?? '', /Entrada não pode ser liberada/)
  const geral = { id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.match(recusaDaGravacao(geral, null, cadastro({ papel: 'vendedor', modulosExtras: ['entrada'] })) ?? '', /Entrada não pode ser liberada/)
  const semEntrada = { ...socio, itensLiberaveis: [] }
  assert.match(recusaDaGravacao(semEntrada, null, cadastro({ papel: 'aux_adm', modulosExtras: ['entrada'] })) ?? '', /telas que você mesmo tem/, 'só libera o que ele tem')
  assert.match(recusaDaGravacao(socio, null, cadastro({ papel: 'aux_adm', grupoDaLoja: BH, modulosExtras: ['entrada'] })) ?? '', /lojas e grupos que você mesmo vê|Loja/, 'só em grupo dele')
})

// ─── Gerenciar cargos por pessoa (#617) ───────────────────────────────────────
const FRASE_LIGAR = 'Só o Admin Geral liga ou desliga Gerenciar cargos'
const sociaDeCargos = { ...socioDoVale, gruposAprovacao: [VALE], itensLiberaveis: ['estoque'], aprovaPagamentoSensivel: false, podeCargos: true }
const sociaSemCargos = { ...sociaDeCargos, podeCargos: false }
const comCargosLigado = (extra = {}) => ({ id: 'u', ...cadastro({ modulosExtras: ['cargos'], ...extra }) })

test('só o admin_geral liga Gerenciar cargos, para sócio e para admin de rede (#617)', () => {
  const geral = { id: 'g', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'admin_socio', modulosExtras: ['cargos'] })), null)
  assert.equal(recusaDaGravacao(geral, null, cadastro({ papel: 'admin_rede', modulosExtras: ['cargos'] })), null)
  for (const g of [sociaSemCargos, sociaDeCargos, { ...sociaDeCargos, itensLiberaveis: ['cargos'] }]) {
    assert.equal(recusaDaGravacao(g, null, cadastro({ papel: 'admin_socio', modulosExtras: ['cargos'] })), FRASE_LIGAR, 'usuário novo')
    assert.equal(recusaDaGravacao(g, { id: 'u', ...cadastro({ papel: 'admin_socio' }) }, cadastro({ papel: 'admin_socio', modulosExtras: ['cargos'] })), FRASE_LIGAR, 'outro sócio')
  }
})

test('sócio não desliga nem bloqueia Gerenciar cargos de ninguém, mas salva os outros campos (#617)', () => {
  const antes = comCargosLigado({ papel: 'admin_socio' })
  assert.equal(recusaDaGravacao(sociaDeCargos, antes, cadastro({ papel: 'admin_socio', modulosExtras: [] })), FRASE_LIGAR, 'desligar')
  assert.equal(recusaDaGravacao(sociaDeCargos, antes, cadastro({ papel: 'admin_socio', modulosExtras: ['cargos'], modulosBloqueados: ['cargos'] })), FRASE_LIGAR, 'bloquear')
  assert.equal(recusaDaGravacao(sociaDeCargos, antes, cadastro({ papel: 'admin_socio', modulosExtras: ['cargos'], modulosBloqueados: ['estoque'] })), null, 'outro campo, permissão igual')
})

test('quem tem a permissão dá cargo ao usuário; sem ela, não (#617)', () => {
  assert.equal(recusaDaGravacao(sociaDeCargos, null, cadastro({ papel: 'cargo', cargoId: 'c1' })), null)
  assert.equal(recusaDaGravacao(sociaSemCargos, null, cadastro({ papel: 'cargo', cargoId: 'c1' })), 'Só quem gerencia cargos atribui cargo')
  const comCargo = { id: 'u', ...cadastro({ papel: 'cargo', cargoId: 'c1' }) }
  assert.equal(recusaDaGravacao(sociaSemCargos, comCargo, cadastro({ papel: 'cargo', cargoId: 'c1', modulosBloqueados: ['estoque'] })), null, 'sem a permissão, mantém o cargo')
  assert.equal(recusaDaGravacao(sociaSemCargos, comCargo, cadastro({ papel: 'cargo', cargoId: 'c2' })), 'Só quem gerencia cargos atribui cargo', 'sem a permissão, não troca')
  assert.equal(recusaDaGravacao(sociaDeCargos, comCargo, cadastro({ papel: 'cargo', cargoId: 'c2' })), null, 'com a permissão, troca')
})

test('a tela oferece Cargos e "Cargo da Conta" a quem gerencia cargos (#617)', () => {
  const com = limitesDaTela(sociaDeCargos)
  assert.equal(com.podeCargos, true)
  assert.ok(com.papeis.includes('cargo'))
  assert.ok(!com.papeis.includes('admin_geral') && !com.papeis.includes('admin_rede'), 'os limites de papel seguem os do sócio')
  const sem = limitesDaTela(sociaSemCargos)
  assert.equal(sem.podeCargos, false)
  assert.ok(!sem.papeis.includes('cargo'))
})

test('a regra de gestão não recusa o cargo com base Admin Sócio que edita a si mesmo e mantém o papel (#617)', () => {
  const eu = { id: 'eu', papel: 'admin_socio', gruposVisiveis: [VALE], gruposAprovacao: [VALE], itensLiberaveis: [], aprovaPagamentoSensivel: false }
  const antes = { id: 'eu', ...cadastro({ papel: 'cargo', cargoId: 'c1' }) }
  assert.equal(recusaDaGravacao(eu, antes, cadastro({ papel: 'cargo', cargoId: 'c1', gruposAprovacao: [VALE] })), null)
  assert.equal(recusaDaGravacao(eu, antes, cadastro({ papel: 'vendedor' })), 'Você não pode desativar nem trocar o papel de si mesmo')
})
