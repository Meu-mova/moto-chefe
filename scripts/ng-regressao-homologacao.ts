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
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { criarRegistro, lerCredencialHomologacao, mascarar, rodarColecao, ufDoEmitente, type Regra } from './lib/postman-ng'
import { montarNfeVendaMoto, type DadosVendaMoto } from '../src/lib/notagateway/payload'
import { formaPagamentoNfe } from '../src/lib/notagateway/venda'

const GRUPO = 'Grupo Teste Sul'
const COLECAO = resolve(process.cwd(), 'scripts/postman/nf-regressao-homologacao.postman_collection.json')
const dryRun = process.argv.includes('--dry-run')
const LOG_DIR = join(homedir(), 'Development/work/moto-chefe/ng-regressao-logs')

const registro = criarRegistro(LOG_DIR)
const log = registro.log

// Comprador e moto sintéticos.
const NCM_MOTO = '87116000'
// Dry-run não chama a NG; a UF real do emitente só se lê no envio de verdade.
const UF_EMITENTE_DRY_RUN = 'MG'
// Texto da carta: entre 15 e 1000 caracteres (carta-correcao.ts).
const TEXTO_CARTA = 'Teste de regressao 347: correcao da cor do veiculo para CINZA. Sem valor fiscal.'

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

async function main() {
  const { token, empresaId, ambiente, regra } = await lerCredencialHomologacao(GRUPO, registro)

  // Curto de propósito: id longo a NG devolve 500 (ver idExternoNfe).
  const idTeste = `mova-homolog-rg-${Date.now().toString(36)}`
  log(`Log: ${registro.abrir(idTeste)}`)
  const args = (envFile: string) => [
    'collection', 'run', COLECAO,
    '--environment', envFile,
    '--env-var', 'baseUrl=https://api.notagateway.com.br/v2',
    '--env-var', `idTeste=${idTeste}`,
    '--no-report-events',
    // Para na primeira falha: carta e cancelamento dependem da nota autorizada.
    '--bail',
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

  process.exitCode = await rodarColecao({ prefixoTmp: 'ng-regressao-', args, token, empresaId, variantes, registro })
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
