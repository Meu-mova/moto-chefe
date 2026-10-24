'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, History } from 'lucide-react'
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
 *
 * São dois botões sobre a mesma janela de 1 hora: o de cima continua de onde a
 * leitura parou (o dia a dia), o de baixo relê os últimos 90 dias inteiros. O
 * de baixo existe porque o ponteiro de NSU só anda pra frente — documento que
 * a SEFAZ já entregou e que não virou nota (schema que o parser não entendeu,
 * lote lido antes de uma correção) o botão de cima nunca mais alcança.
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
  const [consultando, setConsultando] = useState<'normal' | 'releitura' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    if (liberado) return
    const id = setInterval(() => {
      if (podeConsultar({ proximaConsultaEm }, new Date())) setLiberado(true)
    }, INTERVALO_DE_CHECAGEM_MS)
    return () => clearInterval(id)
  }, [liberado, proximaConsultaEmIso]) // eslint-disable-line react-hooks/exhaustive-deps

  async function clicar(desdeZero: boolean) {
    setConsultando(desdeZero ? 'releitura' : 'normal')
    setMsg(null)
    const r = await atualizarLeituraSefaz(desdeZero)
    setMsg({ ok: r.ok, texto: r.mensagem })
    // A consulta que dá certo fecha a janela por 1 hora; a que é recusada
    // também. Nos dois casos os botões voltam a ficar cinza — o horário exato
    // chega no próximo render, com o dado novo do banco.
    setLiberado(false)
    setConsultando(null)
  }

  const ocupado = consultando !== null
  const rotulo = consultando === 'normal'
    ? 'Consultando a SEFAZ…'
    : liberado || ocupado
      ? 'Atualizar leitura da SEFAZ'
      : proximaConsultaEm
        ? `Atualizar — liberado às ${horaDeLiberacao(proximaConsultaEm)}`
        : 'Atualizar leitura da SEFAZ'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => clicar(false)}
        disabled={!liberado || ocupado}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 h-9 text-sm hover:bg-primary-hover disabled:opacity-60 disabled:hover:bg-primary"
      >
        <RefreshCw size={14} className={consultando === 'normal' ? 'animate-spin' : undefined} />
        {rotulo}
      </button>

      <button
        type="button"
        onClick={() => clicar(true)}
        disabled={!liberado || ocupado}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-card text-foreground px-3 h-9 text-sm hover:bg-muted disabled:opacity-60 disabled:hover:bg-card"
      >
        <History size={14} className={consultando === 'releitura' ? 'animate-spin' : undefined} />
        {consultando === 'releitura' ? 'Relendo os últimos 90 dias…' : 'Reler os últimos 90 dias'}
      </button>

      <p className="text-xs text-muted-foreground">
        A releitura pede a fila inteira de novo, do começo — é o que traz nota que a SEFAZ já
        entregou e que não apareceu aqui. Não duplica nada, mas gasta a mesma janela de 1 hora, e
        uma fila grande pode precisar de mais de uma rodada.
      </p>

      {ocupado && (
        <p className="text-xs text-muted-foreground">
          Pode levar até um minuto: quando há fila acumulada, o sistema lê tudo de uma vez.
        </p>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-success' : 'text-warning'}`}>{msg.texto}</p>
      )}
    </div>
  )
}
