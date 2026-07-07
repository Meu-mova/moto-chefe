import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, date, numeric, jsonb, pgView, integer, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'


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
export const tipoPessoaEnum = pgEnum('tipo_pessoa', ['fisica', 'juridica'])
export const sexoEnum = pgEnum('sexo', ['masculino', 'feminino', 'nao_identificado'])

// ─── grupos ──────────────────────────────────────────────────────────────────
export const grupos = pgTable('grupos', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nome:               text('nome').notNull(),
  cnpj:               text('cnpj').notNull(),
  ativo:              boolean('ativo').notNull().default(true),
  validapixEmail:     text('validapix_email'),
  validapixPassword:  text('validapix_password'),
  fabricaEmail:       text('fabrica_email'),
  fabricaSenha:       text('fabrica_senha'),
})

// ─── lojas ───────────────────────────────────────────────────────────────────
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id),
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
  imagemUrl: text('imagem_url'),
  blingCodigo: text('bling_codigo'),
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
  formaPagamento: text('forma_pagamento'),
  dataPrevisao: timestamp('data_previsao', { withTimezone: true }),
  marcaExterna: text('marca_externa'),
  modeloExterno: text('modelo_externo'),
  placa: text('placa'),
  km: integer('km'),
  clienteNomeExterno: text('cliente_nome_externo'),
  clienteFoneExterno: text('cliente_fone_externo'),
  dataAbertura: timestamp('data_abertura', { withTimezone: true }).notNull().defaultNow(),
  dataConclusao: timestamp('data_conclusao', { withTimezone: true }),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  agendamentoId: uuid('agendamento_id'),  // FK: agendamentos.id (sem ref Drizzle — circular)
  origem: text('origem').notNull().default('walk_in'),
  chassiOs: text('chassi_os'),             // chassi real do veículo na OS
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
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
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
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── categorias_despesa ───────────────────────────────────────────────────────
export const categoriasDespesa = pgTable('categorias_despesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
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

// ─── configuracao_taxas (singleton) ──────────────────────────────────────────
export const configuracaoTaxas = pgTable('configuracao_taxas', {
  id: integer('id').primaryKey().default(1),
  taxasCartao: jsonb('taxas_cartao').$type<Record<string, number>>().notNull().default({}),
  taxasDebito: jsonb('taxas_debito').$type<Record<string, number>>().notNull().default({}),
  taxasLink: jsonb('taxas_link').$type<Record<string, number>>().notNull().default({}),
  taxasFinanciamento: jsonb('taxas_financiamento').$type<Record<string, number>>().notNull().default({}),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

// ─── precificacao ─────────────────────────────────────────────────────────────
export const precificacao = pgTable('precificacao', {
  id: uuid('id').primaryKey().defaultRandom(),
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
  conciliado: boolean('conciliado').notNull().default(false),
  conciliadoEm: timestamp('conciliado_em', { withTimezone: true }),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

// ─── demandas ────────────────────────────────────────────────────────────────
export const demandas = pgTable('demandas', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelo: text('modelo').notNull(),
  cor: text('cor').notNull(),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  solicitanteId: uuid('solicitante_id').notNull().references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

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

// ─── bling_config (singleton) ────────────────────────────────────────────────
export const blingConfig = pgTable('bling_config', {
  id: integer('id').primaryKey().default(1),
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
