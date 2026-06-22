import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, date, numeric, jsonb, pgView,
} from 'drizzle-orm/pg-core'


// ─── Enums ───────────────────────────────────────────────────────────────────
export const papelEnum = pgEnum('papel', ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico'])
export const reservaStatusEnum = pgEnum('reserva_status', ['ativa', 'convertida', 'cancelada'])
export const categoriaEnum = pgEnum('categoria', ['autopropelido', 'ciclomotor', 'triciclo', 'bike', 'brinquedo', 'patinete'])
export const motoStatusEnum = pgEnum('moto_status', ['faturada', 'montada', 'disponivel', 'reservada', 'em_garantia', 'vendida', 'caixa'])
export const disponibilidadeEnum = pgEnum('disponibilidade_moto', ['disponivel', 'reservada', 'vendida'])
export const pedidoStatusEnum = pgEnum('pedido_status', ['pendente', 'efetivado', 'cancelado'])
export const transferenciaStatusEnum = pgEnum('transferencia_status', ['pendente', 'aceita', 'recusada'])
export const osStatusEnum = pgEnum('os_status', ['aberta', 'em_andamento', 'concluida'])
export const garantiaStatusEnum = pgEnum('garantia_status', ['ativa', 'encerrada'])
export const historicoTipoEnum = pgEnum('historico_tipo', ['entrada', 'saida', 'transferencia_enviada', 'transferencia_recebida', 'mudanca_status'])
export const referenciaEnum = pgEnum('referencia_tipo', ['transferencia', 'pedido_venda'])
export const tipoLancamentoEnum = pgEnum('tipo_lancamento', ['entrada', 'saida'])

// ─── lojas ───────────────────────────────────────────────────────────────────
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
})

// ─── usuarios ────────────────────────────────────────────────────────────────
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey(), // vinculado ao Supabase Auth uid
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  papel: papelEnum('papel').notNull(),
  lojaId: uuid('loja_id').references(() => lojas.id), // nullable para admin_geral
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
})

// ─── reservas ────────────────────────────────────────────────────────────────
export const reservas = pgTable('reservas', {
  id: uuid('id').primaryKey().defaultRandom(),
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
})

// ─── pedidos_venda ───────────────────────────────────────────────────────────
export const pedidosVenda = pgTable('pedidos_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
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
  dataVenda: timestamp('data_venda', { withTimezone: true }).notNull().defaultNow(),
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
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  abertaPor: uuid('aberta_por').notNull().references(() => usuarios.id),
  mecanicoId: uuid('mecanico_id').references(() => usuarios.id),
  status: osStatusEnum('status').notNull().default('aberta'),
  descricao: text('descricao').notNull(),
  dataAbertura: timestamp('data_abertura', { withTimezone: true }).notNull().defaultNow(),
  dataConclusao: timestamp('data_conclusao', { withTimezone: true }),
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
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})
