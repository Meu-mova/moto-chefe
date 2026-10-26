/**
 * Troca o tomador (nome, documento, tipo de pessoa) de uma venda de peças já lançada (#397).
 * Itens, pagamentos, estoque e conciliação ficam como estão. Mesma permissão do "Editar"
 * (vendaEditavel em pecas/actions.ts) e mesmas regras de documento da criação (ADR-0015).
 */
import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { vendasPecas, vendasPecasEdicoes } from '@/lib/db/schema'
import { vendaPecaEditavel, type UsuarioDaVenda } from '@/lib/venda-peca-editavel'
import { formatarCpfCnpj, isTipoPessoa, validarDocumento, type TipoPessoa } from '@/lib/documento'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ClienteVendaPeca = { clienteNome: string | null; clienteDocumento: string | null; clienteTipoPessoa: TipoPessoa }

type UsuarioEditor = UsuarioDaVenda & { id: string }

/** Linha do histórico: só o que mudou, nome e/ou documento. */
export function resumoDaTrocaDeCliente(antes: ClienteVendaPeca, depois: ClienteVendaPeca): string {
  const nome = (n: string | null) => n ?? 'não informado'
  const doc = (c: ClienteVendaPeca) => (c.clienteDocumento ? formatarCpfCnpj(c.clienteDocumento) : 'sem documento')
  const partes: string[] = []
  if (antes.clienteNome !== depois.clienteNome) partes.push(`Cliente: ${nome(antes.clienteNome)} → ${nome(depois.clienteNome)}`)
  if (antes.clienteDocumento !== depois.clienteDocumento || antes.clienteTipoPessoa !== depois.clienteTipoPessoa) {
    partes.push(`Documento: ${doc(antes)} → ${doc(depois)}`)
  }
  return partes.join('\n')
}

export async function editarClienteVendaPecaTx(
  tx: Tx,
  usuario: UsuarioEditor,
  vendaId: string,
  input: { clienteNome: string | null; clienteTipoPessoa: string; clienteDocumento: string | null },
) {
  const tipoPessoa = isTipoPessoa(input.clienteTipoPessoa) ? input.clienteTipoPessoa : 'fisica'
  const doc = validarDocumento(tipoPessoa, input.clienteDocumento)
  if (!doc.ok) throw new Error(doc.erro)
  const clienteNome = input.clienteNome?.trim() || null
  if (tipoPessoa === 'juridica' && !clienteNome) throw new Error('Informe a razão social da empresa')

  const atual = await vendaPecaEditavel(tx, usuario, vendaId, true)
  if (!atual) throw new Error('Venda não encontrada')

  const antes: ClienteVendaPeca = {
    clienteNome: atual.clienteNome,
    clienteDocumento: atual.clienteDocumento,
    clienteTipoPessoa: isTipoPessoa(atual.clienteTipoPessoa) ? atual.clienteTipoPessoa : 'fisica',
  }
  const depois: ClienteVendaPeca = { clienteNome, clienteDocumento: doc.documento, clienteTipoPessoa: tipoPessoa }
  const resumo = resumoDaTrocaDeCliente(antes, depois)
  if (!resumo) return { numero: atual.numero }

  await tx.update(vendasPecas).set(depois)
    .where(and(eq(vendasPecas.id, vendaId), eq(vendasPecas.lojaId, atual.lojaId)))
  await tx.insert(vendasPecasEdicoes).values({
    grupoId: atual.grupoId, vendaPecaId: vendaId, usuarioId: usuario.id, resumo, antes, depois,
  })
  return { numero: atual.numero }
}
