// Pastas que o scripts/test-db-local.ts deixa para trás quando morre sem passar pelo finally
// (SIGKILL, queda da máquina). Aqui só a decisão; ler a pasta e apagar fica no script.
export const PREFIXO_PG_TESTE = 'mova-pg-teste-'

// Pasta sem postmaster.pid também é a de uma execução que ainda está no initdb ou subindo o
// pg_ctl: só é sobra depois de passar do tempo que isso leva.
export const IDADE_MINIMA_SEM_PID_MS = 600_000

/** O postmaster.pid traz o pid na primeira linha; vazio ou ilegível vale como sem pid. */
export function pidDoPostmaster(conteudo: string | null): number | null {
  const pid = Number.parseInt(conteudo?.split('\n')[0] ?? '', 10)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** Pid vivo nunca é sobra: pode ser outra execução em andamento ou um `--manter`. */
export function ehSobra({ pid, vivo, idadeMs }: { pid: number | null; vivo: boolean; idadeMs: number }): boolean {
  if (pid === null) return idadeMs > IDADE_MINIMA_SEM_PID_MS
  return !vivo
}
