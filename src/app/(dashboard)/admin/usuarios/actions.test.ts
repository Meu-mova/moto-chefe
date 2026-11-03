// Recusa ao salvar volta como { ok: false, erro } (#506): na produção o Next esconde a
// mensagem de erro lançado por Server Action, e a tela mostrava "React error #441".
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

let respostas: unknown[][] = []
function consulta() {
  const resultado = Promise.resolve(respostas.shift() ?? [])
  return Object.assign(resultado, { limit: () => resultado })
}
// Excluir: o delete do cadastro estoura a FK (23503) quando o usuário tem histórico.
let erroNoDelete: unknown = null
const tx = { delete: () => ({ where: () => ({ returning: async () => { if (erroNoDelete) throw erroNoDelete; return [{ id: 'u1', nome: 'U', lojaId: null, contaId: null }] } }) }) }
const db = {
  insert: () => ({ values: async () => {} }),
  select: () => ({ from: () => ({ where: consulta }) }),
  transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
}
let loginsApagados = 0
let geral = false

let recusa: string | null = null
let atual: object | null = { ativo: true }
let usuariosCriados = 0

mock.module('@/lib/db', { namedExports: { db } })
mock.module('@/lib/gestor-da-sessao', { namedExports: { gestorDaSessao: async () => ({ id: 'adm', papel: 'admin_socio' }) } })
mock.module('@/lib/gestao-usuarios', { namedExports: { recusaDaGravacao: () => recusa, podeExcluir: () => geral, COM_HISTORICO: 'Este usuário tem histórico no sistema. Desative em vez de excluir.' } })
mock.module('@/lib/usuarios-gerenciaveis', { namedExports: { cadastroPedido: async () => ({}), cadastroAtual: async () => atual } })
mock.module('@/lib/grupo', { namedExports: { getGrupoIdDaLoja: async () => 'grupo-a' } })
let cargoDoCadastro: object = { ok: true, cargoId: null, papelBase: null }
mock.module('@/lib/cargos', { namedExports: { cargoParaGravar: async () => cargoDoCadastro, nomesDosCargos: async () => ({}) } })
mock.module('@/lib/log-acoes', { namedExports: { camposDePermissaoAlterados: () => [], registrarAcaoSensivelSemFalhar: async () => {} } })
mock.module('@supabase/supabase-js', {
  namedExports: { createClient: () => ({ auth: { admin: { createUser: async () => { usuariosCriados++; return { data: { user: { id: 'novo' } }, error: null } }, deleteUser: async () => { loginsApagados++; return { error: null } } } } }) },
})
mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

const dados = {
  nome: 'Teste', email: 'teste@exemplo.com', senha: 'x', papel: 'admin_socio', lojaId: 'loja-a', conecta: null,
  gruposAprovacao: [], aprovaPagamentoSensivel: false, gruposAcesso: ['grupo-b'], modulosExtras: [], modulosBloqueados: [],
}
const RECUSA_GRUPO = { ok: false, erro: 'Grupo inválido: marque só grupos da mesma Conta da loja do usuário' }

test('criar com grupo de outra Conta devolve a recusa e não cria o login', async () => {
  const { criarUsuarioAction } = await import('./actions')
  // grupo marcado existe; loja do usuário é da conta-a; grupo marcado é da conta-b
  respostas = [[{ id: 'grupo-b' }], [{ contaId: 'conta-a' }], [{ contaId: 'conta-b' }]]
  usuariosCriados = 0
  assert.deepEqual(await criarUsuarioAction(dados), RECUSA_GRUPO)
  assert.equal(usuariosCriados, 0)
})

test('grupo inexistente recebe a mesma frase que grupo de outra Conta', async () => {
  const { criarUsuarioAction, editarUsuarioAction } = await import('./actions')
  respostas = [[]]
  assert.deepEqual(await criarUsuarioAction(dados), RECUSA_GRUPO)
  respostas = [[], []]
  assert.deepEqual(await editarUsuarioAction('u1', dados), RECUSA_GRUPO)
})

test('editar com grupo de outra Conta devolve a recusa', async () => {
  const { editarUsuarioAction } = await import('./actions')
  respostas = [[], [{ id: 'grupo-b' }], [{ contaId: 'conta-a' }], [{ contaId: 'conta-b' }]]
  assert.deepEqual(await editarUsuarioAction('u1', dados), RECUSA_GRUPO)
})

test('recusa da regra de gestão e usuário não encontrado voltam como { ok: false, erro }', async () => {
  const { criarUsuarioAction, editarUsuarioAction } = await import('./actions')
  recusa = 'Sem permissão para esta função'
  assert.deepEqual(await criarUsuarioAction(dados), { ok: false, erro: recusa })
  recusa = null
  atual = null
  assert.deepEqual(await editarUsuarioAction('u1', dados), { ok: false, erro: 'Usuário não encontrado' })
  atual = { ativo: true }
})

test('link Conecta inválido volta como recusa', async () => {
  const { criarUsuarioAction } = await import('./actions')
  assert.deepEqual(await criarUsuarioAction({ ...dados, conecta: 'javascript:alert(1)' }),
    { ok: false, erro: 'Link Conecta deve começar com http:// ou https://' })
})

test('excluir usuário com histórico (FK 23503) devolve a frase e não apaga o login', async () => {
  const { excluirUsuarioAction } = await import('./actions')
  const COM_HISTORICO = 'Este usuário tem histórico no sistema. Desative em vez de excluir.'
  geral = true
  respostas = [[]] // sem liberação de grupo
  erroNoDelete = Object.assign(new Error('update or delete violates foreign key'), { cause: { code: '23503', constraint: 'historico_estoque_usuario_id_usuarios_id_fk' } })
  loginsApagados = 0
  assert.deepEqual(await excluirUsuarioAction('u1'), { ok: false, erro: COM_HISTORICO })
  assert.equal(loginsApagados, 0, 'o login fica: o cadastro não saiu')
  erroNoDelete = null
  respostas = [[]]
  assert.deepEqual(await excluirUsuarioAction('u1'), { ok: true })
  assert.equal(loginsApagados, 1)
  geral = false
})

test('excluir sem ser admin_geral volta como recusa', async () => {
  const { excluirUsuarioAction } = await import('./actions')
  const r = await excluirUsuarioAction('u1')
  assert.equal(r.ok, false)
})

// Quem tem cargo faz o que a base faz (#617): o servidor confere as listas pelo papel da base.
test('cargo com base Sócio guarda e confere os grupos de aprovação; base sem aprovação zera a lista', async () => {
  const { criarUsuarioAction } = await import('./actions')
  const doCargo = { ...dados, papel: 'cargo', cargoId: 'c1', gruposAcesso: [], gruposAprovacao: ['grupo-b'] }
  cargoDoCadastro = { ok: true, cargoId: 'c1', papelBase: 'admin_socio' }
  respostas = [[]] // nenhum dos grupos marcados existe
  assert.deepEqual(await criarUsuarioAction(doCargo), RECUSA_GRUPO)
  cargoDoCadastro = { ok: true, cargoId: 'c1', papelBase: 'aux_adm' }
  respostas = []
  assert.deepEqual(await criarUsuarioAction(doCargo), { ok: true, id: 'novo' }, 'a lista não vale para essa base: nem é conferida')
  cargoDoCadastro = { ok: true, cargoId: null, papelBase: null }
})
