/**
 * Teste de ponta a ponta da #347 contra o staging: cancelar a venda pela tela mantém
 * as NFs de saída dela (venda_id nulo, venda_numero da venda), e venda com NF viva de
 * produção continua sem cancelar (ADR-0014).
 *
 *   E2E_URL=http://localhost:3347 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-nf-cancelar-venda.ts [--ver]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Recusa fora do staging. Grava venda, moto e NFs sintéticas marcadas com E2E347 e
 * apaga tudo no fim. --ver abre o navegador visível e devagar.
 */
import { chromium, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { motivoRecusaForaDoStaging } from './lib/alvo-banco'
import { motivoRecusa } from './lib/e2e-mensalidade'
import { DOMINIO_TESTE } from './lib/seed-dados'

const base = process.env.E2E_URL?.replace(/\/$/, '') ?? ''
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
  ?? motivoRecusaForaDoStaging(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)
if (recusa || !process.env.SEED_SENHA) {
  console.error(recusa ? `Recusado: ${recusa}` : 'Falta no env: SEED_SENHA')
  process.exit(1)
}

const VER = process.argv.includes('--ver')
const AUX = `aux.sul@${DOMINIO_TESTE}`
const MARCA = 'E2E347'

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

type Venda = { id: string; numero: number; chassi: string }
type Ctx = { lojaId: string; grupoId: string; auxId: string; modeloId: string }

async function semearVenda(c: Ctx, sufixo: string): Promise<Venda> {
  const chassi = `${MARCA}${sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}) returning id`)) as { id: string }[]
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, '52998224725', 1000, 'pix') returning id, numero`)) as { id: string; numero: number }[]
  return { id: venda.id, numero: venda.numero, chassi }
}

async function semearNota(c: Ctx, v: Venda, sufixo: string, ambiente: string, status: string, numero: string) {
  const [n] = (await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, numero, payload, data_autorizacao)
    values (${v.id}, ${v.numero}, ${c.grupoId}, ${`${MARCA}-${sufixo}-${v.numero}`}, ${ambiente}, ${status}, ${numero}, '{}'::jsonb,
      ${status === 'Autorizada' ? sql`now()` : sql`null`}) returning id`)) as { id: string }[]
  return n.id
}

async function entrar(pagina: Page) {
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', AUX)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
}

/** Abre o "Cancelar venda" da venda pela busca de chassi e devolve o diálogo. */
async function abrirCancelamento(pagina: Page, v: Venda) {
  await pagina.goto(`${base}/vendas?q=${v.chassi}`, { waitUntil: 'networkidle' })
  await pagina.getByTitle('Cancelar Venda').first().click()
  const dialogo = pagina.getByRole('dialog')
  await dialogo.waitFor()
  return dialogo
}

async function vendaExiste(id: string) {
  return ((await execRows(sql`select 1 from vendas where id = ${id}`)) as unknown[]).length > 0
}

async function limpar() {
  const motos = sql`(select id from motos where chassi like ${MARCA + '%'})`
  const notas = sql`(select id from notas_fiscais_saida where id_externo like ${MARCA + '-%'})`
  const contagem = (await execRows(sql`select
    (select count(*) from notas_fiscais_saida_cartas where nota_id in ${notas})::int as cartas,
    (select count(*) from notas_fiscais_saida where id in ${notas})::int as notas,
    (select count(*) from vendas where moto_id in ${motos})::int as vendas,
    (select count(*) from pedidos_venda where moto_id in ${motos})::int as pedidos,
    (select count(*) from historico_estoque where moto_id in ${motos})::int as historico,
    (select count(*) from motos where id in ${motos})::int as motos`))[0]
  console.log(`\n▶ Limpeza (marcados ${MARCA}): ${JSON.stringify(contagem)}`)
  await db.transaction(async tx => {
    await tx.execute(sql`delete from notas_fiscais_saida_cartas where nota_id in ${notas}`)
    await tx.execute(sql`delete from notas_fiscais_saida where id in ${notas}`)
    await tx.execute(sql`delete from vendas where moto_id in ${motos}`)
    await tx.execute(sql`delete from pedidos_venda where moto_id in ${motos}`)
    await tx.execute(sql`delete from historico_estoque where moto_id in ${motos}`)
    await tx.execute(sql`delete from motos where id in ${motos}`)
  })
}

async function main() {
  const [aux] = (await execRows(sql`select u.id, u.loja_id, l.grupo_id from usuarios u join lojas l on l.id = u.loja_id where u.email = ${AUX}`)) as
    { id: string; loja_id: string; grupo_id: string }[]
  const [modelo] = (await execRows(sql`select id from modelos order by id limit 1`)) as { id: string }[]
  if (!aux || !modelo) throw new Error(`staging sem ${AUX} ou sem modelo`)
  const c: Ctx = { lojaId: aux.loja_id, grupoId: aux.grupo_id, auxId: aux.id, modeloId: modelo.id }

  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    const livre = await semearVenda(c, 'L')
    const negada = await semearNota(c, livre, 'NEG', 'Homologacao', 'Negada', '9347001')
    const cancelada = await semearNota(c, livre, 'CAN', 'Producao', 'Cancelada', '9347002')
    await execRows(sql`insert into notas_fiscais_saida_cartas (nota_id, grupo_id, id_externo, ambiente, numero, correcao, situacao, status)
      values (${cancelada}, ${c.grupoId}, ${`${MARCA}-CCE-${livre.numero}`}, 'Producao', 1, 'correção sintética do teste e2e da 347', 'autorizada', 'Autorizada')`)
    const viva = await semearVenda(c, 'V')
    await semearNota(c, viva, 'AUT', 'Producao', 'Autorizada', '9347003')

    const pagina = await (await navegador.newContext({ locale: 'pt-BR' })).newPage()
    await entrar(pagina)

    console.log(`\n▶ Venda ${livre.numero} com NF Negada (homologação) e NF Cancelada com carta: cancela pela tela`)
    const d1 = await abrirCancelamento(pagina, livre)
    await d1.locator('#motivo-cancelamento').fill(`Teste e2e ${MARCA}`)
    await d1.getByRole('button', { name: 'Cancelar venda' }).click()
    for (let i = 0; i < 40 && await vendaExiste(livre.id); i++) await pagina.waitForTimeout(500)
    confere(!(await vendaExiste(livre.id)), 'a venda foi cancelada')
    const notas = (await execRows(sql`select id, venda_id, venda_numero from notas_fiscais_saida where id in (${negada}, ${cancelada})`)) as
      { id: string; venda_id: string | null; venda_numero: number }[]
    confere(notas.length === 2, 'as duas NFs continuam no banco', `${notas.length} de 2`)
    confere(notas.every(n => n.venda_id === null && n.venda_numero === livre.numero), `venda_id nulo e venda_numero ${livre.numero}`, JSON.stringify(notas))

    console.log(`\n▶ Venda ${viva.numero} com NF Autorizada de produção: a tela recusa`)
    const d2 = await abrirCancelamento(pagina, viva)
    const recusou = await d2.getByText('está autorizada na SEFAZ').waitFor({ timeout: 20_000 }).then(() => true, () => false)
    confere(recusou, 'mostra a orientação do ADR-0014 (cancelar a NF antes)')
    confere(await d2.getByRole('button', { name: 'Cancelar venda' }).count() === 0, 'sem o botão de confirmar')
    confere(await vendaExiste(viva.id), 'a venda continua no banco')
  } finally {
    await navegador.close()
    await limpar().catch(e => { falhas++; console.error(`Limpeza falhou: ${(e as Error).message}`) })
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nOk.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
