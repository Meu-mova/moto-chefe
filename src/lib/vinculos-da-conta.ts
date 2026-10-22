import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientes, lojas, motos, ordensServico, usuarios } from '@/lib/db/schema'
import { contaDaLoja, lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

// Gravação que liga um registro a loja, moto, cliente, OS ou mecânico confere que eles são da
// mesma Conta da loja do registro. O id vem do navegador; de outra Conta, ele "não existe".
export async function conferirVinculosDaConta(
  lojaId: string,
  vinculos: { lojaId?: string; motoId?: string | null; clienteId?: string | null; osId?: string | null; mecanicoId?: string | null },
  exec: Executor = db,
): Promise<void> {
  const contaId = await contaDaLoja(lojaId, exec)

  if (vinculos.lojaId) {
    const [loja] = await exec.select({ id: lojas.id }).from(lojas)
      .where(and(eq(lojas.id, vinculos.lojaId), inArray(lojas.id, lojasDaConta(contaId)))).limit(1)
    if (!loja) throw new Error('Loja não encontrada')
  }

  if (vinculos.motoId) {
    const [moto] = await exec.select({ id: motos.id }).from(motos)
      .where(and(eq(motos.id, vinculos.motoId), inArray(motos.lojaId, lojasDaConta(contaId)))).limit(1)
    if (!moto) throw new Error('Moto não encontrada')
  }

  if (vinculos.clienteId) {
    const [cliente] = await exec.select({ id: clientes.id }).from(clientes)
      .where(and(eq(clientes.id, vinculos.clienteId), eq(clientes.contaId, contaId))).limit(1)
    if (!cliente) throw new Error('Cliente não encontrado')
  }

  if (vinculos.osId) {
    const [os] = await exec.select({ id: ordensServico.id }).from(ordensServico)
      .where(and(eq(ordensServico.id, vinculos.osId), inArray(ordensServico.lojaId, lojasDaConta(contaId)))).limit(1)
    if (!os) throw new Error('OS não encontrada')
  }

  if (vinculos.mecanicoId) {
    // Funcionário de loja costuma ter só loja_id; sócio, só conta_id.
    const [mecanico] = await exec.select({ id: usuarios.id }).from(usuarios)
      .where(and(
        eq(usuarios.id, vinculos.mecanicoId),
        or(eq(usuarios.contaId, contaId), inArray(usuarios.lojaId, lojasDaConta(contaId))),
      )).limit(1)
    if (!mecanico) throw new Error('Mecânico não encontrado')
  }
}
