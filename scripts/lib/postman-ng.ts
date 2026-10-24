/**
 * Comum aos runners das coleções Postman da Nota Gateway em homologação
 * (scripts/ng-reenvio-homologacao.ts, scripts/ng-regressao-homologacao.ts): credencial do
 * grupo no staging, log local 0600 com token e empresaId mascarados e execução da coleção
 * com um environment temporário 0600.
 */
import { spawn } from 'node:child_process'
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { descreverAlvo, motivoRecusaForaDoStaging, rotuloAlvo } from './alvo-banco'
import { decifrar } from '../../src/lib/cripto'
import type { RegraSaida } from '../../src/lib/notagateway/payload'

export type Regra = { [K in keyof RegraSaida]: RegraSaida[K] }

export const mascarar = (s: string) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`)

// Trecho menor que isso não se distingue de texto comum; maior já não pode aparecer.
const MINIMO_TRECHO = 8

/**
 * Mascara todo trecho de MINIMO_TRECHO caracteres ou mais de qualquer segredo. Não depende de
 * como o Postman quebra a linha: o pedaço que ficou de cada lado da quebra é mascarado sozinho.
 */
export function mascararTrechos(s: string, segredos: readonly string[]): { texto: string; trechos: number } {
  let texto = ''
  let trechos = 0
  for (let p = 0; p < s.length;) {
    let maior = 0
    for (const seg of segredos) {
      for (let i = 0; i + MINIMO_TRECHO <= seg.length; i++) {
        let k = 0
        while (p + k < s.length && i + k < seg.length && s[p + k] === seg[i + k]) k++
        if (k > maior) maior = k
      }
    }
    if (maior >= MINIMO_TRECHO) { texto += '****'; trechos++; p += maior }
    else { texto += s[p]; p++ }
  }
  return { texto, trechos }
}

export const mascararTexto = (s: string, segredos: readonly string[]) => mascararTrechos(s, segredos).texto

/** Rede de segurança: reescreve o arquivo mascarado (0600) se achar trecho de segredo. */
export function varrerArquivo(caminho: string, segredos: readonly string[]): number {
  const { texto, trechos } = mascararTrechos(readFileSync(caminho, 'utf8'), segredos)
  if (trechos > 0) {
    writeFileSync(caminho, texto, { mode: 0o600 })
    chmodSync(caminho, 0o600)
  }
  return trechos
}

/** Tudo o que vai à tela e ao log passa por aqui; antes de `abrir`, o log fica em memória. */
export function criarRegistro(dirLog: string) {
  const segredos: string[] = []
  const buffer: string[] = []
  let fd: number | null = null
  let caminho: string | null = null
  const gravar = (linha: string) => {
    if (fd === null) buffer.push(linha + '\n')
    else writeSync(fd, linha + '\n')
  }
  return {
    segredos,
    log(...partes: unknown[]) {
      const linha = mascararTexto(partes.map(p => (typeof p === 'string' ? p : String(p))).join(' '), segredos)
      console.error(linha)
      gravar(linha)
    },
    abrir(idTeste: string): string {
      mkdirSync(dirLog, { recursive: true, mode: 0o700 })
      caminho = join(dirLog, `${idTeste}.log`)
      fd = openSync(caminho, 'wx', 0o600)
      for (const l of buffer.splice(0)) writeSync(fd, l)
      return caminho
    },
    repassar(origem: NodeJS.ReadableStream, destino: NodeJS.WriteStream) {
      const emitir = (bruta: string) => { const l = mascararTexto(bruta, segredos); destino.write(l + '\n'); gravar(l) }
      let resto = ''
      origem.setEncoding('utf8')
      origem.on('data', (pedaco: string) => {
        const linhas = (resto + pedaco).split('\n')
        resto = linhas.pop() ?? ''
        for (const l of linhas) emitir(l)
      })
      origem.on('end', () => { if (resto) emitir(resto) })
    },
    /** Fecha o log e varre o arquivo inteiro; devolve quantos trechos de segredo achou. */
    fechar(): number {
      if (fd === null) return 0
      closeSync(fd)
      fd = null
      return caminho ? varrerArquivo(caminho, segredos) : 0
    },
  }
}

export type Registro = ReturnType<typeof criarRegistro>

const numOuNulo = (v: string | null) => (v === null ? null : String(Number(v)))

/**
 * Lê no staging a credencial e a regra de saída do grupo, recusa fora do staging ou fora de
 * Homologacao e já põe token e empresaId na lista do que sai do log (o Postman imprime a URL
 * inteira de cada requisição).
 */
export async function lerCredencialHomologacao(grupo: string, registro: Registro) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  registro.log(rotuloAlvo(descreverAlvo(databaseUrl)))
  const recusa = motivoRecusaForaDoStaging(databaseUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (recusa) throw new Error(recusa)

  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 })
  let cfg: { token: string; empresa_id: string | null; ambiente: string }
  let regra: Regra
  try {
    const linhas = await sql<{ token: string; empresa_id: string | null; ambiente: string }[]>`
      select c.token, c.empresa_id, c.ambiente
      from notagateway_config c join grupos g on g.id = c.grupo_id
      where g.nome = ${grupo}`
    if (linhas.length !== 1) throw new Error(`Esperava 1 notagateway_config para "${grupo}", achei ${linhas.length}`)
    cfg = linhas[0]
    const regras = await sql`
      select r.* from regras_fiscais_saida r join grupos g on g.id = r.grupo_id where g.nome = ${grupo}`
    if (regras.length !== 1) throw new Error(`Esperava 1 regras_fiscais_saida para "${grupo}", achei ${regras.length}`)
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
  if (cfg.ambiente !== 'Homologacao') throw new Error(`"${grupo}" está em ${cfg.ambiente}; este teste só roda em Homologacao`)
  if (!cfg.empresa_id) throw new Error(`"${grupo}" sem empresaId na Nota Gateway`)
  const token = decifrar(cfg.token).toString('utf8')
  if (!token) throw new Error('Token decifrado vazio')
  registro.segredos.push(token, cfg.empresa_id)
  return { token, empresaId: cfg.empresa_id, ambiente: cfg.ambiente, regra }
}

export async function ufDoEmitente(token: string, empresaId: string): Promise<string> {
  // Mesma leitura do ufDaEmpresa (src/lib/notagateway/client.ts), sem importar o pool do banco.
  const r = await fetch(`https://api.notagateway.com.br/v2/empresas/${empresaId}`, {
    headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
  })
  if (r.status >= 400) throw new Error(`Falha ao ler a empresa na Nota Gateway: HTTP ${r.status}`)
  const uf = ((await r.json()) as { endereco?: { uf?: string } })?.endereco?.uf
  if (!uf) throw new Error('A empresa na Nota Gateway está sem UF no endereço')
  return String(uf)
}

/**
 * Token e empresaId vão num environment temporário (0600), não em --env-var: argumento de
 * processo aparece no `ps` de qualquer usuário da máquina. Devolve o código de saída do Postman.
 */
export async function rodarColecao(opts: {
  prefixoTmp: string
  args: (envFile: string) => string[]
  token: string
  empresaId: string
  variantes: Record<string, string>
  registro: Registro
}): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), opts.prefixoTmp))
  const envFile = join(dir, 'ng.postman_environment.json')
  try {
    writeFileSync(envFile, JSON.stringify({
      name: 'ng-homologacao-temporario',
      values: [
        { key: 'token', value: opts.token, type: 'secret', enabled: true },
        { key: 'empresaId', value: opts.empresaId, type: 'default', enabled: true },
        ...Object.entries(opts.variantes).map(([key, value]) => ({ key, value, type: 'default', enabled: true })),
      ],
    }), { mode: 0o600 })
    return await new Promise<number>((ok, falha) => {
      const p = spawn('postman', opts.args(envFile), { stdio: ['ignore', 'pipe', 'pipe'] })
      opts.registro.repassar(p.stdout!, process.stdout)
      opts.registro.repassar(p.stderr!, process.stderr)
      p.on('error', falha)
      p.on('close', c => ok(c ?? 1))
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
