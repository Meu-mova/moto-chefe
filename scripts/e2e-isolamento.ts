/**
 * Teste de ponta a ponta do isolamento entre grupos (#193, #194) contra o staging:
 * usuários de um grupo sem nenhum registro próprio tentam abrir, pelo endereço, moto,
 * OS, impressões (venda, reserva, OS) e compradores de outro grupo/Conta, e procuram nomes de outros
 * grupos no dashboard.
 *
 * "Não abre" = a resposta é igual à de um id inexistente (status e texto). Com o
 * loading.tsx o Next já mandou o 200 quando o notFound() roda, então o status sozinho
 * não serve de prova.
 *
 *   E2E_URL=<localhost, preview ou https://dev.meumova.com> \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-isolamento.ts
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Recusa a produção. Só lê: não grava nada no banco.
 *
 * Depende do "Grupo Teste Cliente Novo" (socio.novo@, vendedor.novo@) e de
 * geral@teste.meumova.com, o controle que precisa continuar abrindo tudo.
 */
import { chromium, type Browser, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { motivoRecusa } from './lib/e2e-mensalidade'

const base = process.env.E2E_URL?.replace(/\/$/, '') ?? ''
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
if (recusa || !process.env.SEED_SENHA) {
  console.error(recusa ? `Recusado: ${recusa}` : 'Falta no env: SEED_SENHA')
  process.exit(1)
}

const GRUPO = 'Grupo Teste Cliente Novo'
const SOCIO = 'socio.novo@teste.meumova.com'
const VENDEDOR = 'vendedor.novo@teste.meumova.com'
const GERAL = 'geral@teste.meumova.com'
const INEXISTENTE = '00000000-0000-0000-0000-000000000000'

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

async function entrar(navegador: Browser, email: string): Promise<Page> {
  const pagina = await (await navegador.newContext({ locale: 'pt-BR' })).newPage()
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', email)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
  return pagina
}

async function abrir(pagina: Page, caminho: string) {
  const resposta = await pagina.goto(`${base}${caminho}`, { waitUntil: 'networkidle' })
  return { status: resposta?.status() ?? 0, texto: await pagina.locator('body').innerText() }
}

async function main() {
  const [grupo] = (await execRows(sql`select id from grupos where nome = ${GRUPO}`)) as { id: string }[]
  if (!grupo) throw new Error(`"${GRUPO}" não existe no staging`)
  const deFora = sql`(select id from lojas where grupo_id <> ${grupo.id})`
  const [moto] = (await execRows(sql`select id, chassi from motos where loja_id in ${deFora} and chassi is not null limit 1`)) as { id: string; chassi: string }[]
  const [os] = (await execRows(sql`select id from ordens_servico where loja_id in ${deFora} limit 1`)) as { id: string }[]
  const [venda] = (await execRows(sql`select id from vendas where loja_id in ${deFora} limit 1`)) as { id: string }[]
  const [reserva] = (await execRows(sql`select id from reservas where loja_id in ${deFora} limit 1`)) as { id: string }[]
  const [grupoNovo] = (await execRows(sql`select conta_id from grupos where id = ${grupo.id}`)) as { conta_id: string }[]
  const clientesDeFora = (await execRows(sql`select id, nome from clientes where conta_id <> ${grupoNovo.conta_id} order by nome`)) as { id: string; nome: string }[]
  // Nomes que só existem em outros grupos: aparecer na tela é vazamento.
  const marcas = ((await execRows(sql`
    select nome from lojas where grupo_id <> ${grupo.id}
    union select nome from usuarios where loja_id in ${deFora} and (papel = 'vendedor' or 'vendedor' = any(papeis_extras) or papel = 'mecanico')
  `)) as { nome: string }[]).map(r => r.nome).filter(n => n.length >= 6)
  if (!moto || !os || !venda || !reserva || !clientesDeFora.length || !marcas.length) throw new Error('staging sem moto, OS, venda, reserva, comprador ou usuários de outro grupo/Conta para testar')
  const vazou = (texto: string) => [...marcas, moto.chassi].filter(m => texto.includes(m))

  const navegador = await chromium.launch()
  try {
    console.log('\n▶ Controle: admin_geral abre moto, OS e impressão de qualquer grupo')
    const geral = await entrar(navegador, GERAL)
    // Controle: a resposta tem de DIFERIR da de id inexistente; status 200 sozinho não prova
    // nada (o não encontrado também sai com 200).
    for (const [rotulo, rota, id] of [
      ['moto', '/estoque', moto.id], ['OS', '/ordens-servico', os.id], ['impressão da venda', '/vendas', `${venda.id}/checklist-entrega`],
    ] as const) {
      const aberto = await abrir(geral, `${rota}/${id}`)
      const inexistente = await abrir(geral, `${rota}/${id.replace(/^[^/]+/, INEXISTENTE)}`)
      confere(aberto.texto !== inexistente.texto, `admin_geral abre a ${rotulo}`)
    }
    confere((await abrir(geral, `/estoque/${moto.id}`)).texto.includes(moto.chassi), 'admin_geral vê o chassi da moto')

    for (const [papel, email, veOs] of [['admin_socio', SOCIO, true], ['vendedor', VENDEDOR, false]] as const) {
      console.log(`\n▶ ${papel} do grupo novo`)
      const p = await entrar(navegador, email)
      for (const [rotulo, rota, id] of [['moto', '/estoque', moto.id], ['OS', '/ordens-servico', os.id]] as const) {
        if (rotulo === 'OS' && !veOs) continue
        const deOutro = await abrir(p, `${rota}/${id}`)
        const inexistente = await abrir(p, `${rota}/${INEXISTENTE}`)
        confere(
          deOutro.status === inexistente.status && deOutro.texto === inexistente.texto && !vazou(deOutro.texto).length,
          `${rotulo} de outro grupo responde igual a id inexistente`,
          `status ${deOutro.status}/${inexistente.status}; ${vazou(deOutro.texto).slice(0, 3).join(', ') || 'texto diferente'}`,
        )
      }
      const impressoes = [
        ['impressão da venda', '/vendas', venda.id, '/checklist-entrega'],
        ['impressão da reserva', '/reservas', reserva.id, '/imprimir'],
        ...(veOs ? [['impressão da OS', '/ordens-servico', os.id, '/imprimir'] as const] : []),
      ] as const
      for (const [rotulo, rota, id, sufixo] of impressoes) {
        const deOutro = await abrir(p, `${rota}/${id}${sufixo}`)
        const inexistente = await abrir(p, `${rota}/${INEXISTENTE}${sufixo}`)
        confere(
          deOutro.status === inexistente.status && deOutro.texto === inexistente.texto && !vazou(deOutro.texto).length,
          `${rotulo} de outro grupo responde igual a id inexistente`,
          `status ${deOutro.status}/${inexistente.status}; ${vazou(deOutro.texto).slice(0, 3).join(', ') || 'texto diferente'}`,
        )
      }
      // Os dois papéis do teste (sócio e vendedor) acessam /clientes.
      {
        const lista = await abrir(p, '/clientes')
        const nomes = clientesDeFora.map(c => c.nome).filter(n => n.length >= 6 && lista.texto.includes(n))
        confere(!nomes.length, '/clientes (1ª página) sem nome de comprador de outra Conta (nomes com 6+ letras)', nomes.slice(0, 3).join(', '))
        const ficha = await abrir(p, `/clientes/${clientesDeFora[0].id}`)
        const fichaInexistente = await abrir(p, `/clientes/${INEXISTENTE}`)
        confere(
          ficha.status === fichaInexistente.status && ficha.texto === fichaInexistente.texto,
          'ficha de um comprador de outra Conta responde igual a id inexistente',
          `status ${ficha.status}/${fichaInexistente.status}`,
        )
      }
      const d = await abrir(p, '/dashboard')
      confere(!vazou(d.texto).length, 'dashboard sem nomes de outros grupos', vazou(d.texto).slice(0, 3).join(', '))
    }
  } finally {
    await navegador.close()
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nIsolamento ok.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
