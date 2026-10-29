import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, date, numeric, jsonb, pgView, integer, bigint, primaryKey, unique, uniqueIndex,
  foreignKey, index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { StatusAdesao } from '@/lib/adesao-campos'
import type { SituacaoCarta } from '@/lib/notagateway/carta-correcao'


// ─── Enums ───────────────────────────────────────────────────────────────────
export const papelEnum = pgEnum('papel', ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo'])
export const reservaStatusEnum = pgEnum('reserva_status', ['ativa', 'convertida', 'cancelada'])
export const categoriaEnum = pgEnum('categoria', ['autopropelido', 'ciclomotor', 'triciclo', 'bike', 'brinquedo', 'patinete'])
export const motoStatusEnum = pgEnum('moto_status', ['faturada', 'montada', 'disponivel', 'reservada', 'em_garantia', 'vendida', 'caixa'])
export const disponibilidadeEnum = pgEnum('disponibilidade_moto', ['disponivel', 'reservada', 'vendida', 'aguardando_aprovacao'])
export const pedidoStatusEnum = pgEnum('pedido_status', ['pendente', 'efetivado', 'cancelado'])
export const transferenciaStatusEnum = pgEnum('transferencia_status', ['pendente', 'aceita', 'recusada'])
export const aprovacaoVendaStatusEnum = pgEnum('aprovacao_venda_status', ['pendente', 'aprovada', 'recusada'])
// 'valor_minimo': venda abaixo do preço mínimo, aprovada por admin_geral/admin_socio do grupo.
// 'pagamento_sensivel': venda com financiamento/transferência, só o responsável (ver EMAIL_ACESSO_MULTI_GRUPO) aprova.
export const aprovacaoVendaTipoEnum = pgEnum('aprovacao_venda_tipo', ['valor_minimo', 'pagamento_sensivel'])
// 'cancelada' é terminal e fica fora de SEQUENCIA_STATUS — só se chega nele pela
// cancelarOSAction, e só a partir de OS sem pagamento/conciliação.
export const osStatusEnum = pgEnum('os_status', [
  'aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida', 'cancelada',
])
export const garantiaStatusEnum = pgEnum('garantia_status', ['ativa', 'encerrada'])
export const historicoTipoEnum = pgEnum('historico_tipo', ['entrada', 'saida', 'transferencia_enviada', 'transferencia_recebida', 'mudanca_status'])
export const referenciaEnum = pgEnum('referencia_tipo', ['transferencia', 'pedido_venda', 'aprovacao_venda'])
export const tipoLancamentoEnum = pgEnum('tipo_lancamento', ['entrada', 'saida'])
export const tipoPessoaEnum = pgEnum('tipo_pessoa', ['fisica', 'juridica'])
export const sexoEnum = pgEnum('sexo', ['masculino', 'feminino', 'nao_identificado'])
export const demandaStatusEnum = pgEnum('demanda_status', ['aberta', 'atendida'])
export const tipoCorrespondenciaPixEnum = pgEnum('tipo_correspondencia_pix', ['venda', 'os', 'pedido', 'peca'])

// ─── contas ──────────────────────────────────────────────────────────────────
// O cliente do MOVA, acima do grupo (ADR-0018): uma Conta tem um ou mais grupos.
export const contas = pgTable('contas', {
  id:       uuid('id').primaryKey().defaultRandom(),
  nome:     text('nome').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── cargos ──────────────────────────────────────────────────────────────────
// Cargo da Conta (#449): nome e módulos de @/lib/navegacao. Ler e gravar via @/lib/cargos.
export const cargos = pgTable('cargos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  contaId:      uuid('conta_id').notNull().references(() => contas.id),
  nome:         text('nome').notNull(),
  modulos:      text('modulos').array().notNull().default([]),
  criadoEm:     timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── grupos ──────────────────────────────────────────────────────────────────
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  blingClientId:      text('bling_client_id'),
  blingClientSecret:  text('bling_client_secret'),
  // Endpoint do mcp.ai desta empresa (Open Finance: extrato, PIX e cartão).
  // CIFRADO (AES-256-GCM/CERT_MASTER_KEY) porque a URL já carrega o segredo de
  // acesso dentro dela. Nulo = ainda usa a env MCPAI_ENDPOINT_URL global.
  // Ver src/lib/mcpai-credencial.ts.
  mcpaiEndpointUrl:   text('mcpai_endpoint_url'),
  // OBSOLETO: avisos migraram para WhatsApp (env WHATSAPP_ALERTA_NUMERO).
  // Coluna mantida só pra evitar migração de drop; remover numa migração futura.
  telegramChatId:     text('telegram_chat_id'),
  // OBSOLETO desde a migração 0066: a meta virou `metasLoja` — por loja, em R$ e
  // por mês. Nada lê esta coluna; mantida só pra não misturar drop com a entrega.
  metaMotosMes:       integer('meta_motos_mes'),
  // Cor da bandeira (chave da paleta em @/lib/grupo-cores). Deixa a barra de grupo
  // ativo inconfundível, pra não lançar entrada/saída na empresa errada.
  cor:                text('cor'),
  // Qualificação da pessoa jurídica no contrato de compra e venda. Cada grupo é
  // uma empresa distinta — sem isso o contrato sairia com o CNPJ da errada.
  // Editável em /admin/grupos.
  razaoSocial:        text('razao_social'),
  enderecoSede:       text('endereco_sede'),
  // Cidade da sede: é o local do fecho do contrato ("Pouso Alegre, 11/08/2026").
  // Não é a cidade da loja que vendeu, nem se deriva da comarca.
  cidadeSede:         text('cidade_sede'),
  comarcaForo:        text('comarca_foro'),
  // A 1ª mensalidade vence 30 dias depois disto (contrato 4.1). Gravado uma vez,
  // no primeiro acesso de quem não é admin_geral: a implantação não conta.
  primeiroAcessoEm:   timestamp('primeiro_acesso_em', { withTimezone: true }),
  // Destino do "Enviar ao contador" em Notas Emitidas (#402); cada CNPJ tem o seu.
  emailContador:      text('email_contador'),
  contaId:            uuid('conta_id').notNull().references(() => contas.id),
})

// ─── log_acoes ────────────────────────────────────────────────────────────────
// Acessos e ações sensíveis, 12 meses (#198). Gravar só por src/lib/log-acoes.ts.
export const logAcoes = pgTable('log_acoes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  contaId:   uuid('conta_id').references(() => contas.id),
  grupoId:   uuid('grupo_id').references(() => grupos.id),
  // Sem FK de propósito: o log sobrevive à exclusão do usuário (0136).
  usuarioId: uuid('usuario_id').notNull(),
  /** Ver TIPOS_LOG em @/lib/log-acoes (check log_acoes_tipo_check no banco). */
  tipo:      text('tipo').notNull(),
  detalhe:   jsonb('detalhe').$type<Record<string, unknown>>(),
  ip:        text('ip'),
  userAgent: text('user_agent'),
  dia:       date('dia').notNull(),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── pedidos_fabrica_alerta ──────────────────────────────────────────────────
// Memória do alerta de pedido "aguardando pagamento" no portal da fábrica.
// Sem isso o cron re-avisaria o mesmo pedido em toda rodada.
export const pedidosFabricaAlerta = pgTable('pedidos_fabrica_alerta', {
  id:               uuid('id').primaryKey().defaultRandom(),
  grupoId:          uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  // Cada loja tem sua conta no portal e sua própria fila de pendências.
  lojaId:           uuid('loja_id').notNull().references(() => lojas.id, { onDelete: 'cascade' }),
  numeroPedido:     text('numero_pedido').notNull(),
  valor:            numeric('valor', { precision: 12, scale: 2 }),
  dataPedido:       text('data_pedido'),
  primeiroAlertaEm: timestamp('primeiro_alerta_em', { withTimezone: true }).notNull().defaultNow(),
  ultimoAlertaEm:   timestamp('ultimo_alerta_em', { withTimezone: true }).notNull().defaultNow(),
  // Quando o aviso saiu no WhatsApp. Nulo = pedido conhecido, mas ainda não
  // avisado (o disparo falhou) — segue entrando como "novo" na próxima rodada.
  avisadoEm:        timestamp('avisado_em', { withTimezone: true }),
  // Preenchido quando o pedido some da lista de "aguardando pagamento".
  resolvidoEm:      timestamp('resolvido_em', { withTimezone: true }),
}, t => [unique('pedidos_fabrica_alerta_loja_pedido_key').on(t.lojaId, t.numeroPedido)])

// Resultado da última leitura do portal da fábrica, por loja. É o que permite ao
// card do dashboard separar "nenhum pedido pendente" de "ninguém leu esta conta".
export const fabricaSyncLoja = pgTable('fabrica_sync_loja', {
  lojaId:      uuid('loja_id').primaryKey().references(() => lojas.id, { onDelete: 'cascade' }),
  status:      text('status').notNull(),
  erro:        text('erro'),
  pedidos:     integer('pedidos').notNull().default(0),
  executadoEm: timestamp('executado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── lojas ───────────────────────────────────────────────────────────────────
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  cep: text('cep'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  // Login da loja no portal da fábrica (motochefebrasil.store). Cada loja é um
  // cadastro distinto lá — o que uma conta enxerga a outra não enxerga.
  fabricaEmail: text('fabrica_email'),
  fabricaSenha: text('fabrica_senha'),
})

// ─── maquininhas ─────────────────────────────────────────────────────────────
// Maquininhas de cartão do grupo (#460). Ler e conferir via @/lib/maquininhas.
export const maquininhas = pgTable('maquininhas', {
  id:        uuid('id').primaryKey().defaultRandom(),
  grupoId:   uuid('grupo_id').notNull().references(() => grupos.id),
  nome:      text('nome').notNull(),
  // Código gravado no pagamento e usado pela conciliação.
  operadora: text('operadora').notNull(),
  ativo:     boolean('ativo').notNull().default(true),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  grupoOperadora: unique().on(t.grupoId, t.operadora),
}))

// ─── usuarios ────────────────────────────────────────────────────────────────
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey(), // vinculado ao Supabase Auth uid
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  papel: papelEnum('papel').notNull(),
  // Funções acumuladas além do papel principal (ex.: aux_adm que também vende).
  // Só acrescenta permissão, nunca tira. Ler sempre via temPapel() de @/lib/auth,
  // não comparando com .papel direto.
  papeisExtras: text('papeis_extras').array().notNull().default([]),
  // Exceção de acesso por pessoa, em cima do padrão do papel definido em
  // @/lib/navegacao. Guardam o `id` do item, não o href. Ler sempre via
  // itensVisiveis()/podeAcessar(), nunca comparando direto.
  modulosExtras:     text('modulos_extras').array().notNull().default([]),
  modulosBloqueados: text('modulos_bloqueados').array().notNull().default([]),
  lojaId: uuid('loja_id').references(() => lojas.id), // nullable para admin_geral
  conecta: text('conecta'), // link individual do usuário (menu Conecta); nullable
  // Grupos EXTRAS onde este usuário aprova venda (além do grupo da própria loja).
  // Ver src/lib/aprovacao-permissao.ts — editável em /admin/usuarios.
  gruposAprovacao: uuid('grupos_aprovacao').array().notNull().default([]),
  // Libera aprovar financiamento/transferência, nos mesmos grupos acima.
  aprovaPagamentoSensivel: boolean('aprova_pagamento_sensivel').notNull().default(false),
  // Grupos EXTRAS que este usuário pode ESCOLHER no seletor de empresa (além do
  // grupo da própria loja). Coluna separada de grupos_aprovacao de propósito:
  // aprovar pagamento num grupo e enxergar/trocar para aquele grupo são coisas
  // diferentes — um sócio pode ter sido liberado para aprovar uma venda pontual
  // em outro grupo sem que isso signifique que ele deva navegar pelos dados
  // daquele tenant inteiro. Ver src/lib/acesso-grupo.ts (regra pura, testável
  // sem banco) e getGrupoAtivo() em src/lib/grupo.ts, que é quem impõe isso.
  gruposAcesso: uuid('grupos_acesso').array().notNull().default([]),
  // Inativo continua no sistema (histórico intacto), mas some dos relatórios de
  // vendedor e do 1-a-1. Ver /admin/usuarios e queries/individual.
  ativo: boolean('ativo').notNull().default(true),
  // Conta de origem (ADR-0018). Nula só para admin_geral, que é da plataforma.
  contaId: uuid('conta_id').references(() => contas.id),
  // Só com papel 'cargo' (#449); o banco garante os dois juntos.
  cargoId: uuid('cargo_id').references(() => cargos.id),
})

// ─── usuarios_dados ──────────────────────────────────────────────────────────
// Dado pessoal do funcionário, preenchido por ele mesmo em /completar-cadastro.
// Fica em tabela separada de `usuarios` de propósito: getUsuarioLogado() faz
// select() na linha inteira de `usuarios`, que circula pelo layout e chega a
// componentes de cliente — CPF e chave PIX não podem pegar carona nisso.
export const usuariosDados = pgTable('usuarios_dados', {
  usuarioId:      uuid('usuario_id').primaryKey().references(() => usuarios.id),
  cpf:            text('cpf').notNull(),          // só dígitos
  pixTipo:        text('pix_tipo').notNull(),     // cpf | celular | email | aleatoria
  pixChave:       text('pix_chave').notNull(),
  dataNascimento: date('data_nascimento').notNull(),
  preenchidoEm:   timestamp('preenchido_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm:   timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── modelos ─────────────────────────────────────────────────────────────────
export const modelos = pgTable('modelos', {
  id: uuid('id').primaryKey().defaultRandom(),
  marca: text('marca').notNull(),
  modelo: text('modelo').notNull(),
  categoria: categoriaEnum('categoria').notNull(),
  potenciaW: text('potencia_w').notNull(),
  motor: text('motor').notNull(),
  velocidadeMax: text('velocidade_max').notNull(),
  precoCompraPadrao: numeric('preco_compra_padrao', { precision: 12, scale: 2 }),
  imagemUrl: text('imagem_url'),
  // Nulo = catálogo da plataforma; preenchido = modelo só daquela Conta (#321).
  contaId: uuid('conta_id').references(() => contas.id),
})

// ─── modelo_ajustes ──────────────────────────────────────────────────────────
// O que a Conta mudou num modelo da plataforma (#476). Coluna nula herda o original.
export const modeloAjustes = pgTable('modelo_ajustes', {
  contaId: uuid('conta_id').notNull().references(() => contas.id),
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id, { onDelete: 'cascade' }),
  modelo: text('modelo'),
  categoria: categoriaEnum('categoria'),
  potenciaW: text('potencia_w'),
  motor: text('motor'),
  velocidadeMax: text('velocidade_max'),
  precoCompraPadrao: numeric('preco_compra_padrao', { precision: 12, scale: 2 }),
  imagemUrl: text('imagem_url'),
  oculto: boolean('oculto').notNull().default(false),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.contaId, t.modeloId] }),
}))

// ─── conta_marcas ────────────────────────────────────────────────────────────
// Marcas que a Conta enxerga nas listas de escolha (#287). Sem linha = todas.
export const contaMarcas = pgTable('conta_marcas', {
  contaId: uuid('conta_id').notNull().references(() => contas.id),
  marca: text('marca').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.contaId, t.marca] }),
}))

// ─── modelo_bling_codigos (código do produto Bling por modelo + grupo) ───────
export const modeloBlingCodigos = pgTable('modelo_bling_codigos', {
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  codigo: text('codigo').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.modeloId, t.grupoId] }),
}))

// ─── modelo_apelidos (nomes que as notas usam e o catalogo nao conhece) ───
// O infCpl da LAIOUNS chama o DRIFT CAR de "DRIFT" e o PATINETE G5 de "G5".
// Sem de-para o chassi nao acha a ficha fiscal do item. Dentro da Conta (e entre os
// da plataforma) um apelido nunca aponta para dois modelos.
export const modeloApelidos = pgTable('modelo_apelidos', {
  apelido:  text('apelido').notNull(),
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id, { onDelete: 'cascade' }),
  // Repete a Conta do modelo: o apelido é único dentro dela (#321).
  contaId:  uuid('conta_id').references(() => contas.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
// O índice real é NULLS NOT DISTINCT (0143); o IndexBuilder do Drizzle não declara isso.
}, t => [uniqueIndex('modelo_apelidos_conta_apelido_key').on(t.contaId, t.apelido)])

// ─── notagateway_config (credencial da emissao propria, por grupo) ───────
// Token cifrado como o certificado A1. empresaId vem do cadastro na API e e
// usado em toda chamada seguinte. Ver src/lib/notagateway/.
// ─── notas_fiscais_saida (NF-e própria emitida pela Nota Gateway) ───────────
// Uma linha por tentativa (id externo). Homologação não fatura a venda; em
// produção um índice parcial garante uma nota viva por venda (a migração mais
// recente que cria notas_fiscais_saida_uma_viva_idx).
export const notasFiscaisSaida = pgTable('notas_fiscais_saida', {
  id:           uuid('id').primaryKey().defaultRandom(),
  /** Nulo depois que a venda é cancelada: a NF fica como histórico (#347). */
  vendaId:      uuid('venda_id'),
  /** Número da venda, que continua identificando a NF depois do cancelamento. */
  vendaNumero:  integer('venda_numero').notNull(),
  grupoId:      uuid('grupo_id').notNull(),
  idExterno:    text('id_externo').notNull().unique(),
  ambiente:     text('ambiente').notNull(),
  /** Enviando, Processando e Descartada são nossos; o resto vem da API. Classifique por notagateway/status.ts. */
  status:       text('status').notNull().default('Enviando'),
  motivoStatus: text('motivo_status'),
  numero:       text('numero'),
  serie:        text('serie'),
  chave:        text('chave'),
  protocolo:    text('protocolo'),
  linkDanfe:    text('link_danfe'),
  linkXml:      text('link_xml'),
  payload:      jsonb('payload').notNull(),
  emitidaPor:   uuid('emitida_por'),
  /** Da consulta à API; o prazo de cancelamento conta daqui. */
  dataAutorizacao:    timestamp('data_autorizacao', { withTimezone: true }),
  cancelamentoMotivo: text('cancelamento_motivo'),
  cancelamentoPor:    uuid('cancelamento_por'),
  cancelamentoEm:     timestamp('cancelamento_em', { withTimezone: true }),
  criadoEm:     timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  /** Protocolo gravado pela v1.4.0, que cancelava só no MOVA; não se usa mais (#176). */
  cancelamentoProtocolo: text('cancelamento_protocolo'),
  /** Contador que pediu à SEFAZ a liberação do cancelamento extemporâneo (#176). */
  cancelamentoContador: text('cancelamento_contador'),
})

// Cartas de correção da NF de saída (#187). Recusada fica como histórico e libera o número.
export const notasFiscaisSaidaCartas = pgTable('notas_fiscais_saida_cartas', {
  id:           uuid('id').primaryKey().defaultRandom(),
  notaId:       uuid('nota_id').notNull().references(() => notasFiscaisSaida.id),
  grupoId:      uuid('grupo_id').notNull().references(() => grupos.id),
  idExterno:    text('id_externo').notNull().unique(),
  ambiente:     text('ambiente').notNull(),
  numero:       integer('numero').notNull(),
  correcao:     text('correcao').notNull(),
  /** pendente | autorizada | recusada: nossa leitura do status da API (notagateway/carta-correcao.ts). */
  situacao:     text('situacao').$type<SituacaoCarta>().notNull().default('pendente'),
  status:       text('status').notNull().default('Enviando'),
  motivoStatus: text('motivo_status'),
  protocolo:    text('protocolo'),
  emitidaPor:   uuid('emitida_por').references(() => usuarios.id),
  criadoEm:     timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// Acervo das NF-e de saída do Bling no Storage (bucket nfe-bling, migração
// 0116). O botão DANFE de venda antiga lê daqui, não do Bling.
export const nfeBlingArquivo = pgTable('nfe_bling_arquivo', {
  grupoId:     uuid('grupo_id').notNull().references(() => grupos.id),
  blingNfeId:  text('bling_nfe_id').notNull(),
  numero:      text('numero').notNull(),
  serie:       text('serie'),
  chave:       text('chave'),
  documento:   text('documento'),
  dataEmissao: date('data_emissao'),
  situacao:    text('situacao').notNull(),
  xmlPath:     text('xml_path'),
  pdfPath:     text('pdf_path'),
  criadoEm:    timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.grupoId, t.blingNfeId] }) }))

export const notagatewayConfig = pgTable('notagateway_config', {
  grupoId:              uuid('grupo_id').primaryKey().references(() => grupos.id, { onDelete: 'cascade' }),
  token:                text('token').notNull(),
  empresaId:            text('empresa_id'),
  ambiente:             text('ambiente').notNull().default('Homologacao'),
  serieNfe:             text('serie_nfe').notNull().default('1'),
  proximoNumero:        integer('proximo_numero').notNull().default(1),
  certificadoEnviadoEm: timestamp('certificado_enviado_em', { withTimezone: true }),
  atualizadoEm:         timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  logoEnviadaEm:        timestamp('logo_enviada_em', { withTimezone: true }),
  logoEnviadaPor:       uuid('logo_enviada_por').references(() => usuarios.id, { onDelete: 'set null' }),
  siteDanfe:            text('site_danfe'),
})

// ─── regras_fiscais_saida (o que a NOSSA nota leva, por grupo) ──────────
// Nao vem do XML de entrada: 5405 e CFOP de entrada e a saida tem o seu. A do
// Sul de Minas foi extraida das ~200 notas ja aceitas pela SEFAZ.
export const regrasFiscaisSaida = pgTable('regras_fiscais_saida', {
  grupoId:                  uuid('grupo_id').primaryKey().references(() => grupos.id, { onDelete: 'cascade' }),
  naturezaOperacao:         text('natureza_operacao').notNull(),
  cfopInterno:              text('cfop_interno').notNull(),
  cstIcmsInterno:           text('cst_icms_interno').notNull(),
  cfopInterestadual:        text('cfop_interestadual').notNull(),
  cstIcmsInterestadual:     text('cst_icms_interestadual').notNull(),
  aliquotaIcmsInterestadual: numeric('aliquota_icms_interestadual', { precision: 5, scale: 2 }),
  cstPis:                   text('cst_pis').notNull(),
  aliquotaPis:              numeric('aliquota_pis', { precision: 6, scale: 4 }),
  cstCofins:                text('cst_cofins').notNull(),
  aliquotaCofins:           numeric('aliquota_cofins', { precision: 6, scale: 4 }),
  cstIpi:                   text('cst_ipi'),
  cstIbsCbs:                text('cst_ibscbs'),
  classTribIbsCbs:          text('class_trib_ibscbs'),
  crt:                      integer('crt').notNull().default(3),
  /** NULL = usa a origem real da moto; preenchido = forca esse valor. */
  origemFixa:               text('origem_fixa'),
  /** Lei da Transparencia: % aproximado de tributos (tabela do IBPT). */
  ibptFederal:              numeric('ibpt_federal', { precision: 5, scale: 2 }),
  ibptEstadual:             numeric('ibpt_estadual', { precision: 5, scale: 2 }),
  atualizadoEm:             timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── motos_fiscal (ficha fiscal da moto, copiada da NF-e de entrada) ─────────
// A ficha e da MOTO, nao do modelo: o mesmo X12 vem da LAIOUNS como CEST
// 2600101/origem 1/CST 10 e da Q.P.A como 2600100/origem 4/CST 60. E um
// snapshot da entrada -- a NF de saida espelha a de entrada daquela moto.
export const motosFiscal = pgTable('motos_fiscal', {
  motoId:          uuid('moto_id').primaryKey().references(() => motos.id, { onDelete: 'cascade' }),
  emitenteCnpj:    text('emitente_cnpj').notNull(),
  emitenteNome:    text('emitente_nome'),
  nfNumero:        text('nf_numero'),
  nfChave:         text('nf_chave'),
  cProd:           text('c_prod'),
  /** Nome fiscal LITERAL da nota de entrada. E ele que sai na NF de saida. */
  xProd:           text('x_prod'),
  ncm:             text('ncm').notNull(),
  cest:            text('cest'),
  unidade:         text('unidade'),
  origem:          text('origem'),
  // Guardados para conferencia, nao para emitir -- ver a migracao 0103.
  cfopEntrada:     text('cfop_entrada'),
  cstIcmsEntrada:  text('cst_icms_entrada'),
  cstPis:          text('cst_pis'),
  cstCofins:       text('cst_cofins'),
  classTribIbsCbs: text('class_trib_ibscbs'),
  criadoEm:        timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── motos_renave (detalhamento de veículo novo da NF de saída, grupo veicProd) ─
// Só ciclomotor. Preenchido no ato do envio e guardado por moto, como a ficha
// fiscal. O chassi é o da nota (editável na tela); não altera motos.chassi.
// Valores no vocabulário da Nota Gateway -- ver src/lib/notagateway/veiculo.ts
// e a migração 0131.
export const motosRenave = pgTable('motos_renave', {
  motoId:                 uuid('moto_id').primaryKey().references(() => motos.id, { onDelete: 'cascade' }),
  chassi:                 text('chassi').notNull(),
  tipoOperacao:           text('tipo_operacao').notNull(),
  corCodigo:              text('cor_codigo').notNull(),
  corDescricao:           text('cor_descricao').notNull(),
  corDenatran:            text('cor_denatran').notNull(),
  potenciaMotor:          text('potencia_motor').notNull(),
  cilindradas:            text('cilindradas').notNull(),
  pesoLiquido:            numeric('peso_liquido', { precision: 9, scale: 4 }).notNull(),
  pesoBruto:              numeric('peso_bruto', { precision: 9, scale: 4 }).notNull(),
  numeroSerie:            text('numero_serie').notNull(),
  tipoCombustivel:        text('tipo_combustivel').notNull(),
  numeroMotor:            text('numero_motor').notNull(),
  capacidadeMaximaTracao: numeric('capacidade_maxima_tracao', { precision: 9, scale: 4 }).notNull(),
  distanciaEixos:         text('distancia_eixos').notNull(),
  anoModelo:              integer('ano_modelo').notNull(),
  anoFabricacao:          integer('ano_fabricacao').notNull(),
  tipoPintura:            text('tipo_pintura').notNull(),
  tipoVeiculo:            text('tipo_veiculo').notNull(),
  especie:                text('especie').notNull(),
  condicaoVin:            text('condicao_vin').notNull(),
  condicao:               text('condicao').notNull(),
  codigoMarcaModelo:      text('codigo_marca_modelo').notNull(),
  lotacao:                integer('lotacao').notNull(),
  restricao:              text('restricao').notNull(),
  preenchidoPor:          uuid('preenchido_por').references(() => usuarios.id),
  criadoEm:               timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm:           timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── motos ───────────────────────────────────────────────────────────────────
export const motos = pgTable('motos', {
  id: uuid('id').primaryKey().defaultRandom(),
  chassi: text('chassi').notNull().unique(),
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  status: motoStatusEnum('status').notNull().default('caixa'),
  disponibilidade: disponibilidadeEnum('disponibilidade'),
  cor: text('cor').notNull(),
  notaFiscalEntrada: text('nota_fiscal_entrada').notNull(),
  motor: text('motor'),
  precoCompra: numeric('preco_compra', { precision: 12, scale: 2 }),
  responsavelMontagemId: uuid('responsavel_montagem_id').references(() => usuarios.id),
  dataMontagem: date('data_montagem'),
  // Moto cadastrada só para registrar garantia de veículo externo (chassi que não
  // estava na base). NUNCA é estoque — fica fora do Showroom. Ver
  // cadastrarVeiculoGarantiaAction e o filtro em listarMotos.
  somenteGarantia: boolean('somente_garantia').notNull().default(false),
})

// ─── reservas ────────────────────────────────────────────────────────────────
export const reservas = pgTable('reservas', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull().default(sql`nextval('numero_venda_seq')`),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  valorReserva: numeric('valor_reserva', { precision: 12, scale: 2 }).notNull(),
  valorTotalVenda: numeric('valor_total_venda', { precision: 12, scale: 2 }),
  meioPagamento: text('meio_pagamento').notNull(),
  // Detalhamento da entrada quando ela é dividida (migração 0088). Nulo em
  // reserva antiga — normalize com normalizarPagamentos, nunca leia cru.
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number }[]>(),
  dataPrevistaFinalizacao: date('data_prevista_finalizacao').notNull(),
  status: reservaStatusEnum('status').notNull().default('ativa'),
  clienteNome: text('cliente_nome'),
  clienteCpf: text('cliente_cpf'),
  clienteCelular: text('cliente_celular'),
  clienteEmail: text('cliente_email'),
  clienteCep: text('cliente_cep'),
  clienteLogradouro: text('cliente_logradouro'),
  clienteNumero: text('cliente_numero'),
  clienteComplemento: text('cliente_complemento'),
  clienteBairro: text('cliente_bairro'),
  clienteCidade: text('cliente_cidade'),
  clienteEstado: text('cliente_estado'),
  cartaoOperadora: text('cartao_operadora'),
  cartaoParcelas: numeric('cartao_parcelas'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  // Cancelamento (status 'cancelada'). O motivo é obrigatório na action: reserva
  // cancelada some da tela da moto, e sem motivo ninguém reconstrói o porquê.
  canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
  canceladaPor: uuid('cancelada_por').references(() => usuarios.id),
  cancelamentoMotivo: text('cancelamento_motivo'),
})

// ─── pedidos_venda ───────────────────────────────────────────────────────────
export const pedidosVenda = pgTable('pedidos_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull().default(sql`nextval('numero_venda_seq')`),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  status: pedidoStatusEnum('status').notNull().default('pendente'),
  dataPedido: timestamp('data_pedido', { withTimezone: true }).notNull().defaultNow(),
  dataAtualizacao: timestamp('data_atualizacao', { withTimezone: true }).notNull().defaultNow(),
  observacao: text('observacao'),
})

// ─── vendas ──────────────────────────────────────────────────────────────────
export const vendas = pgTable('vendas', {
  id: uuid('id').primaryKey().defaultRandom(),
  // número herdado do pedido_venda via trigger no banco
  numero: integer('numero').notNull().default(sql`nextval('numero_venda_seq')`),
  pedidoVendaId: uuid('pedido_venda_id').notNull().references(() => pedidosVenda.id),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  efetivadoPor: uuid('efetivado_por').notNull().references(() => usuarios.id),
  clienteNome: text('cliente_nome').notNull(),
  clienteCpf: text('cliente_cpf').notNull(),
  clienteCelular: text('cliente_celular'),
  clienteEmail: text('cliente_email'),
  clienteCep: text('cliente_cep'),
  clienteLogradouro: text('cliente_logradouro'),
  clienteNumero: text('cliente_numero'),
  clienteComplemento: text('cliente_complemento'),
  clienteBairro: text('cliente_bairro'),
  clienteCidade: text('cliente_cidade'),
  clienteEstado: text('cliente_estado'),
  /** Quem assina pela empresa na venda para pessoa jurídica. Opcional. */
  representanteNome: text('representante_nome'),
  representanteCpf: text('representante_cpf'),
  /** Contribuinte de ICMS do comprador CNPJ ('contribuinte' | 'isento' | 'nao_contribuinte'); vazio = não contribuinte. */
  clienteIndicadorIe: text('cliente_indicador_ie'),
  clienteInscricaoEstadual: text('cliente_inscricao_estadual'),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number }[]>(),
  reservaId: uuid('reserva_id').references(() => reservas.id),
  notaFiscalSaida: text('nota_fiscal_saida'),
  blingNfeId: text('bling_nfe_id'),
  statusConciliacao: text('status_conciliacao').notNull().default('pendente'),
  dataVenda: timestamp('data_venda', { withTimezone: true }).notNull().defaultNow(),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  /** Por onde o cliente chegou. NULL = venda anterior ao deploy da origem. */
  origemId: uuid('origem_id').references(() => origensVenda.id),
  origemDetalhe: text('origem_detalhe'),
  /** Liberação de exceção da trava de NF: só admin, e o motivo é obrigatório. */
  nfLiberadaEm: timestamp('nf_liberada_em', { withTimezone: true }),
  nfLiberadaPor: uuid('nf_liberada_por'),
  nfLiberacaoMotivo: text('nf_liberacao_motivo'),
})

// ─── origens_venda ───────────────────────────────────────────────────────────
// Catálogo de "por onde o cliente chegou", editável em /admin/origens e separado
// por grupo — cada bandeira tem suas campanhas. `tipo` existe para o relatório
// somar por natureza (todo o Digital) mesmo quando o catálogo enche de campanha
// pontual, já que a tela da venda tem um select só.
export const origensVenda = pgTable('origens_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  nome: text('nome').notNull(),
  tipo: text('tipo').notNull().default('Outro'),
  pedeDetalhe: boolean('pede_detalhe').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── aprovacoes_venda ────────────────────────────────────────────────────────
// origem distingue o que está pendente de aprovação: 'moto' (fluxo original — venda
// ainda não existe, só é criada quando aprovada), 'os' (a OS já existe, fica retida sem
// o pagamento aplicado), 'peca' (venda de peça ainda não existe, mesmo padrão de moto) ou
// 'peca_edicao' (a venda de peça existe; a edição guardada em dados_venda só é aplicada na aprovação).
export const aprovacoesVenda = pgTable('aprovacoes_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  origem: text('origem').notNull().default('moto'),
  motoId: uuid('moto_id').references(() => motos.id),
  osId: uuid('os_id'),  // FK: ordens_servico.id (sem ref Drizzle — declarada antes de ordensServico neste arquivo)
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  dadosVenda: jsonb('dados_venda').notNull(),
  motivo: text('motivo').notNull(),
  tipo: aprovacaoVendaTipoEnum('tipo').notNull().default('valor_minimo'),
  disponibilidadeAnterior: disponibilidadeEnum('disponibilidade_anterior'),
  status: aprovacaoVendaStatusEnum('status').notNull().default('pendente'),
  // Snapshot do desconto, gravado na criação do pedido (só tipo 'valor_minimo').
  // O desconto é derivado — valorMinimoSnapshot - liquidoSnapshot — porque a
  // precificação muda e recalcular depois reescreve o histórico. estimado = true
  // marca as linhas reconstruídas pelo backfill, não medidas na hora.
  valorMinimoSnapshot: numeric('valor_minimo_snapshot', { precision: 12, scale: 2 }),
  liquidoSnapshot: numeric('liquido_snapshot', { precision: 12, scale: 2 }),
  snapshotEstimado: boolean('snapshot_estimado').notNull().default(false),
  respondidoPor: uuid('respondido_por').references(() => usuarios.id),
  dataSolicitacao: timestamp('data_solicitacao', { withTimezone: true }).notNull().defaultNow(),
  dataResposta: timestamp('data_resposta', { withTimezone: true }),
})

// ─── transferencias ──────────────────────────────────────────────────────────
export const transferencias = pgTable('transferencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaOrigemId: uuid('loja_origem_id').notNull().references(() => lojas.id),
  lojaDestinoId: uuid('loja_destino_id').notNull().references(() => lojas.id),
  solicitadoPor: uuid('solicitado_por').notNull().references(() => usuarios.id),
  respondidoPor: uuid('respondido_por').references(() => usuarios.id),
  status: transferenciaStatusEnum('status').notNull().default('pendente'),
  dataSolicitacao: timestamp('data_solicitacao', { withTimezone: true }).notNull().defaultNow(),
  dataResposta: timestamp('data_resposta', { withTimezone: true }),
  observacao: text('observacao'),
})

// ─── historico_estoque ───────────────────────────────────────────────────────
export const historicoEstoque = pgTable('historico_estoque', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaOrigemId: uuid('loja_origem_id').references(() => lojas.id),
  lojaDestinoId: uuid('loja_destino_id').references(() => lojas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tipo: historicoTipoEnum('tipo').notNull(),
  statusAnterior: motoStatusEnum('status_anterior'),
  statusNovo: motoStatusEnum('status_novo'),
  referenciaTipo: referenciaEnum('referencia_tipo'),
  referenciaId: uuid('referencia_id'),
  data: timestamp('data', { withTimezone: true }).notNull().defaultNow(),
  observacao: text('observacao'),
})

// ─── ordens_servico ──────────────────────────────────────────────────────────
export const ordensServico = pgTable('ordens_servico', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero'),
  motoId: uuid('moto_id').references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  abertaPor: uuid('aberta_por').notNull().references(() => usuarios.id),
  mecanicoId: uuid('mecanico_id').references(() => usuarios.id),
  status: osStatusEnum('status').notNull().default('aberta'),
  descricao: text('descricao').notNull(),
  diagnostico: text('diagnostico'),
  observacoesFinais: text('observacoes_finais'),
  valorTotal: numeric('valor_total', { precision: 10, scale: 2 }),
  // Split persistido de valorTotal por tipo de item (os_itens.tipo) — usado pra comissionar
  // mecanico só pela mão de obra e aux_adm só pelas peças usadas na OS (ver recalcularTotal).
  valorServicos: numeric('valor_servicos', { precision: 10, scale: 2 }).notNull().default('0'),
  valorPecas: numeric('valor_pecas', { precision: 10, scale: 2 }).notNull().default('0'),
  formaPagamento: text('forma_pagamento'),
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]>(),
  dataPrevisao: timestamp('data_previsao', { withTimezone: true }),
  marcaExterna: text('marca_externa'),
  modeloExterno: text('modelo_externo'),
  placa: text('placa'),
  km: integer('km'),
  clienteNomeExterno: text('cliente_nome_externo'),
  clienteFoneExterno: text('cliente_fone_externo'),
  // Cliente que não está no cadastro (`clienteId` nulo). Sem documento não dá pra
  // fechar OS para empresa — ver migração 0074.
  clienteDocumentoExterno: text('cliente_documento_externo'),
  clienteTipoPessoaExterno: text('cliente_tipo_pessoa_externo'),
  dataAbertura: timestamp('data_abertura', { withTimezone: true }).notNull().defaultNow(),
  dataConclusao: timestamp('data_conclusao', { withTimezone: true }),
  oficinaEm: timestamp('oficina_em', { withTimezone: true }),
  emAndamentoEm: timestamp('em_andamento_em', { withTimezone: true }),
  finalizadaEm: timestamp('finalizada_em', { withTimezone: true }),
  pendentePagamentoEm: timestamp('pendente_pagamento_em', { withTimezone: true }),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  agendamentoId: uuid('agendamento_id'),  // FK: agendamentos.id (sem ref Drizzle — circular)
  origem: text('origem').notNull().default('walk_in'),
  chassiOs: text('chassi_os'),             // chassi real do veículo na OS
  motivoCancelamento: text('motivo_cancelamento'),
  canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
  canceladaPor: uuid('cancelada_por').references(() => usuarios.id),
})

// ─── agendamentos ─────────────────────────────────────────────────────────────
export const agendamentos = pgTable('agendamentos', {
  id:               uuid('id').primaryKey().defaultRandom(),
  lojaId:           uuid('loja_id').notNull().references(() => lojas.id),
  mecanicoId:       uuid('mecanico_id').references(() => usuarios.id),
  clienteId:        uuid('cliente_id').references(() => clientes.id),
  clienteNome:      text('cliente_nome').notNull(),
  clienteFone:      text('cliente_fone').notNull(),
  tipoServico:      text('tipo_servico').notNull(),
  descricaoCliente: text('descricao_cliente'),
  dataHoraInicio:   timestamp('data_hora_inicio', { withTimezone: true }).notNull(),
  duracaoMinutos:   integer('duracao_minutos').notNull().default(60),
  status:           text('status').notNull().default('pendente'),
  osId:             uuid('os_id'),  // FK: ordens_servico.id (sem ref Drizzle — circular)
  criadoPor:        uuid('criado_por').references(() => usuarios.id),
  criadoEm:         timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── veiculos_historico ───────────────────────────────────────────────────────
export const veiculosHistorico = pgTable('veiculos_historico', {
  id:           uuid('id').primaryKey().defaultRandom(),
  chassi:       text('chassi').notNull(),
  numeroMotor:  text('numero_motor'),
  marca:        text('marca').notNull().default(''),
  modelo:       text('modelo').notNull().default(''),
  cor:          text('cor'),
  ano:          integer('ano'),
  nfEntrada:    text('nf_entrada'),
  // Conta que importou (#325): cada Conta só vê o próprio histórico.
  contaId:      uuid('conta_id').notNull().references(() => contas.id),
  importadoEm:  timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('veiculos_historico_conta_chassi_key').on(t.contaId, t.chassi)])

// ─── servicos_catalogo ─────────────────────────────────────────────────────────
export const servicosCatalogo = pgTable('servicos_catalogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tempoPrevistoMinutos: integer('tempo_previsto_minutos'),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── pecas_catalogo ────────────────────────────────────────────────────────────
export const pecasCatalogo = pgTable('pecas_catalogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
  quantidadeEstoque: integer('quantidade_estoque').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  // Catálogo da Conta: as lojas dela compartilham, as outras Contas não veem (#195).
  contaId: uuid('conta_id').notNull().references(() => contas.id),
  // Custo da última nota de entrada (#341). Registro; não mexe no preço de venda.
  custo: numeric('custo', { precision: 10, scale: 2 }),
}, t => [unique('pecas_catalogo_conta_id_id_key').on(t.contaId, t.id)])

// ─── pecas_vinculo_fornecedor (item do fornecedor → peça da Conta, #341) ──────
// nomeXml é o xProd lido como o x_prod das motos (ADR-0008). A FK composta impede
// vínculo apontando para peça de outra Conta.
export const pecasVinculoFornecedor = pgTable('pecas_vinculo_fornecedor', {
  id: uuid('id').primaryKey().defaultRandom(),
  contaId: uuid('conta_id').notNull().references(() => contas.id),
  fornecedorCnpj: text('fornecedor_cnpj').notNull(),
  codigo: text('codigo').notNull(),
  nomeXml: text('nome_xml').notNull(),
  pecaId: uuid('peca_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('pecas_vinculo_fornecedor_chave_key').on(t.contaId, t.fornecedorCnpj, t.codigo, t.nomeXml),
  foreignKey({
    name: 'pecas_vinculo_fornecedor_peca_da_conta_fkey',
    columns: [t.contaId, t.pecaId],
    foreignColumns: [pecasCatalogo.contaId, pecasCatalogo.id],
  }),
])

// ─── notas_entrada (cada lançamento de NF de entrada, #341) ──────────────────
// Sem unique na chave: nota repetida é aviso, não bloqueio.
export const notasEntrada = pgTable('notas_entrada', {
  id: uuid('id').primaryKey().defaultRandom(),
  contaId: uuid('conta_id').notNull().references(() => contas.id),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  chaveAcesso: text('chave_acesso').notNull(),
  numero: text('numero').notNull(),
  fornecedorCnpj: text('fornecedor_cnpj').notNull(),
  criadoPor: uuid('criado_por').notNull().references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('notas_entrada_grupo_id_chave_acesso_idx').on(t.grupoId, t.chaveAcesso)])

// ─── pecas_estoque_loja (saldo da peça em cada loja, #195; sem linha = zero) ──
export const pecasEstoqueLoja = pgTable('pecas_estoque_loja', {
  pecaId: uuid('peca_id').notNull().references(() => pecasCatalogo.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  quantidade: integer('quantidade').notNull().default(0),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.pecaId, t.lojaId] }),
}))

// ─── vendas_pecas (venda de peças e acessórios — não emite nota fiscal) ───────
export const vendasPecas = pgTable('vendas_pecas', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull().default(sql`nextval('numero_venda_seq')`),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  clienteNome: text('cliente_nome'),
  // Tomador da venda. `clienteId` liga no cadastro quando existe; os campos soltos
  // atendem o balcão, que vende sem cadastrar ninguém. 'juridica' é o que faz o
  // recibo sair no CNPJ da empresa — ver src/app/(print)/pecas.
  clienteId: uuid('cliente_id').references(() => clientes.id),
  clienteDocumento: text('cliente_documento'),
  clienteTipoPessoa: text('cliente_tipo_pessoa').notNull().default('fisica'),
  formaPagamento: text('forma_pagamento').notNull(),
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number }[]>(),
  valorTotal: numeric('valor_total', { precision: 12, scale: 2 }).notNull(),
  dataVenda: timestamp('data_venda', { withTimezone: true }).notNull().defaultNow(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── vendas_pecas_itens ────────────────────────────────────────────────────────
export const vendasPecasItens = pgTable('vendas_pecas_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendaPecaId: uuid('venda_peca_id').notNull().references(() => vendasPecas.id, { onDelete: 'cascade' }),
  pecaId: uuid('peca_id').notNull().references(() => pecasCatalogo.id),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 10, scale: 2 }).notNull().default('1'),
  valorUnitario: numeric('valor_unitario', { precision: 10, scale: 2 }).notNull().default('0'),
})

// ─── vendas_pecas_edicoes (histórico da edição de venda de peças, #242) ──────
export const vendasPecasEdicoes = pgTable('vendas_pecas_edicoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  vendaPecaId: uuid('venda_peca_id').notNull().references(() => vendasPecas.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  resumo: text('resumo').notNull(),
  antes: jsonb('antes').notNull(),
  depois: jsonb('depois').notNull(),
  editadoEm: timestamp('editado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── os_itens ────────────────────────────────────────────────────────────────
export const osItens = pgTable('os_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  osId: uuid('os_id').notNull().references(() => ordensServico.id, { onDelete: 'cascade' }),
  servicoId: uuid('servico_id').references(() => servicosCatalogo.id),
  pecaId: uuid('peca_id').references(() => pecasCatalogo.id),
  tipo: text('tipo').notNull().default('servico'),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('1'),
  valorUnitario: numeric('valor_unitario', { precision: 10, scale: 2 }).notNull().default('0'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
})

// ─── garantias ───────────────────────────────────────────────────────────────
export const garantias = pgTable('garantias', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  osId: uuid('os_id').references(() => ordensServico.id),
  descricao: text('descricao').notNull(),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  dataEncerramento: date('data_encerramento'),
  status: garantiaStatusEnum('status').notNull().default('ativa'),
  dataPedidoPeca: date('data_pedido_peca'),
  numeroPedidoFabrica: text('numero_pedido_fabrica'),
  statusFabrica: text('status_fabrica'),
  statusFabricaSyncEm: timestamp('status_fabrica_sync_em', { withTimezone: true }),
  /** Loja cuja conta no portal da fábrica enxerga o pedido. NULL = a própria loja da garantia. */
  fabricaContaLojaId: uuid('fabrica_conta_loja_id').references(() => lojas.id),
  // Preenchidos pelo RPC encerrar_garantia (migração 0074). Antes a observação só
  // existia em historico_estoque, e só quando a moto voltava pra disponível — o
  // comprovante de encerramento precisa dela sempre.
  observacaoEncerramento: text('observacao_encerramento'),
  encerradaPor: uuid('encerrada_por').references(() => usuarios.id),
  encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
})

// ─── lancamentos_caixa ──────────────────────────────────────────────────────
export const lancamentosCaixa = pgTable('lancamentos_caixa', {
  id: uuid('id').primaryKey().defaultRandom(),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tipo: tipoLancamentoEnum('tipo').notNull(),
  categoria: text('categoria').notNull(),
  descricao: text('descricao'),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  data: date('data').notNull(),
  vendaId: uuid('venda_id').references(() => vendas.id),
  osId: uuid('os_id').references(() => ordensServico.id),
  comprovanteUrl: text('comprovante_url'),
  statusAprovacao: text('status_aprovacao').notNull().default('pendente'),
  aprovadoPorId: uuid('aprovado_por_id').references(() => usuarios.id),
  aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── categorias_caixa ────────────────────────────────────────────────────────
export const categoriasCaixa = pgTable('categorias_caixa', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tipo: text('tipo').notNull(), // 'entrada' | 'saida' | 'ambos'
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  // false = saída real do caixa, mas não é gasto: "Depósito" é dinheiro indo da
  // gaveta pro banco e "Transferencia entre lojas" muda de bolso dentro do grupo.
  // Mesma ideia de categorias_despesa.conta_como_despesa.
  contaComoDespesa: boolean('conta_como_despesa').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── categorias_despesa ───────────────────────────────────────────────────────
export const categoriasDespesa = pgTable('categorias_despesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  // false = saída real, mas não é custo de operar a loja (compra de mercadoria,
  // retirada de sócio). Fica de fora do card Despesas Operacionais do /financeiro.
  contaComoDespesa: boolean('conta_como_despesa').notNull().default(true),
  // Por que fica fora: 'retirada_socio' | 'compra_moto' | 'transferencia_interna'.
  // Sem isto, tudo que sai do cálculo vira um balaio só e não dá pra separar
  // retirada de sócio de compra de mercadoria no relatório.
  motivoNaoOperacional: text('motivo_nao_operacional'),
  // Linha do DRE em que esta categoria entra (ver @/lib/dre). Fica na categoria e
  // não num de-para no código porque categoria nova nasce toda semana pela tela —
  // no código, toda nova entraria calada em "Outras". NULL cai em "Outras" na
  // leitura, nunca some do total.
  grupoDre: text('grupo_dre'),
  // Retirada e pró-labore saem no nome da empresa, mas o dinheiro é de um sócio.
  // A exigência mora aqui, e não numa lista de categorias no código, para
  // categoria nova ("Distribuição de lucros") passar a pedir sem deploy.
  exigeBeneficiario: boolean('exige_beneficiario').notNull().default(false),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── favorecidos_nao_operacionais ────────────────────────────────────────────
// Metade das saídas grandes do extrato nunca foi categorizada, então a flag acima
// não alcança: a fábrica de moto só é reconhecível pelo CNPJ do favorecido.
// `cnpj` guardado só com dígitos — no extrato ele vem formatado de jeitos diferentes.
// `nome_padrao` existe porque nem todo banco manda CNPJ: a Stone escreve só o
// nome do favorecido, então a fábrica e a própria empresa do grupo só são
// reconhecíveis por ele. Ao menos uma das duas chaves é obrigatória (CHECK no
// banco); casar por nome é responsabilidade de `chaveNome` em
// despesas-operacionais, que ignora acento, pontuação e caixa.
export const favorecidosNaoOperacionais = pgTable('favorecidos_nao_operacionais', {
  id:         uuid('id').primaryKey().defaultRandom(),
  grupoId:    uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  cnpj:       text('cnpj'),
  nomePadrao: text('nome_padrao'),
  rotulo:     text('rotulo').notNull(),
  motivo:     text('motivo').notNull().default('compra_moto'),
  criadoEm:   timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── despesas ─────────────────────────────────────────────────────────────────
export const despesas = pgTable('despesas', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:         uuid('loja_id').references(() => lojas.id),           // null = empresa geral
  usuarioId:      uuid('usuario_id').notNull().references(() => usuarios.id),
  categoria:      text('categoria').notNull(),
  /** A quem se destinou. Obrigatório quando a categoria exige — ver migração 0081. */
  beneficiario:   text('beneficiario'),
  descricao:      text('descricao'),
  valor:          numeric('valor', { precision: 12, scale: 2 }).notNull(),
  data:           date('data').notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  banco:          text('banco').notNull(),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── despesas_open_finance (saídas bancárias puxadas do Open Finance) ─────────
// Nasce sem categoria/loja; vira uma linha em `despesas` quando o usuário
// atribui os dois campos ("lançar"). despesaId é preenchido nesse momento.
export const despesasOpenFinance = pgTable('despesas_open_finance', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  contaId:        text('conta_id').notNull(),
  banco:          text('banco').notNull(),
  transacaoId:    text('transacao_id').notNull().unique(),
  data:           timestamp('data', { withTimezone: true }).notNull(),
  valor:          numeric('valor', { precision: 12, scale: 2 }).notNull(),
  favorecidoNome: text('favorecido_nome'),
  descricao:      text('descricao'),
  tipoOperacao:   text('tipo_operacao'),
  categoria:      text('categoria'),
  lojaId:         uuid('loja_id').references(() => lojas.id),
  despesaId:      uuid('despesa_id').references(() => despesas.id),
  lancadoPorId:   uuid('lancado_por_id').references(() => usuarios.id),
  lancadoEm:      timestamp('lancado_em', { withTimezone: true }),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── configuracao_taxas (uma linha por grupo) ────────────────────────────────
export const configuracaoTaxas = pgTable('configuracao_taxas', {
  grupoId: uuid('grupo_id').primaryKey().references(() => grupos.id),
  taxasCartao: jsonb('taxas_cartao').$type<Record<string, number>>().notNull().default({}),
  taxasDebito: jsonb('taxas_debito').$type<Record<string, number>>().notNull().default({}),
  taxasLink: jsonb('taxas_link').$type<Record<string, number>>().notNull().default({}),
  taxasFinanciamento: jsonb('taxas_financiamento').$type<Record<string, number>>().notNull().default({}),
  freteValorKm: numeric('frete_valor_km', { precision: 6, scale: 2 }).notNull().default('3.00'),
  freteKmGratis: integer('frete_km_gratis').notNull().default(40),
  // Valor base cobrado até freteKmGratis. '0.00' preserva o comportamento antigo (frete grátis
  // dentro do limite); grupos como o BH usam um valor fixo (ex: 250) em vez de grátis — acima do
  // limite o cálculo soma esse fixo ao km excedente (não substitui), ver calcularCustoFrete.
  freteValorFixo: numeric('frete_valor_fixo', { precision: 6, scale: 2 }).notNull().default('0.00'),
  imposto: numeric('imposto', { precision: 6, scale: 4 }).notNull().default('0.06'),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── precificacao ─────────────────────────────────────────────────────────────
export const precificacao = pgTable('precificacao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  nome: text('nome').notNull(),
  valorMinimo: numeric('valor_minimo', { precision: 12, scale: 2 }).notNull(),
  taxaPix: numeric('taxa_pix', { precision: 8, scale: 6 }).notNull().default('0'),
  taxasCartao: jsonb('taxas_cartao').$type<Record<string, number>>().notNull().default({}),
  taxasLink: jsonb('taxas_link').$type<Record<string, number>>().notNull().default({}),
  taxasFinanciamento: jsonb('taxas_financiamento').$type<Record<string, number>>().notNull().default({}),
  custo: numeric('custo', { precision: 12, scale: 2 }),
  imagemUrl: text('imagem_url'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── conciliacoes_cartao ─────────────────────────────────────────────────────
export const conciliacoesCartao = pgTable('conciliacoes_cartao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  operadora: text('operadora').notNull(),
  dataTransacao: date('data_transacao').notNull(),
  nsu: text('nsu'),
  autorizacao: text('autorizacao'),
  valorBruto: numeric('valor_bruto', { precision: 12, scale: 2 }).notNull(),
  valorLiquido: numeric('valor_liquido', { precision: 12, scale: 2 }),
  parcelas: integer('parcelas').notNull().default(1),
  tipo: text('tipo').notNull().default('credito'),
  status: text('status').notNull().default('aprovado'),
  vendaId: uuid('venda_id').references(() => vendas.id),
  pecaVendaId: uuid('peca_venda_id').references(() => vendasPecas.id),
  osId: uuid('os_id').references(() => ordensServico.id),
  conciliado: boolean('conciliado').notNull().default(false),
  conciliadoEm: timestamp('conciliado_em', { withTimezone: true }),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── importacoes_cartao ──────────────────────────────────────────────────────
// Fila entre o botão no dashboard (Vercel) e o agente que roda no PC da loja.
// O botão não consegue falar com o PC; ele deixa um pedido aqui e o agente
// pergunta de tempos em tempos se tem serviço.
export const importacoesCartao = pgTable('importacoes_cartao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  solicitadoPor: uuid('solicitado_por').references(() => usuarios.id),
  status: text('status').notNull().default('pendente'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }),
  concluidoEm: timestamp('concluido_em', { withTimezone: true }),
  resultado: jsonb('resultado'),
  erro: text('erro'),
})

// ─── pix_recebimentos_mcp (PIX e TED recebidos, via Open Finance/mcp.ai) ─────
// Fonte única de PIX recebido desde 15/09/2026. A tabela anterior
// (`pix_recebimentos`, do ValidaPix) foi removida junto com a integração; o
// conteúdo dela está exportado em backups/pix_recebimentos_validapix_20260915.json.
export const pixRecebimentosMcp = pgTable('pix_recebimentos_mcp', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  grupoId:             uuid('grupo_id').notNull().references(() => grupos.id),
  contaId:             text('conta_id').notNull(),
  banco:               text('banco').notNull(),
  transacaoId:         text('transacao_id').notNull().unique(),
  data:                timestamp('data', { withTimezone: true }).notNull(),
  valor:               numeric('valor', { precision: 12, scale: 2 }).notNull(),
  pagadorNome:         text('pagador_nome'),
  descricao:           text('descricao'),
  // 'PIX' ou 'TED' (operationType do Open Finance). Null nas linhas gravadas
  // antes de 29/08/2026, quando só PIX entrava — o upsert do sync preenche.
  tipoOperacao:        text('tipo_operacao'),
  tipoCorrespondencia: tipoCorrespondenciaPixEnum('tipo_correspondencia'),
  vendaId:             uuid('venda_id').references(() => vendas.id),
  osId:                uuid('os_id').references(() => ordensServico.id),
  pedidoId:            uuid('pedido_id').references(() => pedidosVenda.id),
  pecaVendaId:         uuid('peca_venda_id').references(() => vendasPecas.id),
  lancadoPorId:        uuid('lancado_por_id').references(() => usuarios.id),
  lancadoEm:           timestamp('lancado_em', { withTimezone: true }),
  criadoEm:            timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── pix_mcp_sync_status (controla staleness do cache de /pix-mcp) ───────────
export const pixMcpSyncStatus = pgTable('pix_mcp_sync_status', {
  grupoId:             uuid('grupo_id').primaryKey().references(() => grupos.id),
  ultimaSincronizacao: timestamp('ultima_sincronizacao', { withTimezone: true }).notNull(),
})

// ─── despesas_of_sync_status (controla staleness do cache de /despesas → Importar do Banco) ──
// Tabela própria, separada de pix_mcp_sync_status — as duas sincronizações usam a
// mesma API do mcp.ai mas escrevem em tabelas diferentes; compartilhar o marcador
// fazia uma sincronização "esconder" a necessidade da outra.
export const despesasOfSyncStatus = pgTable('despesas_of_sync_status', {
  grupoId:             uuid('grupo_id').primaryKey().references(() => grupos.id),
  ultimaSincronizacao: timestamp('ultima_sincronizacao', { withTimezone: true }).notNull(),
})

// ─── demandas ────────────────────────────────────────────────────────────────
export const demandas = pgTable('demandas', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelo: text('modelo').notNull(),               // label exibido (marca + modelo); legado pode ter só texto
  modeloId: uuid('modelo_id').references(() => modelos.id), // FK do seletor — usado p/ casar com moto no estoque
  cor: text('cor').notNull(),
  sinalRecebido: boolean('sinal_recebido').notNull().default(false),
  valorSinal:    numeric('valor_sinal', { precision: 10, scale: 2 }),
  meioPagamento: text('meio_pagamento'),
  // Detalhamento do sinal quando ele é dividido (migração 0089). Nulo em demanda
  // antiga — normalize com normalizarPagamentos, nunca leia cru.
  pagamentos: jsonb('pagamentos').$type<{ tipo: string; valor: number; operadora?: string; parcelas?: number }[]>(),
  numero: integer('numero'),                       // nº do recibo — atribuído via nextval quando há sinal
  sinalRecebidoEm: timestamp('sinal_recebido_em', { withTimezone: true }),
  status: demandaStatusEnum('status').notNull().default('aberta'),
  vendaId: uuid('venda_id').references(() => vendas.id),
  // Snapshot do cliente (mirror da reservas) — preenchido só quando há sinal
  clienteNome: text('cliente_nome'),
  clienteCpf: text('cliente_cpf'),
  clienteCelular: text('cliente_celular'),
  clienteEmail: text('cliente_email'),
  clienteCep: text('cliente_cep'),
  clienteLogradouro: text('cliente_logradouro'),
  clienteNumero: text('cliente_numero'),
  clienteComplemento: text('cliente_complemento'),
  clienteBairro: text('cliente_bairro'),
  clienteCidade: text('cliente_cidade'),
  clienteEstado: text('cliente_estado'),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  solicitanteId: uuid('solicitante_id').notNull().references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── kommo_config (integração Kommo/CRM — conexão OAuth global, 1 linha) ─────
export const kommoConfig = pgTable('kommo_config', {
  id:           text('id').primaryKey().default('global'),
  subdominio:   text('subdominio'),
  clientId:     text('client_id'),
  clientSecret: text('client_secret'),
  accessToken:  text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── kommo_user_map / kommo_leads / kommo_sync_status (métricas de atendimento) ─
export const kommoUserMap = pgTable('kommo_user_map', {
  kommoUserId: text('kommo_user_id').primaryKey(),
  usuarioId:   uuid('usuario_id').references(() => usuarios.id),
  nomeKommo:   text('nome_kommo'),
})

export const kommoLeads = pgTable('kommo_leads', {
  leadId:       bigint('lead_id', { mode: 'number' }).primaryKey(),
  nome:         text('nome'),
  kommoUserId:  text('kommo_user_id'),
  statusId:     integer('status_id'),
  pipelineId:   text('pipeline_id'),
  price:        numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
  lossReasonId: bigint('loss_reason_id', { mode: 'number' }),
  sourceId:     bigint('source_id', { mode: 'number' }),  // canal de entrada (ver kommo_sources)
  primeiroIncomingEm: timestamp('primeiro_incoming_em', { withTimezone: true }), // 1ª msg do cliente
  primeiraRespostaEm: timestamp('primeira_resposta_em', { withTimezone: true }), // 1ª resposta humana
  criadoEm:     timestamp('criado_em', { withTimezone: true }),
  fechadoEm:    timestamp('fechado_em', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }),
})

// Catálogo de motivos de perda do Kommo (id -> nome) — Fase 3
export const kommoLossReasons = pgTable('kommo_loss_reasons', {
  id:   bigint('id', { mode: 'number' }).primaryKey(),
  nome: text('nome').notNull(),
})

// Catálogo de funis/etapas do Kommo — Fase 4 (etapa_fechamento vem do nome)
export const kommoStages = pgTable('kommo_stages', {
  statusId:        bigint('status_id', { mode: 'number' }).primaryKey(),
  pipelineId:      text('pipeline_id'),
  pipelineNome:    text('pipeline_nome'),
  nome:            text('nome').notNull(),
  sort:            integer('sort').notNull().default(0),
  etapaFechamento: boolean('etapa_fechamento').notNull().default(false),
})

// Tarefas em aberto por lead — Fase 4 (substituída a cada sync)
export const kommoTarefasAbertas = pgTable('kommo_tarefas_abertas', {
  id:          bigint('id', { mode: 'number' }).primaryKey(),
  leadId:      bigint('lead_id', { mode: 'number' }).notNull(),
  kommoUserId: text('kommo_user_id'),
  prazo:       timestamp('prazo', { withTimezone: true }),
  texto:       text('texto'),
})

export const kommoSyncStatus = pgTable('kommo_sync_status', {
  id:                  text('id').primaryKey().default('global'),
  ultimaSincronizacao: timestamp('ultima_sincronizacao', { withTimezone: true }),
  ultimoUpdatedAt:     bigint('ultimo_updated_at', { mode: 'number' }),
})

// ─── Marketing: canal de entrada, mapa de funil e verba ──────────────────────
// Catálogo de canal do lead. `origem` e `perfil` são reescritos pelo sync
// (/talks e /unsorted); `nome` é rótulo humano e o sync nunca toca nele.
export const kommoSources = pgTable('kommo_sources', {
  sourceId:     bigint('source_id', { mode: 'number' }).primaryKey(),
  origem:       text('origem'),
  perfil:       text('perfil'),
  nome:         text('nome'),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// Funil → grupo. É daqui que o relatório de marketing tira o grupo (o funil está
// preenchido em 100% dos leads; o vendedor responsável, não).
export const kommoPipelineGrupo = pgTable('kommo_pipeline_grupo', {
  pipelineId:   text('pipeline_id').primaryKey(),
  grupoId:      uuid('grupo_id').references(() => grupos.id),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// Verba de mídia lançada à mão. pipelineId nulo = verba do grupo, sem loja.
export const marketingInvestimento = pgTable('marketing_investimento', {
  id:         uuid('id').primaryKey().defaultRandom(),
  grupoId:    uuid('grupo_id').notNull().references(() => grupos.id),
  mes:        date('mes').notNull(),
  pipelineId: text('pipeline_id'),
  plataforma: text('plataforma').notNull(),
  valor:      numeric('valor', { precision: 12, scale: 2 }).notNull().default('0'),
  observacao: text('observacao'),
  criadoEm:   timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// Atividade diária por colaborador (mensagens/tarefas/tempo de resposta) — Fase 2
export const kommoAtividadeDiaria = pgTable('kommo_atividade_diaria', {
  dia:          date('dia').notNull(),
  kommoUserId:  text('kommo_user_id').notNull(),
  mensagens:    integer('mensagens').notNull().default(0),
  tarefas:      integer('tarefas').notNull().default(0),
  respSomaSeg:  bigint('resp_soma_seg', { mode: 'number' }).notNull().default(0),
  respMedianaSeg: bigint('resp_mediana_seg', { mode: 'number' }).notNull().default(0), // mediana diária (horário comercial)
  respQtd:      integer('resp_qtd').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.dia, t.kommoUserId] }) }))

// ─── clientes ────────────────────────────────────────────────────────────────
export const clientes = pgTable('clientes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tipoPessoa: tipoPessoaEnum('tipo_pessoa').notNull().default('fisica'),
  cpfCnpj: text('cpf_cnpj'),
  sexo: sexoEnum('sexo').notNull().default('nao_identificado'),
  email: text('email'),
  celular: text('celular'),
  endereco: text('endereco'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cep: text('cep'),
  cidade: text('cidade'),
  uf: text('uf'),
  indicadorIe: text('indicador_ie'),
  inscricaoEstadual: text('inscricao_estadual'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  // Conta dona do cliente (ADR-0018): cada Conta só vê os próprios compradores.
  contaId: uuid('conta_id').notNull().references(() => contas.id),
}, t => [unique('clientes_conta_cpf_cnpj_key').on(t.contaId, t.cpfCnpj)])

// ─── simulador_precos ─────────────────────────────────────────────────────────
export const simuladorPrecos = pgTable('simulador_precos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  precoAvista: numeric('preco_avista', { precision: 10, scale: 2 }).notNull(),
  precoPix: numeric('preco_pix', { precision: 10, scale: 2 }).notNull(),
  taxaCartaoFisico: numeric('taxa_cartao_fisico', { precision: 8, scale: 6 }).notNull(),
  taxaLinkPagamento: numeric('taxa_link_pagamento', { precision: 8, scale: 6 }).notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── comunicados ─────────────────────────────────────────────────────────────
export const comunicados = pgTable('comunicados', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  titulo: text('titulo').notNull(),
  conteudo: text('conteudo').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  papeis: text('papeis').array().notNull().default([]),
  dataPostagem: timestamp('data_postagem', { withTimezone: true }),
  criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── bling_config (uma linha por grupo) ──────────────────────────────────────
export const blingConfig = pgTable('bling_config', {
  grupoId: uuid('grupo_id').primaryKey().references(() => grupos.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── comunicados_lidos ───────────────────────────────────────────────────────
export const comunicadosLidos = pgTable('comunicados_lidos', {
  comunicadoId: uuid('comunicado_id').notNull().references(() => comunicados.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  lidoEm: timestamp('lido_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.comunicadoId, t.usuarioId] }),
}))

// ─── funcionarios_config (folha de pagamento) ─────────────────────────────────
// Uma linha por usuário. Sem versionamento histórico — o valor é sempre o
// "atual"; se mudar, o admin edita in-place (mesmo padrão de configuracaoTaxas).
export const funcionariosConfig = pgTable('funcionarios_config', {
  usuarioId:          uuid('usuario_id').primaryKey().references(() => usuarios.id),
  salario:            numeric('salario', { precision: 10, scale: 2 }).notNull().default('0'),
  // LEGADO desde a migração 0076: a comissão virou N regras por pessoa, em
  // folhaRegrasComissao. Estas duas colunas não são mais lidas pelo cálculo nem
  // escritas pela tela — ficaram como registro do que foi migrado. Não apagar sem
  // conferir que nenhuma folha antiga precisa ser reconstruída a partir delas.
  comissaoPercentual: numeric('comissao_percentual', { precision: 5, scale: 2 }).notNull().default('0'),
  ajudaCusto:         numeric('ajuda_custo', { precision: 10, scale: 2 }),
  // Vale fixo combinado com a pessoa, descontado TODO mês (migração 0075). Não
  // substitui folhaAdiantamentos, que é o adiantamento eventual de um mês só —
  // os dois se somam no desconto. NULL = não tem vale fixo.
  adiantamentoFixo:   numeric('adiantamento_fixo', { precision: 10, scale: 2 }),
  ativo:              boolean('ativo').notNull().default(true),
  // Sobre o que a comissão incide. 'padrao' deriva do papel (vendedor→motos dele,
  // mecanico→mão de obra dele, aux_adm→peças dele). Os outros valores existem porque
  // vários aux_adm recebem percentual sobre o total da LOJA, não sobre o que venderam.
  // Ver BASES_COMISSAO em @/lib/folha.
  baseComissao:       text('base_comissao').notNull().default('padrao'),
  atualizadoEm:       timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── folha_ajustes_base (venda real que não foi lançada no sistema) ───────────
// Só afeta o cálculo da folha — não entra em Financeiro, Despesas nem estoque.
// Sempre soma à base de LOJA do seu tipo; se tiver usuarioId, soma TAMBÉM à base
// individual daquela pessoa, porque uma venda real conta nos dois lugares.
export const folhaAjustesBase = pgTable('folha_ajustes_base', {
  id:         uuid('id').primaryKey().defaultRandom(),
  lojaId:     uuid('loja_id').notNull().references(() => lojas.id),
  mes:        text('mes').notNull(), // 'YYYY-MM' — text, não date, pra não cair no fuso
  tipo:       text('tipo').notNull(), // 'motos' | 'pecas' | 'servicos'
  usuarioId:  uuid('usuario_id').references(() => usuarios.id),
  valor:      numeric('valor', { precision: 12, scale: 2 }).notNull(),
  observacao: text('observacao'),
  criadoEm:   timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  criadoPor:  uuid('criado_por').references(() => usuarios.id),
})

// ─── premiacao_faixas (tabela OTE — só vendedor) ───────────────────────────────
// Várias linhas por grupo. A premiação aplicável a um vendedor num mês é o
// premiacao da faixa de maior valorMinimoVendas que ele atingiu ou ultrapassou.
export const premiacaoFaixas = pgTable('premiacao_faixas', {
  id:                uuid('id').primaryKey().defaultRandom(),
  grupoId:           uuid('grupo_id').notNull().references(() => grupos.id),
  valorMinimoVendas: numeric('valor_minimo_vendas', { precision: 12, scale: 2 }).notNull(),
  premiacao:         numeric('premiacao', { precision: 10, scale: 2 }).notNull(),
  criadoEm:          timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Calendário de gestão ──────────────────────────────────────────────────────
// Módulo separado da Agenda da oficina. Cada evento carrega a própria visibilidade
// (quem cria escolhe). Ver docs/superpowers/specs/2026-08-04-calendario-design.md.
export const calendarioRecorrenciaEnum  = pgEnum('calendario_recorrencia', ['nenhuma', 'anual', 'mensal'])
export const calendarioVisibilidadeEnum = pgEnum('calendario_visibilidade', ['grupo', 'loja', 'socios', 'gestao', 'usuarios'])

// Catálogo de categorias por grupo (editável no Admin). `cor` guarda uma chave da
// paleta em @/lib/calendario (as classes Tailwind precisam ser estáticas).
export const calendarioCategorias = pgTable('calendario_categorias', {
  id:        uuid('id').primaryKey().defaultRandom(),
  grupoId:   uuid('grupo_id').notNull().references(() => grupos.id),
  nome:      text('nome').notNull(),
  cor:       text('cor').notNull().default('slate'),
  ordem:     integer('ordem').notNull().default(0),
  ativo:     boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const calendarioEventos = pgTable('calendario_eventos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  grupoId:      uuid('grupo_id').notNull().references(() => grupos.id),
  titulo:       text('titulo').notNull(),
  descricao:    text('descricao'),
  categoriaId:  uuid('categoria_id').notNull().references(() => calendarioCategorias.id),
  dataInicio:   date('data_inicio').notNull(),          // 1ª ocorrência (âncora da recorrência)
  dataFim:      date('data_fim').notNull(),             // = dataInicio nos eventos de um dia só
  hora:         text('hora'),                            // "HH:MM"; null = dia inteiro
  recorrencia:  calendarioRecorrenciaEnum('recorrencia').notNull().default('nenhuma'),
  visibilidade: calendarioVisibilidadeEnum('visibilidade').notNull(),
  lojaId:       uuid('loja_id').references(() => lojas.id), // obrigatório quando visibilidade='loja'
  criadoPor:    uuid('criado_por').notNull().references(() => usuarios.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Destinatários quando visibilidade='usuarios'.
export const calendarioEventoUsuarios = pgTable('calendario_evento_usuarios', {
  eventoId:  uuid('evento_id').notNull().references(() => calendarioEventos.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.eventoId, t.usuarioId] }),
}))

// ─── Assinatura digital de documentos ────────────────────────────────────────
// O HTML do documento é congelado em html_snapshot no envio: editar a venda
// depois não altera o que o cliente assinou.
export const documentosAssinatura = pgTable('documentos_assinatura', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:         uuid('loja_id').references(() => lojas.id),
  vendaId:        uuid('venda_id').notNull().references(() => vendas.id),
  tipo:           text('tipo').notNull(),
  token:          text('token').notNull(),
  status:         text('status').notNull().default('pendente'),
  htmlSnapshot:   text('html_snapshot').notNull(),
  snapshotHash:   text('snapshot_hash').notNull(),
  celularDestino: text('celular_destino').notNull(),
  // Destino do código de assinatura (por e-mail). Preenchido do cadastro da
  // venda na criação; nulo em documentos antigos/em papel.
  emailDestino:   text('email_destino'),
  selfiePath:     text('selfie_path'),
  selfieHash:     text('selfie_hash'),
  assinaturaPath: text('assinatura_path'),
  assinaturaHash: text('assinatura_hash'),
  ipAssinatura:   text('ip_assinatura'),
  userAgent:      text('user_agent'),
  geoLat:         numeric('geo_lat', { precision: 10, scale: 7 }),
  geoLon:         numeric('geo_lon', { precision: 10, scale: 7 }),
  geoPrecisao:    numeric('geo_precisao', { precision: 10, scale: 2 }),
  evidenciasJson: jsonb('evidencias_json'),
  // Checklist preenchido pelo comprador (OK/NÃO/NA + observações) e os dados
  // estruturados do documento, que permitem remontar o HTML definitivo com as
  // marcações no momento da assinatura.
  respostasJson:  jsonb('respostas_json'),
  dadosJson:      jsonb('dados_json'),
  docHash:        text('doc_hash'),
  // 'papel': cliente sem acesso digital assinou na loja e a via foi
  // digitalizada. Entra na mesma tabela para a trava da NF, os ícones e o
  // dossiê funcionarem sem saber de qual caminho veio a assinatura.
  assinaturaModo: text('assinatura_modo').notNull().default('digital'),
  viaFisicaPath:  text('via_fisica_path'),
  viaFisicaHash:  text('via_fisica_hash'),
  registradoPor:  uuid('registrado_por').references(() => usuarios.id),
  criadoPor:      uuid('criado_por').references(() => usuarios.id),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  expiraEm:       timestamp('expira_em', { withTimezone: true }).notNull(),
  assinadoEm:     timestamp('assinado_em', { withTimezone: true }),
})

// Trilha append-only. É esta tabela que responde "prove que foi ele".
export const assinaturaEventos = pgTable('assinatura_eventos', {
  id:          uuid('id').primaryKey().defaultRandom(),
  documentoId: uuid('documento_id').notNull().references(() => documentosAssinatura.id),
  tipo:        text('tipo').notNull(),
  ip:          text('ip'),
  userAgent:   text('user_agent'),
  detalhe:     jsonb('detalhe'),
  criadoEm:    timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// Códigos OTP — guardados em hash, nunca em claro.
export const assinaturaCodigos = pgTable('assinatura_codigos', {
  id:          uuid('id').primaryKey().defaultRandom(),
  documentoId: uuid('documento_id').notNull().references(() => documentosAssinatura.id),
  codigoHash:  text('codigo_hash').notNull(),
  expiraEm:    timestamp('expira_em', { withTimezone: true }).notNull(),
  tentativas:  integer('tentativas').notNull().default(0),
  usadoEm:     timestamp('usado_em', { withTimezone: true }),
  criadoEm:    timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── metas_loja ──────────────────────────────────────────────────────────────
/**
 * Meta de faturamento do mês, uma linha por loja por mês (migração 0066).
 *
 * O grupo vem da loja, não é coluna daqui — duplicar abriria a chance de a meta
 * apontar para um grupo e a loja para outro. Mês sem linha é mês sem meta: o
 * card do dashboard some em vez de mostrar 0%.
 */
export const metasLoja = pgTable('metas_loja', {
  id:            uuid('id').primaryKey().defaultRandom(),
  lojaId:        uuid('loja_id').notNull().references(() => lojas.id),
  ano:           integer('ano').notNull(),
  mes:           integer('mes').notNull(),
  // Medida contra o valor cheio da venda (vendas.valor), não contra o líquido de
  // taxas: é o preço que o vendedor fecha, e o que o vendedor controla.
  valorMeta:     numeric('valor_meta', { precision: 12, scale: 2 }).notNull(),
  atualizadoEm:  timestamp('atualizado_em').notNull().defaultNow(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
}, t => [unique('metas_loja_unica').on(t.lojaId, t.ano, t.mes)])


// ─── cupons_revisao (revisão gratuita) ───────────────────────────────────────
/**
 * Cupom de revisão gratuita, migração 0074.
 *
 * Emissão é SEMPRE manual pelo módulo /cupons — vender moto não gera cupom
 * sozinho (decisão do Cesar em 01/09/2026). O resgate acontece no pagamento da
 * OS: o operador digita o código e o cupom abate a MÃO DE OBRA (os_itens do tipo
 * 'servico'); peça e óleo continuam sendo cobrados.
 *
 * Vencido não é status — sai da comparação com `validoAte`. O status guardado só
 * muda por ação humana ('cancelado') ou pelo resgate ('usado'), então nenhum job
 * precisa rodar pra lista ficar correta.
 */
export const cuponsRevisao = pgTable('cupons_revisao', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  /** Loja que emitiu. O cupom vale em qualquer loja do mesmo grupo. */
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  codigo: text('codigo').notNull().unique(),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  clienteNome: text('cliente_nome'),
  motoId: uuid('moto_id').references(() => motos.id),
  chassi: text('chassi'),
  observacao: text('observacao'),
  validoAte: date('valido_ate').notNull(),
  /** 'ativo' | 'usado' | 'cancelado' */
  status: text('status').notNull().default('ativo'),
  osId: uuid('os_id').references(() => ordensServico.id),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  valorAbatido: numeric('valor_abatido', { precision: 10, scale: 2 }),
  emitidoPor: uuid('emitido_por').references(() => usuarios.id),
  emitidoEm: timestamp('emitido_em', { withTimezone: true }).notNull().defaultNow(),
  canceladoPor: uuid('cancelado_por').references(() => usuarios.id),
  canceladoEm: timestamp('cancelado_em', { withTimezone: true }),
  motivoCancelamento: text('motivo_cancelamento'),
})

// ─── folha_adiantamentos ─────────────────────────────────────────────────────
/**
 * Adiantamento salarial, migração 0074. SÓ desconta do total a pagar da folha do
 * mês — não vira despesa nem saída de caixa (decisão do Cesar em 01/09/2026): o
 * salário cheio já é contabilizado quando pago, e lançar os dois contaria o mesmo
 * dinheiro duas vezes.
 *
 * `mes` em text 'YYYY-MM' pelo mesmo motivo de folhaAjustesBase: date cairia no fuso.
 */
export const folhaAdiantamentos = pgTable('folha_adiantamentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  mes: text('mes').notNull(),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  /** Data em que o dinheiro saiu para a pessoa. Só informativo — a folha usa `mes`. */
  data: date('data'),
  observacao: text('observacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
})


// ─── folha_valores_reais ─────────────────────────────────────────────────────
/**
 * O que a contabilidade efetivamente pagou a cada funcionário no mês, digitado
 * na última coluna da folha.
 *
 * Tabela própria e não coluna em funcionariosConfig: config é cadastro, sem
 * competência, e este valor muda todo mês. Enquanto ninguém informa, a folha e o
 * compromisso em Contas a Pagar seguem valendo o calculado — ver `valorEfetivo`
 * em @/lib/queries/folha.
 */
export const folhaValoresReais = pgTable('folha_valores_reais', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  mes: text('mes').notNull(), // 'YYYY-MM' — text, como o resto do módulo de folha
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})


// ─── folha_regras_comissao ───────────────────────────────────────────────────
/**
 * Regras de comissão e premiação por funcionário, migração 0076.
 *
 * Cada pessoa pode ter VÁRIAS: a Julia Sampaio recebe 5% sobre as peças que vende
 * (comissão) e 0,2% sobre as motos da loja dela (premiação). Antes era uma regra
 * só, presa em funcionariosConfig — aquelas colunas viraram legado.
 *
 * `vigenciaInicio` NULL = sempre valeu, que é como as regras migradas nasceram: a
 * folha é recalculada a cada abertura, então dar data de início a elas mudaria o
 * valor de meses já pagos. Regra nova nasce com o mês preenchido pela tela.
 *
 * Premiação por FAIXA (tabela OTE do vendedor) é outro mecanismo e continua em
 * premiacaoFaixas — as duas se somam na coluna Premiação da folha.
 */
export const folhaRegrasComissao = pgTable('folha_regras_comissao', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  /** 'comissao' | 'premiacao' — ver TIPOS_REGRA em @/lib/folha. */
  tipo: text('tipo').notNull(),
  /** Ver BASES_COMISSAO em @/lib/folha. */
  base: text('base').notNull(),
  percentual: numeric('percentual', { precision: 6, scale: 3 }).notNull(),
  /** 'YYYY-MM' em text, comparado como string — ordena como data e não pega fuso. */
  vigenciaInicio: text('vigencia_inicio'),
  /** 'YYYY-MM' inclusive. NULL = sem fim. */
  vigenciaFim: text('vigencia_fim'),
  descricao: text('descricao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
})


// ─── holerites ───────────────────────────────────────────────────────────────
/**
 * Holerite em PDF que a contabilidade manda todo mês, migração 0077: um de
 * adiantamento e um de pagamento do salário, por funcionário.
 *
 * Guarda o CAMINHO no bucket privado 'holerites', nunca uma URL — o link é
 * assinado por 10 minutos na hora de abrir, depois de conferir quem pediu. Bucket
 * separado de 'comprovantes' de propósito: holerite tem salário de gente dentro.
 *
 * Índice único por (usuario, mes, tipo): reenviar substitui, que é como a
 * contabilidade corrige um arquivo errado.
 */
export const holerites = pgTable('holerites', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  /** 'YYYY-MM' em text, como o resto do módulo de folha. */
  mes: text('mes').notNull(),
  /** 'adiantamento' | 'salario' */
  tipo: text('tipo').notNull(),
  arquivoPath: text('arquivo_path').notNull(),
  /** Nome como veio da contabilidade, para o download sair reconhecível. */
  arquivoNome: text('arquivo_nome').notNull(),
  tamanho: integer('tamanho'),
  enviadoPor: uuid('enviado_por').references(() => usuarios.id),
  enviadoEm: timestamp('enviado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('holerites_pessoa_mes_tipo').on(t.usuarioId, t.mes, t.tipo)])


// ─── contas_pagar ────────────────────────────────────────────────────────────
/**
 * Compromisso de pagamento, migração 0078. NÃO é lançamento financeiro: não entra
 * em despesas, caixa, DRE nem no /financeiro. Quem paga lança a despesa pelo
 * caminho normal — aqui é só a agenda do que vence.
 *
 * O cadastro descreve o compromisso; as ocorrências (uma por mês de competência)
 * é que carregam o check de pago. Ver src/lib/contas-pagar.ts para as regras.
 */
export const contasPagar = pgTable('contas_pagar', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  /** NULL = compromisso da empresa toda; preenchido = de uma loja específica. */
  lojaId: uuid('loja_id').references(() => lojas.id),
  descricao: text('descricao').notNull(),
  categoria: text('categoria'),
  /** 'unica' | 'recorrente' | 'automatica' — ver TIPOS_CONTA em @/lib/contas-pagar. */
  tipo: text('tipo').notNull(),
  /** Fixo; NULL nas automáticas, onde o valor é calculado sobre o mês anterior. */
  valor: numeric('valor', { precision: 12, scale: 2 }),
  /** Única usa a data cheia. */
  dataVencimento: date('data_vencimento'),
  /** Recorrente e automática usam só o dia do mês (31 cai no último dia do mês). */
  diaVencimento: integer('dia_vencimento'),
  /** Ver BASES_FORMULA em @/lib/contas-pagar. */
  formulaBase: text('formula_base'),
  formulaPercentual: numeric('formula_percentual', { precision: 6, scale: 3 }),
  /** 'anterior' (padrão) | 'corrente' — que mês a fórmula apura. Migração 0079. */
  formulaMesRef: text('formula_mes_ref').notNull().default('anterior'),
  /** Vigência em 'YYYY-MM', comparada como texto. NULL dos dois lados = sem limite. */
  inicio: text('inicio'),
  fim: text('fim'),
  ativo: boolean('ativo').notNull().default(true),
  observacao: text('observacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
})

// ─── contas_pagar_ocorrencias ────────────────────────────────────────────────
/**
 * Uma linha por conta e mês de competência. O check de pago mora AQUI, e não no
 * cadastro: marcar setembro não pode apagar o histórico de agosto.
 *
 * Índice único por (conta, competência) deixa a geração do mês idempotente —
 * abrir a tela dez vezes não cria dez cobranças nem sobrescreve uma já paga.
 */
export const contasPagarOcorrencias = pgTable('contas_pagar_ocorrencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  contaId: uuid('conta_id').notNull().references(() => contasPagar.id, { onDelete: 'cascade' }),
  competencia: text('competencia').notNull(),
  vencimento: date('vencimento').notNull(),
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  pago: boolean('pago').notNull().default(false),
  pagoEm: date('pago_em'),
  pagoPor: uuid('pago_por').references(() => usuarios.id),
  observacao: text('observacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('contas_pagar_ocorrencia_unica_drizzle').on(t.contaId, t.competencia)])


// ─── beneficiarios_despesa ───────────────────────────────────────────────────
/**
 * A quem se destina uma retirada ou pró-labore, migração 0081.
 *
 * Catálogo por grupo, e não constante no código: cada bandeira tem seus sócios, e
 * entrada ou saída de sócio não pode depender de deploy. Editável em
 * /admin/categorias-caixa.
 */
export const beneficiariosDespesa = pgTable('beneficiarios_despesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('beneficiarios_despesa_unico_drizzle').on(t.grupoId, t.nome)])


// ─── certificados_digitais ───────────────────────────────────────────────────
// Um certificado A1 por grupo. `arquivo` e `senha` são o pacote cifrado de
// src/lib/cripto.ts — nunca o conteúdo cru.
export const certificadosDigitais = pgTable('certificados_digitais', {
  id:        uuid('id').primaryKey().defaultRandom(),
  grupoId:   uuid('grupo_id').notNull().unique().references(() => grupos.id, { onDelete: 'cascade' }),
  arquivo:   text('arquivo').notNull(),
  senha:     text('senha').notNull(),
  cnpj:      text('cnpj').notNull(),
  titular:   text('titular').notNull(),
  // Sigla da UF do autor da consulta (cUFAutor). Escolhida em /admin/certificados;
  // vira código IBGE em @/lib/sefaz/uf na hora de montar o XML.
  uf:        text('uf').notNull(),
  validoAte: timestamp('valido_ate', { withTimezone: true }).notNull(),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})


// ─── nfe_recebidas / nfe_dfe_sync ────────────────────────────────────────────
// O que a SEFAZ entregou (nfe_recebidas), e de onde continuar lendo (nfe_dfe_sync).
// `ultNsu` é o ponto de leitura na fila da SEFAZ: pular NSU perde a nota para
// sempre (a SEFAZ não reoferece o mesmo NSU). `proximaConsultaEm` é a trava que
// impede consumo indevido — consultar antes da hora depois de um retorno vazio
// faz a SEFAZ bloquear o CNPJ da empresa.
//
// UNIQUE (grupoId, chave) em nfe_recebidas é o que torna inofensivo reprocessar
// um lote: reinserir a mesma chave não duplica.
//
// "Já lançada no MOVA" não é coluna aqui, é junção com motos.nota_fiscal_entrada
// na hora de montar a tela — como campo, viraria uma segunda verdade que
// envelhece sozinha quando a moto é registrada depois.
export const nfeRecebidas = pgTable('nfe_recebidas', {
  id:            uuid('id').primaryKey().defaultRandom(),
  grupoId:       uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  chave:         text('chave').notNull(),
  nsu:           text('nsu').notNull(),
  emitenteCnpj:  text('emitente_cnpj').notNull(),
  emitenteNome:  text('emitente_nome').notNull(),
  valor:         numeric('valor', { precision: 12, scale: 2 }),
  dataEmissao:   timestamp('data_emissao', { withTimezone: true }).notNull(),
  situacao:      text('situacao').notNull().default('resumo'),
  manifestadoEm: timestamp('manifestado_em', { withTimezone: true }),
  xml:           text('xml'),
  criadoEm:      timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  // Quando o aviso de WhatsApp saiu para esta nota. Nulo = ainda não avisada
  // (inclui nota gravada durante o backlog do cron, que fica pendente até a
  // fila zerar) — precisa sobreviver entre rodadas, por isso é coluna e não
  // depende do estado momentâneo da fila.
  avisadoEm:     timestamp('avisado_em', { withTimezone: true }),
}, t => [unique('nfe_recebidas_grupo_id_chave_key').on(t.grupoId, t.chave)])

export const nfeDfeSync = pgTable('nfe_dfe_sync', {
  grupoId:           uuid('grupo_id').primaryKey().references(() => grupos.id, { onDelete: 'cascade' }),
  ultNsu:            text('ult_nsu').notNull().default('0'),
  maxNsu:            text('max_nsu').notNull().default('0'),
  proximaConsultaEm: timestamp('proxima_consulta_em', { withTimezone: true }),
  ultimoCstat:       integer('ultimo_cstat'),
  ultimoErro:        text('ultimo_erro'),
  atualizadoEm:      timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── leads_convencao (captação da antiga landing /convencao, removida) ────────
// Sem uso no código; a tabela fica só pelo histórico dos leads já captados.
export const leadsConvencao = pgTable('leads_convencao', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  email: text('email').notNull(),
  whatsapp: text('whatsapp').notNull(),
  unidade: text('unidade').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── adesoes_mova (pedidos de adesão da página pública /adesao) ───────────────
// cert_arquivo, cert_senha e store_senha são pacotes cifrados (src/lib/cripto.ts), nunca o cru.
// cnpj_arquivo_path é o caminho no bucket privado 'adesoes'.
export const adesoesMova = pgTable('adesoes_mova', {
  id: uuid('id').primaryKey().defaultRandom(),
  loja: text('loja').notNull(),
  responsavel: text('responsavel').notNull(),
  celular: text('celular').notNull(),
  cnpjArquivoPath: text('cnpj_arquivo_path').notNull(),
  // Os três segredos ficam nulos depois de aplicados no grupo e na loja (#292).
  certArquivo: text('cert_arquivo'),
  certSenha: text('cert_senha'),
  storeLogin: text('store_login').notNull(),
  storeSenha: text('store_senha'),
  usuarios: jsonb('usuarios').$type<{ nome: string; email: string; papel: string }[]>().notNull(),
  status: text('status').$type<StatusAdesao>().notNull().default('pendente'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  // Dados do contrato de adesão (#165), completados pelo operador da MOVA em
  // /admin/adesoes. Validação em @/lib/adesao-contrato.
  razaoSocial: text('razao_social'),
  cnpj: text('cnpj'),
  enderecoSede: text('endereco_sede'),
  email: text('email'),
  responsavelCpf: text('responsavel_cpf'),
  valorMensal: numeric('valor_mensal', { precision: 12, scale: 2 }),
  // Sem uso desde a 0119: o vencimento sai do primeiro acesso (#165).
  diaVencimento: integer('dia_vencimento'),
  motivoRecusa: text('motivo_recusa'),
  recusadaEm: timestamp('recusada_em', { withTimezone: true }),
  avisoRecusa: text('aviso_recusa').$type<'enviado' | 'sem_numero' | 'erro'>(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }),
  franqueadoMotochefe: boolean('franqueado_motochefe').notNull().default(false),
  taxaImplantacao: numeric('taxa_implantacao', { precision: 12, scale: 2 }),
  // Grupo que esta adesão gerou: a mensalidade dele sai daqui (#207). Um grupo,
  // uma adesão (índice único parcial na 0127).
  grupoId: uuid('grupo_id').references(() => grupos.id),
  // Endereço da sede em campos (#292); endereco_sede é a linha montada deles.
  sedeCep: text('sede_cep'),
  sedeLogradouro: text('sede_logradouro'),
  sedeNumero: text('sede_numero'),
  sedeComplemento: text('sede_complemento'),
  sedeBairro: text('sede_bairro'),
  sedeCidade: text('sede_cidade'),
  sedeUf: text('sede_uf'),
  certificadoAplicadoEm: timestamp('certificado_aplicado_em', { withTimezone: true }),
  portalAplicadoEm: timestamp('portal_aplicado_em', { withTimezone: true }),
})

// ─── contratos_adesao ────────────────────────────────────────────────────────
// Contrato de adesão ao MOVA assinado pelo lojista (#165, migração 0121). Mesma
// assinatura por link da venda, em tabelas próprias: é documento da plataforma,
// não de um grupo (ADR-0017). Regras em @/lib/assinatura/fluxo.
export const contratosAdesao = pgTable('contratos_adesao', {
  id:             uuid('id').primaryKey().defaultRandom(),
  adesaoId:       uuid('adesao_id').notNull().references(() => adesoesMova.id),
  token:          text('token').notNull().unique(),
  status:         text('status').notNull().default('pendente'),
  htmlSnapshot:   text('html_snapshot').notNull(),
  snapshotHash:   text('snapshot_hash').notNull(),
  emailDestino:   text('email_destino').notNull(),
  selfiePath:     text('selfie_path'),
  selfieHash:     text('selfie_hash'),
  assinaturaPath: text('assinatura_path'),
  assinaturaHash: text('assinatura_hash'),
  ipAssinatura:   text('ip_assinatura'),
  userAgent:      text('user_agent'),
  geoLat:         numeric('geo_lat', { precision: 10, scale: 7 }),
  geoLon:         numeric('geo_lon', { precision: 10, scale: 7 }),
  geoPrecisao:    numeric('geo_precisao', { precision: 10, scale: 2 }),
  evidenciasJson: jsonb('evidencias_json'),
  docHash:        text('doc_hash'),
  criadoPor:      uuid('criado_por').references(() => usuarios.id),
  criadoEm:       timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  expiraEm:       timestamp('expira_em', { withTimezone: true }).notNull(),
  assinadoEm:     timestamp('assinado_em', { withTimezone: true }),
})

export const contratosAdesaoEventos = pgTable('contratos_adesao_eventos', {
  id:         uuid('id').primaryKey().defaultRandom(),
  contratoId: uuid('contrato_id').notNull().references(() => contratosAdesao.id, { onDelete: 'cascade' }),
  tipo:       text('tipo').notNull(),
  ip:         text('ip'),
  userAgent:  text('user_agent'),
  detalhe:    jsonb('detalhe'),
  criadoEm:   timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const contratosAdesaoCodigos = pgTable('contratos_adesao_codigos', {
  id:         uuid('id').primaryKey().defaultRandom(),
  contratoId: uuid('contrato_id').notNull().references(() => contratosAdesao.id, { onDelete: 'cascade' }),
  codigoHash: text('codigo_hash').notNull(),
  expiraEm:   timestamp('expira_em', { withTimezone: true }).notNull(),
  tentativas: integer('tentativas').notNull().default(0),
  usadoEm:    timestamp('usado_em', { withTimezone: true }),
  criadoEm:   timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── mensalidade (cobrança do MOVA aos lojistas, #208) ───────────────────────
// Spec: docs/superpowers/specs/2026-09-14-assinatura-mova-design.md. Regras em
// @/lib/mensalidade/regras. "Assinatura" no código é a assinatura eletrônica.
export const mensalidadeConfig = pgTable('mensalidade_config', {
  id:              uuid('id').primaryKey().defaultRandom(),
  grupoId:         uuid('grupo_id').notNull().unique().references(() => grupos.id),
  valorMensal:     numeric('valor_mensal', { precision: 12, scale: 2 }),
  taxaImplantacao: numeric('taxa_implantacao', { precision: 12, scale: 2 }),
  isento:          boolean('isento').notNull().default(false),
  criadoEm:        timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const mensalidades = pgTable('mensalidades', {
  id:              uuid('id').primaryKey().defaultRandom(),
  grupoId:         uuid('grupo_id').notNull().references(() => grupos.id),
  competencia:     text('competencia').notNull(),
  valor:           numeric('valor', { precision: 12, scale: 2 }).notNull(),
  taxaImplantacao: numeric('taxa_implantacao', { precision: 12, scale: 2 }).notNull().default('0'),
  acrescimo:       numeric('acrescimo', { precision: 12, scale: 2 }).notNull().default('0'),
  vencimento:      date('vencimento').notNull(),
  status:          text('status').$type<'aberta' | 'paga' | 'cancelada'>().notNull().default('aberta'),
  mpPreferenceId:  text('mp_preference_id'),
  mpPaymentId:     text('mp_payment_id'),
  linkPagamento:   text('link_pagamento'),
  pagoEm:          timestamp('pago_em', { withTimezone: true }),
  criadoEm:        timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  // E-mail do dia do vencimento já enviado: o cron não repete.
  avisoVencimentoEm: timestamp('aviso_vencimento_em', { withTimezone: true }),
}, t => [unique('mensalidades_grupo_competencia').on(t.grupoId, t.competencia)])

// Log cru das notificações do Mercado Pago: idempotência e diagnóstico.
// Sem grupo_id: quem cobra é o MOVA, e o grupo só se conhece depois de ler o pagamento.
export const mensalidadeWebhookEventos = pgTable('mensalidade_webhook_eventos', {
  id:               uuid('id').primaryKey().defaultRandom(),
  mpNotificationId: text('mp_notification_id').notNull().unique(),
  tipo:             text('tipo'),
  action:           text('action'),
  dataId:           text('data_id'),
  liveMode:         boolean('live_mode'),
  recebidoEm:       timestamp('recebido_em', { withTimezone: true }).notNull().defaultNow(),
  processadoEm:     timestamp('processado_em', { withTimezone: true }),
  erro:             text('erro'),
})

// ─── Avaliações do Google (por grupo) ──────────────────────────────────────
// Ver src/lib/avaliacoes-google/. Conteúdo do Google vive no máximo 30 dias (termos da
// Google Maps Platform); o cron diário apaga o resto.

/** Chave da Places API do grupo, cifrada (src/lib/cripto.ts). Só de escrita. */
export const avaliacoesGoogleConfig = pgTable('avaliacoes_google_config', {
  grupoId:       uuid('grupo_id').primaryKey().references(() => grupos.id),
  apiKey:        text('api_key').notNull(),
  tentativaEm:   timestamp('tentativa_em', { withTimezone: true }),
  atualizadoEm:  timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoPor: uuid('atualizado_por'),
})

/** Ficha da loja no Google (Place ID) e a última leitura. */
export const avaliacoesGoogleLojas = pgTable('avaliacoes_google_lojas', {
  lojaId:            uuid('loja_id').primaryKey().references(() => lojas.id),
  grupoId:           uuid('grupo_id').notNull().references(() => grupos.id),
  placeId:           text('place_id'),
  nota:              numeric('nota', { precision: 2, scale: 1 }),
  totalAvaliacoes:   integer('total_avaliacoes'),
  mapsUri:           text('maps_uri'),
  sincronizadoEm:    timestamp('sincronizado_em', { withTimezone: true }),
  erroSincronizacao: text('erro_sincronizacao'),
  criadoEm:          timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const avaliacoesGoogle = pgTable('avaliacoes_google', {
  id:          uuid('id').primaryKey().defaultRandom(),
  grupoId:     uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:      uuid('loja_id').notNull().references(() => lojas.id),
  /** O `name` da review na Places API. */
  googleId:    text('google_id').notNull(),
  autor:       text('autor'),
  autorUri:    text('autor_uri'),
  nota:        integer('nota').notNull(),
  texto:       text('texto'),
  publicadaEm: timestamp('publicada_em', { withTimezone: true }),
  vistaEm:     timestamp('vista_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('avaliacoes_google_loja_google_key').on(t.lojaId, t.googleId)])

export const avaliacoesGoogleHistorico = pgTable('avaliacoes_google_historico', {
  lojaId:          uuid('loja_id').notNull().references(() => lojas.id),
  grupoId:         uuid('grupo_id').notNull().references(() => grupos.id),
  dia:             date('dia').notNull(),
  nota:            numeric('nota', { precision: 2, scale: 1 }),
  totalAvaliacoes: integer('total_avaliacoes'),
}, t => [primaryKey({ columns: [t.lojaId, t.dia] })])

/**
 * Plaquinha física: de uma loja e, opcionalmente, de um vendedor. `codigo` vai no link da
 * tag (/avaliar/<codigo>). Desativada continua levando ao Google, mas não conta toque.
 */
export const avaliacoesGooglePlacas = pgTable('avaliacoes_google_placas', {
  id:        uuid('id').primaryKey().defaultRandom(),
  grupoId:   uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:    uuid('loja_id').notNull().references(() => lojas.id),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  nome:      text('nome'),
  codigo:    text('codigo').notNull().unique(),
  ativa:     boolean('ativa').notNull().default(true),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  criadoPor: uuid('criado_por'),
})

/** Toque na placa (NFC) ou leitura do QR. usuarioId é o dono da placa na hora do toque. */
export const avaliacoesGoogleToques = pgTable('avaliacoes_google_toques', {
  id:        bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  grupoId:   uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:    uuid('loja_id').notNull().references(() => lojas.id),
  placaId:   uuid('placa_id').notNull().references(() => avaliacoesGooglePlacas.id),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  origem:    text('origem').$type<'nfc' | 'qr'>().notNull(),
  criadoEm:  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
