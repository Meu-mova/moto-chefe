// Fetch usado por TODA chamada ao Supabase feita do servidor (auth incluído).
//
// Incidente de 17-19/08/2026: as chamadas HTTPS da Vercel para *.supabase.co
// passaram a ficar PRESAS — o log da instrumentação pegou uma de 107s, para um
// endpoint que responde em ~150ms medido de fora. Não é serviço lento (esse
// erra ou demora segundos); é conexão pendurada. O banco não sofreu porque vai
// por outro host (pooler, TCP direto), fora do API Gateway do Supabase.
//
// Sem isso, quem pendura é a página inteira: o login (uma server action sem
// timeout) ficava preso até os 300s da Vercel, e a pessoa só via o botão
// "Entrar" sem resposta.
//
// A aposta do retry: abortar destrói o socket daquela tentativa, então a
// seguinte não herda a conexão presa. Se o Supabase estiver realmente fora, as
// 3 tentativas falham em ~12s e o erro aparece rápido na tela — que é o
// comportamento desejado, em vez de travar.
const TIMEOUT_MS = 4000
const TENTATIVAS = 3

export async function fetchResiliente(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let ultimoErro: unknown

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const controle = new AbortController()
    const alarme = setTimeout(() => controle.abort(), TIMEOUT_MS)

    // O chamador pode ter mandado o próprio signal (o supabase-js manda em
    // alguns casos); cancelar por ele continua valendo. O guard no AbortSignal.any
    // é porque isto roda também no runtime do middleware: se lá não existir, o
    // pior caso é perder o cancelamento do chamador — não derrubar o site todo.
    const signal =
      init?.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, controle.signal])
        : controle.signal

    try {
      return await fetch(input, { ...init, signal })
    } catch (erro) {
      ultimoErro = erro
      // Cancelamento pedido pelo chamador não é falha nossa: não repete.
      if (init?.signal?.aborted) throw erro
      if (tentativa < TENTATIVAS) {
        console.warn(`[supabase] tentativa ${tentativa}/${TENTATIVAS} falhou em ${TIMEOUT_MS}ms, repetindo`)
      }
    } finally {
      clearTimeout(alarme)
    }
  }

  console.error(`[supabase] ${TENTATIVAS} tentativas falharam`, ultimoErro)
  throw ultimoErro
}
