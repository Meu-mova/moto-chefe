'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  uploadHoleriteAction, removerHoleriteAction, getHoleriteUrlAction, type HoleriteRow,
} from '../holerites-actions'

type Resultado = Awaited<ReturnType<typeof uploadHoleriteAction>>

// Aviso e não erro: o arquivo FOI guardado. O toast de aviso fica mais tempo na tela porque é o
// único lugar onde a divergência aparece.
function avisarEnvio(base: string, r: Resultado) {
  if (r?.avisos?.length) {
    toast.warning(
      `${base}, mas ${r.avisos.join(' e ')}. O Valor Real Pago não foi preenchido, confira o PDF.`,
      { duration: 12000 },
    )
  } else if (r?.valorPreenchido != null) {
    const valor = r.valorPreenchido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    toast.success(`${base} · Valor Real Pago preenchido: ${valor}`)
  } else if (r?.leituraFalhou) {
    // Sem toast de erro: o holerite foi guardado, que é o que importa. O aviso existe para
    // ninguém achar que a coluna preencheu sozinha.
    toast.success(`${base} · não deu para ler o valor no PDF, preencha na mão`)
  } else {
    toast.success(base)
  }
}

const mensagemDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao)

// Se a lista nova não chegar (revalidação que falhou), o tipo destrava sozinho depois disto.
const ESPERA_DA_LISTA_MS = 15000

// O que muda quando o envio de um tipo muda (novo, substituído ou removido). Comparar isto, e não
// só a existência, é o que faz o "Substituir" destravar: o id da linha continua o mesmo.
const assinatura = (h: HoleriteRow | undefined) =>
  h ? `${h.id}|${h.arquivoNome}|${new Date(h.enviadoEm).getTime()}` : ''

/**
 * Enviar, abrir e remover os holerites de UMA pessoa. Um só estado e um só `input` por pessoa,
 * para a tela mostrar as mesmas ações na linha (desktop) e no detalhe (celular) sem que uma
 * cópia fique velha. Só a tela mudou: cada passo chama a mesma Server Action de antes.
 *
 * O tipo fica ocupado até a lista nova chegar (a `assinatura` do envio mudar), não só até a action
 * voltar: sem isso, a etiqueta e os botões velhos reaparecem por uns 100 ms (o `useTransition` do
 * Slot antigo segurava esse intervalo). O outro tipo da pessoa continua livre.
 */
export function useEnvioHolerite(funcionarioId: string, mes: string, holeritesDaPessoa: HoleriteRow[]) {
  const inputRef = useRef<HTMLInputElement>(null)
  const alvo = useRef<{ tipo: string; substitui: boolean } | null>(null)
  const [emAndamento, setEmAndamento] = useState<string[]>([])
  // tipo -> assinatura do envio quando a action voltou; enquanto for a mesma, a lista não chegou.
  const [aguardando, setAguardando] = useState<Record<string, string>>({})
  const doTipo = (tipo: string) => holeritesDaPessoa.find(h => h.tipo === tipo)

  useEffect(() => {
    if (Object.keys(aguardando).length === 0) return
    const timer = setTimeout(() => setAguardando({}), ESPERA_DA_LISTA_MS)
    return () => clearTimeout(timer)
  }, [aguardando])

  /** `acao` devolve true quando gravou algo e a lista vai mudar. */
  async function executar(tipo: string, acao: () => Promise<boolean>) {
    const antes = assinatura(doTipo(tipo))
    setEmAndamento(atual => [...atual, tipo])
    let esperaLista = false
    try {
      esperaLista = await acao()
    } finally {
      setEmAndamento(atual => atual.filter(t => t !== tipo))
      if (esperaLista) setAguardando(atual => ({ ...atual, [tipo]: antes }))
    }
  }

  function escolherArquivo(tipo: string, substitui: boolean) {
    alvo.current = { tipo, substitui }
    inputRef.current?.click()
  }

  async function enviar(file: File) {
    if (!alvo.current) return
    const { tipo, substitui } = alvo.current
    const dados = new FormData()
    dados.set('usuarioId', funcionarioId)
    dados.set('mes', mes)
    dados.set('tipo', tipo)
    dados.set('file', file)
    await executar(tipo, async () => {
      try {
        avisarEnvio(substitui ? 'Holerite substituído' : 'Holerite enviado', await uploadHoleriteAction(dados))
        return true
      } catch (e: unknown) {
        toast.error(mensagemDe(e, 'Erro ao enviar o holerite'))
        return false
      } finally {
        // Limpa o input: sem isso, reenviar o MESMO arquivo depois de um erro não dispara onChange
        // e parece que o botão morreu.
        if (inputRef.current) inputRef.current.value = ''
      }
    })
  }

  async function abrir(h: HoleriteRow) {
    await executar(h.tipo, async () => {
      let aba: Window | null = null
      try {
        // A janela é aberta ANTES do await: navegador bloqueia window.open que acontece depois de
        // uma promise, por não ser mais gesto do usuário. Dentro do try para que, se o open
        // lançar, o erro vire toast e os botões destravem.
        aba = window.open('', '_blank')
        const url = await getHoleriteUrlAction(h.id)
        if (aba) aba.location.href = url
        else window.location.href = url
      } catch (e: unknown) {
        aba?.close()
        toast.error(mensagemDe(e, 'Erro ao abrir o holerite'))
      }
      return false
    })
  }

  async function remover(h: HoleriteRow) {
    if (!window.confirm(`Remover o holerite "${h.arquivoNome}"?\n\nO arquivo é apagado do sistema.`)) return
    await executar(h.tipo, async () => {
      try {
        await removerHoleriteAction(h.id)
        toast.success('Holerite removido')
        return true
      } catch (e: unknown) {
        toast.error(mensagemDe(e, 'Erro ao remover'))
        return false
      }
    })
  }

  const ocupado = (tipo: string) =>
    emAndamento.includes(tipo) || (tipo in aguardando && aguardando[tipo] === assinatura(doTipo(tipo)))

  return { inputRef, ocupado, escolherArquivo, enviar, abrir, remover }
}
