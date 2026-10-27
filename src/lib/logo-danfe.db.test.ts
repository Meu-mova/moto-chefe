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

type Db = typeof import('@/lib/db')
type Logo = typeof import('@/lib/logo-danfe')
let db: Db['db']
let enviarLogoDanfe: Logo['enviarLogoDanfe']
let previaLogoDanfe: Logo['previaLogoDanfe']
let gruposParaLogo: Logo['gruposParaLogo']
let png: Buffer

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ enviarLogoDanfe, gruposParaLogo, previaLogoDanfe } = await import('@/lib/logo-danfe'))
  const sharp = (await import('sharp')).default
  const desenho = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: desenho, gravity: 'center' }]).png().toBuffer()
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
  const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
  const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Cuiabá', '00000000000191', ${contaA.id}) returning id`)
  const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Teresina', '00000000000272', ${contaB.id}) returning id`)
  await tx.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id) values (${grupoA.id}, 'cifrado', 'empresa-a'), (${grupoB.id}, 'cifrado', 'empresa-b')`)
  const usuario = async (nome: string, papel: string, contaId: string) => {
    const u = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), ${nome}, ${nome + '@t.com'}, ${papel}, ${contaId}) returning id`)
    return { id: u.id, papel, contaId }
  }
  return {
    grupoA: grupoA.id, grupoB: grupoB.id,
    socioA: await usuario('socioA', 'admin_socio', contaA.id),
    socioB: await usuario('socioB', 'admin_socio', contaB.id),
    auxA: await usuario('auxA', 'aux_adm', contaA.id),
  }
}

/** NG e Storage de mentira: anotam o que receberam. */
function dependencias(tx: Tx, opcoes: { storageFalha?: boolean; ngFalha?: boolean; configFalha?: boolean; dadosFalha?: boolean; cnpjNaNg?: string } = {}) {
  const ng: string[] = []
  const storage: string[] = []
  const consultas: string[] = []
  return {
    ng, storage, consultas,
    deps: {
      // Consultar Empresa de mentira: devolve o cadastro do emitente com o CNPJ do grupo A.
      dadosDaEmpresaNaNg: async (cfg: { empresaId: string }) => {
        consultas.push(cfg.empresaId)
        if (opcoes.dadosFalha) throw new Error('HTTP 503')
        return { razaoSocial: 'EMPRESA A LTDA', logradouro: 'Rua A', numero: '1', complemento: null, bairro: 'Centro', cep: '78000000', cidade: 'Cuiabá', uf: 'MT', cnpj: opcoes.cnpjNaNg ?? '00.000.000/0001-91', telefone: null, email: null }
      },
      configNg: async (grupoId: string) => {
        if (opcoes.configFalha) throw new Error('connect ECONNREFUSED')
        const r = (await tx.execute(sql`select empresa_id from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { empresa_id: string }[] }
        return r.rows[0] ? { token: 't', empresaId: r.rows[0].empresa_id, ambiente: 'Homologacao' as const } : null
      },
      vincularNaNg: async (cfg: { empresaId: string }) => {
        if (opcoes.ngFalha) throw new Error('fetch failed')
        ng.push(cfg.empresaId)
      },
      salvarCopia: async (grupoId: string) => {
        if (opcoes.storageFalha) throw new Error('storage fora')
        storage.push(grupoId)
      },
    },
  }
}

async function registroDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select logo_enviada_em, logo_enviada_por from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { logo_enviada_em: Date | null; logo_enviada_por: string | null }[] }
  return r.rows[0]
}

async function logsDoTipo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select usuario_id, detalhe from log_acoes where tipo = 'logo_danfe_enviada' and grupo_id = ${grupoId}`)) as unknown as { rows: { usuario_id: string; detalhe: Record<string, unknown> }[] }
  return r.rows
}

test('sócio envia a logo de grupo da Conta dele: vai para a empresa do grupo na NG, cópia, registro e log', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    const r = await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx)
    assert.equal(r.ok, true)
    assert.deepEqual(d.ng, ['empresa-a'])
    assert.deepEqual(d.storage, [c.grupoA])
    const reg = await registroDoGrupo(tx, c.grupoA)
    assert.ok(reg.logo_enviada_em)
    assert.equal(reg.logo_enviada_por, c.socioA.id)
    const logs = await logsDoTipo(tx, c.grupoA)
    assert.equal(logs.length, 1)
    assert.equal(logs[0].usuario_id, c.socioA.id)
    assert.ok(!JSON.stringify(logs[0].detalhe).includes('empresa-a'), 'log sem empresaId')
    throw new Desfazer()
  }), Desfazer)
})

test('sócio da Conta B não envia para grupo da Conta A e recebe a mesma frase de grupo inexistente', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    const deOutraConta = await enviarLogoDanfe(c.socioB, c.grupoA, png, '', d.deps, tx)
    const inexistente = await enviarLogoDanfe(c.socioB, '00000000-0000-0000-0000-000000000000', png, '', d.deps, tx)
    assert.deepEqual(deOutraConta, { ok: false, erro: 'Grupo não encontrado' })
    assert.deepEqual(inexistente, deOutraConta)
    assert.deepEqual(await enviarLogoDanfe(c.socioB, 'nao-e-uuid', png, '', d.deps, tx), deOutraConta)
    assert.deepEqual(d.ng, [])
    assert.deepEqual(d.storage, [])
    assert.equal((await registroDoGrupo(tx, c.grupoA)).logo_enviada_em, null)
    throw new Desfazer()
  }), Desfazer)
})

test('lista do card: cada sócio vê só os grupos da Conta dele; aux_adm não vê nenhum', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual((await gruposParaLogo(c.socioA, tx)).map(g => g.id), [c.grupoA])
    assert.deepEqual((await gruposParaLogo(c.socioB, tx)).map(g => g.id), [c.grupoB])
    assert.deepEqual(await gruposParaLogo(c.auxA, tx), [])
    const [linha] = await gruposParaLogo(c.socioA, tx)
    assert.equal(linha.temNg, true)
    assert.ok(!JSON.stringify(linha).includes('empresa-a'), 'a lista vai para a tela: sem empresaId')
    throw new Desfazer()
  }), Desfazer)
})

test('aux_adm é recusado mesmo no grupo da própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    const r = await enviarLogoDanfe(c.auxA, c.grupoA, png, '', d.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Acesso restrito a Admin Geral e Sócio' })
    assert.deepEqual(d.ng, [])
    throw new Desfazer()
  }), Desfazer)
})

test('NG aceitou e a cópia falhou: avisa que já vale e pede reenvio, sem marcar a cópia como salva', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx, { storageFalha: true })
    const r = await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx)
    assert.deepEqual(r, {
      ok: false,
      erro: 'A logo já vale nas próximas notas, mas a cópia do MOVA não foi salva. Envie de novo para ela aparecer aqui.',
    })
    assert.deepEqual(d.ng, ['empresa-a'])
    assert.equal((await registroDoGrupo(tx, c.grupoA)).logo_enviada_em, null)
    assert.equal((await logsDoTipo(tx, c.grupoA)).length, 1, 'a NG mudou: o envio fica no log')
    throw new Desfazer()
  }), Desfazer)
})

test('grupo sem a Nota Gateway configurada avisa e não envia', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`delete from notagateway_config where grupo_id = ${c.grupoA}`)
    const d = dependencias(tx)
    const r = await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Configure a Nota Gateway deste grupo antes de enviar a logo.' })
    assert.deepEqual(d.ng, [])
    throw new Desfazer()
  }), Desfazer)
})

const FALHA_NG = 'Não deu para enviar a logo à Nota Gateway agora. Tente de novo em alguns minutos.'

test('NG recusa ou fora do ar: frase fixa em português, nada no Storage, no registro nem no log', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx, { ngFalha: true })
    const r = await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx)
    assert.deepEqual(r, { ok: false, erro: FALHA_NG })
    assert.deepEqual(d.storage, [])
    assert.equal((await registroDoGrupo(tx, c.grupoA)).logo_enviada_em, null)
    assert.equal((await logsDoTipo(tx, c.grupoA)).length, 0)
    throw new Desfazer()
  }), Desfazer)
})

test('falha ao ler a credencial da NG vira frase fixa, sem lançar', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx, { configFalha: true })
    assert.deepEqual(await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx), { ok: false, erro: 'Não deu para ler o cadastro da empresa na Nota Gateway agora. Tente de novo em alguns minutos.' })
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral vê os grupos de todas as Contas na lista do card', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const admin = { id: c.socioA.id, papel: 'admin_geral', contaId: null }
    const ids = (await gruposParaLogo(admin, tx)).map(g => g.id)
    assert.ok(ids.includes(c.grupoA) && ids.includes(c.grupoB))
    throw new Desfazer()
  }), Desfazer)
})

async function siteDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select site_danfe from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { site_danfe: string | null }[] }
  return r.rows[0]?.site_danfe ?? null
}

test('prévia de grupo de outra Conta: "Grupo não encontrado" e a NG não é consultada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    assert.deepEqual(await previaLogoDanfe(c.socioB, c.grupoA, png, '', d.deps, tx), { ok: false, erro: 'Grupo não encontrado' })
    assert.deepEqual(d.consultas, [])
    throw new Desfazer()
  }), Desfazer)
})

test('prévia monta a imagem com o cadastro da NG quando o CNPJ confere', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    const r = await previaLogoDanfe(c.socioA, c.grupoA, png, 'www.a.com.br', d.deps, tx)
    assert.equal(r.ok, true)
    assert.deepEqual(d.consultas, ['empresa-a'])
    throw new Desfazer()
  }), Desfazer)
})

test('CNPJ da empresa na NG diferente do grupo recusa a prévia e não envia nada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx, { cnpjNaNg: '11222333000181' })
    const erro = { ok: false, erro: 'A empresa da Nota Gateway deste grupo tem outro CNPJ. Confira a credencial antes de enviar a logo.' }
    assert.deepEqual(await previaLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx), erro)
    assert.deepEqual(await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx), erro)
    assert.deepEqual(d.ng, [])
    throw new Desfazer()
  }), Desfazer)
})

test('Consultar Empresa fora do ar: prévia com frase fixa, sem gerar imagem', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx, { dadosFalha: true })
    assert.deepEqual(await previaLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx), { ok: false, erro: 'Não deu para ler o cadastro da empresa na Nota Gateway agora. Tente de novo em alguns minutos.' })
    throw new Desfazer()
  }), Desfazer)
})

test('envio grava o site do grupo; site vazio fica sem site', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const d = dependencias(tx)
    assert.equal((await enviarLogoDanfe(c.socioA, c.grupoA, png, ' www.a.com.br ', d.deps, tx)).ok, true)
    assert.equal(await siteDoGrupo(tx, c.grupoA), 'www.a.com.br')
    assert.equal((await enviarLogoDanfe(c.socioA, c.grupoA, png, '', d.deps, tx)).ok, true)
    assert.equal(await siteDoGrupo(tx, c.grupoA), null)
    throw new Desfazer()
  }), Desfazer)
})
