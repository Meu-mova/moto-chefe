/**
 * Entrada de motos a partir dos XMLs de NF-e, só dos chassis de uma lista. Para o onboarding
 * de uma loja: as notas de compra trazem também motos de outras lojas ou já vendidas, e a
 * tela de Entrada carrega a nota inteira. Mesma gravação da tela (moto, histórico e ficha
 * fiscal da nota), mas tudo numa transação: ou entra o lote inteiro, ou nada.
 *
 * Uso (simula; não grava nada):
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/importar-motos-xml.ts \
 *     --loja <id da loja> --usuario <e-mail de quem fica no histórico> --xmls <pasta> --lista <arquivo.csv>
 * Grava com --aplicar. Na produção: -e .env.prod.local e --prod.
 *
 * A lista é um CSV com ";" e cabeçalho, uma moto por linha:
 *   chassi;chassi_na_nota;modelo;preco
 * - chassi: o da moto, que vai para o MOVA.
 * - chassi_na_nota: só quando o XML traz outro (carta de correção de chassi).
 * - modelo: nome no catálogo da Conta, só quando o de-para da nota não acha.
 * - preco: preço de compra (6400.00 ou 6.400,00).
 * Os XMLs e a lista têm dado fiscal: ficam fora do repositório.
 *
 * Moto comprada por outro CNPJ que o do grupo da loja: a NF de saída sai pelo grupo de entrada
 * da moto (#552), então o --aplicar recusa, salvo as compradas pelo CNPJ dado em
 * --aceito-cnpj-de-outro-grupo <CNPJ> (qualquer outro CNPJ, ou nota sem CNPJ, recusa sempre). Essa flag
 * existe para a exceção da #731 (decisão do Cesar aceita pelo Luis, com o OK
 * do contador antes de aplicar), não como caminho normal de entrada.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { exigirAlvoPermitido } from './lib/alvo-banco'
import { lerXml } from './lib/ler-xml'

const args = process.argv.slice(2)
const arg = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const [lojaId, email, pastaXmls, arquivoLista] = ['--loja', '--usuario', '--xmls', '--lista'].map(arg)
const aplicar = args.includes('--aplicar')
const FLAG_CNPJ = '--aceito-cnpj-de-outro-grupo'
const cnpjAceito = arg(FLAG_CNPJ)

if (!lojaId || !email || !pastaXmls || !arquivoLista) {
  console.error('Uso: scripts/importar-motos-xml.ts --loja <id> --usuario <e-mail> --xmls <pasta> --lista <arquivo.csv> [--aplicar] [--aceito-cnpj-de-outro-grupo <CNPJ>] [--prod]')
  process.exit(1)
}
if (args.includes(FLAG_CNPJ) && (!cnpjAceito || cnpjAceito.startsWith('--'))) {
  console.error(`${FLAG_CNPJ} precisa do CNPJ aceito: ${FLAG_CNPJ} <CNPJ>`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida: rode via `npx dotenv-cli -e <arquivo .env> -- ...`')
  process.exit(1)
}
// Imprime o banco e recusa a produção sem --prod.
exigirAlvoPermitido(process.env.DATABASE_URL, args.includes('--prod'))
if (!aplicar) console.log('Simulação: nada é gravado.')

async function main() {
  // Depois da checagem do alvo: o db abre o pool com a DATABASE_URL.
  const { db } = await import('../src/lib/db')
  const { and, eq, or, sql } = await import('drizzle-orm')
  const { grupos, lojas, usuarios } = await import('../src/lib/db/schema')
  const { contaDaLoja, usuarioDaConta } = await import('../src/lib/conta')
  const { apelidosDosModelos, listarApelidosDaConta, listarModelosDaConta } = await import('../src/lib/modelos-da-conta')
  const { lerListaDeChassis, motosDeOutroCnpj, planejarEntradaDeXmls, recusaPorCnpjComprador } = await import('../src/lib/entrada-xml-lote')
  const { gravarLoteDeEntrada } = await import('../src/lib/entrada-motos')
  const { preencherGruposComPrecoPadrao } = await import('../src/lib/tabela-preco-padrao')

  const [loja] = await db.select({ id: lojas.id, nome: lojas.nome, grupoId: lojas.grupoId, cnpjDoGrupo: grupos.cnpj })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId)).where(eq(lojas.id, lojaId!)).limit(1)
  if (!loja) throw new Error('Loja não encontrada')
  const contaId = await contaDaLoja(loja.id)

  // Quem fica no histórico: usuário ativo da Conta da loja (ADR-0018), ou o admin_geral da plataforma.
  const [usuario] = await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios)
    .where(and(
      sql`lower(${usuarios.email}) = ${email!.trim().toLowerCase()}`,
      eq(usuarios.ativo, true),
      or(usuarioDaConta(contaId), eq(usuarios.papel, 'admin_geral')),
    ))
    .limit(1)
  if (!usuario) throw new Error('Usuário ativo não encontrado na Conta da loja')

  const xmls = readdirSync(pastaXmls!).filter(n => n.toLowerCase().endsWith('.xml')).map(n => lerXml(join(pastaXmls!, n)))
  const escolhidas = lerListaDeChassis(readFileSync(arquivoLista!, 'utf8'))
  const [modelos, apelidos] = await Promise.all([listarModelosDaConta(contaId), listarApelidosDaConta(contaId)])
  const plano = planejarEntradaDeXmls(
    xmls,
    escolhidas,
    modelos.map(m => ({ id: m.id, modelo: m.modelo })),
    apelidosDosModelos(apelidos, modelos),
  )

  const nomeDoModelo = new Map(modelos.map(m => [m.id, m.modelo]))
  const compradorDe = new Map(plano.compradores.map(c => [c.chassi, c.cnpj]))
  const deOutroCnpj = new Set(motosDeOutroCnpj(plano, loja.cnpjDoGrupo))
  console.log(`\nLoja: ${loja.nome} (grupo do CNPJ ${loja.cnpjDoGrupo}) · ${xmls.length} XMLs · ${escolhidas.length} chassis na lista · histórico em nome de ${usuario.nome}\n`)
  for (const m of plano.motos) {
    const marcas = [
      deOutroCnpj.has(m.chassi) ? 'COMPRADA POR OUTRO CNPJ' : '',
      plano.semFicha.includes(m.chassi) ? 'sem ficha fiscal' : '',
    ].filter(Boolean)
    console.log(`  ${m.chassi.padEnd(20)} ${String(nomeDoModelo.get(m.modeloId)).padEnd(12)} ${m.cor.padEnd(10)} NF ${m.notaFiscal.padEnd(6)} R$ ${m.precoCompra.padEnd(9)} comprador ${compradorDe.get(m.chassi) || '(sem CNPJ)'}${marcas.length ? `  (${marcas.join(', ')})` : ''}`)
  }
  console.log(`\n${plano.motos.length} moto(s) no lote, ${plano.fiscais.length} com ficha fiscal, ${deOutroCnpj.size} comprada(s) por outro CNPJ que o do grupo.`)
  if (plano.problemas.length) {
    console.log(`\n${plano.problemas.length} fora do lote:`)
    plano.problemas.forEach(p => console.log(`  - ${p}`))
  }

  if (!aplicar) {
    console.log('\nSimulação. Para gravar, rode de novo com --aplicar.')
    return
  }
  if (plano.problemas.length) throw new Error('Há chassis fora do lote: corrija a lista (ou tire as linhas) antes de gravar')
  const recusa = recusaPorCnpjComprador(plano, loja.cnpjDoGrupo, cnpjAceito)
  if (recusa) throw new Error(recusa)
  if (deOutroCnpj.size) {
    console.warn(`\nATENÇÃO: ${deOutroCnpj.size} moto(s) compradas pelo CNPJ ${cnpjAceito} entram com o grupo desta loja como grupo de entrada, e a NF de saída sai por ele (exceção da #731 à regra do #552).`)
  }

  const r = await db.transaction(async tx => {
    const gravado = await gravarLoteDeEntrada(tx, { lojaId: loja.id, usuarioId: usuario.id, motos: plano.motos, fiscais: plano.fiscais })
    // Igual à tela: modelo que entrou pela 1ª vez no grupo ganha o preço padrão da MotoChefe (#522).
    const precos = await preencherGruposComPrecoPadrao([loja.grupoId], tx)
    return { ...gravado, precos }
  })
  console.log(`\nGravado: ${r.motos} moto(s), ${r.fichas} ficha(s) fiscal(is), ${r.precos} preço(s) padrão preenchido(s).`)
}

main()
  .catch(e => { console.error('FALHOU:', e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
  .finally(async () => { await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end() })
