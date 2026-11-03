'use client'
import { useRef, useState } from 'react'
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
      `${base}, mas ${r.avisos.join(' e ')}. O Valor Real Pago não foi preenchido — confira o PDF.`,
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

/**
 * Enviar, abrir e remover os holerites de UMA pessoa. Um só estado e um só `input` por pessoa,
 * para a tela mostrar as mesmas ações na linha (desktop) e no detalhe (celular) sem que uma
 * cópia fique velha. Só a tela mudou: cada passo chama a mesma Server Action de antes.
 */
export function useEnvioHolerite(funcionarioId: string, mes: string) {
  const inputRef = useRef<HTMLInputElement>(null)
  const alvo = useRef<{ tipo: string; substitui: boolean } | null>(null)
  const [ocupados, setOcupados] = useState<string[]>([])
  const ocupar = (tipo: string, sim: boolean) =>
    setOcupados(atual => (sim ? [...atual, tipo] : atual.filter(t => t !== tipo)))

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
    ocupar(tipo, true)
    try {
      avisarEnvio(substitui ? 'Holerite substituído' : 'Holerite enviado', await uploadHoleriteAction(dados))
    } catch (e: unknown) {
      toast.error(mensagemDe(e, 'Erro ao enviar o holerite'))
    } finally {
      // Limpa o input: sem isso, reenviar o MESMO arquivo depois de um erro não dispara onChange
      // e parece que o botão morreu.
      if (inputRef.current) inputRef.current.value = ''
      ocupar(tipo, false)
    }
  }

  async function abrir(h: HoleriteRow) {
    ocupar(h.tipo, true)
    try {
      // A janela é aberta ANTES do await: navegador bloqueia window.open que acontece depois de
      // uma promise, por não ser mais gesto do usuário.
      const aba = window.open('', '_blank')
      const url = await getHoleriteUrlAction(h.id)
      if (aba) aba.location.href = url
      else window.location.href = url
    } catch (e: unknown) {
      toast.error(mensagemDe(e, 'Erro ao abrir o holerite'))
    } finally {
      ocupar(h.tipo, false)
    }
  }

  async function remover(h: HoleriteRow) {
    if (!window.confirm(`Remover o holerite "${h.arquivoNome}"?\n\nO arquivo é apagado do sistema.`)) return
    ocupar(h.tipo, true)
    try {
      await removerHoleriteAction(h.id)
      toast.success('Holerite removido')
    } catch (e: unknown) {
      toast.error(mensagemDe(e, 'Erro ao remover'))
    } finally {
      ocupar(h.tipo, false)
    }
  }

  return { inputRef, ocupado: (tipo: string) => ocupados.includes(tipo), escolherArquivo, enviar, abrir, remover }
}
