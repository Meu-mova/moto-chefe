# Folha de Pagamento — base de comissão, ajustes manuais e papéis extras

**Data:** 2026-08-03
**Contexto:** o fechamento da folha de julho/2026 travou em três coisas — seis funcionários recebem sobre uma base que o módulo não sabe calcular, Pouso Alegre teve vendas fora do sistema que precisam gerar comissão, e o Tiago acumula duas funções que o sistema não sabe representar.

## Problema

Hoje a base da comissão é derivada do papel, sem escapatória (`src/app/(dashboard)/folha-pagamento/page.tsx`):

- `vendedor` → motos vendidas por ele (valor líquido de cartão)
- `mecanico` → mão de obra (`valorServicos`) das OS concluídas dele
- `aux_adm` → peças vendidas por ele (avulsas + `valorPecas` das OS que ele abriu)

Mas na prática vários aux_adm recebem um percentual sobre o **total da loja**, não sobre o que eles mesmos venderam:

| Pessoa | Papel · Loja | Regra real |
|---|---|---|
| Julia Sampaio | aux_adm · Poços de Caldas | 0,1% sobre as **motos** vendidas pela loja |
| Charles Carvalho | aux_adm · Pouso Alegre | 1,5% sobre as **motos** vendidas pela loja |
| Pedro Henrique | aux_adm · Pouso Alegre | 5% sobre as **peças** vendidas pela loja |
| Adrielly Marques | aux_adm · Varginha | 5% sobre as **peças** vendidas pela loja |
| Tiago Souza Gomes | aux_adm · Lavras | 0,5% sobre as **motos que ele mesmo vendeu** |
| Juliana Rodrigues | vendedor · Itajubá | 0,5% sobre as próprias vendas — só falta cadastro |

## Solução

Uma coluna nova em `funcionarios_config`: `base_comissao text not null default 'padrao'`.

| Valor | Base do mês |
|---|---|
| `padrao` | comportamento atual, derivado do papel |
| `proprias_motos` | motos vendidas por ele (mesmo que o papel não seja `vendedor`) |
| `loja_motos` | motos vendidas pela loja dele |
| `loja_pecas` | peças vendidas pela loja dele (avulsas + peças usadas em OS concluídas) |

### Decisões

- **Valor líquido de cartão vale para todas as bases.** As bases de loja reaproveitam a `valorLiquidoExpr()` que já existe: a parte da venda paga em cartão e já conciliada entra pelo líquido, o resto entra pelo valor cheio.
- **A loja é sempre a do próprio funcionário** (`usuarios.lojaId`). Nenhum dos seis casos precisa apontar para outra loja, então não existe campo de loja alvo — YAGNI.
- **Venda registrada com um dono (`admin_geral`) como vendedor não entra na base de loja nenhuma.** É moto particular passando pela loja, não faturamento dela, e não pode virar comissão de terceiro. Vale para motos e peças avulsas. Não afeta base individual, porque dono não tem comissão configurada. Em julho/2026 isso tirou R$ 9.000 de Pouso Alegre e R$ 11.458,16 de Varginha.
- **Premiação OTE passa a ser calculada sobre as motos vendidas pela própria pessoa**, e não mais sobre a base de comissão. Para todos os vendedores atuais o número é idêntico (a base deles já é exatamente isso). A mudança existe para impedir que alguém com base `loja_motos` — Charles, 1,5% de Pouso Alegre inteira — tire premiação calculada sobre o faturamento da loja se um dia ganhar o papel de vendedor.
- **Quem concorre à OTE passa a ser `temPapel(funcionario, 'vendedor')`**, e não `papel === 'vendedor'` — ver a seção de papéis extras abaixo.
- **Sem versionamento histórico**, igual ao resto do módulo: a base é um valor "atual", editado in-place. A folha de um mês passado é recalculada com a configuração de hoje.
- **Escopo intocado:** dashboard do vendedor, simulador de ganhos e `/precificacao` continuam olhando as vendas próprias. A mudança vive só na folha.

### Componentes

1. **Schema** — `base_comissao` em `funcionarios_config` (migration SQL manual + mirror em `src/lib/db/schema.ts`).
2. **Action** — `salvarConfigFuncionarioAction` passa a aceitar e validar `baseComissao` contra a lista fechada de 4 valores.
3. **UI (aba Funcionários)** — coluna "Base da comissão" com `<select>` nativo por linha. Nativo, e não o `<Select>` do base-ui, porque o value (`loja_motos`) é diferente do label exibido ("Motos da loja") — o componente do base-ui renderiza o value cru nesse caso.
4. **Cálculo (`page.tsx`)** — duas agregações novas por loja (motos líquidas por loja, peças por loja incluindo peças de OS) e um `switch` que escolhe a base conforme a config, caindo no comportamento atual quando `padrao`.
5. **Dados de julho** — aplicar as seis configurações e criar o cadastro da Juliana (salário R$ 1.880, sem ajuda de custo, 0,5%, base `padrao`).

## Parte 2 — ajustes manuais de base

Em julho/2026 Pouso Alegre teve venda de peças e ordem de serviço lançadas fora do MOVA. O dinheiro entrou de verdade e precisa gerar comissão, mas os registros não existem no sistema — e criá-los retroativamente nos módulos de Peças/OS contaminaria estoque, financeiro e integrações para consertar um problema de folha.

Solução: tabela `folha_ajustes_base`, somada às agregações só no cálculo da folha.

```
id          uuid pk
loja_id     uuid not null references lojas(id)
mes         text not null                        -- 'YYYY-MM', mesma convenção do mesParam
tipo        text not null                        -- 'motos' | 'pecas' | 'servicos'
usuario_id  uuid references usuarios(id)         -- opcional
valor       numeric(12,2) not null
observacao  text
criado_em   timestamptz not null default now()
criado_por  uuid references usuarios(id)
```

### Semântica

Um ajuste representa uma venda real da loja, então:

- **sempre** soma à base de **loja** do seu tipo (`loja_motos` / `loja_pecas`);
- **se tiver `usuario_id`**, soma **também** à base **individual** daquela pessoa, no tipo correspondente (motos → base de motos próprias, peças → base de peças, serviços → base de mão de obra do mecânico).

Não é ou-um-ou-outro: uma venda real conta nos dois lugares, exatamente como contaria se estivesse registrada no sistema. Um ajuste de tipo `motos` com `usuario_id` também entra na apuração de OTE daquela pessoa, pelo mesmo motivo.

### Lançamentos de julho/2026 (Pouso Alegre)

| Tipo | Valor | Funcionário | Efeito |
|---|---|---|---|
| `servicos` | 1.800,00 | Fernando Silverio | base dele + R$ 1.800 → comissão 25% = R$ 450,00 |
| `pecas` | 1.285,00 | — | base de peças da loja + R$ 1.285 → Pedro Henrique 5% = R$ 64,25 |

### Decisões

- **`mes` é `text` no formato `YYYY-MM`**, não `date`. Evita o problema conhecido de `new Date('YYYY-MM-DD')` virar meia-noite UTC e cair no dia anterior em BRT, e casa direto com o `mesParam` que a tela já usa.
- **Ajuste não entra em Financeiro, Despesas nem estoque.** Ele existe só para o cálculo da folha. Se o dinheiro precisar aparecer no faturamento, isso é lançamento no módulo próprio, não aqui.
- **Escopo por grupo** via `loja_id`: a action valida que a loja pertence ao grupo ativo antes de gravar, igual ao resto do módulo.
- **Valor pode ser negativo**, para corrigir lançamento a maior sem precisar apagar histórico.
- **UI:** quarta aba "Ajustes" na folha, listando os ajustes do mês selecionado, com formulário (loja, tipo, funcionário opcional, valor, observação) e exclusão. A observação é obrigatória — daqui a seis meses ninguém lembra por que existe um ajuste de R$ 1.800.

## Parte 3 — papéis extras

Tiago Souza Gomes é `aux_adm` e também vende. O sistema representa função como um campo único (`usuarios.papel`), então ele não existe como vendedor em lugar nenhum.

Já funciona hoje: `aux_adm` pode registrar venda, e sem escolher outro vendedor a venda entra no nome dele (`vendas/actions.ts:362`). As vendas dele já estão no banco corretamente atribuídas.

Não funciona hoje — travado atrás de `papel === 'vendedor'`:

- premiação OTE na folha (`folha-pagamento/page.tsx:157`)
- visão de vendedor do dashboard e simulador de ganhos (`dashboard/page.tsx:51`, `:272`, `kpi-cards.tsx:69`)
- reservar moto de outra loja (`estoque/[id]/components/moto-actions.tsx:78`, `estoque/components/moto-table.tsx:119`)
- enxergar os próprios pedidos no card de aprovação (`vendas/components/pedido-card.tsx:41`)

### Solução

Coluna `papeis_extras` em `usuarios` (`text[] not null default '{}'`) + helper `temPapel(usuario, papel)` em `src/lib/auth`, que devolve `usuario.papel === papel || usuario.papeisExtras.includes(papel)`.

### Decisões

- **Migração incremental, não big bang.** Existem 234 leituras de `.papel` em 79 arquivos; a esmagadora maioria é gate de admin e não tem nada a ver com papel duplo. Troco pelo helper só nos ~8 pontos listados acima. O resto migra quando surgir necessidade real.
- **Falha fechada.** Um ponto não migrado faz a pessoa deixar de ver algo que poderia ver — nunca o contrário. Numa base com módulo financeiro, esse é o lado certo pra errar.
- **`papel` continua sendo o papel principal** e continua governando tudo que não foi migrado. `papeis_extras` só acrescenta.
- **`base_comissao` e `papeis_extras` são coisas separadas e continuam separadas.** A primeira decide sobre o que o dinheiro é calculado; a segunda decide o que a pessoa consegue fazer no sistema. Tiago precisa das duas: `base_comissao = proprias_motos` e `papeis_extras = {vendedor}`. Se a base fosse inferida do papel, o caso do Charles (aux_adm com base na loja) voltaria a ser inexprimível.
- **Sem tela de administração de papéis extras nesta leva.** Só o Tiago tem o caso hoje; aplico direto no banco. Se aparecer um segundo caso, aí sim vale um campo em `/admin/usuarios`.

### Como verificar

`npm run type-check` e `npm run build` limpos. Na tela, com julho/2026 selecionado: a base do Charles tem que bater com o total de motos de Pouso Alegre no mês, a do Pedro com o total de peças da mesma loja, e nenhum funcionário de base `padrao` pode ter mudado de valor em relação ao que a tela mostrava antes.

Antes de mexer, capturar a folha de julho como está hoje (por funcionário: base, comissão, premiação, total). Depois da mudança, os únicos valores diferentes podem ser os dos seis nomes da tabela acima. Qualquer alteração em outro funcionário é regressão.

Para os ajustes: com julho/2026 na tela, a base de peças de Pouso Alegre tem que subir exatamente R$ 1.285 e a comissão do Pedro Henrique ir a R$ 64,25; a base do Fernando Silverio tem que subir R$ 1.800 e a comissão dele R$ 450. Trocar para agosto/2026 e confirmar que os dois ajustes somem — ajuste é preso ao mês.

Para os papéis extras: logar como Tiago e confirmar que ele passa a ver a visão de vendedor no dashboard e que aparece com premiação OTE na folha. Logar como um `aux_adm` sem papel extra (Carlos Barbosa) e confirmar que **nada** mudou pra ele.
