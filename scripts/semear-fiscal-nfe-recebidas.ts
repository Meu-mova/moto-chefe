/**
 * Semeia a ficha fiscal dos modelos a partir dos XMLs que o Radar Fiscal já
 * baixou da SEFAZ (`nfe_recebidas.xml`).
 *
 * O caminho normal é a importação do XML no módulo Entrada, que preenche a ficha
 * do modelo a cada compra nova. Este script é o mesmo trabalho olhando para trás:
 * as notas que o Radar já guardou também servem de fonte, e não custa nada
 * aproveitá-las. Dá para rodar quantas vezes quiser — assim como na Entrada,
 * ficha já preenchida nunca é sobrescrita (a condição vive no WHERE).
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/semear-fiscal-nfe-recebidas.ts [--aplicar]
 *
 * Sem --aplicar só mostra o que faria.
 */
import { db } from '../src/lib/db'
import { modelos, nfeRecebidas } from '../src/lib/db/schema'
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { extrairFiscalDaNfe, fiscaisParaCadastrar, type FichaFiscal } from '../src/lib/nfe-fiscal'
import { mapearModelo } from '../src/lib/nfe-entrada'

const aplicar = process.argv.includes('--aplicar')

async function main() {
  const [notas, catalogo] = await Promise.all([
    db
      .select({ xml: nfeRecebidas.xml, chave: nfeRecebidas.chave })
      .from(nfeRecebidas)
      .where(isNotNull(nfeRecebidas.xml)),
    db.select({ id: modelos.id, modelo: modelos.modelo, ncm: modelos.ncm }).from(modelos),
  ])

  const nomes = catalogo.map(m => m.modelo)
  const idPorNome = new Map(catalogo.map(m => [m.modelo, m.id]))
  const semFicha = new Set(catalogo.filter(m => !m.ncm).map(m => m.id))

  const candidatos: { modeloId: string; nota: string; ficha: FichaFiscal }[] = []

  for (const nota of notas) {
    // O nº da nota não está em coluna própria; a chave de acesso carrega o nNF
    // nas posições 26..34 e serve igual como procedência.
    const nNF = String(Number(nota.chave.slice(25, 34)) || '')
    for (const ficha of extrairFiscalDaNfe(nota.xml ?? '')) {
      const nome = mapearModelo(ficha.codigo, nomes) ?? mapearModelo(ficha.descricao, nomes)
      if (!nome) continue
      const modeloId = idPorNome.get(nome)
      if (!modeloId || !semFicha.has(modeloId)) continue
      candidatos.push({ modeloId, nota: nNF, ficha })
    }
  }

  const porModelo = fiscaisParaCadastrar(candidatos)
  const notaPorModelo = new Map(candidatos.map(c => [c.modeloId, c.nota]))
  const nomePorId = new Map(catalogo.map(m => [m.id, m.modelo]))

  console.log(`${notas.length} XMLs · ${catalogo.length} modelos · ${semFicha.size} sem ficha`)
  console.log(`\n${porModelo.size} modelo(s) que este lote consegue preencher:`)
  for (const [id, f] of porModelo) {
    console.log(`  ${nomePorId.get(id)}: NCM ${f.ncm} · CEST ${f.cest || '-'} · orig ${f.origem} · CST ${f.cstIcmsEntrada} · ${f.unidade}`)
  }

  if (!aplicar) {
    console.log('\n(simulação — rode com --aplicar para gravar)')
    process.exit(0)
  }

  let gravados = 0
  for (const [modeloId, ficha] of porModelo) {
    const alterados = await db
      .update(modelos)
      .set({
        ncm: ficha.ncm,
        cest: ficha.cest || null,
        unidade: ficha.unidade || null,
        origem: ficha.origem || null,
        cstIcmsEntrada: ficha.cstIcmsEntrada || null,
        cstPis: ficha.cstPis || null,
        cstCofins: ficha.cstCofins || null,
        classTribIbsCbs: ficha.classTribIbsCbs || null,
        fiscalNota: notaPorModelo.get(modeloId) || null,
        fiscalAtualizadoEm: new Date(),
      })
      .where(and(eq(modelos.id, modeloId), isNull(modelos.ncm)))
      .returning({ id: modelos.id })
    gravados += alterados.length
  }

  console.log(`\n${gravados} ficha(s) gravada(s).`)
  process.exit(0)
}

main()
