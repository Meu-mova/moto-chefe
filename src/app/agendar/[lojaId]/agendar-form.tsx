'use client'
import { useState, useTransition } from 'react'
import { addDays, format, isSunday, startOfDay, setHours, setMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { agendarPublicoAction } from '@/app/(dashboard)/agenda/actions'
import { CheckCircle2, Loader2 } from 'lucide-react'

const TIPOS_SERVICO = [
  'Revisão geral', 'Troca de óleo', 'Freios', 'Pneus', 'Elétrica',
  'Motor', 'Suspensão', 'Escapamento', 'Garantia / Pós-venda', 'Outros',
]

// Próximos 14 dias, excluindo domingos
function getDiasDisponiveis(): Date[] {
  const dias: Date[] = []
  let d = addDays(new Date(), 1)
  while (dias.length < 14) {
    if (!isSunday(d)) dias.push(startOfDay(d))
    d = addDays(d, 1)
  }
  return dias
}

// Horários de 8h às 17h, de hora em hora
function getHorarios(): string[] {
  const h: string[] = []
  for (let hora = 8; hora <= 17; hora++) {
    h.push(`${String(hora).padStart(2, '0')}:00`)
    if (hora < 17) h.push(`${String(hora).padStart(2, '0')}:30`)
  }
  return h
}

type Props = { lojaId: string }

export function AgendarForm({ lojaId }: Props) {
  const [pending, start] = useTransition()
  const [sucesso, setSucesso] = useState(false)

  const [form, setForm] = useState({
    nome:             '',
    fone:             '',
    tipoServico:      '',
    descricao:        '',
    dia:              '',
    horario:          '',
  })
  const [erros, setErros] = useState<Partial<typeof form>>({})

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErros(e => ({ ...e, [k]: '' }))
  }

  function validar() {
    const e: Partial<typeof form> = {}
    if (!form.nome.trim())    e.nome        = 'Informe seu nome'
    if (!form.fone.trim())    e.fone        = 'Informe seu telefone'
    if (!form.tipoServico)    e.tipoServico = 'Selecione o tipo de serviço'
    if (!form.dia)            e.dia         = 'Selecione uma data'
    if (!form.horario)        e.horario     = 'Selecione um horário'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function enviar() {
    if (!validar()) return
    const [h, m]     = form.horario.split(':').map(Number)
    const dataHora   = setMinutes(setHours(new Date(form.dia), h), m)
    start(async () => {
      try {
        await agendarPublicoAction({
          lojaId,
          clienteNome:      form.nome,
          clienteFone:      form.fone,
          tipoServico:      form.tipoServico,
          descricaoCliente: form.descricao || undefined,
          dataHoraInicio:   dataHora.toISOString(),
        })
        setSucesso(true)
      } catch (e: any) {
        setErros({ nome: e.message ?? 'Erro ao enviar. Tente novamente.' })
      }
    })
  }

  if (sucesso) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2 size={52} className="text-success" />
        <div>
          <h3 className="text-xl font-bold text-foreground">Agendamento enviado!</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Recebemos sua solicitação. Nossa equipe entrará em contato pelo número <strong>{form.fone}</strong> para confirmar.
          </p>
        </div>
        <button onClick={() => { setSucesso(false); setForm({ nome: '', fone: '', tipoServico: '', descricao: '', dia: '', horario: '' }) }}
          className="text-sm text-info hover:underline">
          Fazer outro agendamento
        </button>
      </div>
    )
  }

  const dias     = getDiasDisponiveis()
  const horarios = getHorarios()

  return (
    <div className="space-y-4">
      {/* Nome e telefone */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Seu nome *" error={erros.nome}>
          <input value={form.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Nome completo" className={input(erros.nome)} />
        </Field>
        <Field label="Telefone / WhatsApp *" error={erros.fone}>
          <input value={form.fone} onChange={e => set('fone', e.target.value)}
            placeholder="(35) 99999-9999" className={input(erros.fone)} />
        </Field>
      </div>

      {/* Tipo de serviço */}
      <Field label="Tipo de serviço *" error={erros.tipoServico}>
        <select value={form.tipoServico} onChange={e => set('tipoServico', e.target.value)}
          className={input(erros.tipoServico)}>
          <option value="">Selecione...</option>
          {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      {/* Data */}
      <Field label="Data desejada *" error={erros.dia}>
        <select value={form.dia} onChange={e => set('dia', e.target.value)} className={input(erros.dia)}>
          <option value="">Selecione...</option>
          {dias.map(d => (
            <option key={d.toISOString()} value={d.toISOString()}>
              {format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </option>
          ))}
        </select>
      </Field>

      {/* Horário */}
      {form.dia && (
        <Field label="Horário *" error={erros.horario}>
          <div className="grid grid-cols-4 gap-1.5">
            {horarios.map(h => (
              <button key={h} type="button" onClick={() => set('horario', h)}
                className={`py-2 rounded-lg text-sm border font-medium transition-colors ${
                  form.horario === h
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:border-ring'
                }`}>
                {h}
              </button>
            ))}
          </div>
          {erros.horario && <p className="text-destructive text-xs mt-1">{erros.horario}</p>}
        </Field>
      )}

      {/* Observações */}
      <Field label="Observações (opcional)">
        <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
          placeholder="Descreva o problema ou o que precisa ser feito..." rows={3}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
      </Field>

      {/* Aviso */}
      <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
        Ao enviar, você receberá uma confirmação por telefone. O agendamento fica pendente até nossa equipe confirmar a disponibilidade.
      </p>

      <button onClick={enviar} disabled={pending}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
        {pending ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : 'Solicitar agendamento'}
      </button>
    </div>
  )
}

function input(erro?: string) {
  return `w-full border ${erro ? 'border-destructive/50' : 'border-border'} rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring`
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
