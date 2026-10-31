import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight, BarChart3, Bike, Building2, CalendarDays, CalendarRange,
  ClipboardList, CreditCard, Database, FileBarChart, FileSpreadsheet, FileText, Receipt,
  HandCoins, Headset, Home, IdCard, Landmark, Layers, Megaphone, Package,
  Package2, PackageCheck, PackagePlus, QrCode, Radar, Settings2, Shield,
  ShoppingBag, ShoppingCart, Tag, Tags, Target, Ticket, TrendingDown, Users, Wallet, FolderOpen,
  Wrench, ListChecks, Calculator, Trophy, ReceiptText, FileSignature, BadgeDollarSign, History, Star} from 'lucide-react'

// 'cargo' é o papel interno de quem tem cargo da Conta (#449): sozinho não dá poder nenhum.
export type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico' | 'motorista' | 'cargo'
export type Slug = 'comercial' | 'oficina' | 'estoque' | 'financeiro' | 'gestao' | 'configuracao'

export type ItemNav = {
  /** Chave gravada em usuarios.modulos_extras/bloqueados. Estável: não muda se o href mudar. */
  id: string
  href: string
  label: string
  icon: LucideIcon
  /** null = só aparece solto no sidebar, sem hub (Dashboard). */
  categoria: Slug | null
  papeis: Papel[]
  /** Também solto no topo do sidebar, além de aparecer no hub da categoria. */
  destaque?: true
  /** Permissão não sai da tabela; quem chama informa em RegrasProprias. */
  regraPropria?: true
  /** Some do menu e dos hubs, mas a rota continua liberada para quem tem a permissão. */
  oculto?: true
  /**
   * Só quem TEM o papel admin_geral como papel principal (#306): nem liberação individual
   * (modulosExtras) nem papel extra abrem. É a mesma regra das actions dessas telas.
   */
  soAdminGeral?: true
  /**
   * Só o papel abre, nunca a liberação individual: a tela depende de poder que o papel dá
   * nas actions (Usuários, #322). Liberar daria só um link que redireciona.
   */
  soPeloPapel?: true
  /**
   * Liberação individual (modulosExtras) só vale para estes papéis; os de `papeis` continuam
   * pelo papel e cargo não recebe. Entrada (#488): liberável só para aux_adm (decisão do Luis).
   */
  liberavelPara?: Papel[]
}

export type UsuarioNav = {
  papel: string
  papeisExtras?: string[] | null
  modulosExtras?: string[] | null
  modulosBloqueados?: string[] | null
  /** Módulos do cargo da Conta, só para papel 'cargo' (#449). */
  modulosDoCargo?: string[] | null
  /** Persona do admin_rede num grupo liberado de outra Conta (#517). */
  grupoLiberado?: string | null
}

// Telas da Conta inteira (dado pessoal, log): a persona do admin_rede (#517) não
// abre, porque mostrariam os outros grupos da Conta dona.
const FORA_DA_PERSONA = ['log', 'dados-funcionarios']

/** Resultado das regras que não cabem na tabela de papel, por id de item. */
export type RegrasProprias = Record<string, boolean>

// A categoria tem ícone próprio. Não usar o ícone do primeiro item visível: o
// primeiro item muda conforme a permissão de quem olha, e o menu ficaria com
// ícone diferente para cada papel.
export const CATEGORIAS: { slug: Slug; nome: string; icon: LucideIcon }[] = [
  { slug: 'comercial',    nome: 'Comercial',         icon: ShoppingCart },
  { slug: 'oficina',      nome: 'Oficina',           icon: Wrench },
  { slug: 'estoque',      nome: 'Estoque & Fábrica', icon: Package },
  { slug: 'financeiro',   nome: 'Financeiro',        icon: Wallet },
  { slug: 'gestao',       nome: 'Gestão',            icon: Target },
  { slug: 'configuracao', nome: 'Configuração',      icon: Settings2 },
]

const SUPER:     Papel[] = ['admin_geral']
const ADMINS:    Papel[] = [...SUPER, 'admin_socio']
const GESTORES:  Papel[] = [...ADMINS, 'aux_adm']
const COMERCIAL: Papel[] = [...GESTORES, 'vendedor']
const TODOS:     Papel[] = [...COMERCIAL, 'mecanico']
// Motorista fica FORA de TODOS de propósito: TODOS abre a oficina inteira (OS,
// agenda, garantia, cupom, peças), que não é trabalho dele. Ele entra no sistema
// só para pegar o holerite, então só os itens marcados com BASICO aparecem.
const BASICO:    Papel[] = [...TODOS, 'motorista', 'cargo']

// `oculto: true` temporário: menu enxuto para a apresentação de 06/10/2026.
// Sai com o revert do PR, quando o Luis decidir.
export const ITENS: ItemNav[] = [
  { id: 'dashboard',      href: '/dashboard',      label: 'Dashboard',         icon: Home,          categoria: null,           papeis: BASICO,    destaque: true },
  // Página pessoal, não operacional: fica solta no menu como o Dashboard, sem
  // categoria. Último dos destaques para não empurrar Vendas e OS para baixo.
  { id: 'meus-documentos', href: '/meus-documentos', label: 'Meus Documentos',  icon: FolderOpen,    categoria: null,           papeis: BASICO,    destaque: true },

  // ── Comercial
  { id: 'vendas',         href: '/vendas',         label: 'Vendas',            icon: ShoppingCart,  categoria: 'comercial',    papeis: COMERCIAL, destaque: true },
  { id: 'notas-emitidas', href: '/notas-emitidas', label: 'Notas Emitidas',    icon: FileText,      categoria: 'comercial',    papeis: GESTORES, soPeloPapel: true },
  { id: 'demandas',       href: '/demandas',       label: 'Demandas',          icon: ClipboardList, categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'clientes',       href: '/clientes',       label: 'Clientes',          icon: Users,         categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'atendimento',    href: '/atendimento',    label: 'Atendimento',       icon: Headset,       categoria: 'comercial',    papeis: GESTORES, oculto: true },
  { id: 'marketing',      href: '/marketing',      label: 'Marketing',         icon: Megaphone,     categoria: 'comercial',    papeis: GESTORES, oculto: true },
  { id: 'simulador',      href: '/simulador',      label: 'Simulador',         icon: Calculator,    categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'radar',          href: '/radar',          label: 'RADAR',             icon: Radar,         categoria: 'comercial',    papeis: COMERCIAL },

  // ── Oficina
  { id: 'ordens-servico', href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench,        categoria: 'oficina',      papeis: TODOS,     destaque: true },
  { id: 'agenda',         href: '/agenda',         label: 'Agenda Oficina',    icon: CalendarDays,  categoria: 'oficina',      papeis: TODOS },
  { id: 'garantias',      href: '/garantias',      label: 'Garantias',         icon: Shield,        categoria: 'oficina',      papeis: TODOS },
  { id: 'cupons',         href: '/cupons',         label: 'Cupons de Revisão', icon: Ticket,        categoria: 'oficina',      papeis: TODOS },
  { id: 'servicos',       href: '/servicos',       label: 'Serviços',          icon: ListChecks,    categoria: 'oficina',      papeis: GESTORES },
  { id: 'montagens',      href: '/montagens',      label: 'Montagens',         icon: Wrench,        categoria: 'oficina',      papeis: GESTORES },
  { id: 'pecas',          href: '/pecas',          label: 'Peças',             icon: Package2,      categoria: 'oficina',      papeis: TODOS },
  { id: 'pecas-fabrica',  href: '/pecas-fabrica',  label: 'Retirada de Peças', icon: PackageCheck,  categoria: 'oficina',      papeis: GESTORES },

  // ── Estoque & Fábrica
  { id: 'showroom',       href: '/estoque',        label: 'Showroom',          icon: Package,       categoria: 'estoque',      papeis: COMERCIAL, destaque: true },
  // Sócio e admin geral pelo papel; liberável por pessoa só para aux_adm, nunca por cargo (#488, decisão do Luis).
  { id: 'entrada',        href: '/entrada',        label: 'Entrada',           icon: PackagePlus,   categoria: 'estoque',      papeis: ADMINS, liberavelPara: ['aux_adm'] },
  { id: 'radar-fiscal',   href: '/radar-fiscal',   label: 'Notas Recebidas',   icon: Radar,         categoria: 'estoque',      papeis: GESTORES, oculto: true },
  { id: 'transferencias', href: '/transferencias', label: 'Transferências',    icon: ArrowLeftRight, categoria: 'estoque',     papeis: COMERCIAL },
  { id: 'precificacao',   href: '/precificacao',   label: 'Precificação',      icon: Tag,           categoria: 'estoque',      papeis: ADMINS },
  { id: 'compras',        href: '/compras',        label: 'Compras',           icon: ShoppingBag,   categoria: 'estoque',      papeis: ADMINS },
  { id: 'relatorio-fabrica', href: '/relatorio-fabrica', label: 'Relatório Fábrica', icon: FileBarChart, categoria: 'estoque', papeis: GESTORES },

  // ── Financeiro
  { id: 'caixa',          href: '/caixa',          label: 'Caixa',             icon: Wallet,        categoria: 'financeiro',   papeis: GESTORES },
  { id: 'pix',            href: '/pix-mcp',        label: 'PIX',               icon: QrCode,        categoria: 'financeiro',   papeis: COMERCIAL },
  { id: 'conciliacao',    href: '/conciliacao',    label: 'Conciliação',       icon: CreditCard,    categoria: 'financeiro',   papeis: GESTORES },
  { id: 'cartoes',        href: '/cartoes',        label: 'Cartões de Crédito', icon: CreditCard,   categoria: 'financeiro',   papeis: ADMINS, oculto: true },
  { id: 'contas-pagar',   href: '/contas-pagar',   label: 'Contas a Pagar',    icon: Receipt,       categoria: 'financeiro',   papeis: ADMINS },
  { id: 'despesas',       href: '/despesas',       label: 'Despesas',          icon: TrendingDown,  categoria: 'financeiro',   papeis: ADMINS },
  { id: 'financeiro',     href: '/financeiro',     label: 'Financeiro',        icon: BarChart3,     categoria: 'financeiro',   papeis: ADMINS },
  { id: 'dre',            href: '/admin/dre',      label: 'DRE',               icon: FileSpreadsheet, categoria: 'financeiro', papeis: ADMINS },
  { id: 'folha',          href: '/folha-pagamento', label: 'Folha de Pagamento', icon: HandCoins,   categoria: 'financeiro',   papeis: ADMINS },

  // ── Gestão
  { id: 'coletiva',       href: '/relatorios/coletiva',   label: 'Reunião de Vendas', icon: Trophy,    categoria: 'gestao',       papeis: ADMINS },
  { id: 'fechamento',     href: '/relatorios/fechamento', label: 'Fechamento',  icon: FileBarChart,  categoria: 'gestao',       papeis: ADMINS },
  { id: 'individual',     href: '/relatorios/individual', label: 'Desempenho Individual', icon: IdCard, categoria: 'gestao',    papeis: ADMINS },
  { id: 'metas',          href: '/admin/metas',    label: 'Metas',             icon: Target,        categoria: 'gestao',       papeis: GESTORES },
  { id: 'calendario',     href: '/calendario',     label: 'Calendário',        icon: CalendarRange, categoria: 'gestao',       papeis: BASICO },
  { id: 'avaliacoes-google', href: '/admin/avaliacoes-google', label: 'Avaliações Google', icon: Star, categoria: 'gestao', papeis: ADMINS, soPeloPapel: true },
  { id: 'comunicados',    href: '/admin/comunicados', label: 'Comunicados',    icon: Megaphone,     categoria: 'gestao',       papeis: ADMINS },
  { id: 'veiculos-historico', href: '/admin/veiculos-historico', label: 'Histórico de Veículos', icon: FileText, categoria: 'gestao', papeis: ADMINS, oculto: true },
  { id: 'acoes',          href: '/admin/acoes',    label: 'Ações',             icon: Database,      categoria: 'gestao',       papeis: SUPER, oculto: true },

  // ── Configuração
  { id: 'lojas',          href: '/admin/lojas',    label: 'Lojas',             icon: Building2,     categoria: 'configuracao', papeis: SUPER, soAdminGeral: true },
  { id: 'adesoes',        href: '/admin/adesoes',  label: 'Adesões',           icon: FileSignature, categoria: 'configuracao', papeis: SUPER },
  { id: 'mensalidades',   href: '/admin/mensalidades', label: 'Mensalidades',  icon: BadgeDollarSign, categoria: 'configuracao', papeis: SUPER },
  { id: 'grupos',         href: '/admin/grupos',   label: 'Grupos',            icon: Layers,        categoria: 'configuracao', papeis: SUPER, soAdminGeral: true },
  { id: 'usuarios',       href: '/admin/usuarios', label: 'Usuários',          icon: Users,         categoria: 'configuracao', papeis: ADMINS, soPeloPapel: true },
  { id: 'log',            href: '/admin/log',      label: 'Log de acessos',    icon: History,       categoria: 'configuracao', papeis: ADMINS },
  { id: 'dados-funcionarios', href: '/admin/dados-funcionarios', label: 'Dados de Funcionários', icon: IdCard, categoria: 'configuracao', papeis: ADMINS },
  // aux_adm vê o contrato do grupo para orientar a loja; só sócio e admin_geral editam.
  { id: 'contratos',      href: '/admin/contratos', label: 'Contratos',        icon: FileSignature, categoria: 'configuracao', papeis: GESTORES },
  { id: 'modelos',        href: '/admin/modelos',  label: 'Modelos',           icon: Bike,          categoria: 'configuracao', papeis: ADMINS },
  // Tabela de preço sugerido da MotoChefe (#522): da plataforma, só admin_geral carrega.
  { id: 'precos-padrao',  href: '/admin/precos-padrao', label: 'Preços MotoChefe', icon: BadgeDollarSign, categoria: 'configuracao', papeis: SUPER, soAdminGeral: true },
  { id: 'categorias-caixa', href: '/admin/categorias-caixa', label: 'Categorias de Caixa', icon: Tags, categoria: 'configuracao', papeis: ADMINS },
  { id: 'maquininhas',    href: '/admin/maquininhas', label: 'Maquininhas',  icon: CreditCard,    categoria: 'configuracao', papeis: ADMINS },
  { id: 'bancos',         href: '/admin/bancos',   label: 'Bancos',            icon: Landmark,      categoria: 'configuracao', papeis: ADMINS },
  { id: 'calendario-categorias', href: '/admin/calendario-categorias', label: 'Categorias de Calendário', icon: CalendarRange, categoria: 'configuracao', papeis: ADMINS },
  { id: 'canais',         href: '/admin/canais',   label: 'Canais',            icon: Megaphone,     categoria: 'configuracao', papeis: GESTORES, oculto: true },
  { id: 'origens',        href: '/admin/origens',  label: 'Origens',           icon: Tag,           categoria: 'configuracao', papeis: GESTORES },
  { id: 'kommo',          href: '/admin/kommo',    label: 'Kommo',             icon: Headset,       categoria: 'configuracao', papeis: ADMINS, oculto: true },
  { id: 'notas-fiscais',  href: '/admin/notas-fiscais', label: 'Notas Fiscais', icon: ReceiptText,   categoria: 'configuracao', papeis: ADMINS },
  { id: 'bling',          href: '/admin/bling',    label: 'Bling',             icon: Settings2,     categoria: 'configuracao', papeis: ADMINS, oculto: true },
  // Certificado digital é a credencial fiscal da empresa perante a SEFAZ, não é
  // item de configuração comum — só admin_geral (SUPER) mexe nisso.
  { id: 'certificados',   href: '/admin/certificados', label: 'Certificados', icon: Shield, categoria: 'configuracao', papeis: SUPER, oculto: true },
]

// Cópia deliberada de temPapel em @/lib/auth:68 — este arquivo não pode
// importar @/lib/auth (carrega o db no topo do módulo). As duas funções
// precisam mudar juntas se a regra de papel/papeisExtras mudar.
function temPapelNav(usuario: UsuarioNav, papel: string): boolean {
  return usuario.papel === papel || (usuario.papeisExtras ?? []).includes(papel)
}

/** A liberação individual deste item vale para o papel? (Sem restrição, vale para todos.) */
export function liberavelPara(item: Pick<ItemNav, 'liberavelPara'>, papel: string): boolean {
  return !item.liberavelPara || item.liberavelPara.includes(papel as Papel)
}

function visivel(item: ItemNav, usuario: UsuarioNav, regras: RegrasProprias): boolean {
  // Bloqueio individual ganha de tudo — inclusive de liberação individual.
  if ((usuario.modulosBloqueados ?? []).includes(item.id)) return false
  if (usuario.grupoLiberado && FORA_DA_PERSONA.includes(item.id)) return false
  if (item.regraPropria) return regras[item.id] === true
  if (item.soAdminGeral) return usuario.papel === 'admin_geral'
  if (!item.soPeloPapel && liberavelPara(item, usuario.papel) && (usuario.modulosExtras ?? []).includes(item.id)) return true
  if (!item.soPeloPapel && !item.liberavelPara && usuario.papel === 'cargo' && (usuario.modulosDoCargo ?? []).includes(item.id)) return true
  return item.papeis.some(p => temPapelNav(usuario, p))
}

export function itensVisiveis(usuario: UsuarioNav, regras: RegrasProprias): ItemNav[] {
  return ITENS.filter(i => visivel(i, usuario, regras))
}

// O que o sidebar e os hubs mostram. Separado de itensVisiveis porque item
// oculto continua acessível pela URL — oculta só a visualização.
export function itensDoMenu(usuario: UsuarioNav, regras: RegrasProprias): ItemNav[] {
  return itensVisiveis(usuario, regras).filter(i => !i.oculto)
}

export function podeAcessar(usuario: UsuarioNav, href: string, regras: RegrasProprias): boolean {
  const item = ITENS.find(i => i.href === href)
  // Rota fora da tabela não é liberada por omissão — quem adicionar página nova
  // precisa declará-la aqui, e é isso que a torna alcançável.
  if (!item) return false
  return visivel(item, usuario, regras)
}

/**
 * Gate de action por módulo, com a regra do menu: lista positiva, então papel novo (como
 * 'cargo') não entra por omissão. Item com regraPropria não serve aqui.
 */
export function acessaModulo(usuario: UsuarioNav, id: string): boolean {
  const item = ITENS.find(i => i.id === id)
  return !!item && !item.regraPropria && visivel(item, usuario, {})
}

/**
 * Módulos que um cargo da Conta pode receber (#449). Só entra aqui o módulo cujas ações já
 * aceitam o papel 'cargo' pelo acesso ao módulo, com teste; a lista cresce PR a PR.
 */
export const MODULOS_DE_CARGO: string[] = ['clientes']

/** O que quem gerencia cargos pode marcar: os liberados para cargo que ele mesmo vê. */
export function modulosQuePodeDar(usuario: UsuarioNav, regras: RegrasProprias, liberados = MODULOS_DE_CARGO): string[] {
  return itensVisiveis(usuario, regras)
    .filter(i => liberados.includes(i.id) && !i.soPeloPapel && !i.soAdminGeral && !i.regraPropria)
    .map(i => i.id)
    .sort()
}
