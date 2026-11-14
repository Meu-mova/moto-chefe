// ─── Painel da Fábrica MotoChefe ──────────────────────────────────────────────
// Visão da plataforma para a fábrica: estoque e vendas de TODAS as lojas MotoChefe
// do MOVA, de todas as Contas, mas só de motos da marca MotoChefe. Moto de outra
// marca (Voi etc.) nunca entra, nem que esteja numa loja MotoChefe.
//
// Quem é "loja MotoChefe": a loja ativa que tem o login do portal da fábrica
// cadastrado (`lojas.fabrica_email`, motochefebrasil.store). É o cadastro que liga a
// loja à fábrica; sem ele a loja não compra da MotoChefe. A regra de SQL mora em
// @/lib/queries/painel-fabrica, e as duas pontas (marca e loja) num lugar só.
//
// O que a fábrica vê de cada venda (decisão do Luis, #892): só data, número, loja,
// modelo, cor e chassi. Os tipos abaixo só têm isso; o id da loja serve só para
// filtrar pela URL e não aparece na tela, no Excel nem no impresso.
//
// Este arquivo é puro (sem banco): filtro, totais e planilha, usados pela tela e testados.
import { diaBrt } from '@/lib/data-venda'

export const ROTA_PAINEL_FABRICA = '/admin/painel-fabrica'

/** Marca da fábrica. Comparada sem caixa, espaço nem acento: "MotoChefe", "MOTO CHEFE". */
export const MARCA_PAINEL_FABRICA = 'MotoChefe'

const chaveMarca = (m: string) => m.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()

/** Mesma regra do SQL `marcaDoPainel()`: só letras, minúsculas. */
export function ehMarcaDoPainel(marca: string | null | undefined): boolean {
  return !!marca && chaveMarca(marca) === chaveMarca(MARCA_PAINEL_FABRICA)
}

export type LojaPainel = { lojaId: string; lojaNome: string }

export type LinhaEstoquePainel = {
  lojaId: string
  modelo: string
  cor: string
  quantidade: number
}

/** Uma moto vendida. */
export type VendaPainel = {
  /** ISO, em UTC; exibir pelo dia de Brasília. */
  data: string
  numero: number
  lojaId: string
  modelo: string
  cor: string
  chassi: string
}

/** Abas do painel, na ordem da tela; a 1ª é a padrão. */
export const ABAS_PAINEL = [{ id: 'estoque', rotulo: 'Estoque' }, { id: 'vendas', rotulo: 'Vendas' }] as const
export type Aba = (typeof ABAS_PAINEL)[number]['id']
export const abaDaUrl = (v: unknown): Aba => ABAS_PAINEL.find(a => a.id === v)?.id ?? ABAS_PAINEL[0].id
export const rotuloDaAba = (aba: Aba) => ABAS_PAINEL.find(a => a.id === aba)?.rotulo ?? aba

/** Colunas da lista de vendas: as mesmas na tela, no impresso e no Excel. */
export const COLUNAS_VENDAS = ['Data', 'Venda', 'Loja', 'Modelo', 'Cor', 'Chassi'] as const

/** Nome da loja pelo id; vazio se a loja não está na lista. */
export function nomeDaLoja(lojas: LojaPainel[]): (lojaId: string) => string {
  const nomes = new Map(lojas.map(l => [l.lojaId, l.lojaNome]))
  return lojaId => nomes.get(lojaId) ?? ''
}

/**
 * Células de uma venda, na ordem de COLUNAS_VENDAS: a tela, o impresso e o Excel leem daqui.
 * Só a data: a venda é digitada sem hora (parseDataInput grava meio-dia UTC), então a hora
 * mostraria 09:00 em quase todas (decisão do Luis, #899).
 */
export function celulasDaVenda(v: VendaPainel, nomeLoja: (lojaId: string) => string): (string | number)[] {
  return [diaBrt(v.data), v.numero, nomeLoja(v.lojaId), v.modelo, v.cor, v.chassi]
}

/** Lista vazia = sem filtro (tudo). */
export type FiltroPainel = { lojas: string[]; modelos: string[]; cores: string[] }

export const FILTRO_VAZIO: FiltroPainel = { lojas: [], modelos: [], cores: [] }

type ParamUrl = string | string[] | undefined
/** O que a tela e o impresso leem da URL. */
export type ParamsPainel = { aba?: string; de?: string; ate?: string; loja?: ParamUrl; modelo?: ParamUrl; cor?: ParamUrl }
const lista = (v: ParamUrl) => (Array.isArray(v) ? v : v ? [v] : []).map(s => s.trim()).filter(Boolean)

/** Filtro a partir da URL (`?loja=..&loja=..&modelo=..&cor=..`): a tela e o impresso leem igual. */
export function filtroDaUrl(p: { loja?: ParamUrl; modelo?: ParamUrl; cor?: ParamUrl }): FiltroPainel {
  return { lojas: lista(p.loja), modelos: lista(p.modelo), cores: lista(p.cor) }
}

/** Query string da aba, do filtro e do período (links das abas, da loja e do impresso). */
export function urlDoFiltro(f: FiltroPainel, de: string, ate: string, aba: Aba): string {
  const q = new URLSearchParams({ aba, de, ate })
  f.lojas.forEach(v => q.append('loja', v))
  f.modelos.forEach(v => q.append('modelo', v))
  f.cores.forEach(v => q.append('cor', v))
  return q.toString()
}

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

/** Vendas do filtro, da mais recente para a mais antiga (empate: número maior primeiro). */
export function filtrarVendas(vendas: VendaPainel[], f: FiltroPainel): VendaPainel[] {
  return vendas.filter(v => passaNoFiltro(f, v)).sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero)
}

const ordemPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

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

const contarPor = <T>(itens: T[], chave: (i: T) => string) =>
  new Map([...Map.groupBy(itens, chave)].map(([k, grupo]) => [k, grupo.length]))

/** Matriz loja × modelo a partir das vendas uma a uma: a soma sempre bate com a lista. */
export function resumirVendas(vendas: VendaPainel[]) {
  const celulas = contarPor(vendas, v => `${v.lojaId}\u0000${v.modelo}`)
  const porModelo = contarPor(vendas, v => v.modelo)
  return {
    celula: (lojaId: string, modelo: string) => celulas.get(`${lojaId}\u0000${modelo}`) ?? 0,
    porLoja: contarPor(vendas, v => v.lojaId),
    porModelo,
    modelos: [...porModelo.keys()].sort(ordemPt),
    total: vendas.length,
  }
}

export type Planilha = { nome: string; cabecalho: string[]; linhas: (string | number)[][] }

/**
 * Planilha da aba aberta, com as mesmas colunas da tela: só o que a fábrica pode ver
 * (sem cidade, empresa nem id). Vendas na ordem recebida (a da tela).
 */
export function planilhaDoPainel(aba: Aba, d: {
  lojas: LojaPainel[]
  estoque: LinhaEstoquePainel[]
  vendas: VendaPainel[]
  de: string
  ate: string
  /** hojeBrt(), de quem chama: nome do arquivo do estoque. */
  hoje: string
}): Planilha {
  const loja = nomeDaLoja(d.lojas)
  if (aba === 'vendas') {
    return {
      nome: `vendas-motochefe-${d.de}-a-${d.ate}.csv`,
      cabecalho: [...COLUNAS_VENDAS],
      linhas: d.vendas.map(v => celulasDaVenda(v, loja)),
    }
  }
  return {
    nome: `estoque-motochefe-${d.hoje}.csv`,
    cabecalho: ['Loja', 'Modelo', 'Cor', 'Quantidade'],
    linhas: d.estoque
      .map(l => [loja(l.lojaId), l.modelo, l.cor, l.quantidade])
      .sort((a, b) => a.slice(0, 3).join('|').localeCompare(b.slice(0, 3).join('|'), 'pt-BR')),
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
