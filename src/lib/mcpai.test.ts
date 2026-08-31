import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairContraparteDaDescricao, bancoEntraNoPix, bancoEntraNaDespesa, ehTransferenciaEntreContas } from './mcpai'

// Todas as descrições abaixo foram capturadas ao vivo do mcp.ai em 2026-08-29
// (contas Sicoob/Sicredi do Sul de Minas). O formato muda por banco E por tipo
// de crédito dentro do mesmo banco, por isso cada um vira um caso aqui.

test('Sicoob: PIX recebido de outra instituição — nome no segmento [1]', () => {
  assert.equal(
    extrairContraparteDaDescricao(
      'PIX RECEBIDO - OUTRA IF - Recebimento Pix|@GISELLE BOTELHO VILAS BOAS|@***.206.316-**|@',
    ),
    'GISELLE BOTELHO VILAS BOAS',
  )
})

test('Sicoob: PIX entre contas Sicoob — nome no [2], não no [1] ("Transferência Pix")', () => {
  assert.equal(
    extrairContraparteDaDescricao(
      'TRANSF.RECEBIDA - PIX SICOOB - REM.: PIX MOTORS LTDA|@Transferência Pix|@PIX MOTORS LTDA|@44.810.002 0001-11|@autropelido',
    ),
    'PIX MOTORS LTDA',
  )
})

test('Sicoob: PIX entre contas Sicoob — o REM.: vem truncado, o [2] é mais completo', () => {
  assert.equal(
    extrairContraparteDaDescricao(
      'TRANSF.RECEBIDA - PIX SICOOB - REM.: CENTRO FORMACAO DE CONDUTORES AROU|@Transferência Pix|@CENTRO FORMACAO DE CONDUTORES AROUCA E N|@33.671.080 0001-',
    ),
    'CENTRO FORMACAO DE CONDUTORES AROUCA E N',
  )
})

test('Sicoob: PIX entre contas Sicoob sem os segmentos |@ — cai no REM.:', () => {
  assert.equal(
    extrairContraparteDaDescricao('TRANSF.RECEBIDA - PIX SICOOB - REM.: MARIA RITA FAGUNDES DA SILVA'),
    'MARIA RITA FAGUNDES DA SILVA',
  )
})

test('Sicoob: PIX entre contas Sicoob sem remetente nenhum — null, não inventa nome', () => {
  assert.equal(extrairContraparteDaDescricao('TRANSF.RECEBIDA - PIX SICOOB'), null)
})

test('Sicoob: TED recebida — nome antes do |@, CPF é o [1] e não pode virar pagador', () => {
  assert.equal(
    extrairContraparteDaDescricao('CRÉD.TED-STR - BRUNO BUENO|@012.208.566-30|@CODIGO TED: T1082750046'),
    'BRUNO BUENO',
  )
})

test('Sicoob: TED com segmento extra depois do código', () => {
  assert.equal(
    extrairContraparteDaDescricao('CRÉD.TED-STR - LUIS PAULO FABRIS|@062.208.566-30|@CODIGO TED: T1082750046|@123456789012'),
    'LUIS PAULO FABRIS',
  )
})

// ─── Débitos: mesma função é usada pelo Importar do Banco (/despesas). Estes
// casos existem pra travar que as regras novas de crédito não mudaram nada lá.

test('Sicoob: PIX emitido (débito) continua lendo o segmento [1]', () => {
  assert.equal(
    extrairContraparteDaDescricao('PIX EMITIDO OUTRA IF - Pagamento Pix|@09.089.839 0001-12|@LAIOUNS IMPORTACAO E EXPORTACAO LTDA|@'),
    '09.089.839 0001-12',
  )
})

test('Sicredi: recebimento continua no formato sem |@', () => {
  assert.equal(
    extrairContraparteDaDescricao('RECEBIMENTO PIX 12345678000199 SAINT E A P S LTDA.'),
    'SAINT E A P S LTDA.',
  )
})

test('descrição vazia ou nula', () => {
  assert.equal(extrairContraparteDaDescricao(null), null)
  assert.equal(extrairContraparteDaDescricao(''), null)
})

test('Stone: TED recebida no formato de pipes', () => {
  assert.equal(
    extrairContraparteDaDescricao('Transferência | TED | MILTON DONIZETI FERREIRA'),
    'MILTON DONIZETI FERREIRA',
  )
})

test('Stone: PIX recebido no formato de pipes', () => {
  assert.equal(
    extrairContraparteDaDescricao('Transferência | Pix | LIDIA FERREIRA DO LAGO'),
    'LIDIA FERREIRA DO LAGO',
  )
})

test('Stone: PIX enviado (débito) — contraparte no último segmento', () => {
  assert.equal(
    extrairContraparteDaDescricao('Transferência | Pix | ECOMOV MOBILIDADE LTDA'),
    'ECOMOV MOBILIDADE LTDA',
  )
})

// ─── Quais contas do grupo entram em cada módulo ─────────────────────────────
// Até 29/08/2026 existia UMA lista só, aplicada antes de baixar as transações,
// e ela servia os dois módulos. Criada pra tirar a Sicredi do Sul de Minas do
// /pix, ela tirou a conta das despesas junto: R$ 1.051.359 em 72 débitos nunca
// apareceram no Importar do Banco. Agora cada módulo tem a sua regra.

test('PIX: Sicredi do Sul de Minas continua fora — não é conta de receber venda', () => {
  assert.equal(bancoEntraNoPix('Sicredi Empresas', '57.113.017/0001-72'), false)
  assert.equal(bancoEntraNoPix('Sicoob Empresas', '57.113.017/0001-72'), true)
})

test('PIX: a Sicredi da BH entra — a trava é só do Sul de Minas', () => {
  assert.equal(bancoEntraNoPix('Sicredi Empresas', '63.009.605/0001-63'), true)
})

test('PIX: maquininha entra — PIX de cliente cai na conta da Stone/InfinitePay', () => {
  assert.equal(bancoEntraNoPix('Stone Pagamentos Empresas', '57.113.017/0001-72'), true)
  assert.equal(bancoEntraNoPix('InfinitePay Empresas', '57.113.017/0001-72'), true)
})

const SUL_DE_MINAS = '57.113.017/0001-72'
const BH = '63.009.605/0001-63'

test('Despesa: no Sul de Minas só Sicoob e Sicredi entram', () => {
  assert.equal(bancoEntraNaDespesa('Sicoob Empresas', SUL_DE_MINAS), true)
  assert.equal(bancoEntraNaDespesa('Sicredi Empresas', SUL_DE_MINAS), true)
})

test('Despesa: a Stone do Sul de Minas é maquininha e continua fora', () => {
  assert.equal(bancoEntraNaDespesa('Stone Pagamentos Empresas', SUL_DE_MINAS), false)
  assert.equal(bancoEntraNaDespesa('InfinitePay Empresas', SUL_DE_MINAS), false)
})

// A mesma bandeira tem papel diferente em cada grupo: na BH a Stone é conta de
// pagar, como a Sicredi. Lista única não representa isso — liberar a Stone pra BH
// traria a do Sul de Minas junto, desfazendo a limpeza de R$ 2,1 milhões.
test('Despesa: a Stone da BH entra, e isso não solta a do Sul de Minas', () => {
  assert.equal(bancoEntraNaDespesa('Stone Pagamentos Empresas', BH), true)
  assert.equal(bancoEntraNaDespesa('Sicredi Empresas', BH), true)
  assert.equal(bancoEntraNaDespesa('Stone Pagamentos Empresas', SUL_DE_MINAS), false)
})

test('Despesa: conta nova fica de fora até ser liberada', () => {
  assert.equal(bancoEntraNaDespesa('Itaú Empresas', SUL_DE_MINAS), false)
  assert.equal(bancoEntraNaDespesa('Nubank Empresas', BH), false)
})

test('Despesa: grupo sem liberação cadastrada não traz nada', () => {
  assert.equal(bancoEntraNaDespesa('Sicoob Empresas', '65.126.949/0001-88'), false)
})

// ── ehTransferenciaEntreContas ───────────────────────────────────────────────
// Descrições capturadas ao vivo na conta Sicoob do Sul de Minas em 24-27/08/2026.

test('transferência entre contas correntes do Sicoob entra na conciliação (NF 2284)', () => {
  assert.equal(ehTransferenciaEntreContas('CRED.TRANSF.CONTAS INTERCREDIS'), true)
})

test('resgate da poupança e depósito em espécie continuam fora', () => {
  assert.equal(ehTransferenciaEntreContas('CRÉD.TRANSF.POUPANÇA INTERCREDIS'), false)
  assert.equal(ehTransferenciaEntreContas('DEP.DINHEIRO - INTERCREDIS - NOME: MOTOCHEFE SUL DE MINAS LTDA|@CPF CNPJ'), false)
  assert.equal(ehTransferenciaEntreContas(null), false)
})
