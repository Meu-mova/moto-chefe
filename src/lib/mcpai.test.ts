import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairContraparteDaDescricao } from './mcpai'

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
