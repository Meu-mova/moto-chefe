@AGENTS.md

## Vercel CLI

- **Nunca rode `vercel env pull` sem informar o arquivo de destino.** Sem arquivo, ele sobrescreve
  o `.env.local` (o staging) com o ambiente Development da Vercel, que está vazio. Para conferir
  algo, use um arquivo descartável fora do git e não imprima valores.
- Para tirar um ambiente de uma variável compartilhada, edite o alvo pela API
  (`vercel api ... -X PATCH` com `target`), que comprovadamente mantém os outros ambientes. Não
  use `vercel env rm <nome> <ambiente>` para isso: não foi testado se ele remove só aquele
  ambiente ou o registro inteiro, e valor `sensitive` apagado não volta.
