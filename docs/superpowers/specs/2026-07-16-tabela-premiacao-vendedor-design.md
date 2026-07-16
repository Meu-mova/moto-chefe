# Spec: Link para tabela completa de premiação OTE no dashboard do vendedor

**Data:** 2026-07-16

## Problema

O vendedor vê sua premiação OTE atual (card de KPI) e pode simular ganhos (Simulador de Ganhos), mas não tem acesso à tabela completa de faixas de premiação — ela só existe na página `/folha-pagamento`, que é bloqueada para quem não é `admin_geral`/`admin_socio`.

## Solução

Adicionar um link **"Ver tabela completa"** no cabeçalho do card "Simulador de Ganhos" (`SimuladorComissaoOTE`, em `src/app/(dashboard)/dashboard/components/simulador-comissao.tsx`), ao lado do título. Ao clicar, abre um `Dialog` somente-leitura com a tabela de faixas (`ordenadas`, já calculada no componente a partir da prop `faixas` existente) — colunas "Venda mínima no mês" e "Premiação", no mesmo estilo visual de `PremiacaoFaixasTable` (`src/app/(dashboard)/folha-pagamento/components/premiacao-faixas-table.tsx`), mas sem os controles de adicionar/excluir faixa (somente leitura).

Nenhuma rota, query ou server action nova — os dados já chegam prontos via a prop `faixas` que a página do dashboard já busca e passa para este componente.

## Mudanças

`src/app/(dashboard)/dashboard/components/simulador-comissao.tsx`:
- Import `Dialog, DialogContent, DialogHeader, DialogTitle` de `@/components/ui/dialog`.
- Novo estado `const [open, setOpen] = useState(false)`.
- No cabeçalho do card (ao lado de "Simulador de Ganhos" / antes do ícone `TrendingUp`), adicionar um botão-link discreto "Ver tabela completa" que abre o dialog.
- `DialogContent` (`sm:max-w-sm`) com `DialogTitle` "Tabela de Premiação OTE" e a tabela `ordenadas.map(...)` renderizando `valorMinimoVendas`/`premiacao` formatados com a função `fmt` já existente no arquivo — mesmas classes de tabela usadas em `PremiacaoFaixasTable` (`bg-white border rounded-lg overflow-hidden`, `thead bg-slate-50 border-b`, `divide-y`), sem coluna de ações.
- Reaproveitar o texto explicativo já usado em `PremiacaoFaixasTable`: "Premiação mensal do vendedor de acordo com o valor total vendido no mês (motos). Aplica-se a faixa de maior valor mínimo que ele atingiu."

## Fora do escopo

- Sem mudança na página `/folha-pagamento` ou em `PremiacaoFaixasTable` (mantém edição restrita a admin).
- Sem nova rota nem nova checagem de permissão — o dialog só existe dentro do dashboard do vendedor, que já é a área correta.
- Sem mudança no card de KPI "Premiação OTE" (`kpi-cards.tsx`) — o link fica só no Simulador de Ganhos, por decisão do usuário.
