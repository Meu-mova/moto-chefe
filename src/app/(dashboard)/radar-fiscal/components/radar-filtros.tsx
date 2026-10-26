'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'

/**
 * Período, emitente, chave/número e "só não lançadas" — tudo na URL
 * (searchParams), não em estado: o recorte pode ser colado num e-mail e
 * sobrevive ao refresh, como o resto do sistema (ver EstoqueFiltros).
 */
export function RadarFiltros({
  deInicial,
  ateInicial,
  emitenteInicial,
  buscaInicial,
}: {
  deInicial: string
  ateInicial: string
  emitenteInicial: string
  buscaInicial: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [emitente, setEmitente] = useState(emitenteInicial)
  const [busca, setBusca] = useState(buscaInicial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce dos dois campos de texto juntos: digitar num não pode disparar
  // navegação enquanto o outro ainda está sendo editado na mesma leva.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (emitente.trim()) params.set('emitente', emitente.trim()); else params.delete('emitente')
      if (busca.trim()) params.set('busca', busca.trim()); else params.delete('busca')
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [emitente, busca])

  function atualizarData(chave: 'de' | 'ate', valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set(chave, valor); else params.delete(chave)
    router.push(`${pathname}?${params.toString()}`)
  }

  const pendentesAtivo = searchParams.get('pendentes') === '1'
  function togglePendentes() {
    const params = new URLSearchParams(searchParams.toString())
    if (pendentesAtivo) params.delete('pendentes'); else params.set('pendentes', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  function limpar() {
    setEmitente('')
    setBusca('')
    router.push(pathname)
  }

  const temFiltro = searchParams.toString() !== ''

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={deInicial}
          onChange={e => atualizarData('de', e.target.value)}
          className="h-9 w-36"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={ateInicial}
          onChange={e => atualizarData('ate', e.target.value)}
          className="h-9 w-36"
        />
      </div>

      <Input
        placeholder="Emitente..."
        value={emitente}
        onChange={e => setEmitente(e.target.value)}
        className="h-9 w-44"
      />

      <Input
        placeholder="Chave ou número..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="h-9 w-44"
      />

      <Button
        variant={pendentesAtivo ? 'default' : 'outline'}
        size="sm"
        onClick={togglePendentes}
        className="h-9 gap-1.5"
        title="Mostrar só notas que ainda não viraram entrada no estoque"
      >
        <Filter size={14} />
        Só não lançadas
      </Button>

      {temFiltro && (
        <Button variant="ghost" size="sm" onClick={limpar} className="text-muted-foreground">
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
