/**
 * Regressão fiscal após a #347 na Nota Gateway REAL, em HOMOLOGAÇÃO: emitir,
 * consultar até Autorizada, carta de correção, consultar a carta até Autorizada,
 * cancelar dentro das 24 h e consultar até Cancelada. Status esperado de cada passo
 * é asserção na coleção scripts/postman/nf-regressao-homologacao.postman_collection.json.
 * O payload sai do MESMO código do MOVA (montarNfeVendaMoto) com a regra de
 * regras_fiscais_saida do grupo; comprador e moto são sintéticos. Payload, token e
 * empresaId vão à coleção por um environment temporário (0600).
 *
 * Uso (só staging; credencial do "Grupo Teste Sul", que precisa estar em Homologacao):
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-regressao-homologacao.ts --dry-run
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-regressao-homologacao.ts
 *
 * A saída completa (com o corpo de cada requisição e resposta, sem headers nem token) vai
 * também para ~/Development/work/moto-chefe/ng-regressao-logs/<idTeste>.log (0600, fora do repo).
 *
 * Consome 1 número da série de homologação da empresa na NG e a cancela no fim. Requer o
 * Postman CLI (`npm install -g postman-cli`); não usa login nem POSTMAN_API_KEY.
 */
import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import postgres from 'postgres'
import { descreverAlvo, motivoRecusaForaDoStaging, rotuloAlvo } from './lib/alvo-banco'
import { decifrar } from '../src/lib/cripto'
import { montarNfeVendaMoto, type DadosVendaMoto, type RegraSaida } from '../src/lib/notagateway/payload'
import { formaPagamentoNfe } from '../src/lib/notagateway/venda'

const GRUPO = 'Grupo Teste Sul'
const COLECAO = resolve(process.cwd(), 'scripts/postman/nf-regressao-homologacao.postman_collection.json')
const dryRun = process.argv.includes('--dry-run')
const LOG_DIR = join(homedir(), 'Development/work/moto-chefe/ng-regressao-logs')

// Tudo o que vai à tela passa por aqui: antes do idTeste existir, as linhas ficam no buffer.
const logBuffer: string[] = []
let logFd: number | null = null
const segredos: string[] = []
const limparSegredos = (s: string) => segredos.reduce((acc, seg) => acc.split(seg).join('****'), s)
function gravarLog(texto: string) {
  const limpo = limparSegredos(texto)
  if (logFd === null) logBuffer.push(limpo)
  else writeSync(logFd, limpo)
}
function log(...partes: unknown[]) {
  const linha = partes.map(p => (typeof p === 'string' ? p : String(p))).join(' ')
  console.error(limparSegredos(linha))
  gravarLog(linha + '\n')
}
function abrirLog(idTeste: string): string {
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 })
  const caminho = join(LOG_DIR, `${idTeste}.log`)
  logFd = openSync(caminho, 'wx', 0o600)
  for (const l of logBuffer.splice(0)) writeSync(logFd, l)
  return caminho
}
// Repassa a saída do Postman por linha: o token nunca fica partido entre dois pedaços.
function repassar(origem: NodeJS.ReadableStream, destino: NodeJS.WriteStream) {
  let resto = ''
  origem.setEncoding('utf8')
  origem.on('data', (pedaco: string) => {
    const linhas = (resto + pedaco).split('\n')
    resto = linhas.pop() ?? ''
    for (const l of linhas) { destino.write(limparSegredos(l) + '\n'); gravarLog(l + '\n') }
  })
  origem.on('end', () => { if (resto) { destino.write(limparSegredos(resto) + '\n'); gravarLog(resto + '\n') } })
}

const mascarar = (s: string) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`)
// Comprador e moto sintéticos.
const NCM_MOTO = '87116000'
// Dry-run não chama a NG; a UF real do emitente só se lê no envio de verdade.
const UF_EMITENTE_DRY_RUN = 'MG'
// Texto da carta: entre 15 e 1000 caracteres (carta-correcao.ts).
const TEXTO_CARTA = 'Teste de regressao 347: correcao da cor do veiculo para CINZA. Sem valor fiscal.'

type Regra = { [K in keyof RegraSaida]: RegraSaida[K] }
const numOuNulo = (v: string | null) => (v === null ? null : String(Number(v)))

function dadosSinteticos(idExterno: string, ufEmitente: string): DadosVendaMoto {
  const valor = 9990
  return {
    idExterno,
    ambiente: 'Homologacao',
    ufEmitente,
    cliente: {
      tipoPessoa: 'F',
      // Homologação: a SEFAZ exige este nome no destinatário.
      nome: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
      cpfCnpj: '352.817.650-43',
      indicadorIe: 'nao_contribuinte',
      endereco: { uf: 'MG', cidade: 'Pouso Alegre', logradouro: 'Rua Teste Sintetico', numero: '100', bairro: 'Centro', cep: '37550-000' },
    },
    moto: { xProd: 'MOTO ELETRICA TESTE REGRESSAO 2000W', codigo: 'TESTE-REGRESSAO', ncm: NCM_MOTO, cest: '2600100', unidade: 'UN', origem: '0' },
    valor,
    pagamentos: [{ tipo: 'pix', valor }].map(formaPagamentoNfe),
    informacoesAdicionais: 'Teste de regressão fiscal (#347). Sem valor fiscal.',
  }
}

function payloads(idTeste: string, ufEmitente: string, regra: Regra) {
  const base = montarNfeVendaMoto(dadosSinteticos(`${idTeste}-n`, ufEmitente), regra)
  const variantes = { payloadNota: JSON.stringify(base), textoCarta: TEXTO_CARTA }
  if (!variantes.payloadNota.includes('"ambienteEmissao":"Homologacao"') || variantes.payloadNota.includes('Producao')) {
    throw new Error('payloadNota fora de Homologacao')
  }
  return { base, variantes }
}

async function ufDoEmitente(token: string, empresaId: string): Promise<string> {
  // Mesma leitura do ufDaEmpresa (src/lib/notagateway/client.ts), sem importar o pool do banco.
  const r = await fetch(`https://api.notagateway.com.br/v2/empresas/${empresaId}`, {
    headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
  })
  if (r.status >= 400) throw new Error(`Falha ao ler a empresa na Nota Gateway: HTTP ${r.status}`)
  const uf = ((await r.json()) as { endereco?: { uf?: string } })?.endereco?.uf
  if (!uf) throw new Error('A empresa na Nota Gateway está sem UF no endereço')
  return String(uf)
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  log(rotuloAlvo(descreverAlvo(databaseUrl)))
  const recusa = motivoRecusaForaDoStaging(databaseUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (recusa) throw new Error(recusa)

  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 })
  let cfg: { token: string; empresa_id: string | null; ambiente: string } | undefined
  let regra: Regra | undefined
  try {
    const linhas = await sql<{ token: string; empresa_id: string | null; ambiente: string }[]>`
      select c.token, c.empresa_id, c.ambiente
      from notagateway_config c join grupos g on g.id = c.grupo_id
      where g.nome = ${GRUPO}`
    if (linhas.length !== 1) throw new Error(`Esperava 1 notagateway_config para "${GRUPO}", achei ${linhas.length}`)
    cfg = linhas[0]
    const regras = await sql`
      select r.* from regras_fiscais_saida r join grupos g on g.id = r.grupo_id where g.nome = ${GRUPO}`
    if (regras.length !== 1) throw new Error(`Esperava 1 regras_fiscais_saida para "${GRUPO}", achei ${regras.length}`)
    const r = regras[0]
    // Mesma tradução da linha que a action de emissão faz (nfe-propria-actions.ts).
    regra = {
      naturezaOperacao: r.natureza_operacao, cfopInterno: r.cfop_interno, cstIcmsInterno: r.cst_icms_interno,
      cfopInterestadual: r.cfop_interestadual, cstIcmsInterestadual: r.cst_icms_interestadual,
      aliquotaIcmsInterestadual: numOuNulo(r.aliquota_icms_interestadual),
      cstPis: r.cst_pis, aliquotaPis: numOuNulo(r.aliquota_pis),
      cstCofins: r.cst_cofins, aliquotaCofins: numOuNulo(r.aliquota_cofins),
      cstIpi: r.cst_ipi, cstIbsCbs: r.cst_ibscbs, classTribIbsCbs: r.class_trib_ibscbs,
      crt: r.crt, origemFixa: r.origem_fixa,
      ibptFederal: numOuNulo(r.ibpt_federal), ibptEstadual: numOuNulo(r.ibpt_estadual),
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
  if (cfg.ambiente !== 'Homologacao') throw new Error(`"${GRUPO}" está em ${cfg.ambiente}; este teste só roda em Homologacao`)
  if (!cfg.empresa_id) throw new Error(`"${GRUPO}" sem empresaId na Nota Gateway`)
  const token = decifrar(cfg.token).toString('utf8')
  if (!token) throw new Error('Token decifrado vazio')
  segredos.push(token)

  // Curto de propósito: id longo a NG devolve 500 (ver idExternoNfe).
  const idTeste = `mova-homolog-rg-${Date.now().toString(36)}`
  log(`Log: ${abrirLog(idTeste)}`)
  const args = (envFile: string) => [
    'collection', 'run', COLECAO,
    '--environment', envFile,
    '--env-var', 'baseUrl=https://api.notagateway.com.br/v2',
    '--env-var', `idTeste=${idTeste}`,
    '--no-report-events',
  ]

  log(`Grupo: ${GRUPO} | ambiente: ${cfg.ambiente} | empresaId: ${mascarar(cfg.empresa_id)} | token: decifrado (${token.length} caracteres)`)
  // Token e empresaId vão num environment temporário (0600), não em --env-var: argumento
  // de processo aparece no `ps` de qualquer usuário da máquina.
  const exibido = ['postman', ...args('<tmp>/ng.postman_environment.json (token=****, empresaId=' + mascarar(cfg.empresa_id) + ', payload*)')]
  log(`Comando: ${exibido.join(' ')}`)

  const ufEmitente = dryRun ? UF_EMITENTE_DRY_RUN : await ufDoEmitente(token, cfg.empresa_id)
  const { base, variantes } = payloads(idTeste, ufEmitente, regra!)
  const item = base.itens[0]
  log(`Payload base (montarNfeVendaMoto + regra do grupo; UF emitente ${ufEmitente}${dryRun ? ' presumida no dry-run' : ' lida na NG'}):`)
  log(JSON.stringify({
    id: base.id, ambienteEmissao: base.ambienteEmissao, naturezaOperacao: base.naturezaOperacao,
    enviarPorEmail: base.enviarPorEmail, pagamento: base.pedido.pagamento.formas,
    cliente: { ...base.cliente, cpfCnpj: mascarar(base.cliente.cpfCnpj) },
    item: { cfop: item.cfop, ncm: item.ncm, cest: item.cest, descricao: item.descricao, valorUnitario: item.valorUnitario, impostos: item.impostos },
  }, null, 2))
  log('Variantes:', Object.entries(variantes).map(([k, v]) => `${k} (${v.length} bytes)`).join(', '))
  if (dryRun) {
    log('--dry-run: config e payloads válidos; nada enviado à Nota Gateway.')
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'ng-regressao-'))
  const envFile = join(dir, 'ng.postman_environment.json')
  try {
    writeFileSync(envFile, JSON.stringify({
      name: 'ng-homologacao-temporario',
      values: [
        { key: 'token', value: token, type: 'secret', enabled: true },
        { key: 'empresaId', value: cfg.empresa_id, type: 'default', enabled: true },
        ...Object.entries(variantes).map(([key, value]) => ({ key, value, type: 'default', enabled: true })),
      ],
    }), { mode: 0o600 })
    const codigo = await new Promise<number>((ok, falha) => {
      const p = spawn('postman', args(envFile), { stdio: ['ignore', 'pipe', 'pipe'] })
      repassar(p.stdout!, process.stdout)
      repassar(p.stderr!, process.stderr)
      p.on('error', falha)
      p.on('close', c => ok(c ?? 1))
    })
    process.exitCode = codigo
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((e: unknown) => {
  log('FALHOU:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
}).finally(() => {
  if (logFd !== null) closeSync(logFd)
})
