// Aviso de tela quando a Server Action não responde (rede, sessão, erro inesperado). Na produção o
// Next esconde a mensagem do erro lançado, então mostrar `e.message` exibia "React error #441" (#404).
export const FALHA_SEM_RESPOSTA = 'Não consegui salvar agora. Tente de novo.'
