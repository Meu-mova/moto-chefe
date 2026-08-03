# Folha de Pagamento — base de comissão configurável por funcionário

**Data:** 2026-08-03
**Contexto:** fechamento da folha de julho/2026 travou porque seis funcionários recebem sobre uma base que o módulo não sabe calcular.

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
- **Premiação OTE não muda.** Continua exclusiva de `papel = 'vendedor'`. Os cinco aux_adm recebem salário + comissão + ajuda de custo, sem OTE. Tiago passa a ter base de motos próprias mas **não** ganha OTE, porque o papel dele continua `aux_adm`.
- **Sem versionamento histórico**, igual ao resto do módulo: a base é um valor "atual", editado in-place. A folha de um mês passado é recalculada com a configuração de hoje.
- **Escopo intocado:** dashboard do vendedor, simulador de ganhos e `/precificacao` continuam olhando as vendas próprias. A mudança vive só na folha.

### Componentes

1. **Schema** — `base_comissao` em `funcionarios_config` (migration SQL manual + mirror em `src/lib/db/schema.ts`).
2. **Action** — `salvarConfigFuncionarioAction` passa a aceitar e validar `baseComissao` contra a lista fechada de 4 valores.
3. **UI (aba Funcionários)** — coluna "Base da comissão" com `<select>` nativo por linha. Nativo, e não o `<Select>` do base-ui, porque o value (`loja_motos`) é diferente do label exibido ("Motos da loja") — o componente do base-ui renderiza o value cru nesse caso.
4. **Cálculo (`page.tsx`)** — duas agregações novas por loja (motos líquidas por loja, peças por loja incluindo peças de OS) e um `switch` que escolhe a base conforme a config, caindo no comportamento atual quando `padrao`.
5. **Dados de julho** — aplicar as seis configurações e criar o cadastro da Juliana (salário R$ 1.880, sem ajuda de custo, 0,5%, base `padrao`).

### Como verificar

`npm run type-check` e `npm run build` limpos. Na tela, com julho/2026 selecionado: a base do Charles tem que bater com o total de motos de Pouso Alegre no mês, a do Pedro com o total de peças da mesma loja, e nenhum funcionário de base `padrao` pode ter mudado de valor em relação ao que a tela mostrava antes.
