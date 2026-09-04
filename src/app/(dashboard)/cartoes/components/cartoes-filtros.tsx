'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export type OpcaoConta = { accountId: string; rotulo: string }
export type OpcaoFatura = { ref: string; rotulo: string }

export function CartoesFiltros({ contas, faturas, contaAtual, faturaAtual }: {
  contas: OpcaoConta[]
  faturas: OpcaoFatura[]
  contaAtual: string
  faturaAtual: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  function trocar(chave: 'conta' | 'fatura', valor: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set(chave, valor)
    // Trocar de cartão zera a fatura: a fatura de agosto do Sicoob não existe no
    // Sicredi, e manter o ?fatura= levaria para uma tela vazia sem explicação.
    if (chave === 'conta') p.delete('fatura')
    startTransition(() => router.push(`/cartoes?${p.toString()}`))
  }

  // <select> nativo: o <Select> do projeto mostra o value cru quando ele difere
  // do rótulo, e aqui o value é um uuid de conta.
  const classe = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {contas.length > 1 && (
        <select value={contaAtual} onChange={e => trocar('conta', e.target.value)} disabled={pendente} className={classe}>
          {contas.map(c => <option key={c.accountId} value={c.accountId}>{c.rotulo}</option>)}
        </select>
      )}
      <select value={faturaAtual} onChange={e => trocar('fatura', e.target.value)} disabled={pendente} className={classe}>
        {faturas.map(f => <option key={f.ref} value={f.ref}>{f.rotulo}</option>)}
      </select>
    </div>
  )
}
