import { and, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientes, lojas, modelos, motos, vendas } from '@/lib/db/schema'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

// Busca de moto por chassi das telas de Garantias e OS (#325). contaDasMotos nulo =
// admin_geral, que acha moto de qualquer Conta; o comprador só aparece se for cliente
// da Conta de quem busca, porque a moto pode ter sido vendida por outro cliente do MOVA.
// Sem next/headers, para ser testado contra o banco.
export async function buscarMotosPorChassi(
  termo: string,
  opcoes: { contaDasMotos: string | null; contaDoComprador: string; limite: number },
  exec: Executor = db,
) {
  return exec
    .select({
      motoId:      motos.id,
      chassi:      motos.chassi,
      marca:       modelos.marca,
      modelo:      modelos.modelo,
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
      opcoes.contaDasMotos ? inArray(motos.lojaId, lojasDaConta(opcoes.contaDasMotos)) : undefined,
    ))
    .limit(opcoes.limite)
}
