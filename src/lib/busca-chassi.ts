import { and, eq, ilike, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { clientes, lojas, modelos, motos, vendas, veiculosHistorico } from '@/lib/db/schema'
import { lojasDoEscopo } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

// Busca de moto por chassi das telas de Garantias e OS (#325). contaDasMotos nulo =
// admin_geral, que acha moto de qualquer Conta; o comprador só aparece se for cliente
// da Conta de quem busca, porque a moto pode ter sido vendida por outro cliente do MOVA.
// Sem next/headers, para ser testado contra o banco.
export async function buscarMotosPorChassi(
  termo: string,
  opcoes: { contaDasMotos: string | null; contaDoComprador: string; limite: number; grupoLiberado?: string | null },
  exec: Executor = db,
) {
  return exec
    .select({
      motoId:      motos.id,
      chassi:      motos.chassi,
      marca:       modelos.marca,
      modelo:      nomeDoModeloNaLoja(motos.lojaId),
      cor:         motos.cor,
      status:      motos.status,
      lojaId:      motos.lojaId,
      lojaNome:    lojas.nome,
      clienteId:   clientes.id,
      clienteNome: clientes.nome,
      clienteCpf:  clientes.cpfCnpj,
      clienteFone: clientes.celular,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas,   eq(motos.lojaId,   lojas.id))
    .leftJoin(vendas,   eq(vendas.motoId,  motos.id))
    .leftJoin(clientes, and(eq(vendas.clienteId, clientes.id), eq(clientes.contaId, opcoes.contaDoComprador)))
    .where(and(
      ilike(motos.chassi, `%${termo}%`),
      opcoes.contaDasMotos ? inArray(motos.lojaId, lojasDoEscopo({ contaId: opcoes.contaDasMotos, grupoLiberado: opcoes.grupoLiberado })) : undefined,
    ))
    .limit(opcoes.limite)
}

// Histórico de veículos é da Conta que importou (#325). contaId nulo = admin_geral.
export async function buscarHistoricoPorChassi(termo: string, contaId: string | null, limite: number, exec: Executor = db) {
  return exec.select().from(veiculosHistorico)
    .where(and(
      ilike(veiculosHistorico.chassi, `%${termo}%`),
      contaId ? eq(veiculosHistorico.contaId, contaId) : undefined,
    ))
    .limit(limite)
}

type VeiculoHistorico = {
  chassi: string; numeroMotor: string | null; marca: string; modelo: string
  cor: string | null; ano: number | null; nfEntrada: string | null
}

// Chassi é único por Conta: reimportar atualiza a linha da própria Conta e nunca toca na
// de outra, que pode ter o mesmo chassi. Devolve quantos entraram.
export async function gravarVeiculosHistorico(valores: VeiculoHistorico[], contaId: string, exec: Pick<typeof db, 'insert'> = db): Promise<number> {
  if (!valores.length) return 0
  const gravados = await exec
    .insert(veiculosHistorico)
    .values(valores.map(v => ({ ...v, contaId })))
    .onConflictDoUpdate({
      target: [veiculosHistorico.contaId, veiculosHistorico.chassi],
      set: {
        numeroMotor: sql`excluded.numero_motor`,
        marca:       sql`excluded.marca`,
        modelo:      sql`excluded.modelo`,
        cor:         sql`excluded.cor`,
        ano:         sql`excluded.ano`,
        nfEntrada:   sql`excluded.nf_entrada`,
        importadoEm: sql`now()`,
      },
    })
    .returning({ id: veiculosHistorico.id })
  return gravados.length
}

// Chassis da lista que já são motos da Conta (contaId nulo = admin_geral, qualquer Conta).
// A importação do histórico os ignora; chassi de outra Conta não aparece aqui (#325).
export async function chassisNasMotos(chassis: string[], contaId: string | null, grupoLiberado: string | null, exec: Executor = db): Promise<string[]> {
  if (!chassis.length) return []
  const linhas = await exec.select({ chassi: motos.chassi }).from(motos)
    .where(and(inArray(motos.chassi, chassis), contaId ? inArray(motos.lojaId, lojasDoEscopo({ contaId, grupoLiberado })) : undefined))
  return linhas.map(l => l.chassi).filter((c): c is string => !!c)
}

// Moto pelo chassi exato, só entre as lojas da Conta (#325): cupom e garantia importada
// não podem se ligar a moto de outro cliente do MOVA.
export async function motoDaContaPorChassi(chassi: string, contaId: string, grupoLiberado: string | null, exec: Executor = db) {
  const [moto] = await exec.select({ id: motos.id, lojaId: motos.lojaId, chassi: motos.chassi }).from(motos)
    .where(and(eq(motos.chassi, chassi), inArray(motos.lojaId, lojasDoEscopo({ contaId, grupoLiberado }))))
    .limit(1)
  return moto ?? null
}
