// Qual endpoint do mcp.ai usar para falar pelo CNPJ de um grupo.
//
// Cada empresa tem a sua própria conta no mcp.ai, e a URL do endpoint já
// carrega o segredo de acesso dentro dela — é credencial de acesso a dado
// bancário, não configuração. Por isso mora cifrada na linha do grupo
// (`grupos.mcpai_endpoint_url`, AES-256-GCM com CERT_MASTER_KEY, o mesmo
// cofre do certificado A1), e não numa variável de ambiente.
//
// A env `MCPAI_ENDPOINT_URL` continua valendo como fallback para grupo que
// ainda não teve a chave cadastrada — é o que mantém Sul de Minas e BH
// funcionando enquanto o Cesar não cola a URL de cada um.

import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decifrar } from '@/lib/cripto'
import { chaveDoCnpj } from '@/lib/grupo-cnpj'

/**
 * A regra em si, separada do banco para poder ser testada: a chave do grupo
 * ganha da global, e não ter nenhuma das duas é erro NOMEANDO o grupo.
 *
 * O nome na mensagem não é detalhe: com uma chave por empresa, "MCPAI_ENDPOINT_URL
 * não configurada" (o erro antigo) manda procurar no lugar errado — o que falta
 * é cadastro de UMA empresa, não configuração do sistema inteiro.
 */
export function escolherEndpointMcp(opts: {
  grupoNome: string
  doGrupo: string | null | undefined
  global: string | null | undefined
}): string {
  const doGrupo = opts.doGrupo?.trim()
  if (doGrupo) return doGrupo

  const global = opts.global?.trim()
  if (global) return global

  throw new Error(
    `O grupo ${opts.grupoNome} não tem a chave do mcp.ai cadastrada — cadastre em /admin/grupos ` +
    '(Configurações da empresa → Open Finance). Sem ela não dá para ler extrato, PIX nem cartão desta empresa.',
  )
}

/**
 * Só o começo da URL, para a tela poder dizer "está configurada" sem devolver o
 * segredo ao navegador. Mostra host + os últimos 4 caracteres, o suficiente
 * para o Cesar reconhecer qual chave está lá.
 */
export function resumirEndpoint(url: string): string {
  try {
    const { host } = new URL(url)
    return `${host}/…${url.slice(-4)}`
  } catch {
    // URL malformada (alguém colou outra coisa): não tenta adivinhar, só avisa
    // que tem algo salvo — o resumo é informativo, não pode derrubar a tela.
    return 'valor salvo (não parece uma URL)'
  }
}

/** Endpoint do mcp.ai do grupo dono deste CNPJ. Lança se não houver nenhum. */
export async function endpointMcpDoGrupo(cnpjGrupo: string): Promise<string> {
  const digitos = chaveDoCnpj(cnpjGrupo)
  // Os CNPJs ficam formatados em `grupos.cnpj` e chegam aqui do mesmo cadastro,
  // mas comparar por dígitos é o que já se faz no resto do módulo (`mesmoCnpj`)
  // — um cadastro sem pontuação não pode fazer a chave "sumir".
  const ativos = await db
    .select({ nome: grupos.nome, cnpj: grupos.cnpj, url: grupos.mcpaiEndpointUrl })
    .from(grupos)
    .where(eq(grupos.ativo, true))

  const grupo = ativos.find(g => chaveDoCnpj(g.cnpj) === digitos)
  if (!grupo) {
    throw new Error(`Nenhum grupo ativo cadastrado com o CNPJ ${cnpjGrupo} — não sei com qual conta do mcp.ai falar.`)
  }

  let doGrupo: string | null = null
  if (grupo.url) {
    try {
      doGrupo = decifrar(grupo.url).toString('utf8')
    } catch {
      // Chave mestra trocada, ou valor gravado corrompido. Cair no fallback
      // global em silêncio seria pior: leria a conta da empresa ERRADA. Melhor
      // falhar dizendo o que aconteceu.
      throw new Error(
        `A chave do mcp.ai do grupo ${grupo.nome} está gravada mas não pôde ser aberta ` +
        '(CERT_MASTER_KEY diferente da que cifrou). Cadastre a chave de novo em /admin/grupos.',
      )
    }
  }

  return escolherEndpointMcp({
    grupoNome: grupo.nome,
    doGrupo,
    global: process.env.MCPAI_ENDPOINT_URL,
  })
}
