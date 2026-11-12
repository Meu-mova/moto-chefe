import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCpf, normalizarChavePix, chavePixValida, nascimentoValido, IDADE_MINIMA,
  validarPix, ERRO_CHAVE_PIX, recusaCorrecaoPix, ERRO_SEM_DADOS, ERRO_FUNCIONARIO_NAO_ENCONTRADO,
} from './dados-funcionario'
import { cpfValido } from './documento'

// ─── CPF ──────────────────────────────────────────────────────────────────
test('CPF com dígito verificador correto é aceito', () => {
  assert.equal(cpfValido('529.982.247-25'), true)
})

test('CPF com dígito verificador errado é recusado', () => {
  assert.equal(cpfValido('529.982.247-26'), false)
})

test('CPF de dígitos repetidos é recusado', () => {
  // Passa na conta do dígito verificador, mas não existe.
  assert.equal(cpfValido('111.111.111-11'), false)
  assert.equal(cpfValido('000.000.000-00'), false)
})

test('CPF com menos de 11 dígitos é recusado', () => {
  assert.equal(cpfValido('5299822472'), false)
})

test('a pontuação é descartada na normalização', () => {
  assert.equal(normalizarCpf('529.982.247-25'), '52998224725')
})

// ─── chave PIX ────────────────────────────────────────────────────────────
test('chave do tipo CPF segue a regra de CPF', () => {
  assert.equal(chavePixValida('cpf', '529.982.247-25'), true)
  assert.equal(chavePixValida('cpf', '529.982.247-26'), false)
})

test('celular exige DDD e o nono dígito', () => {
  assert.equal(chavePixValida('celular', '(35) 99999-1234'), true)
  assert.equal(chavePixValida('celular', '99999-1234'), false)    // sem DDD
  assert.equal(chavePixValida('celular', '(35) 3999-1234'), false) // fixo, sem o 9
})

test('celular é normalizado no formato que o PIX usa', () => {
  assert.equal(normalizarChavePix('celular', '(35) 99999-1234'), '+5535999991234')
  assert.equal(normalizarChavePix('celular', '+55 35 99999-1234'), '+5535999991234')
})

test('e-mail precisa ter cara de e-mail', () => {
  assert.equal(chavePixValida('email', 'luiz@motochefe.com.br'), true)
  assert.equal(chavePixValida('email', 'luiz.motochefe.com.br'), false)
})

test('e-mail é normalizado em minúsculas', () => {
  assert.equal(normalizarChavePix('email', ' Luiz@MotoChefe.com.br '), 'luiz@motochefe.com.br')
})

test('chave aleatória tem 32 caracteres hexadecimais, com ou sem traços', () => {
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567e89b12d3a456426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456'), false)
  assert.equal(chavePixValida('aleatoria', 'zzz'), false)
})

// ─── nascimento ───────────────────────────────────────────────────────────
const HOJE = new Date('2026-08-04T12:00:00.000Z')

test('nascimento válido é aceito', () => {
  assert.equal(nascimentoValido('1990-03-15', HOJE), true)
})

test('data no futuro é recusada', () => {
  assert.equal(nascimentoValido('2027-01-01', HOJE), false)
})

test(`idade abaixo de ${IDADE_MINIMA} é recusada — quase sempre erro de digitação no ano`, () => {
  assert.equal(nascimentoValido('2020-03-15', HOJE), false)
})

test('quem faz aniversário hoje já tem a idade', () => {
  assert.equal(nascimentoValido('2012-08-04', HOJE), true)   // faz 14 hoje
  assert.equal(nascimentoValido('2012-08-05', HOJE), false)  // faz 14 amanhã
})

test('ano absurdo é recusado', () => {
  assert.equal(nascimentoValido('1899-01-01', HOJE), false)
})

test('formato fora de YYYY-MM-DD é recusado', () => {
  assert.equal(nascimentoValido('15/03/1990', HOJE), false)
  assert.equal(nascimentoValido('', HOJE), false)
})

// ─── Quem corrige o PIX de outro funcionário ─────────────────────────────
// O grupo já vem filtrado na consulta (dados-funcionarios.db.test.ts); aqui, papel e dados.
test('sócio corrige o PIX de vendedor que já preencheu os dados', () => {
  assert.equal(recusaCorrecaoPix({ papel: 'admin_socio' }, { papel: 'vendedor', temDados: true }), null)
})

test('funcionário sem dados não tem PIX para corrigir', () => {
  assert.equal(recusaCorrecaoPix({ papel: 'admin_geral' }, { papel: 'vendedor', temDados: false }), ERRO_SEM_DADOS)
})

test('sócio não corrige o PIX de admin_rede nem de admin_geral, e a recusa não revela que ele existe', () => {
  // admin_rede fica acima do sócio (ADR-0019); mesma frase de id inexistente.
  for (const papel of ['admin_rede', 'admin_geral']) {
    assert.equal(recusaCorrecaoPix({ papel: 'admin_socio' }, { papel, temDados: true }), ERRO_FUNCIONARIO_NAO_ENCONTRADO, papel)
  }
})

test('quem não é admin_geral nem sócio não corrige PIX de ninguém, mesmo se chegar à função', () => {
  // A action já barra antes (soPeloPapel); a regra sozinha também falha fechada.
  for (const papel of ['aux_adm', 'vendedor', 'admin_rede', 'cargo']) {
    assert.equal(recusaCorrecaoPix({ papel }, { papel: 'vendedor', temDados: true }), ERRO_FUNCIONARIO_NAO_ENCONTRADO, papel)
  }
})

test('admin_geral corrige o PIX de admin_rede', () => {
  assert.equal(recusaCorrecaoPix({ papel: 'admin_geral' }, { papel: 'admin_rede', temDados: true }), null)
})

// ─── validarPix: a mesma conferência no "Meus dados" e no admin ──────────
test('tipo e chave que conferem passam', () => {
  assert.equal(validarPix('celular', '(35) 99999-1234'), null)
})

test('chave que não confere com o tipo é recusada', () => {
  assert.equal(validarPix('email', '(35) 99999-1234'), ERRO_CHAVE_PIX)
})

test('tipo fora da lista é recusado, mesmo com chave no formato de aleatória', () => {
  // A chave de 32 hexadecimais passaria como aleatória; o tipo inventado não pode ser gravado.
  assert.equal(validarPix('pix', '0123456789abcdef0123456789abcdef'), ERRO_CHAVE_PIX)
})
