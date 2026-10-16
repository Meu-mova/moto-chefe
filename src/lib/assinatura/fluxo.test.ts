import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solicitarCodigo, conferirCodigo, selarAssinatura, type Repositorio, type Infra, type DocumentoAssinavel, type CodigoGravado, type Selagem } from './fluxo'
import { hashCodigo, MAX_CODIGOS, VALIDADE_MINUTOS } from './codigo'

const ctx = { ip: '1.2.3.4', userAgent: 'teste' }
const PNG = 'data:image/png;base64,iVBORw0KGgo='

function montar(opcoes: { status?: string; expiraEm?: Date; email?: string | null; envio?: 'enviado' | 'erro' | 'sem_email' } = {}) {
  let agora = new Date('2026-10-16T12:00:00Z')
  const doc: DocumentoAssinavel = {
    id: 'doc-1',
    status: opcoes.status ?? 'pendente',
    expiraEm: opcoes.expiraEm ?? new Date('2026-10-20T00:00:00Z'),
    emailDestino: opcoes.email === undefined ? 'cliente@teste.com' : opcoes.email,
    remetente: 'Loja Teste',
  }
  const codigos: CodigoGravado[] = []
  const eventos: { tipo: string; detalhe?: unknown; em: Date }[] = []
  const emails: { para: string; texto: string }[] = []
  const uploads: string[] = []
  const selagens: Selagem<null>[] = []
  const lotes: string[][] = []
  let ultimoCodigoEmClaro = ''

  const repo: Repositorio<DocumentoAssinavel, null> = {
    mensagens: { linkExpirado: 'expirou', linkExpiradoAoSelar: 'expirou ao selar', codigosEsgotados: 'esgotou', semEmail: 'sem e-mail', canceladoNoMeio: 'cancelado no meio' },
    async buscar(token) { return token === 'tok' ? doc : null },
    async historicoEnvios() {
      const ok = eventos.filter(e => e.tipo === 'codigo_enviado' && (e.detalhe as { envio: string }).envio === 'enviado')
      return { enviados: ok.length, ultimoEnvioEm: ok.at(-1)?.em ?? null }
    },
    async ultimoCodigo() { return codigos.at(-1) ?? null },
    async gravarCodigo(_id, codigoHash, expiraEm) {
      codigos.push({ id: `c${codigos.length + 1}`, codigoHash, expiraEm, tentativas: 0, usadoEm: null })
    },
    async registrarTentativa(id, tentativas) { codigos.find(c => c.id === id)!.tentativas = tentativas },
    async marcarCodigoUsado(id, usadoEm) { codigos.find(c => c.id === id)!.usadoEm = usadoEm },
    async registrarEventos(_id, _ctx, novos) {
      lotes.push(novos.map(e => e.tipo))
      for (const e of novos) eventos.push({ tipo: e.tipo, detalhe: e.detalhe, em: agora })
    },
    htmlFinal() { return { ok: true, html: '<p>contrato</p>' } },
    pastaArquivos() { return 'grupo/doc-1' },
    async selar(_d, s) { selagens.push(s); doc.status = 'assinado' },
    async avisarAssinado(d) { emails.push({ para: d.emailDestino ?? '', texto: 'assinado' }) },
  }
  const infra: Infra = {
    async enviarEmail(m) {
      emails.push({ para: m.para, texto: m.texto })
      if (!m.para) return { status: 'sem_email', id: null }
      return { status: opcoes.envio ?? 'enviado', id: 'r1' }
    },
    emailCodigo(codigo) { ultimoCodigoEmClaro = codigo; return { assunto: 'código', texto: `código ${codigo}`, html: '' } },
    async upload(caminho) { uploads.push(caminho); return { ok: true } },
    agora: () => agora,
  }
  return {
    repo, infra, doc, codigos, eventos, emails, uploads, selagens, lotes,
    codigo: () => ultimoCodigoEmClaro,
    avancar: (segundos: number) => { agora = new Date(agora.getTime() + segundos * 1000) },
  }
}

test('solicitarCodigo envia por e-mail, grava só o hash e não devolve o código', async () => {
  const t = montar()
  const r = await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  assert.equal(r.ok, true)
  assert.equal(r.enviados, 1)
  assert.equal(t.codigos.length, 1)
  assert.equal(t.codigos[0].codigoHash, hashCodigo(t.codigo(), 'doc-1'))
  assert.ok(!JSON.stringify(r).includes(t.codigo()))
})

test('solicitarCodigo não gera outro enquanto o código vigente vale; reenviar força', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  assert.equal(t.codigos.length, 1)
  t.avancar(61)
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok', true)
  assert.equal(t.codigos.length, 2)
})

test('solicitarCodigo respeita a espera entre envios e o limite de códigos', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  const cedo = await solicitarCodigo(t.repo, t.infra, ctx, 'tok', true)
  assert.equal(cedo.ok, false)
  assert.ok(cedo.esperarSegundos && cedo.esperarSegundos > 0)
  for (let i = 1; i < MAX_CODIGOS; i++) { t.avancar(61); await solicitarCodigo(t.repo, t.infra, ctx, 'tok', true) }
  t.avancar(61)
  const r = await solicitarCodigo(t.repo, t.infra, ctx, 'tok', true)
  assert.deepEqual([r.ok, r.error, r.restantes], [false, 'esgotou', 0])
})

test('solicitarCodigo: link expirado, cancelado, sem e-mail e falha de envio', async () => {
  assert.equal((await solicitarCodigo(montar({ expiraEm: new Date('2026-10-01') }).repo, montar().infra, ctx, 'tok')).error, 'expirou')
  const c = montar({ status: 'cancelado' })
  assert.equal((await solicitarCodigo(c.repo, c.infra, ctx, 'tok')).error, 'Documento cancelado')
  const s = montar({ email: null })
  assert.equal((await solicitarCodigo(s.repo, s.infra, ctx, 'tok')).error, 'sem e-mail')
  const f = montar({ envio: 'erro' })
  const r = await solicitarCodigo(f.repo, f.infra, ctx, 'tok')
  assert.equal(r.ok, false)
  // Falha de envio não consome a cota.
  assert.equal((await f.repo.historicoEnvios('doc-1')).enviados, 0)
})

test('conferirCodigo: errado soma tentativa; certo marca usado', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  const errado = t.codigo() === '000000' ? '111111' : '000000'
  assert.deepEqual(await conferirCodigo(t.repo, t.infra, ctx, 'tok', errado), { ok: false, error: 'Código incorreto.' })
  assert.equal(t.codigos[0].tentativas, 1)
  assert.deepEqual(await conferirCodigo(t.repo, t.infra, ctx, 'tok', ` ${t.codigo()} `), { ok: true })
  assert.ok(t.codigos[0].usadoEm)
})

test('selarAssinatura exige código conferido', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  const r = await selarAssinatura(t.repo, t.infra, ctx, 'tok', PNG, PNG, null)
  assert.equal(r.ok, false)
  assert.equal(t.selagens.length, 0)
})

test('selarAssinatura sela uma vez, sobe selfie e traço e avisa; duplo clique não duplica', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  await conferirCodigo(t.repo, t.infra, ctx, 'tok', t.codigo())
  assert.deepEqual(await selarAssinatura(t.repo, t.infra, ctx, 'tok', PNG, PNG, { lat: 1, lon: 2, precisao: 3 }), { ok: true })
  assert.deepEqual(await selarAssinatura(t.repo, t.infra, ctx, 'tok', PNG, PNG, null), { ok: true })
  assert.equal(t.selagens.length, 1)
  assert.deepEqual(t.uploads, ['grupo/doc-1/selfie.jpg', 'grupo/doc-1/assinatura.png'])
  assert.equal(t.selagens[0].evidencias.documentoId, 'doc-1')
  assert.equal(t.selagens[0].evidencias.ipAssinatura, '1.2.3.4')
  // selfie_enviada e assinado saem juntos, num lote só.
  assert.deepEqual(t.lotes.at(-1), ['selfie_enviada', 'assinado'])
  assert.equal(t.emails.at(-1)?.texto, 'assinado')
})

test('selarAssinatura recusa imagem inválida e documento cancelado no meio', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  await conferirCodigo(t.repo, t.infra, ctx, 'tok', t.codigo())
  assert.equal((await selarAssinatura(t.repo, t.infra, ctx, 'tok', 'lixo', PNG, null)).error, 'Imagem inválida')
  t.doc.status = 'cancelado'
  assert.equal((await selarAssinatura(t.repo, t.infra, ctx, 'tok', PNG, PNG, null)).error, 'cancelado no meio')
  assert.equal(t.selagens.length, 0)
})

test('conferirCodigo recusa código vencido (passados os minutos de validade)', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  t.avancar(VALIDADE_MINUTOS * 60 + 1)
  assert.deepEqual(await conferirCodigo(t.repo, t.infra, ctx, 'tok', t.codigo()), { ok: false, error: 'Código expirado. Peça um novo.' })
  assert.equal(t.codigos[0].usadoEm, null)
})

test('selarAssinatura com link vencido usa a mensagem do repositório', async () => {
  const t = montar()
  await solicitarCodigo(t.repo, t.infra, ctx, 'tok')
  await conferirCodigo(t.repo, t.infra, ctx, 'tok', t.codigo())
  t.avancar(5 * 24 * 3600)
  assert.equal((await selarAssinatura(t.repo, t.infra, ctx, 'tok', PNG, PNG, null)).error, 'expirou ao selar')
})
