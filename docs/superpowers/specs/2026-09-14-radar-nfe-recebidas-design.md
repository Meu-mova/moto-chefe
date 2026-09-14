# Radar de NF-e recebidas — Distribuição DF-e direto na SEFAZ

**Data:** 2026-09-14
**Status:** Design aprovado em conversa, aguardando revisão da spec
**Decisões do Cesar:** certificado A1 **só no nosso servidor** (sem intermediário);
escopo **avisar + baixar o XML** (manifestação automática de ciência), sem
registro automático no estoque.

---

## 1. Contexto e objetivo

Hoje a nota de entrada chega assim: a fábrica emite, alguém avisa, o Cesar baixa
os XMLs no **FSist** (app desktop com o A1 do Windows) e sobe os arquivos no
`/entrada`, que extrai chassi/modelo/motor/cor do `infCpl` e registra as motos.
Funciona, mas **depende de alguém descobrir que a nota existe**.

A SEFAZ já sabe. Toda NF-e emitida contra um CNPJ fica disponível para o
destinatário no serviço **NFeDistribuiçãoDFe** do Ambiente Nacional. O objetivo é
o MOVA consultar esse serviço sozinho e virar um radar: **nenhuma nota emitida
contra os CNPJs do grupo passa despercebida**, e a que for de mercadoria chega
pronta no `/entrada`.

### Por que não pelo mcp.ai

O adaptador `receita_federal_nfse_recebidas` do mcp.ai está travado no erro
`604 — "Consulta não validada antes de processar."` desde 08/09/2026. Rediagnosticado
em 14/09: mesmo erro, e a especificação do endpoint (`_endpoints`) confirma que
`consultar` aceita só 8 parâmetros e **não existe etapa de validação separada**
para chamar antes — o 604 é da plataforma. Chamado `bug_ASrNrkncoGDO` aberto há
6 dias, sem resposta.

Além de travado, ele é a fonte **errada** para este objetivo: entrega **NFS-e**
(nota de serviço). Nota de mercadoria é **NF-e modelo 55**, e vem da Distribuição
DF-e. Quando o mcp.ai destravar, o destino natural dele continua sendo o
`/despesas` (serviço tomado), não este radar.

### Por que direto, sem intermediário

Quando o módulo Entrada foi feito, a decisão registrada foi começar pelo FSist
manual **para não colocar o certificado A1 num terceiro** antes de provar que a
extração valia a pena. Ela provou: o `/entrada` já lê o XML e registra as motos.
A decisão de 14/09 mantém a premissa — Nuvem Fiscal / Focus NF-e / Tecnospeed
resolveriam mais rápido e absorveriam mudança de layout, mas o `.pfx` sairia da
nossa mão e passaria a haver custo por consulta. **O certificado fica conosco.**

---

## 2. Como a SEFAZ entrega (regras que moldam o design)

Levantado da NT 2014.002 e da documentação dos integradores em 14/09/2026:

| Regra | Consequência no design |
|---|---|
| Consulta é **sequencial por NSU**: manda-se o `ultNSU` conhecido, a SEFAZ devolve o lote seguinte e um novo `ultNSU`/`maxNSU` | O NSU por CNPJ é **estado persistido**. Perder o NSU é perder notas — tabela própria, escrita na mesma transação do lote |
| `cStat 138` = documento localizado; `cStat 137` = nenhum documento | Enquanto `ultNSU < maxNSU`, seguir consultando em sequência até esgotar |
| Depois de `cStat 137` (ou `ultNSU == maxNSU`), **esperar 1 hora**. Consultar antes disso gera `cStat 656 — consumo indevido`, que **bloqueia** | Cron **horário**, com trava de "não consultar antes de X" gravada por CNPJ. Sem isso o CNPJ é bloqueado, não é só desperdício |
| Documento fica disponível por **90 dias** após entrar no Ambiente Nacional | A primeira carga alcança no máximo 90 dias para trás. Nota mais antiga que isso só pelo FSist |
| Antes da manifestação vem só o **resumo** (`resNFe`): chave, emitente, valor, data. O **XML completo** (`procNFe`) só depois de manifestar ciência | É exatamente a fronteira entre a fase 1 e a fase 2 |
| Depois da manifestação, a nota completa entra na fila **com um NSU novo** | O XML não volta na resposta do evento: ele aparece numa consulta seguinte. O fluxo é assíncrono por natureza |
| Evento de **cancelamento** é distribuído mesmo sem manifestação | O radar precisa tratar cancelamento desde a fase 1, senão mostra como pendente uma nota que não existe mais |

Transporte: SOAP sobre **TLS mútuo** — o certificado A1 é a credencial da conexão
(`https.Agent({ pfx, passphrase })`), não um header. Os documentos vêm
**gzipados em base64** dentro do lote.

---

## 3. Onde o certificado fica

**No nosso banco, cifrado.** O `.pfx` tem ~9 KB (12 KB em base64) por grupo, e o
conjunto de variáveis de ambiente da Vercel tem teto — dois grupos já apertam, e
a premissa do MOVA é que **toda funcionalidade nasce escopada por grupo**, então
a solução não pode ser "uma variável por CNPJ".

- Tabela `certificados_digitais`: `grupo_id`, `arquivo` (bytea, cifrado
  AES-256-GCM), `senha` (cifrada), `cnpj`, `valido_ate`, `criado_em`.
- Chave mestra em `CERT_MASTER_KEY` (variável de ambiente). O banco sozinho não
  abre o certificado.
- Tela de upload em `/admin/certificados`, **só `admin_geral`**, mostrando
  validade e alertando quando faltar menos de 30 dias. O do Sul de Minas vence em
  **01/09/2027**; quando vencer, é trocar pela tela, não por deploy.
- Certificados disponíveis hoje: Sul de Minas
  (`MOTOCHEFE SUL DE MINAS LTDA_57113017000172`) e BH (`MOTOCHEFE BH` /
  `PRIME MOBILIDADE A1`).

O certificado **nunca é escrito em disco** na função da Vercel: é lido do banco,
decifrado em memória e passado direto para o agente HTTPS.

---

## 4. Arquitetura

```
cron horário  ──►  src/lib/sefaz/distribuicao.ts
                   (SOAP + mTLS + NSU)
                          │
                          ├──► descompacta docZip (gzip/base64)
                          │
                          ├──► resNFe   ──►  nfe_recebidas (resumo)
                          ├──► procNFe  ──►  nfe_recebidas (xml completo)
                          └──► evento   ──►  cancelamento/ciência

/radar-fiscal  ◄── lê nfe_recebidas, cruza com motos.nota_fiscal_entrada
                   e mostra "já lançada" x "pendente"
                          │
                          └──► botão "registrar no estoque" → /entrada com o XML
```

**Módulos novos**

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/sefaz/certificado.ts` | Ler do banco, decifrar, montar o `https.Agent`. Nunca loga o conteúdo |
| `src/lib/sefaz/distribuicao.ts` | Montar o SOAP, chamar, ler `cStat`/`ultNSU`/`maxNSU`, descompactar o lote |
| `src/lib/sefaz/parser.ts` | **Puro, testável**: XML → `{ tipo: 'resumo'\|'completa'\|'evento', chave, emitente, valor, ... }`. `tipo` é o que a SEFAZ mandou; `situacao` na tabela é o estado da nota depois de aplicar o evento — são coisas diferentes e os nomes não se misturam |
| `src/lib/sefaz/nsu.ts` | **Puro**: dado o retorno, qual o próximo NSU e quando pode consultar de novo |
| `src/app/api/cron/nfe-dfe/route.ts` | Um grupo por vez, respeitando a trava de 1 hora |
| `src/app/(dashboard)/radar-fiscal/page.tsx` | A tela |

**Tabelas**

- `nfe_recebidas`: `grupo_id`, `chave` (única por grupo), `nsu`, `emitente_cnpj`,
  `emitente_nome`, `valor`, `data_emissao`, `situacao` (`resumo` | `completa` |
  `cancelada`), `manifestado_em`, `xml` (text, só quando completa), `criado_em`.
  **"Já lançada no MOVA" não é coluna**: é lida por junção com
  `motos.nota_fiscal_entrada` na hora de montar a tela. Guardar como campo cria
  uma segunda verdade, que envelhece sozinha quando a moto é registrada depois.
- `nfe_dfe_sync`: `grupo_id`, `ult_nsu`, `max_nsu`, `proxima_consulta_em`,
  `ultimo_cstat`, `ultimo_erro`.

A regra de negócio fica nos módulos **puros** (`parser.ts`, `nsu.ts`) — é onde os
testes moram. O que fala com a rede não carrega decisão.

---

## 5. Fase 1 — o radar (sem assinar nada)

Entrega:

1. Certificado guardado e a tela de upload.
2. Cron horário consultando a Distribuição DF-e por grupo, gravando os resumos.
3. Tela `/radar-fiscal`: toda nota emitida contra o CNPJ, com emitente, valor,
   data, chave e o status **"já lançada no MOVA" x "pendente"** — cruzando a
   chave/número com `motos.nota_fiscal_entrada`.
4. Evento de cancelamento marcando a nota como cancelada.
5. Alerta no WhatsApp quando chega nota nova de emitente conhecido como fábrica,
   no padrão já usado ("MOVA INFORMA").

**Nesta fase o MOVA não envia nenhum evento à SEFAZ.** Só lê. É o que permite
colocar no ar sem risco fiscal e já mata o "descobrir a nota quando alguém manda
o XML".

Permissão: sócios e `aux_adm` (é trabalho de quem opera a loja — ver a regra de
sempre liberar para o `aux_adm`), item no menu na categoria **Estoque & Fábrica**,
ao lado de Entrada.

## 6. Fase 2 — manifestação e XML completo

1. Evento **210210 (Ciência da Operação)** assinado em **XML-DSig** com o
   certificado do grupo, enviado ao `NFeRecepcaoEvento`.
2. Na consulta seguinte a nota completa chega com NSU novo → grava o `procNFe`.
3. Botão **"registrar no estoque"** que leva ao `/entrada` com o XML já carregado,
   caindo no preview NF › Modelo › motos que já existe. **O Cesar continua
   conferindo antes de registrar** — foi decisão explícita não registrar sozinho.
4. Só então o FSist sai do fluxo.

**A assinatura é a parte perigosa.** XML-DSig errado é evento rejeitado, e é um
ato formal em nome da empresa. A manifestação começa **manual** (botão por nota),
e só vira automática depois de uma nota real passar ponta a ponta.

---

## 7. Riscos

| Risco | Tratamento |
|---|---|
| **Bloqueio por consumo indevido (656)** — consultar antes de 1 hora depois de um 137 | `proxima_consulta_em` gravado por grupo e respeitado pelo cron. É a trava mais importante do sistema |
| **Perda do controle de NSU** — gravar o lote e não gravar o NSU (ou o contrário) | Lote e NSU na **mesma transação**. Reprocessar o mesmo NSU é inofensivo (chave é única); pular NSU perde nota |
| **XML-DSig incorreto** | Fase 2, manual primeiro, com nota real. Teste unitário com um XML de referência assinado |
| **Certificado vencido** | Alerta a 30 dias na tela; o cron grava `ultimo_erro` e o radar mostra "sincronização parada" em vez de ficar mudo |
| **Certificado vazando em log** | `certificado.ts` é o único ponto que toca o `.pfx`; nada de `console.log` de payload nesse caminho |
| **Nota anterior a 90 dias** | Fora do alcance do serviço, por regra da SEFAZ. Continua sendo FSist. Dito na tela, não escondido |
| **Timeout/indisponibilidade da SEFAZ** | Falha registrada em `ultimo_erro`, sem avançar o NSU. Próxima hora tenta de novo |

## 8. Fora de escopo

- **NFS-e (serviço)** — fonte diferente, hoje travada no mcp.ai. Quando destravar,
  o destino é o `/despesas`, não este radar.
- **Registro automático de motos no estoque** — decisão explícita do Cesar.
- **Eventos de confirmação da operação / operação não realizada** — só ciência.
- **Emissão de NF-e própria** — é o projeto do eNotas, separado deste.

## 9. Critérios de aceite

**Fase 1**
- Uma nota emitida contra o CNPJ do Sul de Minas aparece no `/radar-fiscal` em
  até 1 hora, sem ninguém fazer nada.
- O cron nunca consulta antes de `proxima_consulta_em`; um 137 seguido de outra
  chamada no mesmo intervalo **não acontece** (teste do módulo puro).
- Nota já registrada no estoque aparece como "já lançada"; nota nova aparece como
  pendente.
- Nota cancelada pelo emitente aparece como cancelada.
- Grupo BH e Sul de Minas sincronizam independentes, cada um com seu certificado.

**Fase 2**
- Manifestar ciência por uma nota real traz o `procNFe` na consulta seguinte.
- O XML baixado abre no `/entrada` e produz o mesmo preview do arquivo do FSist —
  comparado lado a lado com uma nota já processada.
