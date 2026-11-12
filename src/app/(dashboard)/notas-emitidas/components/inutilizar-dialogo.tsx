'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN, normalizarJustificativa, validarJustificativa } from '@/lib/notagateway/inutilizacao'
import { motivoDaSefaz, vendaNaDescricao } from '@/lib/notas-emitidas'
import type { NotaEmitida } from '@/lib/queries/notas-emitidas'
import { pedirInutilizacaoAction } from '../actions'

/** O que o diálogo mostra da nota escolhida na lista. */
export type NotaDoDialogo = Pick<NotaEmitida, 'id' | 'numero' | 'serie' | 'ambiente' | 'vendaId' | 'vendaNumero' | 'motivoStatus'>

type Resultado = { tipo: 'enviado' | 'sem_resposta'; texto: string }

const ERRO_INESPERADO = 'Não deu para pedir a inutilização. Tente de novo; se continuar, fale com o suporte.'

/**
 * Pede a inutilização do número da nota escolhida na lista (#597). Vive no nível da tabela,
 * fora da linha: o resultado aparece aqui dentro e a lista só atualiza no Fechar, para o
 * diálogo não sumir com a linha que mudou (C6). Sem confirmação digitada (decisão do Luis).
 */
export function InutilizarDialogo({ nota, onFechar }: { nota: NotaDoDialogo | null; onFechar: () => void }) {
  const router = useRouter()
  const [justificativa, setJustificativa] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const validacao = validarJustificativa(justificativa)
  // Na dúvida, produção: o rótulo de teste só sai com Homologacao explícito.
  const producao = nota !== null && nota.ambiente !== 'Homologacao'
  const motivo = nota ? motivoDaSefaz(nota.motivoStatus) : null

  function fechar() {
    if (enviando) return
    // Também depois de uma recusa: a linha pode ter virado negada ou pendente por outra aba.
    if (resultado || erro) router.refresh()
    setJustificativa('')
    setErro(null)
    setResultado(null)
    onFechar()
  }

  async function confirmar() {
    if (!nota) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await pedirInutilizacaoAction(nota.id, justificativa)
      if (!r.ok) setErro(r.erro)
      else if (r.dados.aviso) setResultado({ tipo: 'sem_resposta', texto: r.dados.aviso })
      else setResultado({ tipo: 'enviado', texto: `Pedido enviado. A linha da nota ${nota.numero} passa a mostrar "Inutilização pendente".` })
    } catch {
      setErro(ERRO_INESPERADO)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={nota !== null} onOpenChange={aberto => { if (!aberto) fechar() }} disablePointerDismissal>
      <DialogContent className="sm:max-w-md" showCloseButton={!enviando}>
        {nota && (
          <>
            <DialogHeader className="-mx-4 -mt-4 flex-row items-center gap-3 border-b border-border px-4 py-3 pr-12">
              <div className="min-w-0 flex-1">
                <DialogTitle>Inutilizar número</DialogTitle>
                <DialogDescription className="text-xs">Nota {nota.numero}, série {nota.serie}{vendaNaDescricao(nota)}</DialogDescription>
              </div>
              {!producao && <Badge className="bg-warning/10 text-warning">Teste (homologação)</Badge>}
            </DialogHeader>

            {producao ? (
              <div className="border-l-4 border-destructive bg-destructive/10 py-2 pr-3 pl-3">
                <p className="font-semibold text-destructive">O número {nota.numero} nunca mais vai ser usado</p>
                <p className="text-muted-foreground">Em produção, a inutilização vale na SEFAZ e não tem volta.</p>
              </div>
            ) : (
              <div className="border-l-4 border-warning bg-warning/10 py-2 pr-3 pl-3">
                <p className="font-semibold text-warning">Nota de teste: sem valor fiscal</p>
                <p className="text-muted-foreground">A inutilização vai à homologação da SEFAZ, que não vale para a empresa.</p>
              </div>
            )}

            {motivo && (
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Motivo da SEFAZ{motivo.codigo != null && ` (${motivo.codigo})`}</p>
                <p className="break-words">{motivo.texto}</p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="justificativa-inutilizacao">Justificativa</Label>
              {/* Sem maxLength: a validação ao vivo é que diz "longa"; cortar calado esconderia o erro (C3). */}
              <Textarea id="justificativa-inutilizacao" aria-describedby="justificativa-ajuda" value={justificativa} rows={3} disabled={enviando || resultado !== null}
                placeholder="Ex.: venda cancelada depois da rejeição da nota" onChange={e => setJustificativa(e.target.value)} />
              {/* A mesma função do servidor mede o texto já sem acento (C3). */}
              <p id="justificativa-ajuda" className={`flex justify-between gap-3 text-xs ${justificativa && !validacao.ok ? 'text-destructive' : 'text-muted-foreground'}`}>
                <span>{justificativa && !validacao.ok ? validacao.erro : `De ${JUSTIFICATIVA_MIN} a ${JUSTIFICATIVA_MAX} caracteres. Os acentos saem sozinhos.`}</span>
                <span className="tabular-nums">{normalizarJustificativa(justificativa).length}</span>
              </p>
            </div>

            {erro && <p role="alert" className="text-destructive">{erro}</p>}
            {resultado && <p role="status" className={resultado.tipo === 'sem_resposta' ? 'text-warning' : 'text-primary-text'}>{resultado.texto}</p>}

            <DialogFooter>
              <Button variant="outline" disabled={enviando} onClick={fechar}>{resultado ? 'Fechar' : 'Cancelar'}</Button>
              {!resultado && (
                <Button variant="destructive" disabled={enviando || !validacao.ok} onClick={confirmar}>
                  {enviando && <Loader2 className="animate-spin" />}
                  Inutilizar o número {nota.numero}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
