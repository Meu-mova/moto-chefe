'use client'
import { useState } from 'react'
import { registrarLeadAction } from './actions'
import { MEET, WHATSAPP, waLink } from '@/lib/lead-convencao'

type Campos = { nome: string; email: string; whatsapp: string; unidade: string }
const VAZIO: Campos = { nome: '', email: '', whatsapp: '', unidade: '' }

const inputClass =
  'w-full rounded-xl border border-emerald-900/40 bg-[#0B1610] px-4 py-3.5 text-base text-white ' +
  'placeholder:text-slate-500 outline-none focus:border-emerald-400'

export function FormConvencao() {
  const [form, setForm] = useState<Campos>(VAZIO)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const res = await registrarLeadAction(form)
    setEnviando(false)
    if (res.ok) setOk(true)
    else setErro(res.erro)
  }

  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (ok) {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-emerald-900/40 bg-[#12241B] p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <span className="text-3xl">✅</span>
          <h2 className="text-2xl font-bold text-white">Recebido!</h2>
          <p className="text-[15px] leading-relaxed text-emerald-100/80">
            Sua vaga na demonstração completa do MOVA está garantida. Enviamos os detalhes no seu e-mail.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-900/40 bg-[#0B1610] p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Sua demonstração</p>
          <p className="mt-2 text-lg font-semibold text-white">{MEET.titulo}</p>
          <p className="text-[15px] text-emerald-100/80">{MEET.quando}</p>
          <p className="mt-2 break-all text-[15px] text-emerald-300">
            Google Meet: <span className="underline">{MEET.link}</span>
          </p>
        </div>

        <a
          href={waLink(WHATSAPP.numero, WHATSAPP.mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-4 text-center text-base font-semibold text-[#08150F] transition-colors hover:bg-emerald-400"
        >
          💬 Confirmar no WhatsApp
        </a>
        <p className="text-center text-[13px] text-slate-500">
          “Estarei na reunião pra conhecer mais do MOVA”
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submeter} className="flex flex-col gap-3.5 rounded-2xl border border-emerald-900/40 bg-[#12241B] p-6 sm:p-8">
      <h2 className="mb-1 text-xl font-bold text-white">Deixe seu contato</h2>
      <input className={inputClass} placeholder="Seu nome" value={form.nome} onChange={set('nome')} autoComplete="name" required />
      <input className={inputClass} type="email" inputMode="email" placeholder="E-mail" value={form.email} onChange={set('email')} autoComplete="email" required />
      <input className={inputClass} type="tel" inputMode="tel" placeholder="WhatsApp (com DDD)" value={form.whatsapp} onChange={set('whatsapp')} autoComplete="tel" required />
      <input className={inputClass} placeholder="Sua unidade da MotoChefe" value={form.unidade} onChange={set('unidade')} required />

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 rounded-xl bg-emerald-500 px-5 py-4 text-base font-semibold text-[#08150F] transition-colors hover:bg-emerald-400 disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : 'Quero a demonstração'}
      </button>
      <p className="text-center text-[13px] text-slate-500">Sem compromisso. Só pra te mandar o convite da demo.</p>
    </form>
  )
}
