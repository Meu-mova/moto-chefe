// ─── Painel da Fábrica MotoChefe ──────────────────────────────────────────────
// Visão da plataforma para a fábrica: estoque e vendas de TODAS as lojas MotoChefe
// do MOVA, de todas as Contas, mas só de motos da marca MotoChefe. Moto de outra
// marca (Voi etc.) nunca entra, nem que esteja numa loja MotoChefe.
//
// Quem é "loja MotoChefe": a loja ativa que tem o login do portal da fábrica
// cadastrado (`lojas.fabrica_email`, motochefebrasil.store). É o cadastro que liga a
// loja à fábrica. A regra de SQL mora em @/lib/queries/painel-fabrica.
//
// Quem vê: o login da fábrica (papel `fabrica`, criado em /admin/acessos-fabrica) e o
// admin_geral. O login da fábrica fica preso em /fabrica, sem menu e sem Server Action
// nenhuma (middleware, `rotaDoLoginFabrica`): todo o painel funciona com GET.
//
// Este arquivo é puro (sem banco): regra de acesso, filtro, totais e CSV.

/** Marca da fábrica. Comparada sem caixa, espaço nem acento: "MotoChefe", "MOTO CHEFE". */
export const MARCA_PAINEL_FABRICA = 'MotoChefe'

export const PAPEL_FABRICA = 'fabrica'
export const ROTA_PAINEL_FABRICA = '/fabrica'
/** Sair por POST numa rota, sem Server Action (o login da fábrica não chama action). */
export const ROTA_SAIR = '/sair'

/** Quem abre o painel: o login da fábrica e o admin_geral (papel principal). */
export function podeVerPainelFabrica(u: { papel: string }): boolean {
  return u.papel === PAPEL_FABRICA || u.papel === 'admin_geral'
}

/**
 * Para onde o middleware manda o login da fábrica: `null` = pode seguir; senão a rota de
 * destino. Server Action (cabeçalho `Next-Action`) é sempre recusada: uma action pode ser
 * chamada de qualquer página pelo id, então prender só a rota não bastaria.
 */
export function rotaDoLoginFabrica(caminho: string, ehServerAction: boolean): 'recusar' | string | null {
  if (ehServerAction) return 'recusar'
  // /sair: o login desativado cai em /conta-desativada e só sai por ela (POST de rota, #869).
  const livre = caminho === ROTA_PAINEL_FABRICA || caminho.startsWith(`${ROTA_PAINEL_FABRICA}/`)
    || caminho === '/conta-desativada' || caminho === ROTA_SAIR
  return livre ? null : ROTA_PAINEL_FABRICA
}

const chaveMarca = (m: string) => m.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()

/** Mesma regra do SQL `marcaDoPainel()`: só letras, minúsculas. */
export function ehMarcaDoPainel(marca: string | null | undefined): boolean {
  return !!marca && chaveMarca(marca) === chaveMarca(MARCA_PAINEL_FABRICA)
}

export type LojaPainel = { lojaId: string; lojaNome: string; cidade: string; grupoNome: string }

export type LinhaEstoquePainel = {
  lojaId: string
  modelo: string
  cor: string
  quantidade: number
}

/** Uma moto vendida. Sem cliente, vendedor, preço ou valor: só o que a fábrica precisa. */
export type VendaPainel = {
  vendaId: string
  numero: number
  /** ISO, em UTC; exibir com o dia de Brasília. */
  data: string
  lojaId: string
  modelo: string
  cor: string
  chassi: string
}

export type LinhaVendaPainel = { lojaId: string; modelo: string; quantidade: number }

export type Aba = 'estoque' | 'vendas'
export const abaDaUrl = (v: unknown): Aba => (v === 'vendas' ? 'vendas' : 'estoque')

/** Lista vazia = sem filtro (tudo). */
export type FiltroPainel = { lojas: string[]; modelos: string[]; cores: string[] }

export const FILTRO_VAZIO: FiltroPainel = { lojas: [], modelos: [], cores: [] }

type ParamUrl = string | string[] | undefined
const lista = (v: ParamUrl) => (Array.isArray(v) ? v : v ? [v] : []).map(s => s.trim()).filter(Boolean)

/** Filtro a partir da URL (`?loja=..&loja=..&modelo=..&cor=..`): a tela e o impresso leem igual. */
export function filtroDaUrl(p: { loja?: ParamUrl; modelo?: ParamUrl; cor?: ParamUrl }): FiltroPainel {
  return { lojas: lista(p.loja), modelos: lista(p.modelo), cores: lista(p.cor) }
}

/** Query string da aba, do filtro e do período (links das abas, da loja e do impresso). */
export function urlDoFiltro(f: FiltroPainel, de: string, ate: string, aba: Aba = 'estoque'): string {
  const q = new URLSearchParams({ aba, de, ate })
  f.lojas.forEach(v => q.append('loja', v))
  f.modelos.forEach(v => q.append('modelo', v))
  f.cores.forEach(v => q.append('cor', v))
  return q.toString()
}

const ordemPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/** Opções dos filtros: tudo o que existe no painel, sem o filtro aplicado. */
export function opcoesDoPainel(estoque: LinhaEstoquePainel[], vendas: VendaPainel[]) {
  const ordena = (s: Set<string>) => [...s].sort(ordemPt)
  return {
    modelos: ordena(new Set([...estoque.map(l => l.modelo), ...vendas.map(l => l.modelo)])),
    cores: ordena(new Set([...estoque.map(l => l.cor), ...vendas.map(l => l.cor)])),
  }
}

const passa = (lista: string[], valor: string) => lista.length === 0 || lista.includes(valor)
const passaNoFiltro = (f: FiltroPainel, l: { lojaId: string; modelo: string; cor: string }) =>
  passa(f.lojas, l.lojaId) && passa(f.modelos, l.modelo) && passa(f.cores, l.cor)

export function filtrarEstoque(linhas: LinhaEstoquePainel[], f: FiltroPainel): LinhaEstoquePainel[] {
  return linhas.filter(l => passaNoFiltro(f, l))
}

/** Vendas filtradas, da mais recente para a mais antiga. */
export function filtrarVendas(vendas: VendaPainel[], f: FiltroPainel): VendaPainel[] {
  return vendas.filter(v => passaNoFiltro(f, v)).sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero)
}

/** Uma linha por loja × modelo, a partir das vendas uma a uma: a soma sempre bate com a lista. */
export function agruparVendas(vendas: VendaPainel[]): LinhaVendaPainel[] {
  const m = new Map<string, LinhaVendaPainel>()
  for (const v of vendas) {
    const k = `${v.lojaId}\u0000${v.modelo}`
    const atual = m.get(k)
    if (atual) atual.quantidade++
    else m.set(k, { lojaId: v.lojaId, modelo: v.modelo, quantidade: 1 })
  }
  return [...m.values()]
}

export type ModeloCor = { modelo: string; cor: string; quantidade: number }
export type Subtotal = { chave: string; quantidade: number }

/** Estoque somado por modelo × cor (todas as lojas do filtro), por modelo e por loja. */
export function resumirEstoque(linhas: LinhaEstoquePainel[]) {
  const porModeloCor = new Map<string, ModeloCor>()
  const porModelo = new Map<string, number>()
  const porLoja = new Map<string, number>()
  let total = 0
  for (const l of linhas) {
    const k = `${l.modelo}\u0000${l.cor}`
    const atual = porModeloCor.get(k)
    if (atual) atual.quantidade += l.quantidade
    else porModeloCor.set(k, { modelo: l.modelo, cor: l.cor, quantidade: l.quantidade })
    porModelo.set(l.modelo, (porModelo.get(l.modelo) ?? 0) + l.quantidade)
    porLoja.set(l.lojaId, (porLoja.get(l.lojaId) ?? 0) + l.quantidade)
    total += l.quantidade
  }
  return {
    modeloCor: [...porModeloCor.values()].sort((a, b) => ordemPt(a.modelo, b.modelo) || ordemPt(a.cor, b.cor)),
    porModelo: [...porModelo].map(([chave, quantidade]) => ({ chave, quantidade })).sort((a, b) => ordemPt(a.chave, b.chave)),
    porLoja: [...porLoja].map(([chave, quantidade]) => ({ chave, quantidade })),
    total,
  }
}

/** Vendas loja × modelo, com total por loja, por modelo e geral. */
export function resumirVendas(linhas: LinhaVendaPainel[]) {
  const celulas = new Map<string, number>()
  const porLoja = new Map<string, number>()
  const porModelo = new Map<string, number>()
  let total = 0
  for (const l of linhas) {
    const k = `${l.lojaId}\u0000${l.modelo}`
    celulas.set(k, (celulas.get(k) ?? 0) + l.quantidade)
    porLoja.set(l.lojaId, (porLoja.get(l.lojaId) ?? 0) + l.quantidade)
    porModelo.set(l.modelo, (porModelo.get(l.modelo) ?? 0) + l.quantidade)
    total += l.quantidade
  }
  return {
    celula: (lojaId: string, modelo: string) => celulas.get(`${lojaId}\u0000${modelo}`) ?? 0,
    porLoja,
    porModelo,
    modelos: [...porModelo.keys()].sort(ordemPt),
    total,
  }
}

/**
 * CSV que o Excel em português abre direto: separador `;`, BOM UTF-8 e aspas em todo
 * campo com `;`, aspas ou quebra de linha. Campo que começa com = + - @ ganha um
 * apóstrofo, para o Excel não executar fórmula vinda de nome de loja ou modelo.
 */
export function paraCsv(cabecalho: string[], linhas: (string | number)[][]): string {
  const campo = (v: string | number) => {
    if (typeof v === 'number') return String(v)
    const s = /^[=+\-@]/.test(v) ? `'${v}` : v
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecalho, ...linhas].map(l => l.map(campo).join(';')).join('\r\n') + '\r\n'
}
