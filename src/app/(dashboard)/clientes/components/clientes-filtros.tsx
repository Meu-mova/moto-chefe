'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

type Valores = { busca?: string; tipoPessoa?: string; sexo?: string; cidade?: string }

const TIPOS = [['todos', 'Todos'], ['fisica', 'Pessoa Física'], ['juridica', 'Pessoa Jurídica']]
const SEXOS = [['todos', 'Todos'], ['masculino', 'Masculino'], ['feminino', 'Feminino'], ['nao_identificado', 'Não identificado']]

// text-base no celular: o iOS dá zoom ao focar campo com fonte menor que 16px.
const campo = 'h-10 w-full rounded-lg border border-input bg-card px-3 text-base lg:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Busca à vista e o resto num só botão "Filtros". Tudo vai por GET na URL, como antes,
 * então link e voltar continuam guardando o filtro. No desktop os campos ficam em linha.
 */
export function ClientesFiltros({ valores, cidades }: { valores: Valores; cidades: string[] }) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState(valores.busca ?? '')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Voltar do navegador ou "Limpar" mudam a URL: o campo acompanha.
  // Compara sem espaços para não comer o espaço que a pessoa acabou de digitar.
  useEffect(() => {
    setTermo(t => (t.trim() === (valores.busca ?? '') ? t : valores.busca ?? ''))
  }, [valores.busca])

  // Busca ao digitar: espera a pessoa parar 350 ms (como em Vendas) e volta à página 1.
  useEffect(() => {
    if (termo.trim() === (valores.busca ?? '')) return
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString())
      if (termo.trim()) p.set('busca', termo.trim())
      else p.delete('busca')
      p.delete('page')
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    }, 350)
    return () => clearTimeout(t)
  }, [termo]) // eslint-disable-line react-hooks/exhaustive-deps
  const ativos = [valores.tipoPessoa, valores.sexo, valores.cidade].filter(v => v && v !== 'todos').length

  // Gaveta do celular: Tipo e Sexo em pílulas (rádio), sem a lista nativa abrindo fora da gaveta.
  const pilulas = (nome: string, opcoes: string[][], atual?: string) => (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{nome === 'tipoPessoa' ? 'Tipo' : 'Sexo'}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={nome} value={v} defaultChecked={(atual ?? 'todos') === v} className="peer sr-only" />
            <span className="inline-flex h-9 items-center rounded-full border border-input px-3.5 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {l}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )

  const cidade = cidades.length > 0 && (
    <label className="block text-sm font-medium lg:w-44">Cidade
      <select name="cidade" defaultValue={valores.cidade ?? 'todos'} className={`${campo} mt-1`}>
        <option value="todos">Todas</option>
        {cidades.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  )

  const selects = (
    <>
      <label className="block text-sm font-medium lg:w-44">Tipo
        <select name="tipoPessoa" defaultValue={valores.tipoPessoa ?? 'todos'} className={`${campo} mt-1`}>
          {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium lg:w-44">Sexo
        <select name="sexo" defaultValue={valores.sexo ?? 'todos'} className={`${campo} mt-1`}>
          {SEXOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {cidade}
    </>
  )

  const busca = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input name="busca" aria-label="Busca" placeholder="Nome, CPF/CNPJ ou celular…" value={termo} onChange={e => setTermo(e.target.value)} className="h-10 pl-9 pr-9 md:text-base lg:text-sm" />
      {termo && (
        <button type="button" onClick={() => setTermo('')} aria-label="Limpar busca"
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  )

  return (
    <>
      {/* Celular: busca + botão que abre a gaveta com os filtros. */}
      <form method="GET" className="flex gap-2 lg:hidden">
        {busca}
        {['tipoPessoa', 'sexo', 'cidade'].map(k => {
          const v = valores[k as keyof Valores]
          return v ? <input key={k} type="hidden" name={k} value={v} /> : null
        })}
        <Button type="button" variant="outline" onClick={() => setAberto(true)} className="h-10 gap-1.5">
          <Filter className="size-4" /> Filtros
          {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{ativos}</span>}
        </Button>
      </form>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          <SheetTitle className="mb-3 text-base">Filtros</SheetTitle>
          <form method="GET" className="space-y-4">
            {termo.trim() && <input type="hidden" name="busca" value={termo.trim()} />}
            {pilulas('tipoPessoa', TIPOS, valores.tipoPessoa)}
            {pilulas('sexo', SEXOS, valores.sexo)}
            {cidade}
            <div className="flex gap-2 pt-2">
              <a href={valores.busca ? `?busca=${encodeURIComponent(valores.busca)}` : '?'} className={buttonVariants({ variant: 'outline', className: 'h-11 flex-1 border-input' })}>Limpar</a>
              <Button type="submit" className="h-11 flex-1">Aplicar</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Desktop: tudo em linha. */}
      <form method="GET" className="hidden items-end gap-3 lg:flex">
        {busca}
        {selects}
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>
    </>
  )
}
