// Teste de banco: Postgres descartável, como src/lib/cliente-da-os.db.test.ts.
// Criar e editar cliente gravam só os campos do formulário de cliente (#404).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaVazia } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let mod: typeof import('@/lib/cliente-cadastro')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/cliente-cadastro')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

const contas = async (tx: Tx) => ({
  a: await semearContaVazia(tx, { prefixo: 'CF404', nome: 'A' }),
  b: await semearContaVazia(tx, { prefixo: 'CF404', nome: 'B' }),
})
const cadastro = (tx: Tx, contaId: string) =>
  mod.cadastrarCliente(tx, { contaId }, { nome: 'Ana', tipoPessoa: 'fisica', sexo: 'nao_identificado', cpfCnpj: '52998224725' })
const doCliente = (tx: Tx, id: string) =>
  linhas(tx, sql`select conta_id, nome, criado_em from clientes where id = ${id}`)

const ID_FORA = '00000000-0000-0000-0000-0000000000c1'
const DATA_FORA = new Date('2001-01-01T12:00:00Z')

test('editar grava os campos do formulário e ignora os outros', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a, b } = await contas(tx)
    const id = await cadastro(tx, a)
    const [antes] = await doCliente(tx, id)
    const dados = { nome: 'Ana Souza', contaId: b, criadoEm: DATA_FORA } as unknown as Parameters<typeof mod.atualizarCliente>[3]
    await mod.atualizarCliente(tx, { contaId: a }, id, dados)
    assert.deepEqual(await doCliente(tx, id), [{ ...antes, nome: 'Ana Souza' }])
  })
})

test('criar grava os campos do formulário e ignora os outros', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a } = await contas(tx)
    const dados = { nome: 'Bia', tipoPessoa: 'fisica', sexo: 'nao_identificado', id: ID_FORA, criadoEm: DATA_FORA } as unknown as Parameters<typeof mod.cadastrarCliente>[2]
    const id = await mod.cadastrarCliente(tx, { contaId: a }, dados)
    assert.notEqual(id, ID_FORA)
    const [gravado] = await doCliente(tx, id)
    assert.equal(gravado.conta_id, a)
    assert.notDeepEqual(gravado.criado_em, DATA_FORA)
  })
})

// Lista dos 13 campos do formulário: se um sair da lista de gravação, o valor some calado.
const FORMULARIO_CRIAR = {
  nome: 'Carla', tipoPessoa: 'juridica', cpfCnpj: '11222333000181', sexo: 'feminino', email: 'carla@teste.invalid',
  celular: '35999990000', endereco: 'Rua A', numero: '10', complemento: 'Sala 1', bairro: 'Centro', cep: '37000000',
  cidade: 'Varginha', uf: 'MG',
} as const
const FORMULARIO_EDITAR = {
  nome: 'Carla Lima', tipoPessoa: 'fisica', cpfCnpj: '52998224725', sexo: 'masculino', email: 'lima@teste.invalid',
  celular: '35988887777', endereco: 'Rua B', numero: '20', complemento: 'Casa', bairro: 'Jardim', cep: '37010000',
  cidade: 'Lavras', uf: 'SP',
} as const
const comoColunas = (f: typeof FORMULARIO_CRIAR | typeof FORMULARIO_EDITAR) => ({
  nome: f.nome, tipo_pessoa: f.tipoPessoa, cpf_cnpj: f.cpfCnpj, sexo: f.sexo, email: f.email, celular: f.celular,
  endereco: f.endereco, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cep: f.cep, cidade: f.cidade, uf: f.uf,
})
const colunasDoFormulario = (tx: Tx, id: string) => linhas(tx, sql`select nome, tipo_pessoa, cpf_cnpj, sexo, email, celular,
  endereco, numero, complemento, bairro, cep, cidade, uf from clientes where id = ${id}`)

test('os 13 campos do formulário gravam no criar e no editar', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a } = await contas(tx)
    const id = await mod.cadastrarCliente(tx, { contaId: a }, FORMULARIO_CRIAR)
    assert.deepEqual(await colunasDoFormulario(tx, id), [comoColunas(FORMULARIO_CRIAR)])
    await mod.atualizarCliente(tx, { contaId: a }, id, FORMULARIO_EDITAR)
    assert.deepEqual(await colunasDoFormulario(tx, id), [comoColunas(FORMULARIO_EDITAR)])
  })
})

test('Conta B editando cliente da Conta A recebe a mesma frase que id inexistente, e nada muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a, b } = await contas(tx)
    const id = await cadastro(tx, a)
    const recusa = async (alvo: string) => {
      try {
        await tx.transaction(sp => mod.atualizarCliente(sp, { contaId: b }, alvo, { nome: 'Outro' }))
        return null
      } catch (e) { return e instanceof Error ? e.message : String(e) }
    }
    assert.equal(await recusa(id), 'Cliente não encontrado')
    assert.equal(await recusa('00000000-0000-0000-0000-000000000000'), 'Cliente não encontrado')
    assert.deepEqual((await doCliente(tx, id)).map(l => l.nome), ['Ana'])
  })
})
