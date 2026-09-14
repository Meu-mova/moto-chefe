// Dados da exportação para a assessoria contábil.
//
// Regra única deste arquivo: nada de conta nova. O resumo sai do `colunasDoMes`
// (o mesmo do /admin/dre e da impressão) e as despesas saem do
// `fontesDespesaDoPeriodo` (o mesmo que o DRE soma). O que existe aqui é a
// listagem item a item das receitas, que nenhuma tela mostrava — e ela usa
// exatamente os mesmos filtros do DRE: OS só concluída, venda pela data da
// venda, peça pela data da venda de balcão.

import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { colunasDoMes, fontesDespesaDoPeriodo } from './dre'
import { montarDre, type LinhaDre } from '@/lib/dre'
import { valorLiquidoSql } from './valor-liquido'
import { linhasDespesa, type LinhaDespesaExport, type Competencia } from '@/lib/export-contabil'

export type { Competencia }

export type LinhaVendaExport = {
  competencia: string
  data: string
  numero: number
  notaFiscal: string
  loja: string
  vendedor: string
  cliente: string
  modelo: string
  chassi: string
  valorBruto: number
  taxas: number
  valorLiquido: number
  formaPagamento: string
  origem: string
}

export type LinhaServicoExport = {
  competencia: string
  data: string
  numero: string
  loja: string
  cliente: string
  maoDeObra: number
  pecas: number
  total: number
  formaPagamento: string
}

export type LinhaPecaExport = {
  competencia: string
  data: string
  numero: number
  loja: string
  cliente: string
  total: number
  formaPagamento: string
}

export type DadosExportContabil = {
  grupo: string
  competencias: Competencia[]
  resumo: { competencia: string; linhas: LinhaDre[] }[]
  despesas: (LinhaDespesaExport & { competencia: string })[]
  vendas: LinhaVendaExport[]
  servicos: LinhaServicoExport[]
  pecas: LinhaPecaExport[]
}

const bordas = (c: Competencia) => ({
  inicio: new Date(Date.UTC(c.ano, c.mes - 1, 1)),
  fim: new Date(Date.UTC(c.ano, c.mes, 1)),
})

export const competenciaTexto = (c: Competencia) => `${c.ano}-${String(c.mes).padStart(2, '0')}`

/** dd/mm/aaaa no fuso de Brasília — o mesmo dia que a tela mostra. */
const dataBr = (d: Date | string) =>
  new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** Competência pela data da linha, para a planilha poder ser filtrada por mês. */
const competenciaDaData = (ddmmaaaa: string) => {
  const [, mes, ano] = ddmmaaaa.split('/')
  return `${ano}-${mes}`
}

const num = (v: unknown) => Number(v ?? 0)

export async function dadosExportContabil(opts: {
  grupo: { id: string; nome: string }
  lojaIds: string[]
  competencias: Competencia[]
}): Promise<DadosExportContabil> {
  const { grupo, lojaIds, competencias } = opts

  if (lojaIds.length === 0 || competencias.length === 0) {
    return { grupo: grupo.nome, competencias, resumo: [], despesas: [], vendas: [], servicos: [], pecas: [] }
  }

  // O período inteiro de uma vez: uma rodada de consultas por mês é o que
  // derruba o pooler quando alguém pede doze meses.
  //
  // O recorte das receitas é por `l.grupo_id`, não por uma lista de lojaIds
  // dentro do sql`` — array em template do Drizzle quebra o cast e já custou
  // doze dias de dado no sync do Kommo. É equivalente: lojaIds são as lojas do
  // grupo.
  const inicio = bordas(competencias[0]).inicio
  const fim = bordas(competencias[competencias.length - 1]).fim

  const [resumoPorMes, fontes, lojasRows, vendasRows, osRows, pecasRows] = await Promise.all([
    Promise.all(
      competencias.map(async c => {
        const { colunas } = await colunasDoMes({ grupoId: grupo.id, lojaIds, ano: c.ano, mes: c.mes })
        const total = colunas.find(col => col.chave === '__total')
        return {
          competencia: competenciaTexto(c),
          linhas: total ? montarDre(total.entrada) : [],
        }
      }),
    ),

    fontesDespesaDoPeriodo(grupo.id, lojaIds, inicio, fim),

    execRows(sql`select id, nome from lojas where grupo_id = ${grupo.id}`),

    execRows(sql`
      select v.data_venda, v.numero, coalesce(v.nota_fiscal_saida, '') as nota_fiscal,
             l.nome as loja, u.nome as vendedor, v.cliente_nome,
             mo.modelo, m.chassi,
             v.valor::numeric as bruto,
             ${valorLiquidoSql('v')} as liquido,
             v.forma_pagamento, coalesce(o.nome, '') as origem
        from vendas v
        join motos m on m.id = v.moto_id
        join modelos mo on mo.id = m.modelo_id
        join lojas l on l.id = v.loja_id
        join usuarios u on u.id = v.vendedor_id
        left join origens_venda o on o.id = v.origem_id
       where l.grupo_id = ${grupo.id}
         and v.data_venda >= ${inicio.toISOString()} and v.data_venda < ${fim.toISOString()}
       order by v.data_venda`),

    // Só OS concluída, e pela data de conclusão: é o que o DRE conta como
    // receita de serviço. OS aberta não é faturamento.
    execRows(sql`
      select os.data_conclusao, os.numero, l.nome as loja,
             coalesce(c.nome, os.cliente_nome_externo, '') as cliente,
             os.valor_servicos::numeric as servicos,
             os.valor_pecas::numeric as pecas,
             coalesce(os.valor_total::numeric, 0) as total,
             coalesce(os.forma_pagamento, '') as forma_pagamento
        from ordens_servico os
        join lojas l on l.id = os.loja_id
        left join clientes c on c.id = os.cliente_id
       where os.status = 'concluida'
         and l.grupo_id = ${grupo.id}
         and os.data_conclusao >= ${inicio.toISOString()} and os.data_conclusao < ${fim.toISOString()}
       order by os.data_conclusao`),

    execRows(sql`
      select p.data_venda, p.numero, l.nome as loja,
             coalesce(c.nome, p.cliente_nome, '') as cliente,
             p.valor_total::numeric as total,
             coalesce(p.forma_pagamento, '') as forma_pagamento
        from vendas_pecas p
        join lojas l on l.id = p.loja_id
        left join clientes c on c.id = p.cliente_id
       where l.grupo_id = ${grupo.id}
         and p.data_venda >= ${inicio.toISOString()} and p.data_venda < ${fim.toISOString()}
       order by p.data_venda`),
  ])

  const nomePorLoja = new Map((lojasRows as { id: string; nome: string }[]).map(l => [l.id, l.nome]))
  const nomeLoja = (id: string | null) => (id ? nomePorLoja.get(id) ?? '(loja removida)' : 'Geral (Empresa)')

  const despesas = linhasDespesa(fontes, nomeLoja).map(l => ({
    ...l,
    competencia: competenciaDaData(l.data),
  }))

  const vendas = (vendasRows as Record<string, unknown>[]).map((v): LinhaVendaExport => {
    const bruto = num(v.bruto)
    const liquido = num(v.liquido)
    const data = dataBr(v.data_venda as string)
    return {
      competencia: competenciaDaData(data),
      data,
      numero: num(v.numero),
      notaFiscal: String(v.nota_fiscal ?? ''),
      loja: String(v.loja ?? ''),
      vendedor: String(v.vendedor ?? ''),
      cliente: String(v.cliente_nome ?? ''),
      modelo: String(v.modelo ?? ''),
      chassi: String(v.chassi ?? ''),
      valorBruto: bruto,
      // A taxa de cartão da moto é o que o DRE deduz: bruto menos líquido.
      taxas: bruto - liquido,
      valorLiquido: liquido,
      formaPagamento: String(v.forma_pagamento ?? ''),
      origem: String(v.origem ?? ''),
    }
  })

  const servicos = (osRows as Record<string, unknown>[]).map((o): LinhaServicoExport => {
    const data = dataBr(o.data_conclusao as string)
    return {
      competencia: competenciaDaData(data),
      data,
      numero: o.numero ? String(o.numero) : '(sem número)',
      loja: String(o.loja ?? ''),
      cliente: String(o.cliente ?? ''),
      maoDeObra: num(o.servicos),
      pecas: num(o.pecas),
      total: num(o.total),
      formaPagamento: String(o.forma_pagamento ?? ''),
    }
  })

  const pecas = (pecasRows as Record<string, unknown>[]).map((p): LinhaPecaExport => {
    const data = dataBr(p.data_venda as string)
    return {
      competencia: competenciaDaData(data),
      data,
      numero: num(p.numero),
      loja: String(p.loja ?? ''),
      cliente: String(p.cliente ?? ''),
      total: num(p.total),
      formaPagamento: String(p.forma_pagamento ?? ''),
    }
  })

  return {
    grupo: grupo.nome,
    competencias,
    resumo: resumoPorMes,
    despesas,
    vendas,
    servicos,
    pecas,
  }
}
