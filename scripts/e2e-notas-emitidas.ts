/**
 * Teste de ponta a ponta da tela Notas Emitidas (#348) contra o staging, que não tem NF de
 * produção: o script cria notas sintéticas (id_externo 'e2e-348-*'), confere a tela com os
 * usuários de teste e apaga o que criou, também quando falha.
 *
 *   E2E_URL=http://localhost:3348 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-notas-emitidas.ts [--ver]
 *
 * --ver abre o navegador na tela, devagar, para acompanhar.
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Conta A = "Grupo Teste Sul" (aux.sul, socio.sul, vendedor.sul); Conta B = "Grupo Teste Vale"
 * (aux.vale). geral@ escolhe o grupo pelo cookie grupoAtivo, como o seletor da tela.
 * Screenshots em /tmp/e2e-348/.
 */
import { mkdirSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { fimDoDiaBrt, hojeBrt, inicioDoDiaBrt, mesBrt, parseDataInput } from '@/lib/data-venda'
import { classificarNota, type CategoriaNota } from '@/lib/notas-emitidas'
import { motivoRecusaForaDoStaging } from './lib/alvo-banco'
import { motivoRecusa } from './lib/e2e-mensalidade'

const base = (process.env.E2E_URL ?? 'http://localhost:3348').replace(/\/$/, '')
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
  ?? motivoRecusaForaDoStaging(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)
if (recusa || !process.env.SEED_SENHA) {
  console.error(recusa ? `Recusado: ${recusa}` : 'Falta no env: SEED_SENHA')
  process.exit(1)
}

const VER = process.argv.includes('--ver')
const PASTA = '/tmp/e2e-348'
const MARCA = 'e2e-348-'
const GRUPO_A = 'Grupo Teste Sul'
const GRUPO_B = 'Grupo Teste Vale'
const USUARIO = (nome: string) => `${nome}@teste.meumova.com`

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

type Grupo = { id: string; conta_id: string }
type Venda = { id: string; numero: number; chassi: string; data_venda: string }

async function grupoPorNome(nome: string): Promise<Grupo> {
  const [g] = (await execRows(sql`select id, conta_id from grupos where nome = ${nome}`)) as Grupo[]
  if (!g) throw new Error(`"${nome}" não existe no staging`)
  return g
}

// Nota viva de produção é uma por venda (notas_fiscais_saida_uma_viva_idx): só servem vendas sem nenhuma.
async function vendasLivres(grupoId: string, quantas: number): Promise<Venda[]> {
  const vendas = (await execRows(sql`
    select v.id, v.numero, m.chassi, to_char(v.data_venda at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as data_venda
    from vendas v join lojas l on l.id = v.loja_id join motos m on m.id = v.moto_id
    where l.grupo_id = ${grupoId}
      and not exists (select 1 from notas_fiscais_saida n where n.venda_id = v.id and n.ambiente = 'Producao'
        and n.status not in ('Negada', 'Denegada', 'Cancelada', 'Descartada'))
    order by v.numero limit ${quantas}`)) as Venda[]
  if (vendas.length < quantas) throw new Error(`grupo ${grupoId} tem ${vendas.length} venda(s) sem NF viva; o teste precisa de ${quantas}`)
  return vendas
}

type NotaNova = { venda: Venda; grupo: Grupo; sufixo: string; status: string; ambiente: 'Producao' | 'Homologacao'; criadoEm?: string; motivo?: string }

async function criar(n: NotaNova) {
  await db.execute(sql`
    insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, status, motivo_status, numero, serie, payload, criado_em, link_danfe, link_xml)
    values (${n.venda.id}, ${n.grupo.id}, ${MARCA + n.sufixo}, ${n.ambiente}, ${n.status}, ${n.motivo ?? null}, ${numeroDa(n.sufixo)}, '1', '{}'::jsonb,
      coalesce(${n.criadoEm ?? null}::timestamptz, now()),
      ${n.status === 'Autorizada' ? 'https://example.invalid/danfe.pdf' : null}, ${n.status === 'Autorizada' ? 'https://example.invalid/nota.xml' : null})`)
}

const numeroDa = (sufixo: string) => `E2E348${sufixo.toUpperCase()}`

async function limpar() {
  const achadas = (await execRows(sql`select id_externo from notas_fiscais_saida where id_externo like ${MARCA + '%'}`)) as { id_externo: string }[]
  if (!achadas.length) return
  console.log(`  limpando ${achadas.length} nota(s) sintética(s): ${achadas.map(a => a.id_externo).join(', ')}`)
  await db.execute(sql`delete from notas_fiscais_saida where id_externo like ${MARCA + '%'}`)
}

/** Contagem por categoria a partir do banco, pela mesma regra de grupo, ambiente e período da tela. */
async function esperado(grupoId: string, ambiente: string, de: string, ate: string) {
  const linhas = (await execRows(sql`
    select status from notas_fiscais_saida where grupo_id = ${grupoId} and ambiente = ${ambiente}
      and criado_em >= ${inicioDoDiaBrt(de).toISOString()}::timestamptz and criado_em <= ${fimDoDiaBrt(ate).toISOString()}::timestamptz`)) as { status: string }[]
  const conta: Record<CategoriaNota, number> = { autorizada: 0, cancelada: 0, recusada: 0, em_andamento: 0, descartada: 0 }
  for (const l of linhas) conta[classificarNota(l.status)]++
  return conta
}

async function entrar(navegador: Browser, email: string, grupoAtivo?: string, celular = false): Promise<Page> {
  const contexto = await navegador.newContext({ locale: 'pt-BR', viewport: celular ? { width: 390, height: 844 } : { width: 1440, height: 900 } })
  if (grupoAtivo) await contexto.addCookies([{ name: 'grupoAtivo', value: grupoAtivo, url: base }])
  const pagina = await contexto.newPage()
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', email)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
  if (new URL(pagina.url()).pathname.startsWith('/login')) throw new Error(`login falhou para ${email}`)
  return pagina
}

async function abrir(pagina: Page, caminho: string) {
  await pagina.goto(`${base}${caminho}`, { waitUntil: 'networkidle' })
  return pagina.locator('body').innerText()
}

async function contadores(pagina: Page) {
  const rotulos: Record<string, CategoriaNota> = { Autorizadas: 'autorizada', Canceladas: 'cancelada', Recusadas: 'recusada', 'Em andamento': 'em_andamento' }
  const lidos: Partial<Record<CategoriaNota, number>> = {}
  for (const texto of await pagina.locator('nav[aria-label="Filtrar por status"] a').allInnerTexts()) {
    const rotulo = Object.keys(rotulos).find(r => texto.includes(r))
    const numero = texto.match(/(\d+)\s*$/)?.[1]
    if (rotulo && numero) lidos[rotulos[rotulo]] = Number(numero)
  }
  return lidos
}

const tabela = (pagina: Page) => pagina.locator('table').innerText()

async function main() {
  const A = await grupoPorNome(GRUPO_A)
  const B = await grupoPorNome(GRUPO_B)
  if (A.conta_id === B.conta_id) throw new Error('os dois grupos precisam ser de Contas diferentes')
  const [va1, va2, va3] = await vendasLivres(A.id, 3)
  const [vb1] = await vendasLivres(B.id, 1)

  const hoje = hojeBrt()
  const inicioMes = `${mesBrt()}-01`
  // Meio-dia de Brasília do dia anterior ao 1º do mês: fora do período padrão.
  const diaForaDoMes = new Date(parseDataInput(inicioMes).getTime() - 86_400_000).toISOString().slice(0, 10)
  const foraDoMes = `${diaForaDoMes}T15:00:00.000Z`

  await limpar()
  mkdirSync(PASTA, { recursive: true })
  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    console.log('\n▶ Criando notas sintéticas no staging')
    const notas: NotaNova[] = [
      { venda: va1, grupo: A, sufixo: 'a1', status: 'Autorizada', ambiente: 'Producao' },
      { venda: va1, grupo: A, sufixo: 'a2', status: 'Cancelada', ambiente: 'Producao', motivo: 'Teste e2e: venda desfeita' },
      { venda: va1, grupo: A, sufixo: 'a3', status: 'Negada', ambiente: 'Producao', motivo: '539 - Rejeição: teste e2e' },
      { venda: va2, grupo: A, sufixo: 'a4', status: 'Processando', ambiente: 'Producao' },
      { venda: va1, grupo: A, sufixo: 'a5', status: 'Descartada', ambiente: 'Producao' },
      { venda: va1, grupo: A, sufixo: 'a6', status: 'Autorizada', ambiente: 'Homologacao' },
      { venda: va3, grupo: A, sufixo: 'a7', status: 'Autorizada', ambiente: 'Producao', criadoEm: foraDoMes },
      { venda: vb1, grupo: B, sufixo: 'b1', status: 'Autorizada', ambiente: 'Producao' },
    ]
    for (const n of notas) await criar(n)
    console.log(`  ${notas.length} notas criadas (${MARCA}*)`)
    const N = (s: string) => numeroDa(s)
    const daA = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'].map(N)

    console.log('\n▶ Menu: aparece para aux_adm, sócio e admin_geral; não para vendedor')
    for (const [nome, grupo] of [['aux.sul', undefined], ['socio.sul', undefined], ['geral', A.id]] as const) {
      const p = await entrar(navegador, USUARIO(nome), grupo)
      await abrir(p, '/dashboard')
      confere(await p.locator('a[href="/notas-emitidas"]').count() > 0, `${nome} vê o item no menu`)
      await p.context().close()
    }
    {
      const p = await entrar(navegador, USUARIO('vendedor.sul'))
      await abrir(p, '/dashboard')
      confere(await p.locator('a[href="/notas-emitidas"]').count() === 0, 'vendedor não vê o item no menu')
      await abrir(p, '/notas-emitidas')
      confere(new URL(p.url()).pathname === '/dashboard', 'vendedor pelo endereço volta ao dashboard', p.url())
      await p.context().close()
    }

    console.log('\n▶ aux_adm da Conta A, desktop')
    const aux = await entrar(navegador, USUARIO('aux.sul'))
    let texto = await abrir(aux, '/notas-emitidas')
    const esperadoMes = await esperado(A.id, 'Producao', inicioMes, hoje)
    const lidos = await contadores(aux)
    for (const c of ['autorizada', 'cancelada', 'recusada', 'em_andamento'] as const) {
      confere(lidos[c] === esperadoMes[c], `contador ${c} = ${esperadoMes[c]}`, `tela: ${lidos[c]}`)
    }
    confere([N('a1'), N('a2'), N('a3'), N('a4')].every(n => texto.includes(n)), 'padrão "Emitidas" mostra autorizada, cancelada, recusada e em andamento')
    confere(!texto.includes(N('a5')), 'Descartada fora do padrão')
    confere(!texto.includes(N('a6')), 'homologação fora do padrão (produção)')
    confere(!texto.includes(N('a7')), 'nota de fora do mês fora do período padrão')
    confere(!texto.includes(N('b1')), 'Conta A não vê nota da Conta B')
    await aux.screenshot({ path: `${PASTA}/desktop-padrao.png`, fullPage: true })

    await aux.click('nav[aria-label="Filtrar por status"] a:has-text("Recusadas")')
    await aux.waitForURL(/status=recusada/)
    await aux.waitForLoadState('networkidle')
    texto = await tabela(aux)
    confere(texto.includes(N('a3')) && !texto.includes(N('a1')) && !texto.includes(N('a2')), 'clicar em Recusadas filtra a tabela')
    await aux.screenshot({ path: `${PASTA}/desktop-recusadas.png`, fullPage: true })
    await aux.click('nav[aria-label="Filtrar por status"] a:has-text("Recusadas")')
    const voltou = await aux.waitForURL(/status=ativas/, { timeout: 10_000 }).then(() => true, () => false)
    confere(voltou, 'clicar de novo no indicador ativo volta para "Emitidas"', aux.url())

    await aux.click('a:has-text("ver todas")')
    await aux.waitForURL(/status=todas/)
    await aux.waitForLoadState('networkidle')
    confere((await tabela(aux)).includes(N('a5')), '"ver todas" mostra a Descartada')

    await abrir(aux, '/notas-emitidas')
    await aux.locator('input[type="date"]').first().fill(diaForaDoMes)
    await aux.waitForURL(new RegExp(`de=${diaForaDoMes}`))
    await aux.waitForLoadState('networkidle')
    confere((await tabela(aux)).includes(N('a7')), `De = ${diaForaDoMes} traz a nota de fora do mês`)
    await aux.locator('input[type="date"]').nth(1).fill(diaForaDoMes)
    await aux.waitForURL(new RegExp(`ate=${diaForaDoMes}`))
    await aux.waitForLoadState('networkidle')
    texto = await tabela(aux).catch(() => '')
    confere(texto.includes(N('a7')) && !texto.includes(N('a1')), `Até = ${diaForaDoMes} tira as notas do mês`)

    await abrir(aux, '/notas-emitidas')
    await aux.getByLabel('Ambiente').selectOption('Homologacao')
    await aux.waitForURL(/ambiente=Homologacao/)
    await aux.waitForLoadState('networkidle')
    texto = await aux.locator('body').innerText()
    confere(texto.includes(N('a6')) && !texto.includes(N('a1')), 'Ambiente Homologação mostra só a de homologação')
    confere(texto.includes('sem valor fiscal'), 'aviso de homologação')

    await abrir(aux, '/notas-emitidas')
    const linha = aux.locator('tr', { hasText: N('a1') })
    await linha.locator(`a:has-text("#${va1.numero}")`).click()
    await aux.waitForURL(/\/vendas\?/)
    const url = new URL(aux.url())
    const diaVenda = hojeBrt(new Date(va1.data_venda))
    confere(url.searchParams.get('q') === va1.chassi && url.searchParams.get('de') === diaVenda, 'link da venda abre /vendas?q=<chassi>&de=<dia>', url.search)
    await aux.waitForLoadState('networkidle')
    confere((await aux.locator('body').innerText()).includes(va1.chassi), 'Vendas mostra a venda da nota')
    await aux.context().close()

    console.log('\n▶ Celular')
    const cel = await entrar(navegador, USUARIO('aux.sul'), undefined, true)
    texto = await abrir(cel, '/notas-emitidas')
    confere(texto.includes(N('a1')), 'lista aparece no celular')
    await cel.screenshot({ path: `${PASTA}/celular-padrao.png`, fullPage: true })
    await cel.context().close()

    console.log('\n▶ Conta B')
    const auxB = await entrar(navegador, USUARIO('aux.vale'))
    texto = await abrir(auxB, '/notas-emitidas')
    confere(texto.includes(N('b1')), 'aux da Conta B vê a própria nota')
    confere(!daA.some(n => texto.includes(n)), 'Conta B não vê nenhuma nota da Conta A')
    texto = await abrir(auxB, '/notas-emitidas?status=todas&ambiente=Homologacao')
    confere(!daA.some(n => texto.includes(n)), 'nem em "ver todas" de homologação')
    await auxB.context().close()

    // Cookie apontando para o grupo da outra Conta (adulterado): cai no próprio grupo.
    const socioA = await entrar(navegador, USUARIO('socio.sul'), B.id)
    texto = await abrir(socioA, '/notas-emitidas')
    confere(!texto.includes(N('b1')), 'sócio da A com cookie do grupo da B não vê nota da B')
    await socioA.context().close()

    const geralB = await entrar(navegador, USUARIO('geral'), B.id)
    texto = await abrir(geralB, '/notas-emitidas')
    confere(texto.includes(N('b1')) && !daA.some(n => texto.includes(n)), 'admin_geral no grupo da B vê só a B')
    await geralB.context().close()
  } finally {
    await navegador.close()
    await limpar().catch(e => { falhas++; console.error('  ✗ LIMPEZA FALHOU, apague à mão as notas e2e-348-*:', e instanceof Error ? e.message : e) })
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s). Screenshots em ${PASTA}.` : `\nNotas Emitidas ok. Screenshots em ${PASTA}.`)
  process.exit(falhas ? 1 : 0)
}

main().catch(async e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
