import { CONTRATADA } from '@/lib/mova-empresa'
import { formatarCpfCnpj } from '@/lib/documento'
import { formatarNumeroBR } from '@/lib/numero-br'
import { esc, envolverDocumento } from '@/lib/assinatura/documento'
import type { StatusAdesao } from '@/lib/adesao-campos'

// Contrato de Licença de Uso do MOVA (#165). Texto: minuta do Cesar de
// 30/09/2026 ajustada em 16/10/2026 (v2), sem testemunhas e com aceite
// eletrônico só do lojista. Revisado pelo advogado.

/**
 * Valores fechados com o Cesar na call de 16/10/2026. Os 7 dias de backup são
 * a retenção do plano Pro do Supabase; arquivos do Storage não têm backup.
 */
export const TERMOS = {
  indiceReajuste: 'IPCA/IBGE',
  multaAtrasoPct: '2%',
  diasAtrasoParaRescisao: 60,
  disponibilidadePct: '99%',
  canaisSuporte: 'WhatsApp e e-mail',
  horarioSuporte: 'de segunda a sexta, das 9h às 12h e das 14h às 17h',
  horasRespostaSuporte: 2,
  diasBackup: 7,
  horasAvisoIncidente: 48,
  anosSigilo: 5,
  limiteResponsabilidade: 'uma mensalidade',
  mesesVigencia: 12,
  diasAvisoRescisao: 30,
  multaRescisao: 'Se o CLIENTE encerrar o Contrato antes de completar 6 meses de vigência, paga multa de uma mensalidade; depois disso, não há multa.',
  diasCorrecaoDescumprimento: 10,
  diasExportacaoDados: 15,
  diasGuardaDados: 60,
  emailContato: 'contato@meumova.com',
  diasAvisoMudancaFuncao: 30,
  horasOrientacao: 2,
  diasUteisImplantacao: 15,
} as const

/**
 * Enquanto for false, o envio de contrato real fica travado na produção
 * (decisão de 16/10/2026): o lojista não recebe valores que o Cesar não fechou.
 */
export const TERMOS_CONFIRMADOS = true

export type DadosContratoAdesao = {
  razaoSocial: string | null
  cnpj: string | null
  enderecoSede: string | null
  email: string | null
  responsavelNome: string | null
  responsavelCpf: string | null
  /** Decimal com ponto, como vem do banco. */
  taxaImplantacao: string | null
  valorMensal: string | null
}

export function dadosContratoCompletos(d: DadosContratoAdesao): boolean {
  return Object.values(d).every(v => typeof v === 'string' && v.trim() !== '')
}

const reais = (v: string) => `R$ ${formatarNumeroBR(v)}`

export function montarContratoAdesao(d: DadosContratoAdesao): string {
  if (!dadosContratoCompletos(d)) throw new Error('Dados do contrato incompletos')
  // Abreviações só para o texto longo abaixo caber em linhas legíveis.
  const t = TERMOS
  const c = CONTRATADA
  const corpo = `
    <h1>CONTRATO DE LICENÇA DE USO — MOVA</h1>

    <h2>1. Partes</h2>
    <p><b>LICENCIANTE:</b> ${esc(c.razaoSocial)}, inscrita no CNPJ sob o nº ${esc(formatarCpfCnpj(c.cnpj))}, com sede na ${esc(c.endereco)}, que comercializa o software sob a marca ${esc(c.marca)}, doravante "MOVA".</p>
    <p><b>LICENCIADA:</b> ${esc(d.razaoSocial!)}, inscrita no CNPJ sob o nº ${esc(formatarCpfCnpj(d.cnpj))}, com sede em ${esc(d.enderecoSede!)}, endereço eletrônico ${esc(d.email!)}, neste ato representada por ${esc(d.responsavelNome!)}, CPF ${esc(formatarCpfCnpj(d.responsavelCpf))}, doravante "CLIENTE".</p>
    <p>As partes celebram este Contrato de Licença de Uso de Software na modalidade de serviço (SaaS), que se rege pelas cláusulas a seguir.</p>

    <h2>2. Objeto</h2>
    <p>2.1. O MOVA concede ao CLIENTE licença de uso não exclusiva, intransferível e temporária do sistema MOVA, acessado pela internet, enquanto este Contrato estiver vigente e as mensalidades em dia.</p>
    <p>2.2. A licença cobre um CNPJ e todas as lojas (filiais) desse CNPJ, sem limite de usuários. Outro CNPJ, ainda que do mesmo grupo econômico, exige contratação própria.</p>
    <p>2.3. Estão incluídos os módulos disponíveis na data da contratação — estoque, vendas, ordens de serviço, peças, financeiro, folha e fiscal — e as atualizações que o MOVA lançar durante a vigência.</p>
    <p>2.4. Não estão incluídos: serviços de terceiros contratados pelo CLIENTE (Cláusula 7), desenvolvimento sob encomenda, treinamento presencial e migração de dados de outros sistemas além do previsto na Cláusula 3, que podem ser orçados à parte. Treinamento presencial pedido pelo CLIENTE tem valor por hora combinado entre as partes antes da visita, e as despesas de passagem, hospedagem e alimentação ficam por conta do CLIENTE.</p>
    <p>2.5. Esta licença não transfere ao CLIENTE a propriedade do software, do código-fonte ou da marca MOVA.</p>

    <h2>3. Implantação</h2>
    <p>3.1. Os dados do CLIENTE ficam separados dos dados dos demais clientes do MOVA, e somente o CLIENTE e os usuários que ele cadastrar têm acesso a eles. Nenhum outro cliente do MOVA acessa os dados do CLIENTE.</p>
    <p>3.2. A implantação inclui: cadastro da empresa, das lojas e do usuário administrador, configuração inicial das regras fiscais com base nas informações do contador do CLIENTE e ${t.horasOrientacao} horas de orientação guiada, junto com o CLIENTE.</p>
    <p>3.3. O prazo de implantação é de até ${t.diasUteisImplantacao} dias úteis, contados do recebimento das informações e documentos solicitados pelo MOVA. Atraso no envio dessas informações pelo CLIENTE prorroga o prazo na mesma medida. Ao fim da implantação, o MOVA libera o acesso do CLIENTE ao sistema.</p>
    <p>3.4. Taxa de implantação: ${reais(d.taxaImplantacao!)}, paga junto com a primeira mensalidade.</p>

    <h2>4. Preço, cobrança e bloqueio</h2>
    <p>4.1. O CLIENTE paga mensalidade de ${reais(d.valorMensal!)} por CNPJ. A primeira mensalidade vence 30 (trinta) dias após o primeiro acesso do CLIENTE ao sistema, e as seguintes no mesmo dia dos meses subsequentes. Quando esse dia for 29, 30 ou 31, o vencimento passa a ser o dia 28.</p>
    <p>4.2. A cobrança é enviada pelo MOVA por link de pagamento (Mercado Pago), para pagamento por PIX, boleto ou cartão de crédito ou débito. O pagamento só se considera feito quando confirmado pela instituição de pagamento.</p>
    <p>4.3. O valor será reajustado todo ano em fevereiro, a partir de fevereiro do ano seguinte ao da assinatura, pelo ${esc(t.indiceReajuste)}, ou pelo índice que o substituir, com aviso ao CLIENTE de pelo menos 30 dias.</p>
    <p>4.4. Atraso gera multa de ${esc(t.multaAtrasoPct)} e juros de 1% ao mês sobre o valor devido, calculados dia a dia.</p>
    <p>4.5. Bloqueio: passados 5 (cinco) dias corridos do vencimento sem pagamento, o acesso ao sistema será suspenso. Durante a suspensão, o responsável do CLIENTE acessa apenas a tela de pagamento. Os dados não são apagados, e o acesso volta automaticamente após a confirmação do pagamento.</p>
    <p>4.6. Atraso superior a ${t.diasAtrasoParaRescisao} dias autoriza o MOVA a rescindir o Contrato, observada a Cláusula 10 quanto à devolução dos dados.</p>

    <h2>5. Obrigações do MOVA</h2>
    <p>5.1. Manter o sistema disponível ${esc(t.disponibilidadePct)} do tempo em cada mês, excluídas manutenções programadas avisadas com 24 horas de antecedência e falhas de fornecedores de infraestrutura fora do controle do MOVA.</p>
    <p>5.2. Prestar suporte por ${esc(t.canaisSuporte)}, ${esc(t.horarioSuporte)}, respondendo em até ${t.horasRespostaSuporte} horas úteis. Falha que impeça vender ou emitir nota fiscal tem prioridade.</p>
    <p>5.3. Fazer cópia de segurança (backup) do banco de dados do CLIENTE pelo menos uma vez por dia, mantida por no mínimo ${t.diasBackup} dias.</p>
    <p>5.4. Corrigir defeitos do sistema em prazo compatível com a gravidade e informar o CLIENTE sobre mudanças relevantes.</p>
    <p>5.5. Manter sigilo sobre os dados e informações do CLIENTE, nos termos da Cláusula 8.</p>

    <h2>6. Obrigações do CLIENTE</h2>
    <p>6.1. Usar o sistema apenas nas operações da própria empresa, sem revender, sublicenciar, copiar ou tentar acessar o código-fonte.</p>
    <p>6.2. Cadastrar seus usuários, definir as permissões de cada um e responder pelos atos praticados com esses acessos. Senhas são pessoais; suspeita de uso indevido deve ser comunicada ao MOVA de imediato.</p>
    <p>6.3. Responder pela exatidão dos dados que lança no sistema, inclusive os dados fiscais. As regras de tributação usadas na emissão de notas são definidas pelo contador do CLIENTE; o MOVA apenas as aplica.</p>
    <p>6.4. Fornecer e manter válido o certificado digital A1 da empresa quando usar o módulo fiscal, e as credenciais dos serviços que quiser integrar (portal da fábrica, bancos, Open Finance). O MOVA guarda o certificado, a senha e as credenciais cifrados e os usa somente para executar as operações que o CLIENTE ou seus usuários pedirem no sistema. O CLIENTE pode revogar essa autorização a qualquer momento, trocando o certificado ou as senhas, ciente de que as funções que dependem deles deixam de funcionar. Encerrado o Contrato, o MOVA exclui o certificado, as senhas e as credenciais.</p>
    <p>6.5. Obter dos seus clientes e funcionários as autorizações exigidas por lei para o tratamento dos dados pessoais que lançar no sistema.</p>
    <p>6.6. Pagar as mensalidades em dia.</p>

    <h2>7. Serviços de terceiros</h2>
    <p>7.1. Algumas funções do MOVA dependem de serviços que o CLIENTE contrata diretamente, em nome próprio, como: emissor de nota fiscal (Nota Gateway), CRM (Kommo), leitura de extratos bancários (Open Finance), envio de WhatsApp e operadoras de cartão.</p>
    <p>7.2. O custo, a disponibilidade e as regras desses serviços são de responsabilidade dos respectivos fornecedores e do CLIENTE. O MOVA não responde por falhas, mudanças ou interrupções causadas por eles, nem por indisponibilidade dos sistemas da SEFAZ.</p>
    <p>7.3. O MOVA fará esforço razoável para manter as integrações funcionando e adaptá-las quando o fornecedor mudar, mas pode descontinuar uma integração se o fornecedor deixar de oferecê-la, avisando o CLIENTE com antecedência sempre que possível.</p>

    <h2>8. Dados e proteção de dados (LGPD)</h2>
    <p>8.1. Os dados lançados no sistema pertencem ao CLIENTE. Para fins da Lei 13.709/2018 (LGPD), o CLIENTE é o controlador e o MOVA é o operador, tratando os dados apenas para prestar o serviço e conforme as instruções do CLIENTE.</p>
    <p>8.2. O MOVA não vende, não compartilha e não usa os dados do CLIENTE para outros fins, exceto quando exigido por lei ou ordem judicial. Os fornecedores de infraestrutura usados pelo MOVA (hospedagem e banco de dados) atuam como suboperadores.</p>
    <p>8.3. O MOVA adota medidas de segurança compatíveis com o serviço, entre elas: separação dos dados de cada cliente, acesso por senha individual, conexão criptografada e credenciais sensíveis (como certificado digital e senhas de integração) guardadas cifradas.</p>
    <p>8.4. Em caso de incidente de segurança que possa afetar dados do CLIENTE, o MOVA comunicará o CLIENTE em até ${t.horasAvisoIncidente} horas após tomar conhecimento, com as informações de que dispuser.</p>
    <p>8.5. As partes guardam sigilo sobre as informações comerciais uma da outra durante o Contrato e por ${t.anosSigilo} anos após o seu término.</p>

    <h2>9. Propriedade intelectual e responsabilidade</h2>
    <p>9.1. O software MOVA, seu código-fonte, telas, documentação e marca são de propriedade exclusiva do MOVA. Melhorias sugeridas pelo CLIENTE e incorporadas ao sistema também passam a integrá-lo, sem direito a remuneração.</p>
    <p>9.2. O MOVA não responde por: decisões de negócio tomadas com base nos relatórios; dados lançados errado pelo CLIENTE; regras fiscais informadas pelo CLIENTE ou por seu contador; falhas de serviços de terceiros (Cláusula 7); nem por lucros cessantes.</p>
    <p>9.3. A responsabilidade total do MOVA por danos decorrentes deste Contrato fica limitada ao valor de ${esc(t.limiteResponsabilidade)} vigente na data do fato, salvo dolo ou culpa grave.</p>

    <h2>10. Prazo, rescisão e devolução dos dados</h2>
    <p>10.1. O Contrato vale por ${t.mesesVigencia} meses a partir da assinatura e se renova automaticamente por períodos iguais, salvo aviso em contrário.</p>
    <p>10.2. Qualquer parte pode encerrá-lo sem justificativa, com aviso prévio de ${t.diasAvisoRescisao} dias por escrito (e-mail vale). ${esc(t.multaRescisao)}</p>
    <p>10.3. O Contrato pode ser rescindido de imediato em caso de descumprimento grave não corrigido em ${t.diasCorrecaoDescumprimento} dias após notificação, ou nos termos da Cláusula 4.6.</p>
    <p>10.4. Devolução dos dados: encerrado o Contrato por qualquer motivo, o MOVA entrega ao CLIENTE, em até ${t.diasExportacaoDados} dias e mediante pedido, a exportação dos seus dados em formato aberto (planilhas e os arquivos XML das notas fiscais). Os dados ficam guardados por ${t.diasGuardaDados} dias após o encerramento e depois são apagados de forma definitiva, salvo o que a lei obrigar a manter.</p>
    <p>10.5. Mensalidades vencidas até o encerramento continuam devidas.</p>

    <h2>11. Disposições gerais e foro</h2>
    <p>11.1. Comunicações entre as partes valem por e-mail: MOVA em ${esc(t.emailContato)}; CLIENTE no e-mail informado na Cláusula 1.</p>
    <p>11.2. O MOVA pode alterar funcionalidades do sistema para melhorá-lo, desde que não retire do CLIENTE uma função essencial contratada sem aviso de ${t.diasAvisoMudancaFuncao} dias.</p>
    <p>11.3. Este Contrato não cria vínculo societário, trabalhista ou de representação entre as partes. Tolerância com um descumprimento não significa renunciar ao direito.</p>
    <p>11.4. Assinatura eletrônica: o CLIENTE aceita este Contrato por meio eletrônico, pelo link enviado pelo MOVA, com confirmação de código enviado ao e-mail do responsável, registro fotográfico e assinatura desenhada, e as partes reconhecem esse aceite como válido, com o mesmo efeito de uma via assinada fisicamente, ainda que feito por plataforma não credenciada pela ICP-Brasil e sem certificado digital. O MOVA manifesta sua concordância ao enviar o Contrato para aceite.</p>
    <p>11.5. Fica eleito o foro da comarca de ${esc(c.comarcaForo)} para resolver questões deste Contrato.</p>

    <p>${esc(c.cidadeFecho)}, na data do aceite eletrônico.</p>
    <p><i>Seguem, gerados pelo sistema, os registros do aceite eletrônico do CLIENTE: data e hora, endereço IP, confirmação do código e código de verificação do documento.</i></p>`
  return envolverDocumento(corpo)
}

export const DIAS_VALIDADE_CONTRATO = 7

/** Por que o contrato não pode ser enviado agora; null quando pode. */
export function motivoBloqueioEnvio(p: {
  statusAdesao: StatusAdesao
  dados: DadosContratoAdesao
  jaAssinado: boolean
  producao: boolean
  termosConfirmados: boolean
}): string | null {
  if (p.statusAdesao !== 'dados_completos' || !dadosContratoCompletos(p.dados)) {
    return 'Complete e salve os dados do contrato antes de enviar'
  }
  if (p.jaAssinado) return 'Esta adesão já tem contrato assinado'
  if (p.producao && !p.termosConfirmados) {
    return 'Envio travado na produção até os termos do contrato serem confirmados'
  }
  return null
}

/** Só a trava da produção, para a tela avisar antes do clique. */
export function envioTravadoNaProducao(): boolean {
  return process.env.VERCEL_ENV === 'production' && !TERMOS_CONFIRMADOS
}
