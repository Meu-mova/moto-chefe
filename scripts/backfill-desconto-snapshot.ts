/**
 * Backfill do snapshot de desconto em aprovacoes_venda (migração 0065).
 *
 * As aprovações criadas antes do snapshot só guardaram o valor bruto e as formas
 * de pagamento. Aqui reconstruímos valor_minimo_snapshot e liquido_snapshot com a
 * precificação e as taxas de HOJE — que não são as da época — e por isso todas as
 * linhas saem com snapshot_estimado = true.
 *
 * Uso:
 *   npx dotenv-cli -e .env.production.local -- node --import tsx scripts/backfill-desconto-snapshot.ts [--dry]
 *
 * Idempotente: só toca linha com valor_minimo_snapshot NULL. Rodar de novo não
 * reescreve nada. --dry mostra o que faria sem gravar.
 */
import postgres from 'postgres'
import { calcLiquidoRecebido, type TaxasVenda } from '../src/lib/preco-minimo'

const dry = process.argv.includes('--dry')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.production.local -- ...`')
  process.exit(1)
}

// max:1 e prepare:false — script avulso, e o pooler Supavisor não aceita prepared.
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

type Linha = {
  id: string
  grupo_id: string
  grupo: string
  vendedor: string
  modelo: string | null
  valor: string
  dados_venda: { pagamentos?: { tipo: string; valor: number; parcelas?: number }[] } | null
  valor_minimo: string | null
}

async function main() {
  const linhas = await sql<Linha[]>`
    SELECT a.id, g.id AS grupo_id, g.nome AS grupo, u.nome AS vendedor,
           m.modelo AS modelo, a.valor, a.dados_venda,
           p.valor_minimo AS valor_minimo
      FROM aprovacoes_venda a
      JOIN usuarios u ON u.id = a.vendedor_id
      JOIN lojas    l ON l.id = a.loja_id
      JOIN grupos   g ON g.id = l.grupo_id
      LEFT JOIN motos        mo ON mo.id = a.moto_id
      LEFT JOIN modelos      m  ON m.id  = mo.modelo_id
      LEFT JOIN precificacao p  ON p.nome = m.modelo AND p.grupo_id = g.id AND p.ativo = true
     WHERE a.tipo = 'valor_minimo'
       AND a.valor_minimo_snapshot IS NULL
     ORDER BY a.data_solicitacao
  `

  if (linhas.length === 0) {
    console.log('Nada a fazer — todas as aprovações de valor mínimo já têm snapshot.')
    await sql.end()
    return
  }

  const taxasRows = await sql<{ grupo_id: string; taxas_cartao: unknown; taxas_debito: unknown; taxas_link: unknown; taxas_financiamento: unknown }[]>`
    SELECT grupo_id, taxas_cartao, taxas_debito, taxas_link, taxas_financiamento FROM configuracao_taxas
  `
  const taxasPorGrupo = new Map<string, TaxasVenda>(
    taxasRows.map(t => [t.grupo_id, {
      taxasCartao: (t.taxas_cartao ?? {}) as Record<string, number>,
      taxasDebito: (t.taxas_debito ?? {}) as Record<string, number>,
      taxasLink: (t.taxas_link ?? {}) as Record<string, number>,
      taxasFinanciamento: (t.taxas_financiamento ?? {}) as Record<string, number>,
    }])
  )

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  let gravadas = 0
  const pulados: string[] = []

  for (const l of linhas) {
    const taxas = taxasPorGrupo.get(l.grupo_id)
    const pagamentos = l.dados_venda?.pagamentos
    const minimo = l.valor_minimo ? parseFloat(l.valor_minimo) : null

    // Sem precificação ativa, sem taxas do grupo ou sem pagamentos não dá pra
    // reconstruir nada. Deixa NULL e reporta — inventar número é pior que faltar.
    if (!taxas || !Array.isArray(pagamentos) || minimo === null) {
      pulados.push(`${l.id} (${l.vendedor}, ${l.modelo ?? 'sem modelo'}): ${!taxas ? 'grupo sem configuracao_taxas' : !Array.isArray(pagamentos) ? 'dados_venda sem pagamentos' : 'modelo sem precificação ativa'}`)
      continue
    }

    const liquido = calcLiquidoRecebido(pagamentos, taxas)
    const desconto = minimo - liquido

    if (!dry) {
      await sql`
        UPDATE aprovacoes_venda
           SET valor_minimo_snapshot = ${minimo.toFixed(2)},
               liquido_snapshot      = ${liquido.toFixed(2)},
               snapshot_estimado     = true
         WHERE id = ${l.id}
           AND valor_minimo_snapshot IS NULL
      `
    }
    gravadas++
    const aviso = desconto <= 0 ? '  ← tabela mudou depois da venda' : ''
    console.log(`${l.grupo} | ${l.vendedor.padEnd(24)} | ${(l.modelo ?? '—').padEnd(8)} | mínimo ${fmt(minimo).padStart(10)} | líquido ${fmt(liquido).padStart(10)} | desconto ${fmt(desconto).padStart(9)}${aviso}`)
  }

  console.log(`\n${dry ? '[dry-run] ' : ''}${gravadas} linha(s) com snapshot estimado.`)
  if (pulados.length > 0) {
    console.log(`\n${pulados.length} pulada(s):`)
    for (const p of pulados) console.log(`  - ${p}`)
  }
  await sql.end()
}

main().catch(async (e) => {
  console.error(e)
  await sql.end({ timeout: 5 })
  process.exit(1)
})
