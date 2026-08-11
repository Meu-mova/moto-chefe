# Assinatura digital de documentos — contrato de venda e checklist de entrega

Data: 2026-08-11
Status: aprovado pelo Cesar na sessão; implementação autorizada ("pode rodar tudo")

## Problema

Contrato de venda e checklist de entrega são assinados no papel. O contrato nem existe no
sistema — é um modelo fora do Mova que a loja imprime e preenche à mão. Isso custa três coisas:
a via assinada só existe fisicamente (some, molha, fica na gaveta da loja errada), não há como
saber quem assinou o quê sem ir até a loja, e não há trava nenhuma impedindo que a NF saia antes
do contrato estar assinado.

O objetivo é assinar esses dois documentos pelo celular do cliente, com trilha de evidências
suficiente para sustentar o documento se ele for contestado, e travar a emissão de NF enquanto o
contrato não voltar assinado.

## Base jurídica (e seus limites)

A validade vem do **art. 10, §2º da MP 2.200-2/2001**: documento eletrônico assinado por meio não
ICP-Brasil é válido quando as partes admitem essa forma como válida. Na prática, três coisas
sustentam o documento em juízo:

1. **Cláusula de aceite no próprio documento** — o texto declara que as partes reconhecem a
   assinatura eletrônica como válida. É isso que aciona o §2º. Sem a cláusula, o resto vale menos.
2. **Trilha de evidências** — quem, de onde, quando, por qual número, com qual rosto.
3. **Prova de integridade** — hash que permite demonstrar que o documento não mudou desde a
   assinatura.

Isto não é parecer jurídico. O texto do contrato e a cláusula de aceite devem passar pelo advogado
da empresa antes de ir para produção.

## Decisões tomadas (com o Cesar)

1. **Assinatura própria dentro do Mova**, não provedor externo (ZapSign/Clicksign). Custo marginal
   zero, controle do layout, e o desenho isola o hash para permitir plugar carimbo de tempo depois
   sem refazer nada.
2. **Link remoto por WhatsApp**, não assinatura no aparelho da loja. O IP coletado precisa ser o do
   cliente; o do balcão não prova nada.
3. **Escopo da v1: contrato de venda + checklist de entrega.** O mecanismo nasce genérico (o tipo do
   documento é um campo), então acrescentar certificado de bateria, reserva ou OS depois é registrar
   mais um tipo.
4. **O contrato passa a ser gerado pelo sistema**, com os dados da venda, igual ao checklist de
   entrega que já existe em `src/app/(print)/vendas/[id]/checklist-entrega`. Modelo único (não varia
   por grupo nesta versão).
5. **Identificação: selfie + IP + código de 6 dígitos no WhatsApp.** O código prova posse do número
   que está no cadastro — é o elo mais forte e mais barato da trilha.
6. **Só o cliente assina.** A loja consta como emissora (dados da loja, vendedor, data). Sem
   assinatura do vendedor e sem testemunha nesta versão.
7. **Entrega final: link permanente**, não PDF gerado no servidor. O cliente imprime/salva em PDF
   pelo próprio navegador se quiser. Nada de Chromium headless na Vercel.
8. **NF travada sem contrato assinado**, com liberação de exceção por `admin_geral`/`admin_socio`
   mediante motivo escrito e registrado.

## Fluxo

### Envio (vendedor)

1. Na venda (dialog de detalhes ou card do estoque), botão **"Enviar para assinatura"** → escolhe
   contrato ou checklist.
2. O sistema valida o celular do cliente **antes** de criar o documento. Celular ausente ou inválido
   abre a correção na hora — é o ponto onde o fluxo mais trava na prática.
3. Renderiza o documento e **congela o HTML** no banco. A partir daí, editar a venda não altera o
   documento enviado.
4. Dispara no WhatsApp: `MOVA INFORMA — <nome>, seu contrato está pronto para assinatura: <link>`.

### Assinatura (cliente, no celular dele)

Rota pública `/assinar/[token]`, quatro passos:

1. **Leitura** — o documento inteiro, mesmo layout do impresso, com a cláusula de aceite eletrônico
   no rodapé. O botão de avançar só habilita depois de rolar até o fim.
2. **Código** — 6 dígitos enviados no WhatsApp do número do cadastro. Validade de 10 minutos,
   5 tentativas.
3. **Selfie** — câmera frontal, com o aviso de LGPD exibido antes de a câmera abrir.
4. **Traço** — canvas, o cliente assina com o dedo e confirma.

Ao confirmar: grava evidências, calcula o hash, muda o status para `assinado`, envia o link final
no WhatsApp. O mesmo link vira a via permanente, com selo de verificação, hash e folha de
evidências no rodapé.

Link não assinado expira em 7 dias; o vendedor reenvia com um clique (novo prazo, mesmo documento).

## Modelo de dados

Três tabelas novas, todas escopadas por grupo (`grupo_id`), migração
`src/lib/db/migrations/0051_assinatura_digital.sql` aplicada por
`npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0051_assinatura_digital.sql`.

### `documentos_assinatura`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `grupo_id` | uuid NOT NULL | herdado da venda |
| `loja_id` | uuid | |
| `venda_id` | uuid NOT NULL → vendas | |
| `tipo` | text NOT NULL | `contrato_venda` \| `checklist_entrega` |
| `token` | text UNIQUE NOT NULL | 32 bytes aleatórios em base64url |
| `status` | text NOT NULL | `pendente` \| `visualizado` \| `assinado` \| `expirado` \| `cancelado` |
| `html_snapshot` | text NOT NULL | documento congelado |
| `snapshot_hash` | text NOT NULL | SHA-256 do HTML |
| `celular_destino` | text NOT NULL | número congelado no envio |
| `selfie_path` / `selfie_hash` | text | bucket privado + SHA-256 |
| `assinatura_path` / `assinatura_hash` | text | idem, do traço |
| `ip_assinatura` / `user_agent` | text | |
| `geo_lat` / `geo_lon` / `geo_precisao` | numeric | só se o cliente autorizar |
| `evidencias_json` | jsonb | JSON canônico que gera o hash final |
| `doc_hash` | text | SHA-256 do `evidencias_json` — é o que sai impresso |
| `criado_por` | uuid → usuarios | |
| `criado_em` / `expira_em` / `assinado_em` | timestamptz | |

Índices: `token` (unique), `venda_id`, `(grupo_id, status)`.

### `assinatura_eventos`

Trilha completa, append-only: `id`, `documento_id`, `tipo` (`link_aberto`, `codigo_enviado`,
`codigo_errado`, `codigo_ok`, `selfie_enviada`, `assinado`, `reenviado`), `ip`, `user_agent`,
`detalhe` jsonb, `criado_em`. É a tabela que responde "prove que foi ele".

### `assinatura_codigos`

`id`, `documento_id`, `codigo_hash` (SHA-256 — **nunca em claro**), `expira_em`, `tentativas`,
`usado_em`, `criado_em`.

### Colunas novas em `vendas`

`nf_liberada_em` (timestamptz), `nf_liberada_por` (uuid → usuarios), `nf_liberacao_motivo` (text).

### Storage

Bucket **privado** `assinaturas`, caminhos `{grupo_id}/{documento_id}/selfie.jpg` e
`{grupo_id}/{documento_id}/assinatura.png`. Exibição interna só por URL assinada de curta duração.

## Hash de integridade

`evidencias_json` é um JSON com chaves em ordem fixa: `snapshot_hash`, `selfie_hash`,
`assinatura_hash`, `celular_destino`, `ip_assinatura`, `user_agent`, `codigo_verificado_em`,
`assinado_em`, `documento_id`, `venda_id`, `tipo`. `doc_hash = sha256(JSON.stringify(canônico))`.

A serialização precisa ser determinística (ordem de chaves fixa, sem espaços) — é o que permite
recalcular o hash anos depois e provar que nada mudou. Uma função pura faz isso, e o teste
unitário garante que a ordem não escorregue com refatoração.

Isolado desse jeito, plugar carimbo de tempo externo depois é carimbar `doc_hash` — nada mais muda.

## Trava da emissão de NF

Duas server actions em `src/app/(dashboard)/vendas/actions.ts` já resolvem a venda pelo `motoId`;
a trava entra exatamente aí:

- `criarRascunhoBlingAction` — não cria rascunho no Bling.
- `confirmarNFSaidaAction` — não registra o número, **inclusive** pelo caminho "nota já emitida".

Travar só o rascunho não adianta: o vendedor emitiria direto no Bling e voltaria para registrar.

Regra (função pura `podeEmitirNf`): permite se existe documento `contrato_venda` da venda com
status `assinado`, **ou** se a venda tem `nf_liberada_em` preenchido. Caso contrário recusa com a
mensagem do motivo.

Na UI, o botão de NF fica desabilitado com cadeado e o texto "contrato não assinado". A liberação
é um dialog só para admin, com o motivo obrigatório — sem texto, não libera.

Ordem resultante do fluxo de venda: **contrato assinado → NF → entrega → checklist assinado**.

## Estrutura de código

- `src/lib/assinatura/hash.ts` — JSON canônico e `doc_hash`. Puro, testado.
- `src/lib/assinatura/codigo.ts` — geração, hash, validação (expiração e tentativas). Puro, testado.
- `src/lib/assinatura/nf.ts` — `podeEmitirNf`. Puro, testado.
- `src/lib/assinatura/documento.ts` — montagem do HTML congelado por tipo.
- `src/app/assinar/[token]/` — rota pública (as 4 telas + a via assinada).
- `src/app/(dashboard)/vendas/assinatura-actions.ts` — enviar, reenviar, cancelar, liberar NF.
- `src/lib/whatsapp/assinatura.ts` — mensagens de envio, código e link final.

O middleware (`src/middleware.ts`) hoje redireciona toda rota sem sessão para `/login`. Precisa
liberar `/assinar`. A página leva `noindex`.

O envio para número arbitrário não existe hoje — `enviarAlertaWhatsapp` só fala com o número fixo
do Cesar. Entra uma `enviarWhatsappPara(numero, texto)` reaproveitando `montarChamadaEnvio`, que já
recebe o número.

## Tratamento de erro

| Situação | Comportamento |
|---|---|
| WhatsApp fora do ar ao enviar o código | erro visível, botão de reenviar. O código **nunca** aparece na tela |
| 5 códigos errados | documento travado por 30 min; vendedor precisa reenviar |
| Upload da selfie falha | repete só a selfie; o código validado não se perde |
| Duplo clique em confirmar | idempotente — não cria segunda assinatura |
| Envio do link final falha | a assinatura **não** é desfeita; já está selada. Vendedor reenvia |
| Link expirado | tela explicando, sem dado do cliente exposto |
| Token inválido | 404 genérico, sem revelar se existiu |

## Segurança e LGPD

- O token do link **é** a credencial: 32 bytes aleatórios, não enumerável, `noindex`.
- A selfie nunca aparece no link público. Lá consta apenas "selfie coletada em `<data/hora>`, hash
  `<...>`". A foto em si só na área interna, para admin, por URL assinada.
- Base legal: execução de contrato. Aviso na tela antes de a câmera abrir, explicando finalidade e
  retenção.
- Retenção: 5 anos, acompanhando o contrato.
- Rate limit por token e por IP nas rotas públicas, com contador em tabela — sem dependência nova.

## Testes

Unitários (`node --test` com tsx, padrão do repo — acrescentar ao script `test` do package.json):

- `hash.test.ts` — canônico determinístico; mudar qualquer evidência muda o hash; ordem de chaves
  estável.
- `codigo.test.ts` — expiração, contagem de tentativas, código usado não revalida.
- `nf.test.ts` — bloqueia sem contrato; libera com contrato assinado; libera com exceção registrada;
  contrato de outra venda não libera.

Manual, obrigatório em celular real (iOS e Android): câmera frontal, canvas com o dedo, rolagem até
o fim do documento. Emulador de navegador não cobre isso.

## Fora de escopo (deliberadamente)

Certificado ICP-Brasil; carimbo de tempo externo; PDF gerado no servidor; assinatura do vendedor e
de testemunhas; contrato com texto diferente por grupo; os demais documentos (certificado de
bateria, recibo de reserva, OS, demanda).

## Pendência que bloqueia parte da implementação

**O texto do contrato de venda.** O modelo em Word/PDF que as lojas usam hoje precisa ser fornecido
para virar a página do sistema. Enquanto não vier, o checklist de entrega (que já existe como
página) e todo o mecanismo de assinatura podem ser construídos e testados; só a página do contrato
fica pendente.
