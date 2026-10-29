# Avaliações do Google e a plaquinha NFC

Tela: **Gestão → Avaliações Google** (`/admin/avaliacoes-google`), só para os sócios
(`admin_geral` e `admin_socio`). Vale para o grupo ativo no seletor; cada grupo tem a própria
chave e as próprias lojas.

## O que o MOVA faz

- Uma vez por dia (cron às 07h de Brasília) lê no Google a **nota**, o **total de avaliações** e
  as **até 5 avaliações** que a Places API devolve para cada loja. O botão "Atualizar agora"
  faz a mesma leitura na hora (no máximo uma vez a cada 10 minutos).
- Guarda uma foto diária da nota e do total para mostrar a variação dos últimos 30 dias.
- Cada **plaquinha** é cadastrada no MOVA, de uma loja e, se quiser, de um **vendedor** (crachá,
  mesa) ou do balcão. Cada uma tem link próprio (`https://<mova>/avaliar/<código>`) e QR code.
  Quem encosta o celular na tag (ou lê o QR) cai direto na tela "escrever avaliação" da loja no
  Google. O MOVA conta cada toque por placa, por loja e por vendedor, separando NFC de QR, e
  mostra o ranking do mês ("Toques por vendedor no mês"; dá para escolher meses anteriores).
- O toque conta para quem era o dono da placa **na hora**: trocar o vendedor da placa (ele saiu
  ou mudou de loja) não leva os toques antigos junto. Placa desativada continua levando o
  cliente ao Google, mas não conta mais toque.
- O Google não informa quem escreveu a avaliação a partir de qual placa: o MOVA mede o toque,
  não a avaliação. Para ver o resultado, compare os toques com o aumento do total da loja.

Limites da Places API: ela não traz todas as avaliações nem permite responder. Para isso seria
preciso a Business Profile API, que exige pedir acesso ao Google e entrar com a conta dona das
fichas. Fica para uma segunda fase, se valer a pena.

Termos do Google: conteúdo da Places API não pode ficar guardado por muito tempo. O MOVA apaga
avaliações e histórico com mais de 30 dias; só o Place ID e a contagem de toques ficam.

## 1. Criar a chave da Places API (uma vez por grupo)

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (ex.: "MOVA
   avaliações") e ligue o faturamento. O Google exige cartão mesmo dentro da cota gratuita.
2. Em **APIs e serviços → Biblioteca**, ative a **Places API (New)**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
4. Na chave, em **Restrições de API**, deixe só a **Places API (New)**. Não use restrição por
   site (referenciador HTTP): quem chama é o servidor do MOVA, não o navegador.
5. Em **Faturamento → Orçamentos e alertas**, crie um alerta baixo (ex.: R$ 50/mês).
6. Cole a chave em **Avaliações Google → Configuração e plaquinhas**. Ela fica cifrada no banco
   e não volta para a tela.

Custo: o campo de avaliações entra na faixa mais cara da Places API, mas o MOVA faz uma consulta
por loja por dia (cerca de 30 por loja por mês). Confira a cota gratuita e o preço atual na
[tabela do Google](https://developers.google.com/maps/billing-and-pricing/pricing).

## 2. Achar o Place ID de cada loja

1. Abra o [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id#find-id).
2. Busque a loja pelo nome e endereço, exatamente como aparece no Google Maps.
3. Copie o código que começa com `ChIJ...` e cole no campo **Place ID** da loja.

Trocar o Place ID depois não muda o link das placas: a tag já gravada continua valendo.

## 2b. Cadastrar as placas

Em **Plaquinhas → Nova placa**, escolha a loja, o vendedor (ou "Balcão") e, se quiser, um
apelido ("crachá", "mesa 2"). A placa aparece na lista com o link para gravar na tag e o QR para
imprimir. Uma placa por pessoa: o link de uma placa não pode ir na tag de outra.

## 3. A plaquinha

**O que comprar**

- Tag NFC **NTAG213** (144 bytes, sobra para o link) ou NTAG215. Adesivo redondo de 25 a 30 mm,
  ou cartão PVC. Compre algumas a mais.
- Placa de acrílico ou PVC de balcão (10×15 cm, por exemplo), com a tag colada **atrás** ou
  embutida. **Não cole em metal**: o metal bloqueia o NFC. Se a placa for de metal, use tag
  "anti-metal" (on-metal).
- Arte sugerida: logo da loja, "Avalie a gente no Google", ícone de NFC ("encoste o celular
  aqui") marcando onde a tag está, e o QR code baixado no MOVA (no mínimo 3×3 cm impresso) para
  quem tem celular sem NFC ou com o NFC desligado.

**Como gravar a tag** (celular Android ou iPhone a partir do XS)

1. Instale o app **NFC Tools** (gratuito, wakdev).
2. **Escrever → Adicionar registro → URL/URI**, cole o **link da tag** mostrado no MOVA (o que
   não tem `?o=qr`).
3. Toque em **Escrever** e encoste o celular na tag.
4. Teste: com a tela do celular desbloqueada, encoste na tag. Tem que abrir a tela de avaliação
   da loja no Google. No MOVA, o toque aparece no card da loja.
5. Só depois do teste, trave a tag: **Outros → Bloquear tag**. **É irreversível**, mas impede
   que alguém regrave a tag com outro link. Como o link aponta para o MOVA, não vai ser preciso
   regravar.

Cada placa tem um link próprio: não grave o link de uma placa na tag de outra, senão o toque
conta para a pessoa errada. Escreva o apelido ou o nome do vendedor no verso da placa.

## 4. Regras do Google que valem para a loja

As políticas do Google proíbem e podem derrubar avaliações (ou a ficha) quando a loja:

- oferece brinde, desconto ou qualquer vantagem em troca da avaliação;
- pede avaliação só para quem ficou satisfeito (pedir para todos é o certo);
- escreve avaliação pela própria loja, por funcionário ou por parente.

A placa pede avaliação para qualquer cliente, e não há filtro no meio: o toque vai direto para o
Google.
