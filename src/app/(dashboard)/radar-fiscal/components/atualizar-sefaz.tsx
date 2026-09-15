'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { podeConsultar } from '@/lib/sefaz/nsu'
import { atualizarLeituraSefaz } from '../actions'

const INTERVALO_DE_CHECAGEM_MS = 15_000

function horaDeLiberacao(quando: Date): string {
  return quando.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * `liberadoNoServidor` vem calculado da página, e é o estado INICIAL daqui.
 *
 * Não dá pra começar com `new Date()` no cliente: o primeiro render tem que
 * bater com o HTML que o servidor mandou, e dois relógios diferentes gerariam
 * rótulos diferentes (erro de hidratação). O relógio do cliente só entra
 * depois, no efeito abaixo, que é o que faz o botão liberar sozinho quando a
 * hora chega — sem recarregar a página e sem ficar perguntando ao servidor.
 */
export function AtualizarSefaz({
  proximaConsultaEmIso,
  liberadoNoServidor,
}: {
  proximaConsultaEmIso: string | null
  liberadoNoServidor: boolean
}) {
  const proximaConsultaEm = proximaConsultaEmIso ? new Date(proximaConsultaEmIso) : null
  const [liberado, setLiberado] = useState(liberadoNoServidor)
  const [consultando, setConsultando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    if (liberado) return
    const id = setInterval(() => {
      if (podeConsultar({ proximaConsultaEm }, new Date())) setLiberado(true)
    }, INTERVALO_DE_CHECAGEM_MS)
    return () => clearInterval(id)
  }, [liberado, proximaConsultaEmIso]) // eslint-disable-line react-hooks/exhaustive-deps

  async function clicar() {
    setConsultando(true)
    setMsg(null)
    const r = await atualizarLeituraSefaz()
    setMsg({ ok: r.ok, texto: r.mensagem })
    // A consulta que dá certo fecha a janela por 1 hora; a que é recusada
    // também. Nos dois casos o botão volta a ficar cinza — o horário exato
    // chega no próximo render, com o dado novo do banco.
    setLiberado(false)
    setConsultando(false)
  }

  const rotulo = consultando
    ? 'Consultando a SEFAZ…'
    : liberado
      ? 'Atualizar leitura da SEFAZ'
      : proximaConsultaEm
        ? `Atualizar — liberado às ${horaDeLiberacao(proximaConsultaEm)}`
        : 'Atualizar leitura da SEFAZ'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={clicar}
        disabled={!liberado || consultando}
        className="inline-flex items-center gap-2 rounded-md bg-slate-800 text-white px-3 h-9 text-sm hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-800"
      >
        <RefreshCw size={14} className={consultando ? 'animate-spin' : undefined} />
        {rotulo}
      </button>
      {consultando && (
        <p className="text-xs text-slate-500">
          Pode levar até um minuto: quando há fila acumulada, o sistema lê tudo de uma vez.
        </p>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.texto}</p>
      )}
    </div>
  )
}
