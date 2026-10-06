/**
 * Apaga e recria o conjunto sintético do staging (fase 5 do plano).
 *
 * Uso: npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/seed-staging.ts
 * Precisa no env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SENHA.
 *
 * Esvazia TODAS as tabelas do public (menos schema_migrations) e os usuários
 * @teste.meumova.com do Auth. Por isso só roda no projeto mova-staging, por
 * lista de permissão — não existe flag que libere outro banco.
 */
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import {
  categoriasCaixa, categoriasDespesa, configuracaoTaxas, grupos, lojas, modelos, motos,
  ordensServico, origensVenda, pedidosVenda, precificacao, reservas, usuarios, usuariosDados, vendas,
} from '../src/lib/db/schema'
import { hojeBrt } from '../src/lib/data-venda'
import { descreverAlvo, REF_STAGING, rotuloAlvo } from './lib/alvo-banco'
import {
  CATEGORIAS_CAIXA, CATEGORIAS_DESPESA, DOMINIO_TESTE, GRUPOS, LOJAS, MODELOS, ORIGENS, TAXAS,
  gerarCpf, montarMotos, montarReservas, montarUsuarios, nomeCliente,
} from './lib/seed-dados'

const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SENHA } = process.env
const faltando = Object.entries({ DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SENHA })
  .filter(([, v]) => !v).map(([k]) => k)
if (faltando.length > 0) {
  console.error(`Faltam no env: ${faltando.join(', ')}`)
  process.exit(1)
}

// As duas pontas (banco e Auth) precisam ser o staging: uma URL de Auth da prod
// com o banco do staging apagaria usuário real.
const alvo = descreverAlvo(DATABASE_URL!)
console.error(rotuloAlvo(alvo))
const refAuth = new URL(NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
if (alvo.ref !== REF_STAGING || refAuth !== REF_STAGING) {
  console.error(`Recusado: o seed só roda no mova-staging (${REF_STAGING}). Banco: ${alvo.ref ?? '?'}, Auth: ${refAuth}.`)
  process.exit(1)
}

const cliente = postgres(DATABASE_URL!, { max: 1, prepare: false, connect_timeout: 15 })
const db = drizzle(cliente)
const auth = createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.admin

function somarDias(isoData: string, dias: number): string {
  const [a, m, d] = isoData.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

async function limparAuth() {
  let apagados = 0
  let outros = 0
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    for (const u of data.users) {
      if (u.email?.endsWith(`@${DOMINIO_TESTE}`)) {
        const { error: e } = await auth.deleteUser(u.id)
        if (e) throw new Error(`deleteUser ${u.email}: ${e.message}`)
        apagados++
      } else {
        outros++
      }
    }
    if (data.users.length < 1000) break
  }
  console.log(`Auth: ${apagados} usuários de teste apagados.`)
  if (outros > 0) console.log(`  ! ${outros} usuários fora de @${DOMINIO_TESTE} ficaram no Auth (não são do seed).`)
}

async function limparPublic() {
  const tabelas = await cliente<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`
  const lista = tabelas.map(t => `public."${t.tablename}"`).join(', ')
  await cliente.unsafe(`truncate ${lista} restart identity cascade`)
  console.log(`public: ${tabelas.length} tabelas esvaziadas.`)
}

async function main() {
  await limparAuth()
  await limparPublic()

  const hoje = hojeBrt()
  const idGrupo = new Map<string, string>()
  const idLoja = new Map<string, string>()
  const idModelo = new Map<string, string>()
  const idUsuario = new Map<string, string>()
  const idOrigem = new Map<string, string>()

  for (const g of GRUPOS) {
    const [r] = await db.insert(grupos).values({
      nome: g.nome, cnpj: g.cnpj, razaoSocial: `${g.nome} Ltda`, cidadeSede: g.cidadeSede,
    }).returning({ id: grupos.id })
    idGrupo.set(g.chave, r.id)
    await db.insert(configuracaoTaxas).values({ grupoId: r.id, ...TAXAS })
    const origens = await db.insert(origensVenda).values(
      ORIGENS.map((o, i) => ({ grupoId: r.id, nome: o.nome, tipo: o.tipo, ordem: i })),
    ).returning({ id: origensVenda.id })
    idOrigem.set(g.chave, origens[0].id)
  }

  for (const l of LOJAS) {
    const [r] = await db.insert(lojas).values({
      nome: l.nome, cidade: l.cidade, endereco: 'Rua Fictícia, 100', grupoId: idGrupo.get(l.grupo)!,
    }).returning({ id: lojas.id })
    idLoja.set(l.chave, r.id)
  }

  for (const m of MODELOS) {
    const [r] = await db.insert(modelos).values({
      marca: 'MotoChefe', modelo: m.modelo, categoria: 'autopropelido',
      potenciaW: m.potenciaW, motor: '—', velocidadeMax: '—',
    }).returning({ id: modelos.id })
    idModelo.set(m.modelo, r.id)
    // O app liga preço a modelo por nome + grupo (buscarPrecificacao).
    await db.insert(precificacao).values(GRUPOS.map(g => ({
      grupoId: idGrupo.get(g.chave)!, nome: m.modelo, valorMinimo: m.valorMinimo.toFixed(2),
    })))
  }

  for (const u of montarUsuarios()) {
    const { data, error } = await auth.createUser({ email: u.email, password: SEED_SENHA!, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser ${u.email}: ${error?.message}`)
    await db.insert(usuarios).values({
      id: data.user.id, nome: u.nome, email: u.email, papel: u.papel,
      lojaId: u.loja ? idLoja.get(u.loja)! : null, aprovaPagamentoSensivel: u.aprovaPagamentoSensivel,
    })
    if (u.cpf) {
      await db.insert(usuariosDados).values({
        usuarioId: data.user.id, cpf: u.cpf, pixTipo: 'email', pixChave: u.email, dataNascimento: '1990-01-15',
      })
    }
    idUsuario.set(u.email, data.user.id)
  }
  const usuarioDe = (prefixo: string, loja: string) => {
    const grupo = LOJAS.find(l => l.chave === loja)!.grupo
    return idUsuario.get(`${prefixo}.${grupo}@${DOMINIO_TESTE}`)!
  }

  await db.insert(categoriasCaixa).values(CATEGORIAS_CAIXA.map((c, i) => ({ ...c, ordem: i })))
  await db.insert(categoriasDespesa).values(CATEGORIAS_DESPESA.map((c, i) => ({ ...c, ordem: i })))

  const listaMotos = montarMotos()
  const idMoto = new Map<string, string>()
  for (const m of listaMotos) {
    const [r] = await db.insert(motos).values({
      chassi: m.chassi, modeloId: idModelo.get(m.modelo)!, lojaId: idLoja.get(m.loja)!,
      status: m.status, disponibilidade: m.disponibilidade, cor: m.cor,
      notaFiscalEntrada: `TST-${m.chassi.slice(-6)}`,
      dataMontagem: m.status === 'caixa' ? null : somarDias(hoje, -30),
    }).returning({ id: motos.id })
    idMoto.set(m.chassi, r.id)
  }

  for (const r of montarReservas(listaMotos)) {
    const moto = listaMotos.find(m => m.chassi === r.chassi)!
    const total = r.pagamentos.reduce((a, p) => a + p.valor, 0)
    await db.insert(reservas).values({
      motoId: idMoto.get(r.chassi)!, lojaId: idLoja.get(moto.loja)!, vendedorId: usuarioDe('vendedor', moto.loja),
      valorReserva: total.toFixed(2), valorTotalVenda: r.valorTotalVenda.toFixed(2),
      meioPagamento: r.pagamentos[0].tipo, pagamentos: r.pagamentos,
      dataPrevistaFinalizacao: somarDias(hoje, 14),
      clienteNome: nomeCliente(r.cliente), clienteCpf: gerarCpf(r.cliente),
      clienteCelular: '35999990000', clienteEmail: `cliente${r.cliente}@${DOMINIO_TESTE}`,
      clienteCep: '37000000', clienteLogradouro: 'Rua Fictícia', clienteNumero: String(r.cliente),
      clienteBairro: 'Centro', clienteCidade: 'Cidade Teste', clienteEstado: 'MG',
    })
  }

  // Uma venda por moto vendida (8), espalhadas pelo mês corrente para o dashboard.
  const vendidas = listaMotos.filter(m => m.status === 'vendida')
  for (const [i, m] of vendidas.entries()) {
    const valor = MODELOS.find(x => x.modelo === m.modelo)!.valorMinimo + 500
    const lojaId = idLoja.get(m.loja)!
    const vendedorId = usuarioDe('vendedor', m.loja)
    const [pedido] = await db.insert(pedidosVenda).values({
      motoId: idMoto.get(m.chassi)!, lojaId, vendedorId, status: 'efetivado',
    }).returning({ id: pedidosVenda.id })
    await db.insert(vendas).values({
      pedidoVendaId: pedido.id, motoId: idMoto.get(m.chassi)!, lojaId, vendedorId,
      efetivadoPor: usuarioDe('aux', m.loja),
      clienteNome: nomeCliente(200 + i), clienteCpf: gerarCpf(200 + i),
      valor: valor.toFixed(2), formaPagamento: 'pix', pagamentos: [{ tipo: 'pix', valor }],
      dataVenda: new Date(`${somarDias(hoje, -i)}T15:00:00-03:00`),
      origemId: idOrigem.get(LOJAS.find(l => l.chave === m.loja)!.grupo)!,
    })
  }

  const statusOs = ['aberta', 'oficina', 'em_andamento', 'finalizada', 'concluida'] as const
  for (const [i, status] of statusOs.entries()) {
    const loja = LOJAS[i].chave
    await db.insert(ordensServico).values({
      lojaId: idLoja.get(loja)!, abertaPor: usuarioDe('aux', loja), mecanicoId: usuarioDe('mecanico', loja),
      status, descricao: `OS de teste ${i + 1}: revisão geral`,
      marcaExterna: 'MotoChefe', modeloExterno: MODELOS[i].modelo,
      clienteNomeExterno: nomeCliente(300 + i), clienteFoneExterno: '35999990000',
      valorTotal: status === 'concluida' ? '350.00' : null,
    })
  }

  console.log(`Seed concluído: ${GRUPOS.length} grupos, ${LOJAS.length} lojas, ${idUsuario.size} usuários, `
    + `${listaMotos.length} motos, 4 reservas, ${vendidas.length} vendas, ${statusOs.length} OS.`)
  await cliente.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await cliente.end({ timeout: 5 })
  process.exit(1)
})
