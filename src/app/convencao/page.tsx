import type { Metadata } from 'next'
import { FormConvencao } from './form-convencao'

export const metadata: Metadata = {
  title: 'MOVA — Demonstração',
  description: 'Viu o MOVA na convenção da MotoChefe? Veja o sistema rodando na sua loja.',
}

const BULLETS = [
  'Estoque, venda, oficina e financeiro — num sistema só',
  'Feito pra loja de motos elétricas, do XML da nota à garantia',
  'Já roda na MotoChefe, de verdade, todo dia',
]

export default function ConvencaoPage() {
  return (
    <main className="min-h-screen bg-[#0E1A14] px-5 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Convenção MotoChefe 2026
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mova-logo-dark.png" alt="MOVA" className="h-9 w-auto" />
          <h2 className="text-2xl font-bold leading-snug text-white">
            Viu o MOVA na convenção? Veja rodando na sua loja.
          </h2>
          <ul className="flex flex-col gap-2.5">
            {BULLETS.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-emerald-100/80">
                <span className="mt-0.5 text-emerald-400">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </header>

        <FormConvencao />

        <p className="text-center text-[13px] text-slate-500">meumova.com</p>
      </div>
    </main>
  )
}
