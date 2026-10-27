// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
// Chave descartável só para o cifrar() do teste.
process.env.CERT_MASTER_KEY ??= 'a'.repeat(64)

type Db = typeof import('@/lib/db')
type Mod = typeof import('@/lib/avaliacoes-google/avaliacoes')
let db: Db['db']
let m: Mod

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/avaliacoes-google/avaliacoes')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

const PLACE_A = 'ChIJAAAAAAAAAAAAAAAAAAAAAAA'
const PLACE_B = 'ChIJBBBBBBBBBBBBBBBBBBBBBBB'
const CHAVE = 'AIzaChaveDeTeste1234567890'

async function linhas<T>(tx: Tx, q: ReturnType<typeof sql>): Promise<T[]> {
  return ((await tx.execute(q)) as unknown as { rows: T[] }).rows
}

async function cenario(tx: Tx) {
  const um = async (q: ReturnType<typeof sql>) => (await linhas<{ id: string }>(tx, q))[0].id
  const contaA = await um(sql`insert into contas (nome) values ('Conta A') returning id`)
  const contaB = await um(sql`insert into contas (nome) values ('Conta B') returning id`)
  const grupoA = await um(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo A', '49.366.097/0001-40', ${contaA}) returning id`)
  const grupoB = await um(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo B', '00000000000272', ${contaB}) returning id`)
  const lojaA = await um(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja A', 'Pouso Alegre', 'Rua A', ${grupoA}) returning id`)
  const lojaB = await um(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja B', 'Teresina', 'Rua B', ${grupoB}) returning id`)
  return {
    grupoA, grupoB, lojaA, lojaB,
    socioA: { papel: 'admin_socio', contaId: contaA },
    socioB: { papel: 'admin_socio', contaId: contaB },
    auxA: { papel: 'aux_adm', contaId: contaA },
    geral: { papel: 'admin_geral', contaId: null },
  }
}

type Cenario = Awaited<ReturnType<typeof cenario>>

/** Grupo A configurado e lido uma vez: chave, Place ID, nota, uma avaliação. */
async function grupoAConfigurado(tx: Tx, c: Cenario) {
  assert.deepEqual(await m.salvarChaveGoogle(c.socioA, { grupoId: c.grupoA, chave: CHAVE }, tx), { ok: true })
  assert.deepEqual(await m.salvarPlaceIdLoja(c.socioA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: PLACE_A }, tx), { ok: true })
  await m.sincronizarGrupo(c.grupoA, googleFalso().deps, tx)
}

function googleFalso() {
  const chamadas: { apiKey: string; placeId: string }[] = []
  return {
    chamadas,
    deps: {
      buscarLugar: async (apiKey: string, placeId: string) => {
        chamadas.push({ apiKey, placeId })
        return {
          nota: placeId === PLACE_A ? 4.8 : 3.9,
          total: placeId === PLACE_A ? 120 : 15,
          mapsUri: `https://maps.google.com/?q=${placeId}`,
          avaliacoes: [{
            googleId: `places/${placeId}/reviews/1`, autor: 'Cliente', autorUri: null, nota: 5,
            texto: `Avaliação de ${placeId}`, publicadaEm: '2026-10-20T13:00:00Z',
          }],
        }
      },
    },
  }
}

async function placaDaLoja(tx: Tx, lojaId: string) {
  return (await linhas<{ grupo_id: string; place_id: string | null; codigo_placa: string; nota: string | null }>(
    tx, sql`select grupo_id, place_id, codigo_placa, nota from avaliacoes_google_lojas where loja_id = ${lojaId}`,
  ))[0] ?? null
}

test('sócio da Conta B não liga Place ID à loja da Conta A, por nenhum grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const naoEncontrada = { ok: false, erro: 'Loja não encontrada' }
    assert.deepEqual(await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: PLACE_B }, tx), naoEncontrada)
    assert.deepEqual(await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoB, lojaId: c.lojaA, placeId: PLACE_B }, tx), naoEncontrada)
    // Id inexistente recebe a mesma frase.
    assert.deepEqual(
      await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoB, lojaId: '00000000-0000-0000-0000-000000000000', placeId: PLACE_B }, tx),
      naoEncontrada,
    )
    assert.equal(await placaDaLoja(tx, c.lojaA), null)
    throw new Desfazer()
  }), Desfazer)
})

test('sócio da Conta B não sobrescreve o Place ID que a Conta A já gravou', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    const antes = await placaDaLoja(tx, c.lojaA)
    assert.equal((await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoB, lojaId: c.lojaA, placeId: PLACE_B }, tx)).ok, false)
    assert.deepEqual(await placaDaLoja(tx, c.lojaA), antes)
    throw new Desfazer()
  }), Desfazer)
})

test('sócio da Conta B não lê o painel nem troca a chave do grupo da Conta A', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    assert.equal(await m.painelAvaliacoes(c.socioB, c.grupoA, tx), null)
    assert.deepEqual(await m.salvarChaveGoogle(c.socioB, { grupoId: c.grupoA, chave: 'AIzaOutraChave000000000000' }, tx), { ok: false, erro: 'Grupo não encontrado' })
    const [cfg] = await linhas<{ api_key: string }>(tx, sql`select api_key from avaliacoes_google_config where grupo_id = ${c.grupoA}`)
    const { decifrar } = await import('@/lib/cripto')
    assert.equal(decifrar(cfg.api_key).toString('utf8'), CHAVE)

    // O painel do próprio grupo B não traz nada da loja A.
    const painelB = await m.painelAvaliacoes(c.socioB, c.grupoB, tx)
    assert.deepEqual(painelB?.lojas.map(l => l.lojaId), [c.lojaB])
    assert.equal(painelB?.temChave, false)
    throw new Desfazer()
  }), Desfazer)
})

test('aux_adm da própria Conta não configura nem lê (só os sócios)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.equal((await m.salvarChaveGoogle(c.auxA, { grupoId: c.grupoA, chave: CHAVE }, tx)).ok, false)
    assert.equal((await m.salvarPlaceIdLoja(c.auxA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: PLACE_A }, tx)).ok, false)
    assert.equal(await m.painelAvaliacoes(c.auxA, c.grupoA, tx), null)
    throw new Desfazer()
  }), Desfazer)
})

test('sócio da Conta A configura, lê o Google com a chave dele e vê nota, total e avaliação', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await m.salvarChaveGoogle(c.socioA, { grupoId: c.grupoA, chave: CHAVE }, tx)
    await m.salvarPlaceIdLoja(c.socioA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: PLACE_A }, tx)
    const g = googleFalso()
    assert.deepEqual(await m.sincronizarGrupo(c.grupoA, g.deps, tx), { lojas: 1, erros: 0 })
    assert.deepEqual(g.chamadas, [{ apiKey: CHAVE, placeId: PLACE_A }])

    const painel = await m.painelAvaliacoes(c.socioA, c.grupoA, tx)
    const loja = painel!.lojas[0]
    assert.equal(painel!.temChave, true)
    assert.equal(loja.nota, 4.8)
    assert.equal(loja.total, 120)
    assert.equal(loja.avaliacoes.length, 1)
    assert.equal(loja.avaliacoes[0].texto, `Avaliação de ${PLACE_A}`)
    throw new Desfazer()
  }), Desfazer)
})

test('ler o Google do grupo B não toca na loja nem nas avaliações do grupo A', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    await m.salvarChaveGoogle(c.socioB, { grupoId: c.grupoB, chave: 'AIzaChaveDaContaB000000000' }, tx)
    await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoB, lojaId: c.lojaB, placeId: PLACE_B }, tx)
    const g = googleFalso()
    await m.sincronizarGrupo(c.grupoB, g.deps, tx)
    assert.deepEqual(g.chamadas.map(x => x.placeId), [PLACE_B])
    assert.equal(g.chamadas[0].apiKey, 'AIzaChaveDaContaB000000000')
    assert.equal((await placaDaLoja(tx, c.lojaA))!.nota, '4.8')
    const avaliacoesA = await linhas<{ texto: string }>(tx, sql`select texto from avaliacoes_google where loja_id = ${c.lojaA}`)
    assert.deepEqual(avaliacoesA.map(a => a.texto), [`Avaliação de ${PLACE_A}`])
    throw new Desfazer()
  }), Desfazer)
})

test('toque na placa conta para a loja certa e só aparece no painel do grupo dela', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    await m.salvarPlaceIdLoja(c.socioB, { grupoId: c.grupoB, lojaId: c.lojaB, placeId: PLACE_B }, tx)
    const codigoA = (await placaDaLoja(tx, c.lojaA))!.codigo_placa

    assert.equal(await m.registrarToque(codigoA, 'nfc', tx), `https://search.google.com/local/writereview?placeid=${PLACE_A}`)
    await m.registrarToque(codigoA, 'qr', tx)
    assert.equal(await m.registrarToque('zzzzzzzzzz', 'nfc', tx), null)
    assert.equal(await m.registrarToque('../x', 'nfc', tx), null)

    const lojaA = (await m.painelAvaliacoes(c.socioA, c.grupoA, tx))!.lojas[0]
    assert.deepEqual(lojaA.toquesMes, { nfc: 1, qr: 1 })
    const lojaB = (await m.painelAvaliacoes(c.socioB, c.grupoB, tx))!.lojas[0]
    assert.deepEqual(lojaB.toquesMes, { nfc: 0, qr: 0 })
    throw new Desfazer()
  }), Desfazer)
})

test('placa sem Place ID não redireciona e não conta toque', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await m.salvarPlaceIdLoja(c.socioA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: PLACE_A }, tx)
    await m.salvarPlaceIdLoja(c.socioA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: '' }, tx)
    const codigo = (await placaDaLoja(tx, c.lojaA))!.codigo_placa
    assert.equal(await m.registrarToque(codigo, 'nfc', tx), null)
    const [{ n }] = await linhas<{ n: number }>(tx, sql`select count(*)::int as n from avaliacoes_google_toques where loja_id = ${c.lojaA}`)
    assert.equal(n, 0)
    throw new Desfazer()
  }), Desfazer)
})

test('trocar o Place ID mantém o código da placa e apaga o que era da ficha antiga', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    const antes = (await placaDaLoja(tx, c.lojaA))!
    await m.salvarPlaceIdLoja(c.socioA, { grupoId: c.grupoA, lojaId: c.lojaA, placeId: 'ChIJCCCCCCCCCCCCCCCCCCCCCCC' }, tx)
    const depois = (await placaDaLoja(tx, c.lojaA))!
    assert.equal(depois.codigo_placa, antes.codigo_placa)
    assert.equal(depois.nota, null)
    const [{ n }] = await linhas<{ n: number }>(tx, sql`select count(*)::int as n from avaliacoes_google where loja_id = ${c.lojaA}`)
    assert.equal(n, 0)
    throw new Desfazer()
  }), Desfazer)
})

test('limpeza apaga avaliação e histórico com mais de 30 dias, de todos os grupos', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await grupoAConfigurado(tx, c)
    await tx.execute(sql`update avaliacoes_google set vista_em = now() - interval '31 days' where loja_id = ${c.lojaA}`)
    await tx.execute(sql`insert into avaliacoes_google_historico (loja_id, grupo_id, dia, nota, total_avaliacoes)
      values (${c.lojaA}, ${c.grupoA}, (now() - interval '40 days')::date, 4.5, 100)`)
    await m.limparConteudoVencido(tx)
    const [{ av }] = await linhas<{ av: number }>(tx, sql`select count(*)::int as av from avaliacoes_google where loja_id = ${c.lojaA}`)
    const [{ hist }] = await linhas<{ hist: number }>(tx, sql`select count(*)::int as hist from avaliacoes_google_historico where loja_id = ${c.lojaA}`)
    assert.equal(av, 0)
    assert.equal(hist, 1) // só a foto de hoje
    throw new Desfazer()
  }), Desfazer)
})
