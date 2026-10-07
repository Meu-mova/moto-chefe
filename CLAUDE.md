@AGENTS.md

## Vercel CLI

- **Nunca rode `vercel env pull` sem informar o arquivo de destino.** Sem arquivo, ele sobrescreve
  o `.env.local` (o staging) com o ambiente Development da Vercel (sem nenhuma variável em
  2026-10-07). Para conferir algo, use um arquivo descartável fora do git e não imprima valores.
- Mudar o ambiente de uma variável: pela API, como em `docs/infra/segredos.md` ("Regras"); não
  com `vercel env rm`.
