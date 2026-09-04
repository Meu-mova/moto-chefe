'use client'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react'
import {
  uploadHoleriteAction, removerHoleriteAction, getHoleriteUrlAction, type HoleriteRow,
} from '../holerites-actions'

// Os dois arquivos que a contabilidade manda todo mês. A ordem aqui é a ordem das
// colunas da tabela.
const TIPOS = [
  { valor: 'adiantamento', label: 'Adiantamento' },
  { valor: 'salario',      label: 'Pagamento do salário' },
] as const

export type FuncionarioHolerite = { id: string; nome: string; papel: string; lojaNome: string }

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
  motorista:   'Motorista',
}

function fmtTamanho(bytes: number | null) {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function fmtData(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Slot({ funcionarioId, mes, tipo, holerite }: {
  funcionarioId: string
  mes: string
  tipo: string
  holerite: HoleriteRow | undefined
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [abrindo, setAbrindo] = useState(false)

  function enviar(file: File) {
    const dados = new FormData()
    dados.set('usuarioId', funcionarioId)
    dados.set('mes', mes)
    dados.set('tipo', tipo)
    dados.set('file', file)
    start(async () => {
      try {
        const r = await uploadHoleriteAction(dados)
        const base = holerite ? 'Holerite substituído' : 'Holerite enviado'
        // Aviso e não erro: o arquivo FOI guardado. Fica mais tempo na tela que o
        // toast comum porque é o único lugar onde a divergência aparece.
        if (r?.avisos?.length) {
          toast.warning(
            `${base}, mas ${r.avisos.join(' e ')}. O Valor Real Pago não foi preenchido — confira o PDF.`,
            { duration: 12000 },
          )
        } else if (r?.valorPreenchido != null) {
          const valor = r.valorPreenchido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          toast.success(`${base} · Valor Real Pago preenchido: ${valor}`)
        } else if (r?.leituraFalhou) {
          // Sem toast de erro: o holerite foi guardado, que é o que importa. O
          // aviso existe para ninguém achar que a coluna preencheu sozinha.
          toast.success(`${base} · não deu para ler o valor no PDF, preencha na mão`)
        } else {
          toast.success(base)
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao enviar o holerite')
      } finally {
        // Limpa o input: sem isso, reenviar o MESMO arquivo depois de um erro não
        // dispara onChange e parece que o botão morreu.
        if (inputRef.current) inputRef.current.value = ''
      }
    })
  }

  async function abrir() {
    if (!holerite) return
    setAbrindo(true)
    try {
      // A janela é aberta ANTES do await: navegador bloqueia window.open que
      // acontece depois de uma promise, por não ser mais gesto do usuário.
      const aba = window.open('', '_blank')
      const url = await getHoleriteUrlAction(holerite.id)
      if (aba) aba.location.href = url
      else window.location.href = url
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir o holerite')
    } finally {
      setAbrindo(false)
    }
  }

  function remover() {
    if (!holerite) return
    if (!confirm(`Remover o holerite "${holerite.arquivoNome}"?\n\nO arquivo é apagado do sistema.`)) return
    start(async () => {
      try {
        await removerHoleriteAction(holerite.id)
        toast.success('Holerite removido')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f) }}
      />

      {holerite ? (
        <>
          <div className="flex items-center gap-1.5">
            <button
              onClick={abrir}
              disabled={abrindo}
              title={holerite.arquivoNome}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 max-w-[180px]"
            >
              <FileText size={13} className="shrink-0" />
              <span className="truncate">{holerite.arquivoNome}</span>
              <ExternalLink size={11} className="shrink-0 opacity-60" />
            </button>
            <button
              onClick={remover}
              disabled={pending}
              title="Remover"
              className="text-slate-300 hover:text-red-500 shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            {fmtData(holerite.enviadoEm)}
            {holerite.enviadoPorNome ? ` · ${holerite.enviadoPorNome}` : ''}
            {holerite.tamanho ? ` · ${fmtTamanho(holerite.tamanho)}` : ''}
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
          >
            {pending ? 'Enviando…' : 'Substituir'}
          </button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={12} /> {pending ? 'Enviando…' : 'Enviar PDF'}
        </Button>
      )}
    </div>
  )
}

export function HoleritesTable({ funcionarios, holerites, mes }: {
  funcionarios: FuncionarioHolerite[]
  holerites: HoleriteRow[]
  mes: string
}) {
  // Chave composta em vez de dois mapas: o slot é identificado por pessoa + tipo.
  const porChave = new Map(holerites.map(h => [`${h.usuarioId}|${h.tipo}`, h]))
  const enviados = holerites.length
  const esperados = funcionarios.length * TIPOS.length

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        PDFs que a contabilidade manda todo mês. Ficam em bucket privado — o link de abertura vale 10 minutos e é
        gerado na hora. Reenviar substitui o arquivo daquele mês, sem acumular duas versões.
        {' '}<span className="text-slate-400">{enviados} de {esperados} enviados neste mês.</span>
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
              {TIPOS.map(t => (
                <th key={t.valor} className="text-left px-4 py-2 text-xs font-medium text-slate-600">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {funcionarios.map(f => (
              <tr key={f.id} className="hover:bg-slate-50 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{f.nome}</p>
                  <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
                </td>
                {TIPOS.map(t => (
                  <td key={t.valor} className="px-4 py-3">
                    <Slot
                      funcionarioId={f.id}
                      mes={mes}
                      tipo={t.valor}
                      holerite={porChave.get(`${f.id}|${t.valor}`)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {funcionarios.length === 0 && (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">Nenhum funcionário ativo neste recorte.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
