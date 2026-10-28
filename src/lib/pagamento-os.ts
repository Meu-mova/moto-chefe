import { db } from '@/lib/db'
import { ordensServico, lancamentosCaixa, cuponsRevisao } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import type { PgtoOS } from '@/lib/conciliacao-status'
import { TIPO_PAGAMENTO_CUPOM, normalizarCodigoCupom } from '@/lib/cupom-revisao'
import { conferirMaquininhas, operadorasGravadas } from '@/lib/maquininhas'
import { RecusaUsuario } from '@/lib/resultado-action'

export type DadosPagamentoOS = {
  valorTotal: number
  pagamentos: PgtoOS[]
}

/** Maquininha do pagamento é do grupo da loja da OS; a já gravada na OS continua aceita (#460). */
export async function conferirMaquininhasDaOS(
  exec: Pick<typeof db, 'select'>, osId: string, pagamentos: { operadora?: string | null }[],
) {
  const [os] = await exec.select({ lojaId: ordensServico.lojaId, pagamentos: ordensServico.pagamentos })
    .from(ordensServico).where(eq(ordensServico.id, osId)).limit(1)
  if (!os) throw new RecusaUsuario('OS não encontrada')
  await conferirMaquininhas(exec, os.lojaId, pagamentos, operadorasGravadas(os.pagamentos))
}

// Aplica o pagamento de fato na OS, sem checagem de permissão: quem chama confere antes
// (fechamento direto e aprovação de pagamento sensível). Fica fora de arquivo 'use server'
// de propósito: lá, função exportada vira endpoint que qualquer usuário chama direto (#328).
export async function aplicarPagamentoOS(osId: string, dados: DadosPagamentoOS) {
  const [osAtual] = await db
    .select({ status: ordensServico.status, lojaId: ordensServico.lojaId, numero: ordensServico.numero })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  // Aprovações de pagamento sensível criadas antes da migração pra array de
  // pagamentos guardam o formato antigo (só formaPagamento, sem `pagamentos`).
  // Normaliza aqui pra não quebrar ao aprovar uma aprovação pendente antiga.
  const legado = dados as unknown as { formaPagamento?: string }
  const pagamentos = dados.pagamentos ?? (legado.formaPagamento
    ? [{ tipo: legado.formaPagamento, valor: dados.valorTotal }]
    : [])
  // Aqui, e não só no fechamento: a aprovação de pagamento sensível chega direto (#460).
  await conferirMaquininhasDaOS(db, osId, pagamentos)

  const usuario = await getUsuarioLogado()
  const pagamentosDinheiro = pagamentos.filter(p => p.tipo === 'dinheiro')
  // Data no fuso de SP — evita cair no dia anterior à noite (toISOString é UTC).
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  await db.transaction(async (tx) => {
    await tx.update(ordensServico).set({
      valorTotal:     String(dados.valorTotal),
      formaPagamento: pagamentos[0]?.tipo ?? (dados.valorTotal < 0.01 ? 'Gratuita' : null),
      pagamentos:     pagamentos.length > 0 ? pagamentos : null,
      ...(osAtual?.status === 'pendente_pagamento'
        ? { status: 'concluida' as any, dataConclusao: new Date() }
        : {}),
    }).where(eq(ordensServico.id, osId))

    // Recebimento em dinheiro entra no caixa da loja, como na venda de moto.
    // Re-sincroniza: apaga os lançamentos de dinheiro anteriores desta OS e
    // recria — assim editar o pagamento (ou trocá-lo por outra forma, ou zerar
    // uma OS gratuita) não duplica nem deixa resíduo no caixa.
    if (osAtual?.lojaId) {
      await tx.delete(lancamentosCaixa)
        .where(and(eq(lancamentosCaixa.osId, osId), eq(lancamentosCaixa.tipo, 'entrada')))
      for (const pgto of pagamentosDinheiro) {
        await tx.insert(lancamentosCaixa).values({
          lojaId:    osAtual.lojaId,
          usuarioId: usuario.id,
          tipo:      'entrada',
          categoria: 'Serviço',
          descricao: `OS #${osAtual.numero ?? '—'} dinheiro`,
          valor:     Number(pgto.valor).toFixed(2),
          data:      hoje,
          osId,
        })
      }
    }

    // Cupom de revisão: re-sincroniza como o caixa acima. Primeiro SOLTA os cupons
    // presos a esta OS que sumiram do pagamento — trocar o cupom por dinheiro numa
    // reedição deixaria o cupom queimado sem nada em troca —, depois prende os que
    // ficaram. Fora da transação isso abriria janela pra dois caixas gastarem o
    // mesmo código.
    const linhasCupom = pagamentos.filter(p => p.tipo === TIPO_PAGAMENTO_CUPOM && p.cupom)
    const codigosCupom = linhasCupom.map(p => normalizarCodigoCupom(p.cupom))

    await tx.update(cuponsRevisao)
      .set({ status: 'ativo', osId: null, usadoEm: null, valorAbatido: null })
      .where(and(
        eq(cuponsRevisao.osId, osId),
        codigosCupom.length > 0 ? notInArray(cuponsRevisao.codigo, codigosCupom) : undefined,
      ))

    for (const linha of linhasCupom) {
      await tx.update(cuponsRevisao).set({
        status: 'usado',
        osId,
        usadoEm: new Date(),
        valorAbatido: Number(linha.valor).toFixed(2),
      }).where(eq(cuponsRevisao.codigo, normalizarCodigoCupom(linha.cupom)))
    }
  })

  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
  revalidatePath('/caixa')
}
