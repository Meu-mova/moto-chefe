# Cadastro complementar de funcionários

**Data:** 2026-08-04
**Status:** aprovado

## Problema

O MOVA guarda de cada funcionário apenas nome, e-mail, papel e loja. Falta o
básico para pagar e para tratar a pessoa como pessoa: **CPF, chave PIX e data de
nascimento**. Hoje esses dados vivem fora do sistema, no WhatsApp e na cabeça de
quem paga.

Pedir por mensagem não funciona — sempre falta alguém. A coleta precisa
acontecer dentro do sistema, e o funcionário precisa preencher os próprios
dados: ninguém digita chave PIX de outra pessoa sem errar.

## Escopo

**Três campos, e só.** CPF, chave PIX (com o tipo da chave) e data de
nascimento. Foram avaliados e descartados nesta entrega: nome completo,
telefone, contato de emergência, CNH, endereço e dados bancários além do PIX.
O formulário curto é o que faz todo mundo preencher.

## Onde os dados ficam

Tabela nova `usuarios_dados`, 1:1 com `usuarios` — **não** colunas novas em
`usuarios`.

O motivo é concreto: `getUsuarioLogado()` (`src/lib/auth.ts:8`) faz
`db.select().from(usuarios)` e devolve a linha inteira, que circula pelo layout
e por vários componentes. CPF e chave PIX morando ali passariam a viajar junto
em todo lugar que lê o usuário logado, inclusive para o navegador. Em tabela
separada, só vê quem pede.

```
usuarios_dados
  usuario_id       uuid PK → usuarios
  cpf              text         notNull   (só dígitos, sem pontuação)
  pix_tipo         text         notNull   'cpf' | 'celular' | 'email' | 'aleatoria'
  pix_chave        text         notNull
  data_nascimento  date         notNull
  preenchido_em    timestamptz  notNull default now()
  atualizado_em    timestamptz  notNull default now()
```

`cpf` guarda só dígitos: a máscara é da tela, não do banco. Isso evita o mesmo
CPF gravado de duas formas.

## A trava

Em `src/app/(dashboard)/layout.tsx`, logo depois do `getUsuarioLogado()`: se o
papel **não** for `admin_geral` e não existir linha em `usuarios_dados`,
`redirect('/completar-cadastro')`.

**Por que redirect e não modal.** O layout já tem o `ComunicadoModal`, que é um
modal por cima do conteúdo. Não serve aqui: um modal pode ser fechado pelo
inspetor do navegador, e a página por baixo continua sendo montada e buscando
dados. Com o redirect, a página nem executa.

**Por que `/completar-cadastro` fica fora do grupo `(dashboard)`.** Se ficasse
dentro, cairia na própria trava e viraria loop infinito de redirect. Vai para
`src/app/completar-cadastro/`, ao lado de `/agendar`, que já vive fora do
dashboard pelo mesmo tipo de motivo.

**Por que `admin_geral` fica de fora.** É a válvula de escape. A trava roda para
todo usuário em toda página; se tiver defeito, ninguém entra no sistema. Com a
exceção, sobra alguém que consegue entrar e corrigir. O `admin_geral` preenche
os próprios dados pela mesma tela, acessada pelo menu — só não é obrigado.

## O formulário

Uma tela, três informações (o tipo da chave é um seletor que existe só para
validar a chave), feita para preencher no celular.

| Campo | Validação |
|---|---|
| CPF | 11 dígitos **com dígito verificador conferido**. `111.111.111-11` e afins são recusados. |
| Tipo da chave | Uma de: CPF, celular, e-mail, aleatória. É o que permite validar a chave. |
| Chave PIX | Conforme o tipo: CPF valida como CPF; celular exige DDD + 9 dígitos; e-mail exige formato; aleatória exige 32 caracteres hexadecimais. |
| Data de nascimento | Recusa data futura e idade abaixo de 14 anos — na prática, erro de digitação no ano. |

Salvou, vai direto para o dashboard. **Sem botão de pular.**

**Cuidado com a data.** É exatamente o caso do bug que já mordeu este projeto:
`"YYYY-MM-DD"` dentro de `new Date()` vira meia-noite UTC, que em Brasília é 21h
do dia anterior — a pessoa nasceu dia 10 e o sistema grava dia 9. A coluna é
`date` puro e a leitura usa o `parseDataInput()` que já existe em
`src/lib/data-venda.ts`.

## Depois de preenchido

- **Editar o próprio dado:** a mesma `/completar-cadastro` continua acessível,
  por um link no `Header` (`src/components/layout/header.tsx`), onde já ficam o
  nome e o botão Sair. Serve para quando a pessoa trocar de chave PIX.
- **Ver os dados da equipe:** página nova `/admin/dados-funcionarios`, com nome,
  CPF, chave PIX e nascimento, atrás do `AdminGuard` — que é justamente
  `admin_geral` + `admin_socio`.

  Não entra em `/admin/usuarios`, apesar de ser o lugar óbvio: aquela página está
  atrás do `SuperAdminGuard`, que é **só `admin_geral`**, e afrouxar a guarda
  dela para incluir o sócio abriria junto a criação de usuário e a troca de
  papéis, que são coisas bem mais sensíveis. Página separada custa pouco e não
  mexe em permissão existente.

A checagem de papel fica **na server action**, não só no gate visual da tela.
Server action é endpoint público do Next: gate só na tela deixa qualquer
usuário autenticado chamar a função direto e ler CPF e PIX de todo mundo.

## Testes

O que merece teste são os validadores puros, em `node:test`, sem banco e sem
navegador:

- **CPF**: dígito verificador correto; dígito verificador errado; 11 dígitos
  repetidos; menos de 11 dígitos; entrada com pontuação (deve normalizar).
- **Chave PIX**, para cada um dos quatro tipos: um caso válido e um inválido —
  incluindo celular sem DDD, e-mail sem `@` e aleatória com tamanho errado.
- **Data de nascimento**: data futura recusada; idade abaixo de 14 recusada;
  data válida aceita; e o caso de virada de fuso (nascimento em `2000-01-10`
  tem que continuar dia 10, não 9).

A trava em si é verificada na mão: entrar como funcionário sem dados e conferir
que qualquer URL do dashboard cai no formulário; entrar como `admin_geral` e
conferir que passa direto.

## Riscos aceitos

- **Todo mundo é interrompido no próximo acesso.** É o objetivo, mas significa
  que a primeira manhã depois do deploy tem gente parada preenchendo. Publicar
  em horário de baixo movimento.
- **Quem não souber a própria chave PIX trava.** Não há escapatória por decisão
  explícita. Se virar problema real, a saída é o `admin_geral` preencher pela
  tela de admin.

## Fora de escopo

- Exportação da folha usando esses dados.
- Aviso de aniversário no Telegram.
- Qualquer campo além dos três (a lista avaliada está em "Escopo").
