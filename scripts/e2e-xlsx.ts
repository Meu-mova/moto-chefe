/**
 * Teste de ponta a ponta da #351 contra o staging: com o xlsx da distribuição oficial do
 * SheetJS, o relatório de contabilidade baixa uma pasta legível e as telas de Entrada e de
 * Histórico de Veículos leem planilha e mostram a pré-visualização. Não confirma nenhuma
 * importação: nada é gravado.
 *
 *   E2E_URL=http://localhost:3351 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-xlsx.ts [--ver]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Recusa fora do staging. --ver abre o navegador visível e devagar.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import * as XLSX from 'xlsx'
import { sql } from 'drizzle-orm'
import { execRows } from '@/lib/db'
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
const ADMIN = `geral@${DOMINIO_TESTE}`
const MARCA = 'E2E351'
const DIR = '/tmp/e2e-351'

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

async function entrar(pagina: Page) {
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', ADMIN)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
}

/** Planilha sintética gerada com a própria lib, com o cabeçalho que cada tela espera. */
async function planilha(nome: string, cabecalho: string[], linhas: string[][]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]), 'Planilha1')
  const arquivo = `${DIR}/${nome}`
  await writeFile(arquivo, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  return arquivo
}

async function contarMarcados() {
  const [r] = (await execRows(sql`select
    (select count(*) from motos where chassi like ${MARCA + '%'})::int as motos,
    (select count(*) from veiculos_historico where chassi like ${MARCA + '%'})::int as historico`)) as
    { motos: number; historico: number }[]
  return r
}

async function main() {
  await mkdir(DIR, { recursive: true })
  const antes = await contarMarcados()
  const chassis = [`${MARCA}A${Date.now().toString(36).toUpperCase()}`, `${MARCA}B${Date.now().toString(36).toUpperCase()}`]

  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    const contexto = await navegador.newContext({ locale: 'pt-BR', acceptDownloads: true })
    const pagina = await contexto.newPage()
    await entrar(pagina)

    console.log('\n▶ Relatório de contabilidade (.xlsx)')
    const mes = new Date().toISOString().slice(0, 7)
    const res = await pagina.request.get(`${base}/api/relatorios/contabilidade?de=${mes}&ate=${mes}`)
    confere(res.status() === 200, 'a rota responde 200', String(res.status()))
    confere((res.headers()['content-type'] ?? '').includes('spreadsheetml'), 'Content-Type de xlsx')
    const wb = XLSX.read(await res.body(), { type: 'buffer' })
    const abas = ['Resumo', 'Despesas', 'Vendas de motos', 'Serviços (OS)', 'Peças (balcão)']
    confere(abas.every(a => wb.SheetNames.includes(a)), 'tem as cinco abas', wb.SheetNames.join(', '))
    const cabecalho = (aba: string) => (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[aba], { header: 1 })[0] ?? []) as string[]
    const esperado: Record<string, string[]> = {
      'Despesas': ['competencia', 'data', 'origem', 'banco', 'favorecido', 'descricao', 'categoria', 'loja', 'valor', 'entraNoResultado', 'motivo'],
      'Vendas de motos': ['competencia', 'data', 'numero', 'notaFiscal', 'loja', 'vendedor', 'cliente', 'modelo', 'chassi', 'valorBruto', 'taxas', 'valorLiquido', 'formaPagamento', 'origem'],
      'Serviços (OS)': ['competencia', 'data', 'numero', 'loja', 'cliente', 'maoDeObra', 'pecas', 'total', 'formaPagamento'],
      'Peças (balcão)': ['competencia', 'data', 'numero', 'loja', 'cliente', 'total', 'formaPagamento'],
    }
    for (const [aba, cols] of Object.entries(esperado)) {
      const lido = wb.Sheets[aba] ? cabecalho(aba) : []
      confere(JSON.stringify(lido) === JSON.stringify(cols), `colunas da aba ${aba}`, lido.join(','))
    }

    console.log('\n▶ Entrada: planilha na pré-visualização, sem registrar')
    const arqEntrada = await planilha('entrada.xlsx', ['CHASSI', 'COR', 'MOTOR', 'MODELO', 'NF ENTRADA'],
      chassis.map((c, i) => [c, 'CINZA', `MOT${i}`, `MODELO ${MARCA}`, '351']))
    await pagina.goto(`${base}/entrada`, { waitUntil: 'networkidle' })
    await pagina.locator('input[type="file"][accept=".xlsx,.xls"]').setInputFiles(arqEntrada)
    const leuEntrada = await pagina.getByText('2 moto(s) importada(s) da planilha').waitFor({ timeout: 15_000 }).then(() => true, () => false)
    confere(leuEntrada, 'avisa que leu as 2 motos')
    for (const c of chassis) {
      const viu = await pagina.getByRole('cell', { name: c, exact: true }).waitFor({ timeout: 15_000 }).then(() => true, () => false)
      confere(viu, `linha ${c} na tabela`)
    }

    console.log('\n▶ Histórico de veículos: planilha na pré-visualização, sem importar')
    const arqHist = await planilha('historico.xlsx', ['Chassi', 'Motor', 'Marca', 'Modelo', 'Cor', 'Ano'],
      chassis.map((c, i) => [c, `MOT${i}`, 'MOTOCHEFE', `MODELO ${MARCA}`, 'CINZA', '2026']))
    await pagina.goto(`${base}/admin/veiculos-historico`, { waitUntil: 'networkidle' })
    await pagina.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles(arqHist)
    for (const c of chassis) {
      const viu = await pagina.getByRole('cell', { name: c, exact: true }).waitFor({ timeout: 15_000 }).then(() => true, () => false)
      confere(viu, `linha ${c} na tabela`)
    }
  } catch (e) {
    falhas++
    console.error(e instanceof Error ? e.message : e)
    const pagina = navegador.contexts()[0]?.pages()[0]
    if (pagina) {
      const arquivo = `${DIR}/falha-${Date.now()}.png`
      await pagina.screenshot({ path: arquivo, fullPage: true }).then(() => console.error(`Tela no momento: ${arquivo}`), () => null)
    }
  } finally {
    await navegador.close()
    // Nenhum passo confirma gravação; a contagem prova que a pré-visualização não gravou.
    const depois = await contarMarcados().catch(() => null)
    confere(JSON.stringify(depois) === JSON.stringify(antes), 'nada marcado E2E351 gravado no staging', JSON.stringify(depois))
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nOk.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
