import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { clientes, vendas } from '@/lib/db/schema'
import { contaDaLoja } from '@/lib/conta'
import { formatarCpfCnpj, lerContribuinteIcms, lerDocumentoCliente, soDigitosDoc, tipoPessoaDoDocumento, type TipoPessoa } from '@/lib/documento'
import { RecusaUsuario } from '@/lib/resultado-action'

// Comprador da venda: a edição da venda e a correção da NF recusada (#347)
// gravam pelo mesmo caminho, para a nota ser remontada do cadastro.

/**
 * Confere o CPF/CNPJ do comprador. A tela também barra, mas o navegador não é
 * fonte de verdade. Documento inválido bloqueia, exceção ao "avise, não
 * bloqueie" (ADR-0015): a SEFAZ recusaria a nota. Devolve o documento
 * formatado, como a máscara da tela grava, e o representante só quando é
 * pessoa jurídica.
 *
 * `documentoGravado`: na edição, a venda antiga pode ter um documento que não
 * passa na conferência de hoje (ou nenhum). Se ele não mudou, segue como está;
 * corrigir o valor da venda não pode travar por causa do CPF.
 */
export function conferirComprador(
  clienteCpf: string,
  representante?: { nome?: string | null; cpf?: string | null },
  documentoGravado?: string | null,
): { clienteCpf: string; tipoPessoa: TipoPessoa; representanteNome: string | null; representanteCpf: string | null } {
  const digitos = soDigitosDoc(clienteCpf)
  let tipoPessoa: TipoPessoa
  let documento: string
  if (documentoGravado != null && digitos === soDigitosDoc(documentoGravado)) {
    tipoPessoa = tipoPessoaDoDocumento(digitos)
    documento = clienteCpf
  } else {
    const doc = lerDocumentoCliente(clienteCpf)
    if (!doc.ok) throw new RecusaUsuario(doc.erro)
    tipoPessoa = doc.tipoPessoa
    documento = formatarCpfCnpj(doc.documento)
  }

  if (tipoPessoa === 'fisica') {
    return { clienteCpf: documento, tipoPessoa, representanteNome: null, representanteCpf: null }
  }

  // O CPF do representante não vai para a nota, então não barra (ADR-0011):
  // grava os dígitos recebidos, com máscara só quando formam um CPF.
  const cpfRepresentante = soDigitosDoc(representante?.cpf)
  return {
    clienteCpf: documento,
    tipoPessoa,
    representanteNome: representante?.nome?.trim() || null,
    representanteCpf: !cpfRepresentante ? null
      : cpfRepresentante.length === 11 ? formatarCpfCnpj(cpfRepresentante) : cpfRepresentante,
  }
}

/** Ausente (`undefined`) = não mexe no campo gravado; `null` ou '' = apaga. */
export type CompradorVenda = {
  clienteNome: string
  clienteCpf: string
  clienteCelular?: string | null
  clienteEmail?: string | null
  clienteCep?: string | null
  clienteLogradouro?: string | null
  clienteNumero?: string | null
  clienteComplemento?: string | null
  clienteBairro?: string | null
  clienteCidade?: string | null
  clienteEstado?: string | null
  representanteNome?: string | null
  representanteCpf?: string | null
  clienteIndicadorIe?: string | null
  clienteInscricaoEstadual?: string | null
}

export type CompradorConferido = ReturnType<typeof conferirCompradorDaVenda>

/** Confere antes de abrir a transação: documento inválido barra (ADR-0015). */
export function conferirCompradorDaVenda(dados: CompradorVenda, documentoGravado: string | null) {
  const comprador = conferirComprador(
    dados.clienteCpf,
    { nome: dados.representanteNome, cpf: dados.representanteCpf },
    documentoGravado,
  )
  // Venda que virou pessoa física não guarda representante, mesmo sem os campos no payload.
  const gravaRepresentante = comprador.tipoPessoa === 'fisica'
    || dados.representanteNome !== undefined || dados.representanteCpf !== undefined
  const gravaIcms = comprador.tipoPessoa === 'fisica' || dados.clienteIndicadorIe !== undefined
  const icms = lerContribuinteIcms(comprador.clienteCpf, dados.clienteIndicadorIe, dados.clienteInscricaoEstadual)
  return { dados, comprador, gravaRepresentante, gravaIcms, icms }
}

type Executor = Pick<typeof db, 'select' | 'update'>

/**
 * Grava o comprador na venda e a IE no cadastro do cliente. O cliente se acha
 * pelo documento DENTRO da Conta da loja da venda: outra Conta com o mesmo CPF
 * ou CNPJ não é tocada.
 */
export async function gravarCompradorDaVenda(tx: Executor, venda: { id: string; lojaId: string }, c: CompradorConferido) {
  const { dados, comprador, icms } = c
  const campo = (k: keyof CompradorVenda) => (dados[k] === undefined ? {} : { [k]: dados[k] || null })
  await tx.update(vendas)
    .set({
      clienteNome: dados.clienteNome,
      clienteCpf:  comprador.clienteCpf,
      ...(c.gravaRepresentante ? { representanteNome: comprador.representanteNome, representanteCpf: comprador.representanteCpf } : {}),
      ...(c.gravaIcms ? { clienteIndicadorIe: icms.indicadorIe, clienteInscricaoEstadual: icms.inscricaoEstadual } : {}),
      ...campo('clienteCelular'),
      ...campo('clienteEmail'),
      ...campo('clienteCep'),
      ...campo('clienteLogradouro'),
      ...campo('clienteNumero'),
      ...campo('clienteComplemento'),
      ...campo('clienteBairro'),
      ...campo('clienteCidade'),
      ...campo('clienteEstado'),
    })
    .where(eq(vendas.id, venda.id))

  // A IE é da empresa: a correção vale também para a próxima venda a ela.
  if (c.gravaIcms && icms.indicadorIe) {
    await tx.update(clientes)
      .set({ indicadorIe: icms.indicadorIe, inscricaoEstadual: icms.inscricaoEstadual, atualizadoEm: sql`now()` })
      .where(and(eq(clientes.cpfCnpj, soDigitosDoc(comprador.clienteCpf)), eq(clientes.contaId, await contaDaLoja(venda.lojaId, tx))))
  }
}
