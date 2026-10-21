import { and, eq, sql } from 'drizzle-orm'
import { motos } from '@/lib/db/schema'

// Regra única de "moto no showroom" (#310): a tela Showroom e o dashboard divergiam
// por terem cada um a sua cópia. Entra a moto vendida que ainda não saiu (disponibilidade
// diferente de vendida); moto só de garantia de veículo externo nunca é estoque.
export const motoNaoVendida = () => sql`${motos.disponibilidade} IS DISTINCT FROM 'vendida'::disponibilidade_moto`

export const motoNoShowroom = () => and(eq(motos.somenteGarantia, false), motoNaoVendida())!
