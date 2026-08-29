import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight, BarChart3, Bike, Building2, CalendarDays, CalendarRange,
  ClipboardList, CreditCard, Database, FileBarChart, FileSpreadsheet, FileText,
  HandCoins, Headset, Home, IdCard, Landmark, Layers, Megaphone, Package,
  Package2, PackageCheck, PackagePlus, QrCode, Radar, Settings2, Shield,
  ShoppingBag, ShoppingCart, Tag, Tags, Target, TrendingDown, Users, Wallet,
  Wrench, ListChecks, Calculator,
} from 'lucide-react'

export type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico'
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
}

export type UsuarioNav = {
  papel: string
  papeisExtras?: string[] | null
  modulosExtras?: string[] | null
  modulosBloqueados?: string[] | null
}

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

export const ITENS: ItemNav[] = [
  { id: 'dashboard',      href: '/dashboard',      label: 'Dashboard',         icon: Home,          categoria: null,           papeis: TODOS,     destaque: true },

  // ── Comercial
  { id: 'vendas',         href: '/vendas',         label: 'Vendas',            icon: ShoppingCart,  categoria: 'comercial',    papeis: COMERCIAL, destaque: true },
  { id: 'demandas',       href: '/demandas',       label: 'Demandas',          icon: ClipboardList, categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'clientes',       href: '/clientes',       label: 'Clientes',          icon: Users,         categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'atendimento',    href: '/atendimento',    label: 'Atendimento',       icon: Headset,       categoria: 'comercial',    papeis: GESTORES },
  { id: 'marketing',      href: '/marketing',      label: 'Marketing',         icon: Megaphone,     categoria: 'comercial',    papeis: GESTORES },
  { id: 'simulador',      href: '/simulador',      label: 'Simulador',         icon: Calculator,    categoria: 'comercial',    papeis: COMERCIAL },
  { id: 'radar',          href: '/radar',          label: 'RADAR',             icon: Radar,         categoria: 'comercial',    papeis: COMERCIAL },

  // ── Oficina
  { id: 'ordens-servico', href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench,        categoria: 'oficina',      papeis: TODOS,     destaque: true },
  { id: 'agenda',         href: '/agenda',         label: 'Agenda Oficina',    icon: CalendarDays,  categoria: 'oficina',      papeis: TODOS },
  { id: 'garantias',      href: '/garantias',      label: 'Garantias',         icon: Shield,        categoria: 'oficina',      papeis: TODOS },
  { id: 'servicos',       href: '/servicos',       label: 'Serviços',          icon: ListChecks,    categoria: 'oficina',      papeis: GESTORES },
  { id: 'montagens',      href: '/montagens',      label: 'Montagens',         icon: Wrench,        categoria: 'oficina',      papeis: GESTORES },
  { id: 'pecas',          href: '/pecas',          label: 'Peças',             icon: Package2,      categoria: 'oficina',      papeis: TODOS },
  { id: 'pecas-fabrica',  href: '/pecas-fabrica',  label: 'Retirada de Peças', icon: PackageCheck,  categoria: 'oficina',      papeis: GESTORES },

  // ── Estoque & Fábrica
  { id: 'showroom',       href: '/estoque',        label: 'Showroom',          icon: Package,       categoria: 'estoque',      papeis: COMERCIAL, destaque: true },
  { id: 'entrada',        href: '/entrada',        label: 'Entrada',           icon: PackagePlus,   categoria: 'estoque',      papeis: [],        regraPropria: true },
  { id: 'transferencias', href: '/transferencias', label: 'Transferências',    icon: ArrowLeftRight, categoria: 'estoque',     papeis: COMERCIAL },
  { id: 'precificacao',   href: '/precificacao',   label: 'Precificação',      icon: Tag,           categoria: 'estoque',      papeis: ADMINS },
  { id: 'compras',        href: '/compras',        label: 'Compras',           icon: ShoppingBag,   categoria: 'estoque',      papeis: ADMINS },
  { id: 'relatorio-fabrica', href: '/relatorio-fabrica', label: 'Relatório Fábrica', icon: FileBarChart, categoria: 'estoque', papeis: GESTORES },

  // ── Financeiro
  { id: 'caixa',          href: '/caixa',          label: 'Caixa',             icon: Wallet,        categoria: 'financeiro',   papeis: GESTORES },
  { id: 'pix',            href: '/pix-mcp',        label: 'PIX',               icon: QrCode,        categoria: 'financeiro',   papeis: COMERCIAL },
  { id: 'conciliacao',    href: '/conciliacao',    label: 'Conciliação',       icon: CreditCard,    categoria: 'financeiro',   papeis: GESTORES },
  { id: 'despesas',       href: '/despesas',       label: 'Despesas',          icon: TrendingDown,  categoria: 'financeiro',   papeis: ADMINS },
  { id: 'financeiro',     href: '/financeiro',     label: 'Financeiro',        icon: BarChart3,     categoria: 'financeiro',   papeis: ADMINS },
  { id: 'dre',            href: '/admin/dre',      label: 'DRE',               icon: FileSpreadsheet, categoria: 'financeiro', papeis: ADMINS },
  { id: 'folha',          href: '/folha-pagamento', label: 'Folha de Pagamento', icon: HandCoins,   categoria: 'financeiro',   papeis: ADMINS },

  // ── Gestão
  { id: 'metas',          href: '/admin/metas',    label: 'Metas',             icon: Target,        categoria: 'gestao',       papeis: GESTORES },
  { id: 'calendario',     href: '/calendario',     label: 'Calendário',        icon: CalendarRange, categoria: 'gestao',       papeis: COMERCIAL },
  { id: 'comunicados',    href: '/admin/comunicados', label: 'Comunicados',    icon: Megaphone,     categoria: 'gestao',       papeis: ADMINS },
  { id: 'veiculos-historico', href: '/admin/veiculos-historico', label: 'Histórico de Veículos', icon: FileText, categoria: 'gestao', papeis: ADMINS },
  { id: 'acoes',          href: '/admin/acoes',    label: 'Ações',             icon: Database,      categoria: 'gestao',       papeis: SUPER },

  // ── Configuração
  { id: 'lojas',          href: '/admin/lojas',    label: 'Lojas',             icon: Building2,     categoria: 'configuracao', papeis: ADMINS },
  { id: 'grupos',         href: '/admin/grupos',   label: 'Grupos',            icon: Layers,        categoria: 'configuracao', papeis: SUPER },
  { id: 'usuarios',       href: '/admin/usuarios', label: 'Usuários',          icon: Users,         categoria: 'configuracao', papeis: SUPER },
  { id: 'dados-funcionarios', href: '/admin/dados-funcionarios', label: 'Dados de Funcionários', icon: IdCard, categoria: 'configuracao', papeis: ADMINS },
  { id: 'modelos',        href: '/admin/modelos',  label: 'Modelos',           icon: Bike,          categoria: 'configuracao', papeis: ADMINS },
  { id: 'categorias-caixa', href: '/admin/categorias-caixa', label: 'Categorias de Caixa', icon: Tags, categoria: 'configuracao', papeis: ADMINS },
  { id: 'bancos',         href: '/admin/bancos',   label: 'Bancos',            icon: Landmark,      categoria: 'configuracao', papeis: ADMINS },
  { id: 'calendario-categorias', href: '/admin/calendario-categorias', label: 'Categorias de Calendário', icon: CalendarRange, categoria: 'configuracao', papeis: ADMINS },
  { id: 'canais',         href: '/admin/canais',   label: 'Canais',            icon: Megaphone,     categoria: 'configuracao', papeis: GESTORES },
  { id: 'origens',        href: '/admin/origens',  label: 'Origens',           icon: Tag,           categoria: 'configuracao', papeis: GESTORES },
  { id: 'kommo',          href: '/admin/kommo',    label: 'Kommo',             icon: Headset,       categoria: 'configuracao', papeis: ADMINS },
  { id: 'bling',          href: '/admin/bling',    label: 'Bling',             icon: Settings2,     categoria: 'configuracao', papeis: ADMINS },
]

// Cópia deliberada de temPapel em @/lib/auth:68 — este arquivo não pode
// importar @/lib/auth (carrega o db no topo do módulo). As duas funções
// precisam mudar juntas se a regra de papel/papeisExtras mudar.
function temPapelNav(usuario: UsuarioNav, papel: string): boolean {
  return usuario.papel === papel || (usuario.papeisExtras ?? []).includes(papel)
}

function visivel(item: ItemNav, usuario: UsuarioNav, regras: RegrasProprias): boolean {
  // Bloqueio individual ganha de tudo — inclusive de liberação individual.
  if ((usuario.modulosBloqueados ?? []).includes(item.id)) return false
  if (item.regraPropria) return regras[item.id] === true
  if ((usuario.modulosExtras ?? []).includes(item.id)) return true
  return item.papeis.some(p => temPapelNav(usuario, p))
}

export function itensVisiveis(usuario: UsuarioNav, regras: RegrasProprias): ItemNav[] {
  return ITENS.filter(i => visivel(i, usuario, regras))
}

export function podeAcessar(usuario: UsuarioNav, href: string, regras: RegrasProprias): boolean {
  const item = ITENS.find(i => i.href === href)
  // Rota fora da tabela não é liberada por omissão — quem adicionar página nova
  // precisa declará-la aqui, e é isso que a torna alcançável.
  if (!item) return false
  return visivel(item, usuario, regras)
}
