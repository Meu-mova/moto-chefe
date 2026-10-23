/**
 * Teste de ponta a ponta da #347 (PR 2a e 2b-2) contra o staging, em duas partes.
 *
 * Parte 1, sem Nota Gateway: ao abrir "Emitir NF de saída" de uma venda cuja última
 * tentativa foi recusada, o diálogo abre na tela da recusa com os campos que o código
 * aponta (237 cliente, 778 moto, GW7324 só orientação, 301 só orientação, 302 a IE do
 * cliente), sem travessão e sem "Só salvar", no desktop e no celular.
 *
 * Parte 2, com a Nota Gateway REAL em HOMOLOGAÇÃO (Grupo Teste Sul): recusa se o
 * grupo não estiver em homologação. (a) Emite pela tela uma moto com NCM inexistente,
 * que a SEFAZ nega com número; corrige o NCM no diálogo e "Salvar e reenviar nº N" tem
 * de chegar a Autorizada com o MESMO número, sem o diálogo fechar. Também emite com CPF
 * de dígito errado, que a Nota Gateway barra antes da SEFAZ (sem número): o reenvio
 * corrigido, com o mesmo id, tem de autorizar.
 * (b) Denegada 302 semeada no banco (a SEFAZ de homologação não denega sob encomenda):
 * "Salvar e emitir a nova nota" tem de autorizar com id e número NOVOS. No fim cancela
 * as autorizadas na Nota Gateway. Log sem token em ~/Development/work/moto-chefe/ng-reenvio-logs/.
 *
 *   E2E_URL=http://localhost:3349 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-nf-reenvio.ts [--ver] [--so-parte-1]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SEED_SENHA e
 * CERT_MASTER_KEY (abre a credencial da Nota Gateway do grupo). Grava vendas, motos e
 * NFs sintéticas marcadas com E2E347R e apaga tudo no fim (contagem antes do delete).
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { chromium, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { cancelarNfe, configNotaGateway, consultarNfe } from '@/lib/notagateway/client'
import { STATUS_MORTOS } from '@/lib/notagateway/status'
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
const MARCA = 'E2E347R'
const PASTA = '/tmp/e2e-347-pr2'
const LOGS = `${homedir()}/Development/work/moto-chefe/ng-reenvio-logs`
const LOG = `${LOGS}/${new Date().toISOString().replace(/[:.]/g, '-')}.log`
const SO_PARTE_1 = process.argv.includes('--so-parte-1')

/** Log da parte 2: status, números e motivos. A credencial nunca entra. */
async function registrar(evento: string, dados: unknown = {}) {
  const linha = `${new Date().toISOString()} ${evento} ${JSON.stringify(dados)}\n`
  process.stdout.write(`    · ${evento}\n`)
  await appendFile(LOG, linha)
}

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

type Ctx = { lojaId: string; grupoId: string; auxId: string; modeloId: string; ambiente: string }
type Caso = { sufixo: string; motivo: string; numero: string; documento: string; venda?: { id: string; numero: number; chassi: string; motoId: string } }

const CPF = '529.982.247-25'
const CNPJ = '11.222.333/0001-81'
const CASOS: Caso[] = [
  { sufixo: 'C', motivo: '237 - Rejeição: CPF do destinatário inválido', numero: '9347101', documento: CPF },
  { sufixo: 'M', motivo: '778 - Rejeição: Informado NCM inexistente', numero: '9347104', documento: CPF },
  { sufixo: 'G', motivo: 'Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.', numero: '9347105', documento: CPF },
  { sufixo: 'E', motivo: '301 - Uso Denegado: Irregularidade fiscal do emitente', numero: '9347102', documento: CPF },
  { sufixo: 'D', motivo: '302 - Uso Denegado: Irregularidade fiscal do destinatário', numero: '9347103', documento: CNPJ },
]

async function semear(c: Ctx, caso: Caso) {
  const chassi = `${MARCA}${caso.sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  // Efetivado, como o pedido de uma venda de verdade: pendente apareceria em "Pedidos Pendentes".
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}, 'efetivado') returning id`)) as { id: string }[]
  await execRows(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod) values (${moto.id}, ${MARCA}, '87116000', ${'MOTO ' + MARCA})`)
  // NF liberada sem contrato: senão o diálogo para na trava da assinatura.
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, nf_liberada_em)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, ${caso.documento}, 1000, 'pix', now()) returning id, numero`)) as { id: string; numero: number }[]
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, payload)
    values (${venda.id}, ${venda.numero}, ${c.grupoId}, ${`${MARCA}-${caso.sufixo}-${venda.numero}`}, ${c.ambiente}, 'Negada', ${caso.motivo}, ${caso.numero}, '{}'::jsonb)`)
  caso.venda = { id: venda.id, numero: venda.numero, chassi, motoId: moto.id }
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

/**
 * Abre "Emitir NF de saída" pela busca de chassi. Desktop: "Abrir venda #N" abre o
 * painel lateral. Celular: o cartão da venda ("#N · data …") abre a gaveta.
 */
async function abrirNf(pagina: Page, v: { numero: number; chassi: string }, celular: boolean) {
  await pagina.goto(`${base}/vendas?q=${v.chassi}`, { waitUntil: 'networkidle' })
  if (celular) {
    await pagina.getByRole('button', { name: new RegExp(`^#${v.numero} · `) }).click()
    await pagina.getByRole('dialog').getByRole('button', { name: 'Emitir NF de saída' }).click()
  } else {
    await pagina.getByRole('button', { name: `Abrir venda #${v.numero}`, exact: true }).locator('visible=true').click()
    await pagina.getByRole('complementary', { name: `Venda #${v.numero}`, exact: true }).getByRole('button', { name: 'Emitir NF de saída' }).click()
  }
}

async function telaDoCaso(pagina: Page, caso: Caso, tela: string) {
  await abrirNf(pagina, caso.venda!, tela === 'celular')
  const dialogo = pagina.getByRole('dialog').filter({ hasText: 'Por quê?' })
  const ve = (texto: string | RegExp) => dialogo.getByText(texto).first().waitFor({ timeout: 30_000 }).then(() => true, () => false)
  const botao = (nome: string | RegExp) => dialogo.getByRole('button', { name: nome })
  const n = caso.numero
  const cod = caso.sufixo
  confere(await ve(`Nota nº ${n} · venda nº ${caso.venda!.numero}`), `${tela} ${cod}: número da nota e da venda`)
  confere(!(await dialogo.innerText()).includes('—'), `${tela} ${cod}: sem travessão`)

  if (cod === 'C' || cod === 'M') {
    confere(await ve('A SEFAZ recusou esta nota'), `${tela} ${cod}: título da recusa`)
    confere(await ve('Corrigir aqui'), `${tela} ${cod}: grupo apontado marcado`)
    const campo = cod === 'C' ? 'CPF ou CNPJ' : 'NCM'
    confere(await dialogo.getByLabel(campo, { exact: true }).isVisible(), `${tela} ${cod}: campo ${campo} aberto`)
    confere(await botao(`Salvar e reenviar nº ${n}`).count() === 1, `${tela} ${cod}: "Salvar e reenviar nº ${n}"`)

  } else if (cod === 'G') {
    confere(await ve('O CFOP do produto está num formato que a nota não aceita.'), `${tela} ${cod}: "Por quê?" em linguagem de loja`)
    confere(await ve('Peça a um Admin Geral ou Sócio para corrigir.'), `${tela} ${cod}: aux_adm é orientado a pedir ao Admin`)
    confere(await dialogo.getByRole('textbox').count() === 0, `${tela} ${cod}: sem campos`)
    confere(await botao(`Reenviar nº ${n}`).count() === 1, `${tela} ${cod}: "Reenviar nº ${n}"`)
  } else {
    confere(await ve('A SEFAZ bloqueou esta nota'), `${tela} ${cod}: título da bloqueada`)
    confere(await ve('Fica bloqueado e não volta.'), `${tela} ${cod}: o número não volta`)
    confere(await botao(new RegExp(`Reenviar nº ${n}`)).count() === 0, `${tela} ${cod}: sem reenviar o mesmo número`)
    if (cod === 'D') {
      confere(await ve('O cliente tem Inscrição Estadual?'), `${tela} ${cod}: pergunta da IE`)
      confere(await botao('Salvar e emitir a nova nota').count() === 1, `${tela} ${cod}: "Salvar e emitir a nova nota"`)
    } else {
      confere(await ve('Consulte a Inscrição Estadual da empresa no SINTEGRA.'), `${tela} ${cod}: orientação da IE da empresa`)
      confere(await dialogo.getByRole('textbox').count() === 0, `${tela} ${cod}: sem campos`)
    }
  }
  confere(await botao('Só salvar').count() === 0, `${tela} ${cod}: sem "Só salvar"`)
  // O X do cabeçalho também se chama "Fechar" (aria-label), mas não tem texto: este é o do conteúdo.
  confere(await botao('Fechar').filter({ hasText: /^Fechar$/ }).count() === 1, `${tela} ${cod}: "Fechar"`)
  await pagina.screenshot({ path: `${PASTA}/${tela}-${cod}.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })

}

// ── Parte 2: Nota Gateway real em homologação ─────────────────────────────────

/** O diálogo "NF de saída": no celular a gaveta da venda também é um dialog. */
const dialogoNf = (pagina: Page) =>
  pagina.getByRole('dialog').filter({ has: pagina.getByText('NF de saída', { exact: true }) })

type VendaReal = { id: string; numero: number; chassi: string; motoId: string }

/** Venda que a SEFAZ de homologação aceitaria: endereço completo, pagamento e ficha fiscal. */
async function semearVendaReal(c: Ctx, sufixo: string, documento: string, ncm?: string): Promise<VendaReal> {
  const chassi = `${MARCA}${sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}, 'efetivado') returning id`)) as { id: string }[]
  // Ficha copiada de uma moto do staging com CEST: sem ele a SEFAZ recusa a saída com ICMS-ST.
  const [ref] = (await execRows(sql`select ncm, cest, origem, unidade from motos_fiscal where cest is not null and emitente_cnpj <> ${MARCA} order by moto_id limit 1`)) as
    { ncm: string; cest: string; origem: string | null; unidade: string | null }[]
  await execRows(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, cest, origem, unidade, x_prod)
    values (${moto.id}, ${MARCA}, ${ncm ?? ref?.ncm ?? '87116000'}, ${ref?.cest ?? null}, ${ref?.origem ?? '0'}, ${ref?.unidade ?? 'UN'}, ${'MOTO ELETRICA ' + MARCA})`)
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      cliente_cep, cliente_logradouro, cliente_numero, cliente_bairro, cliente_cidade, cliente_estado, valor, forma_pagamento, pagamentos, nf_liberada_em)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, ${documento},
      '37500-000', 'Rua Coronel Rennó', '100', 'Centro', 'Itajubá', 'MG', 1000, 'pix', ${JSON.stringify([{ tipo: 'pix', valor: 1000 }])}::jsonb, now())
    returning id, numero`)) as { id: string; numero: number }[]
  return { id: venda.id, numero: venda.numero, chassi, motoId: moto.id }
}

type LinhaNota = { id: string; id_externo: string; status: string; numero: string | null; motivo_status: string | null }
const notasDaVenda = async (vendaId: string) =>
  (await execRows(sql`select id, id_externo, status, numero, motivo_status from notas_fiscais_saida where venda_id = ${vendaId} order by criado_em`)) as LinhaNota[]

/** Espera a tela de resultado: autorizada, recusada ou bloqueada. Consulta de novo se a SEFAZ demorar. */
async function esperarResultado(pagina: Page): Promise<'autorizada' | 'recusa' | 'tempo'> {
  const dialogo = dialogoNf(pagina)
  for (let i = 0; i < 40; i++) {
    if (await dialogo.getByText(/NF-e .* autorizada/).count()) return 'autorizada'
    if (await dialogo.getByText('Por quê?').count()) return 'recusa'
    const consultar = dialogo.getByRole('button', { name: 'Consultar agora' })
    if (await consultar.count() && await consultar.isEnabled()) await consultar.click()
    await pagina.waitForTimeout(5_000)
  }
  return 'tempo'
}

const NCM_BOM = async () =>
  ((await execRows(sql`select ncm from motos_fiscal where cest is not null and emitente_cnpj <> ${MARCA} order by moto_id limit 1`)) as { ncm: string }[])[0]?.ncm ?? '87116000'

/**
 * Recusa real, corrige no diálogo e reenvia com o mesmo id.
 * - 'ncm': NCM inexistente passa pela Nota Gateway e a SEFAZ nega com número; o
 *   reenvio tem de sair com o MESMO número.
 * - 'cpf': CPF de dígito errado a Nota Gateway barra antes da SEFAZ (4xx, sem
 *   número); o reenvio com o mesmo id tem de autorizar.
 */
async function reenvioMesmoId(pagina: Page, c: Ctx, caso: 'ncm' | 'cpf') {
  const ncm = caso === 'ncm'
  console.log(`\n▶ Parte 2a (${caso}): recusa real, corrige e reenvia com o mesmo id`)
  const v = ncm ? await semearVendaReal(c, 'S', CPF, '99999999') : await semearVendaReal(c, 'R', '529.982.247-26')
  await registrar(`2a-${caso}.venda`, { numero: v.numero })
  await abrirNf(pagina, v, false)
  const dialogo = dialogoNf(pagina)
  await dialogo.getByRole('checkbox').first().check()
  await dialogo.getByRole('button', { name: /Transmitir teste/ }).click()
  const primeiro = await esperarResultado(pagina)
  const [n1] = await notasDaVenda(v.id)
  await registrar(`2a-${caso}.primeiro_envio`, { tela: primeiro, nota: n1 })
  confere(primeiro === 'recusa' && n1?.status === 'Negada', `${caso}: a primeira nota foi recusada`, JSON.stringify(n1))
  if (primeiro !== 'recusa') return
  if (ncm) confere(!!n1.numero, 'ncm: a SEFAZ negou com número', `motivo: ${n1.motivo_status}`)
  else confere(!n1.numero, 'cpf: a Nota Gateway barrou antes da SEFAZ, sem número', JSON.stringify(n1))

  if (ncm) await dialogo.getByLabel('NCM', { exact: true }).fill(await NCM_BOM())
  else await dialogo.getByLabel('CPF ou CNPJ', { exact: true }).fill(CPF)
  await dialogo.getByRole('button', { name: /^Salvar e reenviar/ }).click()
  const segundo = await esperarResultado(pagina)
  const notas = await notasDaVenda(v.id)
  await registrar(`2a-${caso}.reenvio`, { tela: segundo, notas })
  confere(await dialogoNf(pagina).isVisible(), `${caso}: o diálogo não fechou sozinho depois do reenvio`)
  confere(segundo === 'autorizada', `${caso}: o reenvio foi autorizado`, segundo)
  confere(notas.length === 1 && notas[0].id_externo === n1.id_externo, `${caso}: mesma linha e mesmo id`, JSON.stringify(notas))
  if (ncm) confere(notas[0]?.status === 'Autorizada' && notas[0].numero === n1.numero, `ncm: mesmo número (${n1.numero})`, JSON.stringify(notas[0]))
  await pagina.screenshot({ path: `${PASTA}/ng-2a-${caso}-autorizada.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })
}

async function denegadaNumeroNovo(pagina: Page, c: Ctx) {
  console.log('\n▶ Parte 2b: denegada 302 (semeada), corrige a IE e emite com número novo')
  const v = await semearVendaReal(c, 'N', CNPJ)
  // A SEFAZ de homologação não denega sob encomenda: a 302 nasce no banco, com o id
  // da 1ª tentativa, que nunca existiu na Nota Gateway.
  const idDenegada = `mova-homolog-${v.numero}-1`
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, payload)
    values (${v.id}, ${v.numero}, ${c.grupoId}, ${idDenegada}, ${c.ambiente}, 'Negada', '302 - Uso Denegado: Irregularidade fiscal do destinatário', '999999', '{}'::jsonb)`)
  await registrar('2b.venda', { numero: v.numero, idDenegada })
  await abrirNf(pagina, v, false)
  const dialogo = dialogoNf(pagina)
  // O rádio fica dentro do <label>: o nome acessível é o rótulo com a dica ("Não tem Cliente consumidor final").
  await dialogo.getByRole('radio', { name: /^Não tem/ }).check()
  await dialogo.getByRole('button', { name: 'Salvar e emitir a nova nota' }).click()
  const r = await esperarResultado(pagina)
  const notas = await notasDaVenda(v.id)
  await registrar('2b.emissao', { tela: r, notas })
  confere(await dialogoNf(pagina).isVisible(), 'o diálogo não fechou sozinho depois de emitir')
  confere(r === 'autorizada', 'a nova nota foi autorizada', r)
  const nova = notas.find(n => n.id_externo !== idDenegada)
  confere(!!nova && nova.status === 'Autorizada' && nova.numero !== '999999', 'nova nota com id e número novos', JSON.stringify(notas))
  confere(notas.find(n => n.id_externo === idDenegada)?.status === 'Negada', 'a denegada ficou como estava')
  await pagina.screenshot({ path: `${PASTA}/ng-2b-autorizada.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })
}

/**
 * Cancela na Nota Gateway (homologação) as notas autorizadas do teste e marca a linha
 * como Cancelada. A limpeza só apaga nota morta (STATUS_MORTOS): a viva na Nota Gateway
 * (autorizada sem cancelar, em envio ou em cancelamento) fica no banco em vez de órfã.
 */
async function cancelarAutorizadas(c: Ctx): Promise<string[]> {
  const naoCanceladas: string[] = []
  const cfg = await configNotaGateway(c.grupoId)
  if (!cfg || cfg.ambiente !== 'Homologacao') return naoCanceladas
  const autorizadas = (await execRows(sql`select n.id_externo from notas_fiscais_saida n join vendas v on v.id = n.venda_id
    join motos m on m.id = v.moto_id where m.chassi like ${MARCA + '%'} and n.status = 'Autorizada'`)) as { id_externo: string }[]
  for (const { id_externo } of autorizadas) {
    try {
      await cancelarNfe(cfg, id_externo)
      let status = ''
      for (let i = 0; i < 12 && status !== 'Cancelada'; i++) {
        await new Promise(r => setTimeout(r, 5_000))
        status = (await consultarNfe(cfg, id_externo))?.status ?? 'sem retorno'
      }
      await registrar('cancelamento', { idExterno: id_externo, status })
      confere(status === 'Cancelada', `nota ${id_externo} cancelada na Nota Gateway`, status)
      if (status === 'Cancelada') await execRows(sql`update notas_fiscais_saida set status = 'Cancelada' where id_externo = ${id_externo}`)
      else naoCanceladas.push(id_externo)
    } catch (e) {
      naoCanceladas.push(id_externo)
      await registrar('cancelamento.falha', { idExterno: id_externo, erro: (e as Error).message })
      confere(false, `cancelar ${id_externo}`, (e as Error).message)
    }
  }
  return naoCanceladas
}

async function limpar() {
  const motos = sql`(select id from motos where chassi like ${MARCA + '%'})`
  const notas = sql`(select id from notas_fiscais_saida
    where (id_externo like ${MARCA + '-%'} or venda_id in (select id from vendas where moto_id in ${motos}))
      and status in ${STATUS_MORTOS})`
  const contagem = (await execRows(sql`select
    (select count(*) from notas_fiscais_saida where id in ${notas})::int as notas,
    (select count(*) from motos_fiscal where moto_id in ${motos})::int as fichas,
    (select count(*) from vendas where moto_id in ${motos})::int as vendas,
    (select count(*) from pedidos_venda where moto_id in ${motos})::int as pedidos,
    (select count(*) from historico_estoque where moto_id in ${motos})::int as historico,
    (select count(*) from motos where id in ${motos})::int as motos`))[0]
  console.log(`\n▶ Limpeza (marcados ${MARCA}): ${JSON.stringify(contagem)}`)
  await db.transaction(async tx => {
    await tx.execute(sql`delete from notas_fiscais_saida where id in ${notas}`)
    await tx.execute(sql`delete from vendas where moto_id in ${motos}`)
    await tx.execute(sql`delete from pedidos_venda where moto_id in ${motos}`)
    await tx.execute(sql`delete from historico_estoque where moto_id in ${motos}`)
    await tx.execute(sql`delete from motos_fiscal where moto_id in ${motos}`)
    await tx.execute(sql`delete from motos where id in ${motos}`)
  })
}

async function main() {
  const [aux] = (await execRows(sql`select u.id, u.loja_id, l.grupo_id from usuarios u join lojas l on l.id = u.loja_id where u.email = ${AUX}`)) as
    { id: string; loja_id: string; grupo_id: string }[]
  const [modelo] = (await execRows(sql`select id from modelos order by id limit 1`)) as { id: string }[]
  if (!aux || !modelo) throw new Error(`staging sem ${AUX} ou sem modelo`)
  const [cfg] = (await execRows(sql`select ambiente from notagateway_config where grupo_id = ${aux.grupo_id}`)) as { ambiente: string }[]
  if (!cfg) throw new Error('o grupo do aux.sul não tem a Nota Gateway configurada no staging')
  if (cfg.ambiente === 'Producao') throw new Error('o grupo do aux.sul está em produção na Nota Gateway: recuso')
  const c: Ctx = { lojaId: aux.loja_id, grupoId: aux.grupo_id, auxId: aux.id, modeloId: modelo.id, ambiente: cfg.ambiente }

  await mkdir(PASTA, { recursive: true })
  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    for (const caso of CASOS) await semear(c, caso)
    const telas = [
      { nome: 'desktop', opcoes: { viewport: { width: 1440, height: 900 } } },
      { nome: 'celular', opcoes: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ]
    for (const t of telas) {
      console.log(`\n▶ ${t.nome}`)
      const pagina = await (await navegador.newContext({ locale: 'pt-BR', ...t.opcoes })).newPage()
      await entrar(pagina)
      for (const caso of CASOS) await telaDoCaso(pagina, caso, t.nome)
    }

    if (!SO_PARTE_1) {
      if (c.ambiente !== 'Homologacao') throw new Error('Parte 2 recusada: o grupo do aux.sul não está em homologação na Nota Gateway')
      await mkdir(LOGS, { recursive: true })
      await registrar('inicio', { grupoId: c.grupoId, ambiente: c.ambiente })
      const pagina = await (await navegador.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })).newPage()
      await entrar(pagina)
      await reenvioMesmoId(pagina, c, 'ncm')
      await reenvioMesmoId(pagina, c, 'cpf')
      await denegadaNumeroNovo(pagina, c)
      console.log(`\n  Log: ${LOG}`)
    }
  } catch (e) {
    falhas++
    console.error(e instanceof Error ? e.message : e)
    const pagina = navegador.contexts().at(-1)?.pages()[0]
    if (pagina) {
      const arquivo = `${PASTA}/falha-${Date.now()}.png`
      await pagina.screenshot({ path: arquivo, fullPage: true, animations: 'disabled', timeout: 60_000 }).then(() => console.error(`Tela no momento: ${arquivo}`), () => null)
    }
  } finally {
    await navegador.close()
    const manter = SO_PARTE_1 ? [] : await cancelarAutorizadas(c).catch(e => { falhas++; console.error(`Cancelamento falhou: ${(e as Error).message}`); return [] as string[] })
    if (manter.length) console.error(`Notas mantidas no banco (não cancelaram na Nota Gateway): ${manter.join(', ')}`)
    await limpar().catch(e => { falhas++; console.error(`Limpeza falhou: ${(e as Error).message}`) })
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nOk.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
