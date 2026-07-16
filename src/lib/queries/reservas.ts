import { db } from '@/lib/db'
import { reservas, motos, modelos, lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type ReservaComDetalhes = Awaited<ReturnType<typeof buscarReserva>>

export async function buscarReserva(id: string) {
  const [reserva] = await db
    .select({
      id: reservas.id,
      numero: reservas.numero,
      status: reservas.status,
      criadoEm: reservas.criadoEm,
      motoId: reservas.motoId,
      lojaId: reservas.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      cor: motos.cor,
      chassi: motos.chassi,
      vendedorNome: usuarios.nome,
      valorReserva: reservas.valorReserva,
      valorTotalVenda: reservas.valorTotalVenda,
      meioPagamento: reservas.meioPagamento,
      cartaoOperadora: reservas.cartaoOperadora,
      cartaoParcelas: reservas.cartaoParcelas,
      dataPrevistaFinalizacao: reservas.dataPrevistaFinalizacao,
      clienteNome: reservas.clienteNome,
      clienteCpf: reservas.clienteCpf,
      clienteCelular: reservas.clienteCelular,
      clienteEmail: reservas.clienteEmail,
      clienteCep: reservas.clienteCep,
      clienteLogradouro: reservas.clienteLogradouro,
      clienteNumero: reservas.clienteNumero,
      clienteComplemento: reservas.clienteComplemento,
      clienteBairro: reservas.clienteBairro,
      clienteCidade: reservas.clienteCidade,
      clienteEstado: reservas.clienteEstado,
    })
    .from(reservas)
    .innerJoin(motos, eq(reservas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(reservas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(reservas.vendedorId, usuarios.id))
    .where(eq(reservas.id, id))
    .limit(1)
  return reserva ?? null
}
