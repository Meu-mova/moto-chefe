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

**O item 1 já está resolvido no modelo do advogado.** A Cláusula Décima Quinta do contrato fornecido
(`Compra e Venda Motochefe.docx`) diz, literalmente, que as partes concordam que o documento pode
ser assinado por meio eletrônico "ainda que por meio de plataforma de assinatura eletrônica não
credenciada pela infraestrutura de chaves públicas brasileira (ICP Brasil) e/ou sem certificado de
assinatura digital", e que não contestarão validade, autenticidade e integridade. Nada precisa ser
inventado — o sistema reproduz essa cláusula como ela é.

As Cláusulas Décima Terceira (uso de imagem) e Décima Quarta (LGPD) do mesmo modelo já cobrem o
tratamento de dados e a coleta de imagem do cliente.

Isto não é parecer jurídico. As alterações que este projeto faz no modelo (ver "Alterações no
modelo do contrato") devem passar pelo advogado antes de ir para produção.

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
   entrega que já existe em `src/app/(print)/vendas/[id]/checklist-entrega`. O texto das cláusulas é
   único; **os dados da pessoa jurídica vendedora e a comarca do foro vêm do cadastro do grupo**
   (decidido em 11/08, ao receber o modelo real — ver "Alterações no modelo do contrato").
5. **Identificação: selfie + IP + código de 6 dígitos no WhatsApp.** O código prova posse do número
   que está no cadastro — é o elo mais forte e mais barato da trilha.
6. **Só o cliente assina.** A loja consta como emissora (dados da loja, vendedor, data). Sem
   assinatura do vendedor e sem testemunha nesta versão.
7. **Entrega final: link permanente**, não PDF gerado no servidor. O cliente imprime/salva em PDF
   pelo próprio navegador se quiser. Nada de Chromium headless na Vercel.
8. **NF travada sem contrato assinado**, com liberação de exceção por `admin_geral`/`admin_socio`
   mediante motivo escrito e registrado.

## Alterações no modelo do contrato

O modelo oficial (`Compra e Venda Motochefe.docx`, recebido em 11/08/2026) é um contrato de
**Equipamento de Mobilidade Individual Autopropelido**, 16 cláusulas mais o Anexo I (Cartilha de
Uso da Bateria). O sistema o reproduz integralmente, com três desvios decididos com o Cesar:

1. **Qualificação do comprador reduzida.** O modelo pede nome, estado civil, profissão, CPF, RG,
   endereço e e-mail. **Estado civil, profissão e RG não existem em nenhuma tabela do sistema** e
   coletá-los travaria o balcão. Saem do documento; ficam nome, CPF, endereço e e-mail.
   **Precisa de aval do advogado** — qualificação mais enxuta enfraquece a identificação da parte.
2. **Sem testemunhas.** O modelo prevê duas testemunhas com nome e CPF. Elas saem do documento
   eletrônico. Consequência assumida: sem as duas testemunhas o contrato **não é título executivo
   extrajudicial** (art. 784, III do CPC), então uma cobrança judicial exigiria ação de
   conhecimento, mais lenta que a execução direta.
3. **Vendedora e foro por grupo.** O modelo traz fixos a razão social MOTOCHEFE SUL DE MINAS LTDA.,
   o CNPJ 57.113.017/0001-72, o endereço de Pouso Alegre e o foro da Comarca de Pouso Alegre. BH e
   Vale são outras pessoas jurídicas — os CNPJs já estão em `grupos` (BH 63.009.605/0001-63, Vale
   65.126.949/0001-88), mas faltam razão social, endereço da sede e comarca. Viram colunas de
   `grupos`, **editáveis em `/admin/grupos`** (a tela já existe, com dialog de edição), para o
   Cesar cadastrar sem depender de migração.
4. **Descrição do veículo enxuta.** A Cláusula Primeira do modelo pede marca, modelo, ano de
   fabricação, cor e número de série. Fica marca, modelo, cor e chassi: **ano de fabricação não
   existe em nenhuma tabela** do sistema, e o Cesar decidiu não levar potência nem número do motor
   para o contrato. Os limites da Resolução CONTRAN 996 na Cláusula Terceira permanecem como estão
   no modelo — são texto legal, não característica medida deste veículo. O número do motor continua
   no checklist de entrega, onde serve à conferência do veículo.

O Anexo I (Cartilha de Uso da Bateria, 14 itens) faz parte integrante do contrato pelo Parágrafo
Segundo da Cláusula Décima Primeira, e entra no mesmo documento assinado — o "Ciente/De acordo"
separado do anexo é absorvido pela assinatura única do instrumento.

**Enquanto um grupo não tiver razão social, endereço e comarca preenchidos, o envio de contrato
falha com mensagem clara naquele grupo.** Nada de contrato saindo com o CNPJ da empresa errada.

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

### Colunas novas em `grupos`

`razao_social` (text), `endereco_sede` (text), `comarca_foro` (text) — a qualificação da pessoa
jurídica vendedora no contrato, editável em `/admin/grupos`. Sul de Minas já vai preenchido pela
migração, com os dados do modelo. BH e Vale ficam nulos até o Cesar cadastrar, e a listagem do
Admin mostra quais grupos ainda não podem emitir contrato.

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

## Pendências

1. **Razão social, endereço da sede e comarca do foro de BH e do Vale.** O Cesar cadastra em
   `/admin/grupos` assim que a tela estiver no ar. Até lá, o envio de contrato funciona apenas nas
   lojas do Sul de Minas — os outros dois grupos recebem uma mensagem pedindo o cadastro. Não
   bloqueia a implementação.
2. **Aval do advogado** sobre os desvios do modelo: qualificação reduzida (sem estado civil,
   profissão e RG), ausência de testemunhas e descrição do veículo sem ano de fabricação. Bloqueia
   o uso com cliente real, não a construção.
3. **Conferir a versão revisada do .docx.** Em 11/08 o Cesar informou ter corrigido o arquivo, mas
   a versão nova ainda não chegou nesta máquina — o texto transcrito no plano vem do arquivo de
   20/07. Comparar cláusula a cláusula antes de subir o contrato para produção.
