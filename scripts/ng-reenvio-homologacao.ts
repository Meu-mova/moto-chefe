/**
 * Prova na Nota Gateway REAL, em HOMOLOGAÇÃO, o que o suporte afirmou (#347):
 *   1. NF-e Negada pela SEFAZ, corrigida e reenviada com o MESMO id, sai com o MESMO número.
 *   2. POST recusado pela própria NG (400) não registra o id nem consome número: o mesmo
 *      id corrigido é aceito e o número é o seguinte ao da nota anterior. Dois casos:
 *      JSON truncado e JSON válido com CFOP com letras (GW7324, tabela B.1.1 da doc).
 * O payload sai do MESMO código do MOVA (montarNfeVendaMoto) com a regra de
 * regras_fiscais_saida do grupo; comprador e moto são sintéticos. As variantes vão à
 * coleção pelo environment temporário (0600). No fim cancela as três autorizadas. Requests e testes em
 * scripts/postman/nf-reenvio-homologacao.postman_collection.json.
 *
 * Uso (só staging; credencial do "Grupo Teste Sul", que precisa estar em Homologacao):
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-reenvio-homologacao.ts --dry-run
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-reenvio-homologacao.ts
 *
 * A saída completa (com o corpo de cada requisição e resposta, sem headers nem token) vai
 * também para ~/Development/work/moto-chefe/ng-reenvio-logs/<idTeste>.log (0600, fora do repo).
 *
 * Consome 3 números da série de homologação da empresa na NG. Requer o Postman CLI
 * (`npm install -g postman-cli`); não usa login nem POSTMAN_API_KEY.
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { criarRegistro, lerCredencialHomologacao, mascarar, rodarColecao, ufDoEmitente, type Regra } from './lib/postman-ng'
import { montarNfeVendaMoto, type DadosVendaMoto } from '../src/lib/notagateway/payload'
import { formaPagamentoNfe } from '../src/lib/notagateway/venda'

const GRUPO = 'Grupo Teste Sul'
const COLECAO = resolve(process.cwd(), 'scripts/postman/nf-reenvio-homologacao.postman_collection.json')
const dryRun = process.argv.includes('--dry-run')
const LOG_DIR = join(homedir(), 'Development/work/moto-chefe/ng-reenvio-logs')

const registro = criarRegistro(LOG_DIR)
const log = registro.log

// Comprador e moto sintéticos. NCM 9999.99.99 não existe na tabela: a SEFAZ nega (a1).
const NCM_MOTO = '87116000'
const NCM_INEXISTENTE = '99999999'
// CFOP com letra: a própria NG recusa com 400 GW7324 antes da SEFAZ (d1).
const CFOP_COM_LETRAS = '5A05'
// Dry-run não chama a NG; a UF real do emitente só se lê no envio de verdade.
const UF_EMITENTE_DRY_RUN = 'MG'

function dadosSinteticos(idExterno: string, ufEmitente: string, ncm: string): DadosVendaMoto {
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
    moto: { xProd: 'MOTO ELETRICA TESTE REENVIO 2000W', codigo: 'TESTE-REENVIO', ncm, cest: '2600100', unidade: 'UN', origem: '0' },
    valor,
    pagamentos: [{ tipo: 'pix', valor }].map(formaPagamentoNfe),
    informacoesAdicionais: 'Teste de reenvio com o mesmo id (#347). Sem valor fiscal.',
  }
}

function payloads(idTeste: string, ufEmitente: string, regra: Regra) {
  const montar = (sufixo: string, ncm = NCM_MOTO) => montarNfeVendaMoto(dadosSinteticos(`${idTeste}-${sufixo}`, ufEmitente, ncm), regra)
  const base = montar('a')
  const corrigidoC = montar('c')
  const campoInvalido = montar('d')
  campoInvalido.itens[0].cfop = CFOP_COM_LETRAS
  const variantes = {
    payloadNcmInvalido: JSON.stringify(montar('a', NCM_INEXISTENTE)),
    payloadCorrigidoA: JSON.stringify(base),
    payloadTruncadoC: JSON.stringify(corrigidoC).slice(0, 400),
    payloadCorrigidoC: JSON.stringify(corrigidoC),
    payloadCfopInvalidoD: JSON.stringify(campoInvalido),
    payloadCorrigidoD: JSON.stringify(montar('d')),
  }
  for (const [k, v] of Object.entries(variantes)) {
    if (!v.includes('"ambienteEmissao":"Homologacao"') || v.includes('Producao')) throw new Error(`${k} fora de Homologacao`)
  }
  return { base, variantes }
}

async function main() {
  const { token, empresaId, ambiente, regra } = await lerCredencialHomologacao(GRUPO, registro)

  // Curto de propósito: id longo a NG devolve 500 (ver idExternoNfe).
  const idTeste = `mova-homolog-rv-${Date.now().toString(36)}`
  log(`Log: ${registro.abrir(idTeste)}`)
  const args = (envFile: string) => [
    'collection', 'run', COLECAO,
    '--environment', envFile,
    '--env-var', 'baseUrl=https://api.notagateway.com.br/v2',
    '--env-var', `idTeste=${idTeste}`,
    '--no-report-events',
  ]

  log(`Grupo: ${GRUPO} | ambiente: ${ambiente} | empresaId: ${mascarar(empresaId)} | token: decifrado (${token.length} caracteres)`)
  const exibido = ['postman', ...args('<tmp>/ng.postman_environment.json (token=****, empresaId=' + mascarar(empresaId) + ', payload*)')]
  log(`Comando: ${exibido.join(' ')}`)

  const ufEmitente = dryRun ? UF_EMITENTE_DRY_RUN : await ufDoEmitente(token, empresaId)
  const { base, variantes } = payloads(idTeste, ufEmitente, regra)
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

  process.exitCode = await rodarColecao({ prefixoTmp: 'ng-reenvio-', args, token, empresaId, variantes, registro })
}

main().catch((e: unknown) => {
  log('FALHOU:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
}).finally(() => {
  const trechos = registro.fechar()
  if (trechos > 0) {
    console.error(`\n!!! A máscara deixou passar ${trechos} trecho(s) de segredo no log; o arquivo foi reescrito mascarado. A tela acima pode ter o segredo: limpe o terminal. !!!`)
    process.exitCode = 1
  }
})
