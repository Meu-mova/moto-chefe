// Texto do aviso de recusa da adesão. O envio é manual por enquanto (#165): o
// painel oferece a mensagem pronta para copiar.

export function mensagemRecusa(loja: string, motivo: string): string {
  return [
    `Olá! Aqui é da equipe MOVA, sobre a adesão da ${loja}.`,
    '',
    `Neste momento não conseguimos seguir com a adesão. Motivo: ${motivo}`,
    '',
    'Se quiser conversar ou corrigir algo, é só responder esta mensagem.',
  ].join('\n')
}
