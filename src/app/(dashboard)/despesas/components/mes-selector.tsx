'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export function MesSelector({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = new URLSearchParams(params.toString())
    next.set('mes', e.target.value)
    router.push(`/despesas?${next.toString()}`)
  }

  return (
    <input
      type="month"
      defaultValue={mesAtual}
      onChange={handleChange}
      className="h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base outline-none md:h-9 md:w-auto md:text-sm"
    />
  )
}
