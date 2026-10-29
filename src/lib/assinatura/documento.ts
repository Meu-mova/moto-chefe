import { formatarCpfCnpj, rotuloDocumento, tipoPessoaDoDocumento } from '@/lib/documento'

export type TipoDocumento = 'contrato_venda' | 'checklist_entrega'

export const LABEL_TIPO: Record<TipoDocumento, string> = {
  contrato_venda: 'contrato de venda',
  checklist_entrega: 'checklist de entrega',
}

export type DadosDocumento = {
  vendaId: string
  // Comprador — sem estado civil, profissão e RG: o sistema não tem esses dados
  // e coletá-los travaria o balcão (decisão registrada no spec).
  clienteNome: string
  /** CPF ou CNPJ: o tamanho decide o tipo de pessoa. O nome ficou de quando só
   *  havia CPF; snapshot antigo no banco usa a mesma chave. */
  clienteCpf: string
  /** Quem assina pela empresa (#65). Só faz sentido com CNPJ, e é opcional. */
  representanteNome?: string | null
  representanteCpf?: string | null
  clienteEmail: string
  clienteEndereco: string
  // Vendedora — vem do grupo, não fixa no texto: BH e Vale são outras empresas.
  vendedoraRazaoSocial: string
  vendedoraCnpj: string
  vendedoraEndereco: string
  /** Cidade da SEDE — é o local do fecho do contrato. Não é a cidade da loja
   *  que atendeu: quem assina é a pessoa jurídica. */
  cidadeSede: string
  comarcaForo: string
  lojaNome: string
  lojaCidade: string
  // Decisões do Cesar em 11/08: o contrato NÃO leva ano de fabricação (o sistema
  // não guarda), potência nem número do motor. A Cláusula Terceira mantém os
  // limites legais da Resolução CONTRAN 996, que são texto do modelo, não
  // característica medida deste veículo. O `motor` continua aqui porque o
  // checklist de entrega usa — é conferência de veículo, não cláusula.
  marca: string
  modelo: string
  chassi: string
  cor: string
  motor: string
  valor: string
  /** Resumo textual da venda (campo forma_pagamento). Só é usado quando a venda
   *  não tem o detalhe de `pagamentos` — venda antiga, por exemplo. */
  formaPagamento: string
  /** Detalhe do pagamento, como está gravado na venda. É o que vai para a
   *  Cláusula Sexta: cada forma com o seu valor e as parcelas. */
  pagamentos: PagamentoVenda[]
  dataVenda: string
}

export type PagamentoVenda = {
  tipo: string
  valor: number
  parcelas?: number | null
  operadora?: string | null
}

const NOME_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'dinheiro',
  cartao_credito: 'cartão de crédito',
  cartao_debito: 'cartão de débito',
  link_pagamento: 'link de pagamento',
  boleto: 'boleto',
  financiamento: 'financiamento',
  transferencia: 'transferência bancária',
  deposito: 'depósito',
  cheque: 'cheque',
  consorcio: 'consórcio',
}

export function reais(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * "R$ 2.000,00 no PIX", "R$ 4.000,00 no cartão de crédito em 12x".
 * Uma linha por pagamento — o comprador que dividiu em três formas precisa ver
 * as três no contrato, não um "Cartão 12x" que esconde o resto.
 */
export function descreverPagamentos(pagamentos: PagamentoVenda[] | null | undefined, fallback: string): string[] {
  const lista = (pagamentos ?? []).filter(p => Number(p.valor) > 0)
  if (lista.length === 0) return fallback.trim() ? [fallback.trim()] : []
  return lista.map(p => {
    const nome = NOME_PAGAMENTO[p.tipo] ?? p.tipo.replace(/_/g, ' ')
    const parcelas = p.parcelas && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''
    return `${reais(Number(p.valor))} no ${nome}${parcelas}`
  })
}

// Contrato sem a qualificação da vendedora sairia com a empresa errada ou em
// branco — melhor recusar o envio do que emitir assim.
export function dadosVendedoraCompletos(d: DadosDocumento): boolean {
  return !!(d.vendedoraRazaoSocial?.trim() && d.vendedoraCnpj?.trim()
    && d.vendedoraEndereco?.trim() && d.cidadeSede?.trim() && d.comarcaForo?.trim())
}

// Cláusula Décima Quinta do modelo do advogado, palavra por palavra. É ela que
// aciona o art. 10, §2º da MP 2.200-2/2001 — a assinatura eletrônica não-ICP
// vale porque as partes declaram aceitá-la. NÃO reescrever este texto.
export const CLAUSULA_ACEITE =
  'As partes concordam que este documento poderá ser assinado digitalmente, produzindo o mesmo ' +
  'efeito legal da via assinada fisicamente e acordam não contestar a sua validade, conteúdo ' +
  'autenticidade e integridade. As partes convencionam que esse documento pode ser assinado de ' +
  'forma manuscrita ou por meio eletrônico, ainda que por meio de plataforma de assinatura ' +
  'eletrônica não credenciada pela infraestrutura de chaves públicas brasileira (ICP Brasil) ' +
  'e/ou sem certificado de assinatura digital.'

// Anexo I do contrato — parte integrante pelo Parágrafo Segundo da Cláusula
// Décima Primeira. Copiado do modelo, 14 itens.
export const ITENS_CARTILHA_BATERIA = [
  'NUNCA deixe a bateria carregando da noite para o dia.',
  'NÃO EXCEDA o tempo máximo de carregamento, que é de 8 (oito) horas.',
  'CONECTE a bateria diretamente na tomada de parede ao carregar, NÃO use adaptadores elétricos como réguas e “benjamins”.',
  'CARREGUE a bateria sempre em um local aberto, arejado e durante o dia.',
  'OBSERVE o tempo ideal de carga de 4 a 6 horas e verifique se a luz verde de carregamento já está acesa.',
  'NUNCA carregue a bateria sob exposição direta ao sol, seja fora do veículo ou dentro dele.',
  'CUIDADO ao manusear a bateria: evite contato de objetos metálicos com os conectores, devido ao alto risco de curto-circuito e incêndio.',
  'MANTENHA a tomada da bateria sempre tampada, e os conectores protegidos.',
  'É PROIBIDO qualquer reparo nas baterias. Caso seja constatada intervenção, a garantia será automaticamente anulada.',
  'NÃO UTILIZE baterias recondicionadas ou de procedência desconhecida, como aquelas compradas online sem certificação.',
  'NÃO UTILIZE carregadores recondicionados ou de procedência desconhecida, incluindo os adquiridos pela internet sem garantias.',
  'AGUARDE entre 20 e 30 minutos após o uso do veículo elétrico para iniciar o carregamento, permitindo o resfriamento da bateria.',
  'NÃO EXCEDA o peso máximo suportado pelo veículo, nem utilize pneus descalibrados.',
  'EVITE deixar a bateria descarregar completamente.',
]

// Itens conferidos na entrega. Fonte única — a página impressa
// (print)/vendas/[id]/checklist-entrega importa daqui.
export const ITENS_CHECKLIST = [
  'Chave de ignição',
  'Ignição pelo painel / controle / cartão',
  'Acelerador',
  'Freios em funcionamento',
  'Comandos 1, 2 e 3',
  'Ré',
  'Sensor de freio',
  'Lanterna',
  'Farol (baixo e alto)',
  'Buzina',
  'Setas dianteiras e traseiras',
  'Alarmes e travas',
  'Carenagens em perfeito estado',
  'Carregador em funcionamento',
  'Abertura do banco / compartimento da bateria',
]

export function esc(v: string): string {
  return (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const ESTILO = `
  .doc { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; line-height: 1.55; }
  .doc h1 { font-size: 15px; margin-bottom: 14px; text-align: center; }
  .doc h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 18px 0 8px; }
  .doc p { margin-bottom: 9px; text-align: justify; }
  .doc table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .doc td, .doc th { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; font-size: 11px; }
  .doc ul { margin: 0 0 10px 18px; }
  .doc li { margin-bottom: 5px; }
  .doc .clausula { font-size: 11px; color: #475569; }
`

// Texto de pessoa jurídica aprovado pelo advogado (#65, 15/10/2026). Representante
// é opcional na venda: sem ele, a linha sai em branco para a loja completar à mão.
function qualificacaoComprador(d: DadosDocumento): string {
  return `<p>${qualificacaoCompradorEmLinha(d)}</p>`
}

/** O mesmo texto, sem o parágrafo em volta: é o campo {comprador_qualificacao} do contrato do grupo. */
export function qualificacaoCompradorEmLinha(d: DadosDocumento): string {
  if (tipoPessoaDoDocumento(d.clienteCpf) === 'juridica') {
    return `Na qualidade de <b>COMPRADOR(A)</b>: ${esc(d.clienteNome)}, pessoa jurídica, inscrita no CNPJ sob o nº ${esc(formatarCpfCnpj(d.clienteCpf))}, com sede na ${esc(d.clienteEndereco)}, endereço eletrônico: ${esc(d.clienteEmail)}, neste ato representada por ${esc(d.representanteNome?.trim() || '______________________________')}, CPF ${esc(formatarCpfCnpj(d.representanteCpf?.trim()) || '________________')}.`
  }
  return `Na qualidade de <b>COMPRADOR(A)</b>: ${esc(d.clienteNome)}, brasileiro(a), inscrito no CPF
    sob o nº ${esc(formatarCpfCnpj(d.clienteCpf))}, residente e domiciliado na ${esc(d.clienteEndereco)}, endereço
    eletrônico: ${esc(d.clienteEmail)}.`
}

// ATENÇÃO: transcrito do modelo "Compra e Venda Motochefe.docx". Os desvios em
// relação ao original são três, todos decididos com o Cesar e registrados no
// spec: qualificação do comprador sem estado civil/profissão/RG, sem
// testemunhas, e vendedora + comarca vindas do grupo.
function contrato(d: DadosDocumento): string {
  const cartilha = ITENS_CARTILHA_BATERIA.map(i => `<li>${esc(i)}</li>`).join('')
  return `
    <h1>CONTRATO DE COMPRA E VENDA DE EQUIPAMENTO DE MOBILIDADE INDIVIDUAL AUTOPROPELIDO</h1>

    <p>Na qualidade de <b>VENDEDORA</b>: ${esc(d.vendedoraRazaoSocial)}, pessoa jurídica, inscrita
    no CNPJ sob o nº ${esc(formatarCpfCnpj(d.vendedoraCnpj))}, com endereço à ${esc(d.vendedoraEndereco)}, neste ato
    representada por quem de direito.</p>

    ${qualificacaoComprador(d)}

    <p>Doravante denominadas, em conjunto, Partes, têm entre si, justo e acertado o presente
    Contrato de Compra e Venda de Equipamento de Mobilidade Individual Autopropelido, que se regerá
    pelas cláusulas seguintes:</p>

    <p><b>CLÁUSULA PRIMEIRA</b> – O objeto do presente instrumento contratual é a aquisição pelo(a)
    COMPRADOR(A) do veículo autopropelido elétrico da marca ${esc(d.marca)}, modelo
    ${esc(d.modelo)}, cor ${esc(d.cor)}, número de série ${esc(d.chassi)}, possuindo as demais
    características e especificações constantes da nota fiscal.</p>

    <p><b>CLÁUSULA SEGUNDA</b> – Pela assinatura do presente instrumento, o(a) COMPRADOR(A) declara
    que lhe foram devidamente expostas todas as características do Equipamento ora adquirido e que
    todas suas dúvidas foram esclarecidas pela VENDEDORA. Independentemente do teste drive, diante
    de todas as informações técnicas prestadas pela VENDEDORA, atesta o CLIENTE COMPRADOR que o
    EQUIPAMENTO se presta perfeitamente à destinação que lhe será dada;</p>

    <p><b>CLÁUSULA TERCEIRA</b> – O COMPRADOR declara ter ciência de que a circulação do objeto
    deste contrato é regulamentada pela Resolução CONTRAN nº 996, de 15 de junho de 2023,
    enquadrando-se juridicamente como Equipamento de Mobilidade Individual Autopropelido, por
    atender cumulativamente às seguintes características de fábrica:</p>
    <p>a) Potência nominal máxima do motor de propulsão de até 1.000 W (mil watts);<br/>
    b) Velocidade máxima de fabricação de até 32 km/h (trinta e dois quilômetros por hora);<br/>
    c) Largura máxima de até 70 cm (setenta centímetros); e<br/>
    d) Distância entre eixos de até 130 cm (cento e trinta centímetros).</p>
    <p>3.1. Nos termos do Art. 12 da referida Resolução e do Art. 134-A do Código de Trânsito
    Brasileiro (CTB), o equipamento não está sujeito a registro, licenciamento, emplacamento ou
    exigência de Carteira Nacional de Habilitação (CNH) para sua circulação em vias públicas e
    espaços autorizados.</p>
    <p>3.2. O COMPRADOR assume integral responsabilidade pela observância das regras de circulação
    locais e pela manutenção/uso dos equipamentos obrigatórios previstos na legislação (como
    campainha, sinalização noturna e indicador de velocidade).</p>
    <p>3.3. A VENDEDORA exime-se de qualquer responsabilidade civil, criminal ou administrativa
    decorrente de eventuais modificações estruturais, adulterações de software, remoção de
    limitadores ou desbloqueios de potência e velocidade efetuados após a entrega do produto,
    ficando o COMPRADOR ciente de que tais alterações podem reclassificar o veículo (ex.: para
    ciclomotor), sujeitando-o às exigências legais e penalidades aplicáveis.</p>

    <p><b>CLÁUSULA QUARTA</b> – O COMPRADOR(A) declara que negociou livremente o preço do bem e
    que, por isso, o valor ajustado e as condições desta compra e venda foram estabelecidas de
    forma consensual pelas partes, estando elas em perfeita consonância e clareza;</p>

    <p><b>CLÁUSULA QUINTA</b> – A VENDEDORA declara, neste ato, que o bem ora negociado não é
    objeto de furto ou qualquer outra ação criminosa.</p>

    <p><b>CLÁUSULA SEXTA</b> – O preço, justo e acertado, é de R$ ${esc(d.valor)}, a ser pago da
    seguinte forma:</p>
    <ul>${descreverPagamentos(d.pagamentos, d.formaPagamento).map(l => `<li>${esc(l)}</li>`).join('')}</ul>

    <p><b>CLÁUSULA SÉTIMA</b> – Através da assinatura deste instrumento, o(a) COMPRADOR(A) declara
    que foi previamente informado(a) pela VENDEDORA de que, caso o bem não esteja disponível no
    estoque da VENDEDORA, o preço e/ou as características gerais do bem estarão sujeitos a
    alterações pela fabricante. O valor e as especificações do bem somente se tornarão definitivos
    no momento da emissão da Nota Fiscal de compra e venda, respeitando o preço vigente na data de
    emissão.</p>
    <p>7.1. Caso o bem adquirido não se encontre disponível em estoque, sua entrega estará
    condicionada à disponibilização do item pela fabricante, sem que haja qualquer responsabilidade
    da VENDEDORA em relação ao prazo de entrega.</p>

    <p><b>CLÁUSULA OITAVA</b> – O COMPRADOR é totalmente responsável pelo fornecimento de
    informações e documentos à VENDEDORA, não se responsabilizando esta última, inclusive perante
    terceiros e agentes financiadores, por fornecimento de dados e/ou documentação falsos pelo(a)
    COMPRADOR(A).</p>

    <p><b>CLÁUSULA NONA</b> – Após a confirmação do pagamento, será realizada a entrega física do
    veículo ao(à) COMPRADOR(A), ocasião em que lhe serão transferidas a posse e a propriedade do
    bem, aperfeiçoando-se a compra e venda, que, a partir de então, torna-se irrevogável e
    irretratável. A partir da entrega do veículo, o(a) COMPRADOR(A) passa a assumir toda a
    responsabilidade civil, administrativa e criminal sobre o bem, inclusive por multas, infrações
    de trânsito, apreensões, tributos e quaisquer outros encargos ou penalidades decorrentes de sua
    posse ou utilização.</p>

    <p><b>CLÁUSULA DÉCIMA</b> – A entrega física do bem será realizada no estabelecimento comercial
    da VENDEDORA, após a liberação do departamento financeiro e mediante agendamento prévio com o
    departamento de entrega técnica.</p>

    <p><b>CLÁUSULA DÉCIMA PRIMEIRA</b> – A VENDEDORA assegura ao(à) COMPRADOR(A) a garantia legal
    de 90 (noventa) dias, nos termos do Código de Defesa do Consumidor, para todos os componentes
    do veículo.</p>
    <p>11.1. Além da garantia legal, a VENDEDORA concede garantia contratual complementar de 09
    (nove) meses, totalizando 01 (um) ano de garantia exclusivamente para motor, bateria e módulo,
    sendo os 09 (nove) meses adicionais condicionados à realização das revisões periódicas na
    VENDEDORA, observando-se os intervalos máximos de 03 (três) meses ou 2.000 (dois mil)
    quilômetros rodados, prevalecendo o que ocorrer primeiro.</p>
    <p>11.2. A garantia contratual não abrange os demais componentes do veículo, os quais
    permanecem cobertos exclusivamente pela garantia legal de 90 (noventa) dias.</p>
    <p>11.3. A garantia não será aplicada em caso de danos devido ao mau uso ou uso severo,
    armazenamento incorreto, acidentes, agentes externos, desgaste por abrasão, corrosão ou erosão,
    desgaste natural pelo uso regular do Equipamento ou por modificações ou intervenções de
    terceiros realizadas sem autorização da vendedora no período de vigência da garantia
    contratual.</p>
    <p><b>PARÁGRAFO PRIMEIRO</b> – Fica desde logo acordado, que somente a VENDEDORA poderá
    providenciar a manutenção do Equipamento objeto do presente instrumento, caso venha a ocorrer
    qualquer necessidade de reparos durante o período de garantia e que não será realizado o
    reembolso de pagamentos referentes a reparos feitos por terceiros sem autorização da
    vendedora.</p>
    <p><b>PARÁGRAFO SEGUNDO</b> – O COMPRADOR declara estar ciente de que recebeu e leu o "Manual
    de Uso e Cuidados com a Bateria", o qual passa a fazer parte integrante do presente contrato
    (ANEXO I). Ao assinar o presente instrumento, o(a) COMPRADOR confirma que compreende as
    instruções e recomendações contidas no manual e compromete-se a seguir as orientações de uso e
    manutenção descritas para garantir a durabilidade e segurança da bateria.</p>
    <p><b>PARÁGRAFO TERCEIRO</b> – O(A) COMPRADOR(A) declara estar ciente de que a obrigação da
    VENDEDORA se limita à realização das revisões, manutenções e eventuais reparos exclusivamente
    em seu estabelecimento físico. Para tanto, o(a) COMPRADOR(A) compromete-se a, mediante
    agendamento prévio, disponibilizar o veículo sempre que necessário, responsabilizando-se pelo
    seu transporte até o estabelecimento físico da VENDEDORA, bem como pela sua retirada após a
    conclusão dos serviços. Fica expressamente estabelecido que a VENDEDORA não arcará com
    quaisquer despesas de transporte, remoção, guincho, frete, deslocamento, veículo reserva ou
    custos correlatos inerentes à imobilização do veículo para revisão ou reparos.</p>

    <p><b>CLÁUSULA DÉCIMA SEGUNDA</b> – Nos casos em que o(a) COMPRADOR(A) adquirir o Equipamento
    objeto do presente instrumento, para fins de posterior revenda, a responsabilidade da VENDEDORA
    cessa no momento de entrega do bem ao(a) COMPRADOR(A). Deste modo, a VENDEDORA não se
    responsabiliza por nenhum tipo de negociação e/ou promessa que venha a ser realizada pelo
    COMPRADOR(A) a terceiros.</p>

    <p><b>CLÁUSULA DÉCIMA TERCEIRA</b> – O(A) COMPRADOR(A) autoriza, de forma gratuita, o uso de
    sua imagem em fotografias e vídeos realizados pela VENDEDORA no ato da entrega do veículo,
    exclusivamente para divulgação de suas atividades comerciais em redes sociais, website,
    materiais publicitários e demais meios de comunicação.</p>

    <p><b>CLÁUSULA DÉCIMA QUARTA</b> – O(A) COMPRADOR(A) declara estar ciente de que a VENDEDORA
    realizará o tratamento de seus dados pessoais, tais como nome, CPF ou CNPJ, endereço, e-mail,
    telefone e demais informações necessárias à execução deste contrato, ao cumprimento de
    obrigações legais e à prestação dos serviços relacionados à compra e venda do veículo. A
    VENDEDORA compromete-se a utilizar os dados de forma confidencial, em conformidade com a Lei
    Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD), restringindo o acesso às informações
    apenas aos seus colaboradores e prestadores de serviço que necessitem delas para o desempenho
    de suas atividades, adotando as medidas de segurança cabíveis para sua proteção.</p>
    <p><b>PARÁGRAFO ÚNICO</b> – Fica, desde já, ciente o Comprador de que poderá solicitar
    expressamente e a qualquer tempo a desativação de seus dados, ocasião em que a Vendedora
    efetuará a desativação a partir do pedido do interessado titular dos dados.</p>

    <p><b>CLÁUSULA DÉCIMA QUINTA</b> – ${CLAUSULA_ACEITE}</p>

    <p><b>CLÁUSULA DÉCIMA SEXTA</b> – Elegem as partes o foro da Comarca de ${esc(d.comarcaForo)},
    para nele serem dirimidas todas e quaisquer dúvidas ou questões oriundas do presente contrato,
    renunciando as partes a qualquer outro, por mais especial e privilegiado que seja,
    obrigando-se as partes por si, seus herdeiros e sucessores.</p>

    <p>E por assim estarem justos e contratados, extrai-se o presente instrumento digital, para
    gerar os efeitos de direito, assinando-o eletronicamente.</p>

    <p>${esc(d.cidadeSede)}, ${esc(d.dataVenda)}.</p>

    <h2>ANEXO I — Cartilha de Uso da Bateria</h2>
    <ul>${cartilha}</ul>
    <p>A MAIORIA DOS ACIDENTES COM BATERIAS OCORRE POR NEGLIGÊNCIA OU USO INCORRETO. SIGA
    CUIDADOSAMENTE ESTAS RECOMENDAÇÕES DE SEGURANÇA E PREVENÇÃO.</p>`
}

export type RespostaItem = 'ok' | 'nao' | 'na'

export const LABEL_RESPOSTA: Record<RespostaItem, string> = {
  ok: 'OK',
  nao: 'NÃO',
  na: 'NA',
}

export type RespostasChecklist = {
  /** item → resposta. Chave é o texto do item, para o jsonb ser legível anos depois. */
  itens: Record<string, RespostaItem>
  observacoes: string
}

/** Todo item respondido? É o que libera a assinatura do checklist. */
export function checklistCompleto(r: RespostasChecklist | null | undefined): boolean {
  if (!r) return false
  return ITENS_CHECKLIST.every(i => r.itens?.[i] === 'ok' || r.itens?.[i] === 'nao' || r.itens?.[i] === 'na')
}

// Três colunas por item. Sem respostas (documento ainda em branco, antes de o
// comprador preencher) as células saem vazias, prontas para marcar à caneta se
// alguém imprimir.
function checklist(d: DadosDocumento, r?: RespostasChecklist | null): string {
  const celula = (item: string, valor: RespostaItem) => {
    const marcado = r?.itens?.[item] === valor
    return `<td style="width:44px;text-align:center;${marcado ? 'font-weight:700;background:#f1f5f9' : ''}">${marcado ? '✓' : ''}</td>`
  }
  const linhas = ITENS_CHECKLIST.map(i => `
    <tr>
      <td>${esc(i)}</td>
      ${celula(i, 'ok')}${celula(i, 'nao')}${celula(i, 'na')}
    </tr>`).join('')

  const obs = (r?.observacoes ?? '').trim()

  return `
    <h1>CHECKLIST DE ENTREGA</h1>
    <table>
      <tr><th>Vendedora</th><td>${esc(d.lojaNome)} — ${esc(d.lojaCidade)}</td></tr>
      <tr><th>Comprador</th><td>${esc(d.clienteNome)} — ${rotuloDocumento(d.clienteCpf)} ${esc(formatarCpfCnpj(d.clienteCpf))}</td></tr>
      <tr><th>Veículo</th><td>${esc(d.marca)} ${esc(d.modelo)}, cor ${esc(d.cor)}, chassi ${esc(d.chassi)}, motor ${esc(d.motor)}</td></tr>
    </table>
    <h2>Itens conferidos na entrega</h2>
    <table>
      <tr>
        <th>Item</th>
        <th style="width:44px;text-align:center">OK</th>
        <th style="width:44px;text-align:center">NÃO</th>
        <th style="width:44px;text-align:center">NA</th>
      </tr>
      ${linhas}
    </table>
    <p style="font-size:10px;color:#64748b">NA = não se aplica a este veículo.</p>
    <h2>Observações</h2>
    <p style="min-height:34px;border:1px solid #e2e8f0;padding:6px;white-space:pre-wrap">${obs ? esc(obs) : '—'}</p>
    <p>O comprador declara ter recebido o veículo na data de ${esc(d.dataVenda)}, conferido os
    itens acima e recebido as orientações de uso, carga e manutenção.</p>
    <p class="clausula">${CLAUSULA_ACEITE}</p>`
}

// O HTML gerado aqui é CONGELADO no banco. Precisa ser determinístico: nada de
// data de hoje, random ou qualquer coisa que mude entre duas chamadas com os
// mesmos dados.
//
// O checklist é montado duas vezes: em branco no envio, e de novo na assinatura
// com as marcações do comprador — é essa segunda versão que ele assina e que
// entra no hash.
export function montarHtmlDocumento(
  tipo: TipoDocumento,
  d: DadosDocumento,
  respostas?: RespostasChecklist | null,
): string {
  const corpo = tipo === 'contrato_venda' ? contrato(d) : checklist(d, respostas)
  return envolverDocumento(corpo)
}

/** Mesmo estilo de impressão para todo documento assinável (venda e adesão). */
export function envolverDocumento(corpo: string): string {
  return `<style>${ESTILO}</style><article class="doc">${corpo}</article>`
}
