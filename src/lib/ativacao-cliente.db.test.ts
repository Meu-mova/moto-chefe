// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import forge from 'node-forge'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'b'.repeat(64)

type Db = typeof import('@/lib/db')
type Mod = typeof import('@/lib/ativacao-cliente')
let db: Db['db']
let aplicarCertificadoDaAdesao: Mod['aplicarCertificadoDaAdesao']
let aplicarPortalDaAdesao: Mod['aplicarPortalDaAdesao']
let dadosDaAtivacao: Mod['dadosDaAtivacao']
let criarLojaDaAdesao: Mod['criarLojaDaAdesao']
let cifrar: typeof import('@/lib/cripto')['cifrar']
let lerSenhaFabrica: typeof import('@/lib/fabrica-senha')['lerSenhaFabrica']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ aplicarCertificadoDaAdesao, aplicarPortalDaAdesao, dadosDaAtivacao, criarLojaDaAdesao } = await import('@/lib/ativacao-cliente'))
  ;({ cifrar } = await import('@/lib/cripto'))
  ;({ lerSenhaFabrica } = await import('@/lib/fabrica-senha'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
const USUARIO = '00000000-0000-4000-8000-000000000001'
const CNPJ = '12345678000195'

// A1 de teste: CN no formato da ICP-Brasil ("RAZAO:CNPJ"), que é o que lerDadosDoPfx lê.
function pfxDeTeste(cnpj: string, senha: string): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = chaves.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
  const subject = [{ name: 'commonName', value: `EMPRESA TESTE:${cnpj}` }]
  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.sign(chaves.privateKey)
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, cert, senha, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')
}

type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const rows = async <T>(tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: T[] }).rows

async function cenario(tx: Tx, cnpjDoCertificado = CNPJ) {
  const [conta] = await rows<{ id: string }>(tx, sql`insert into contas (nome) values ('Cliente') returning id`)
  const [grupo] = await rows<{ id: string }>(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Cliente', ${CNPJ}, ${conta.id}) returning id`)
  const [outro] = await rows<{ id: string }>(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('Outro', '00000000000191', ${conta.id}) returning id`)
  const [loja] = await rows<{ id: string }>(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Centro', 'r', 'c', ${grupo.id}) returning id`)
  const [lojaOutro] = await rows<{ id: string }>(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Fora', 'r', 'c', ${outro.id}) returning id`)
  const [adesao] = await rows<{ id: string }>(tx, sql`
    insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, cert_arquivo, cert_senha, store_login, store_senha, usuarios, grupo_id)
    values ('Cliente', 'Resp', '65999990000', 'x.pdf', ${cifrar(pfxDeTeste(cnpjDoCertificado, 'senha-a1'))}, ${cifrar('senha-a1')},
      'loja@cliente.com', ${cifrar('senha-portal')}, '[]'::jsonb, ${grupo.id})
    returning id`)
  return { grupo: grupo.id, loja: loja.id, lojaOutro: lojaOutro.id, adesao: adesao.id }
}

test('certificado da adesão vai para o grupo e sai da adesão', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const r = await aplicarCertificadoDaAdesao({ adesaoId: c.adesao, uf: 'MT', usuarioId: USUARIO }, tx)
    assert.deepEqual(r, { ok: true, titular: 'EMPRESA TESTE' })

    const [cert] = await rows<{ cnpj: string; uf: string }>(tx, sql`select cnpj, uf from certificados_digitais where grupo_id = ${c.grupo}`)
    assert.deepEqual(cert, { cnpj: CNPJ, uf: 'MT' })
    const [a] = await rows<{ arquivo: string | null; senha: string | null; aplicado: boolean }>(tx,
      sql`select cert_arquivo arquivo, cert_senha senha, certificado_aplicado_em is not null aplicado from adesoes_mova where id = ${c.adesao}`)
    assert.deepEqual(a, { arquivo: null, senha: null, aplicado: true }, 'segredo apagado da adesão')
    const [log] = await rows<{ n: number }>(tx, sql`select count(*)::int n from log_acoes where tipo = 'certificado_aplicado' and grupo_id = ${c.grupo}`)
    assert.equal(log.n, 1)

    const dados = await dadosDaAtivacao(c.adesao, tx)
    assert.equal(dados?.temCertificadoNaAdesao, false)
    assert.equal(dados?.resumo.certificado?.titular, 'EMPRESA TESTE', 'resumo mostra o certificado do grupo')
    assert.deepEqual(dados?.lojas.map(l => l.nome), ['Centro'], 'só as lojas do grupo da adesão')
    assert.equal(dados?.resumo.portal, false)

    const deNovo = await aplicarCertificadoDaAdesao({ adesaoId: c.adesao, uf: 'MT', usuarioId: USUARIO }, tx)
    assert.equal(deNovo.ok, false, 'segunda vez não tem o que aplicar')
    throw new Desfazer()
  }), Desfazer)
})

test('certificado de outro CNPJ é recusado e nada muda', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx, '99999999000191')
    const r = await aplicarCertificadoDaAdesao({ adesaoId: c.adesao, uf: 'MT', usuarioId: USUARIO }, tx)
    assert.equal(r.ok, false)
    const [n] = await rows<{ n: number }>(tx, sql`select count(*)::int n from certificados_digitais where grupo_id = ${c.grupo}`)
    assert.equal(n.n, 0)
    const [a] = await rows<{ tem: boolean }>(tx, sql`select cert_arquivo is not null tem from adesoes_mova where id = ${c.adesao}`)
    assert.equal(a.tem, true, 'adesão continua com o certificado')
    throw new Desfazer()
  }), Desfazer)
})

test('portal: login recusado não grava; aceito grava cifrado na loja e apaga da adesão', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const recusa = async () => { throw new Error('A fábrica recusou o login: E-mail ou senha inválidos') }
    const r1 = await aplicarPortalDaAdesao({ adesaoId: c.adesao, lojaId: c.loja, email: 'marlon', usuarioId: USUARIO }, tx, recusa)
    assert.deepEqual(r1, { ok: false, erro: 'A fábrica recusou o login: E-mail ou senha inválidos' })
    const [antes] = await rows<{ email: string | null }>(tx, sql`select fabrica_email email from lojas where id = ${c.loja}`)
    assert.equal(antes.email, null)

    const fora = await aplicarPortalDaAdesao({ adesaoId: c.adesao, lojaId: c.lojaOutro, email: 'loja@cliente.com', usuarioId: USUARIO }, tx, async () => ({}))
    assert.equal(fora.ok, false, 'loja de outro grupo é recusada')

    let usada: { email: string; senha: string } | null = null
    const aceita = async (cred: { email: string; senha: string }) => { usada = cred; return {} }
    const r2 = await aplicarPortalDaAdesao({ adesaoId: c.adesao, lojaId: c.loja, email: ' loja@cliente.com ', usuarioId: USUARIO }, tx, aceita)
    assert.deepEqual(r2, { ok: true })
    assert.deepEqual(usada, { email: 'loja@cliente.com', senha: 'senha-portal' }, 'sem senha nova, testa com a da adesão')

    const [loja] = await rows<{ email: string; senha: string }>(tx, sql`select fabrica_email email, fabrica_senha senha from lojas where id = ${c.loja}`)
    assert.equal(loja.email, 'loja@cliente.com')
    assert.notEqual(loja.senha, 'senha-portal', 'não fica em texto puro')
    assert.equal(lerSenhaFabrica(loja.senha), 'senha-portal')
    const [a] = await rows<{ senha: string | null; aplicado: boolean }>(tx, sql`select store_senha senha, portal_aplicado_em is not null aplicado from adesoes_mova where id = ${c.adesao}`)
    assert.deepEqual(a, { senha: null, aplicado: true })
    const [log] = await rows<{ n: number }>(tx, sql`select count(*)::int n from log_acoes where tipo = 'portal_aplicado' and grupo_id = ${c.grupo}`)
    assert.equal(log.n, 1)
    throw new Desfazer()
  }), Desfazer)
})

test('se o log falhar, nada do passo fica gravado (certificado e portal)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    // Trigger só desta transação de teste: some no rollback do fim.
    await tx.execute(sql`create function falha_log() returns trigger language plpgsql as $$ begin raise exception 'log fora do ar'; end $$`)
    await tx.execute(sql`create trigger falha_log before insert on log_acoes for each row execute function falha_log()`)

    await assert.rejects(aplicarCertificadoDaAdesao({ adesaoId: c.adesao, uf: 'MT', usuarioId: USUARIO }, tx), /log_acoes/)
    const [cert] = await rows<{ n: number }>(tx, sql`select count(*)::int n from certificados_digitais where grupo_id = ${c.grupo}`)
    assert.equal(cert.n, 0, 'certificado não ficou no grupo')
    const [a1] = await rows<{ tem: boolean; marcado: boolean }>(tx,
      sql`select cert_arquivo is not null tem, certificado_aplicado_em is not null marcado from adesoes_mova where id = ${c.adesao}`)
    assert.deepEqual(a1, { tem: true, marcado: false }, 'adesão continua com o certificado, sem marca de aplicado')

    await assert.rejects(aplicarPortalDaAdesao({ adesaoId: c.adesao, lojaId: c.loja, email: 'loja@cliente.com', usuarioId: USUARIO }, tx, async () => ({})), /log_acoes/)
    const [loja] = await rows<{ email: string | null; senha: string | null }>(tx, sql`select fabrica_email email, fabrica_senha senha from lojas where id = ${c.loja}`)
    assert.deepEqual(loja, { email: null, senha: null }, 'loja sem credencial')
    const [a2] = await rows<{ tem: boolean; marcado: boolean }>(tx,
      sql`select store_senha is not null tem, portal_aplicado_em is not null marcado from adesoes_mova where id = ${c.adesao}`)
    assert.deepEqual(a2, { tem: true, marcado: false }, 'adesão continua com a senha do portal')
    throw new Desfazer()
  }), Desfazer)
})

test('loja criada no grupo da adesão, com o CEP geocodificado', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const geo = async () => ({ coordenada: { latitude: -15.6, longitude: -56.1 } }) as never
    const vazio = await criarLojaDaAdesao({ adesaoId: c.adesao, nome: 'Nova', cidade: '', endereco: 'Rua A', cep: '' }, tx, geo)
    assert.equal(vazio.ok, false, 'sem cidade, não cria')

    const r = await criarLojaDaAdesao({ adesaoId: c.adesao, nome: ' Nova ', cidade: 'Cuiabá', endereco: 'Av. B, 707', cep: '78010-400' }, tx, geo)
    assert.ok(r.ok && r.geocodificado)
    const [loja] = await rows<{ nome: string; grupo: string; cep: string; lat: string }>(tx,
      sql`select nome, grupo_id grupo, cep, latitude::text lat from lojas where id = ${r.ok ? r.lojaId : ''}`)
    assert.deepEqual(loja, { nome: 'Nova', grupo: c.grupo, cep: '78010-400', lat: '-15.600000' })

    const dados = await dadosDaAtivacao(c.adesao, tx)
    assert.deepEqual(dados?.lojas.map(l => l.nome), ['Centro', 'Nova'], 'o passo do portal passa a oferecer a loja nova')
    throw new Desfazer()
  }), Desfazer)
})
