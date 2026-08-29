import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, date, numeric, jsonb, pgView, integer, bigint, primaryKey, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'


// ─── Enums ───────────────────────────────────────────────────────────────────
export const papelEnum = pgEnum('papel', ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico'])
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

// ─── grupos ──────────────────────────────────────────────────────────────────
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  validapixEmail:     text('validapix_email'),
  validapixPassword:  text('validapix_password'),
  blingClientId:      text('bling_client_id'),
  blingClientSecret:  text('bling_client_secret'),
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
  lojaId: uuid('loja_id').references(() => lojas.id), // nullable para admin_geral
  conecta: text('conecta'), // link individual do usuário (menu Conecta); nullable
  // Grupos EXTRAS onde este usuário aprova venda (além do grupo da própria loja).
  // Ver src/lib/aprovacao-permissao.ts — editável em /admin/usuarios.
  gruposAprovacao: uuid('grupos_aprovacao').array().notNull().default([]),
  // Libera aprovar financiamento/transferência, nos mesmos grupos acima.
  aprovaPagamentoSensivel: boolean('aprova_pagamento_sensivel').notNull().default(false),
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
})

// ─── modelo_bling_codigos (código do produto Bling por modelo + grupo) ───────
export const modeloBlingCodigos = pgTable('modelo_bling_codigos', {
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
  codigo: text('codigo').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.modeloId, t.grupoId] }),
}))

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
// o pagamento aplicado) ou 'peca' (venda de peça ainda não existe, mesmo padrão de moto).
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
  chassi:       text('chassi').notNull().unique(),
  numeroMotor:  text('numero_motor'),
  marca:        text('marca').notNull().default(''),
  modelo:       text('modelo').notNull().default(''),
  cor:          text('cor'),
  ano:          integer('ano'),
  nfEntrada:    text('nf_entrada'),
  importadoEm:  timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
})

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
})

// ─── vendas_pecas (venda de peças e acessórios — não emite nota fiscal) ───────
export const vendasPecas = pgTable('vendas_pecas', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull().default(sql`nextval('numero_venda_seq')`),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  clienteNome: text('cliente_nome'),
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
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── favorecidos_nao_operacionais ────────────────────────────────────────────
// Metade das saídas grandes do extrato nunca foi categorizada, então a flag acima
// não alcança: a fábrica de moto só é reconhecível pelo CNPJ do favorecido.
// `cnpj` guardado só com dígitos — no extrato ele vem formatado de jeitos diferentes.
export const favorecidosNaoOperacionais = pgTable('favorecidos_nao_operacionais', {
  id:       uuid('id').primaryKey().defaultRandom(),
  grupoId:  uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  cnpj:     text('cnpj').notNull(),
  rotulo:   text('rotulo').notNull(),
  motivo:   text('motivo').notNull().default('compra_moto'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── despesas ─────────────────────────────────────────────────────────────────
export const despesas = pgTable('despesas', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grupoId:        uuid('grupo_id').notNull().references(() => grupos.id),
  lojaId:         uuid('loja_id').references(() => lojas.id),           // null = empresa geral
  usuarioId:      uuid('usuario_id').notNull().references(() => usuarios.id),
  categoria:      text('categoria').notNull(),
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

// ─── pix_recebimentos ────────────────────────────────────────────────────────
export const pixRecebimentos = pgTable('pix_recebimentos', {
  id:               text('id').primaryKey(),  // endToEndId do ValidaPix
  grupoId:          uuid('grupo_id').notNull().references(() => grupos.id),
  dataPagamento:    timestamp('data_pagamento', { withTimezone: true }).notNull(),
  valor:            numeric('valor', { precision: 12, scale: 2 }).notNull(),
  pagadorNome:      text('pagador_nome'),
  pagadorDocumento: text('pagador_documento'),
  observacao:       text('observacao'),
  vendaId:          uuid('venda_id').references(() => vendas.id),
  pedidoId:         uuid('pedido_id').references(() => pedidosVenda.id),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── pix_recebimentos_mcp (teste — Open Finance via mcp.ai, sem ValidaPix) ────
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
  cpfCnpj: text('cpf_cnpj').unique(),
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
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

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
  comissaoPercentual: numeric('comissao_percentual', { precision: 5, scale: 2 }).notNull().default('0'),
  ajudaCusto:         numeric('ajuda_custo', { precision: 10, scale: 2 }),
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
