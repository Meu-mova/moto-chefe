# Módulo de Clientes — Design Spec
**Data:** 2026-06-26

## Contexto

O sistema MOVA não possui cadastro de clientes. Há 2.016 clientes exportados do sistema anterior (Bling) em `D:\ECOMOV\exportar clientes Bling.csv` (separador `;`, encoding Latin-1) que serão importados como ponto de partida.

O módulo de clientes será a entidade central do sistema, vinculada a vendas e ordens de serviço.

---

## 1. Modelo de Dados

### Nova tabela `clientes`

| Coluna | Tipo | Restrições |
|---|---|---|
| id | uuid | PK, default random |
| nome | text | NOT NULL |
| tipo_pessoa | enum `'fisica' / 'juridica'` | NOT NULL |
| cpf_cnpj | text | UNIQUE, nullable |
| sexo | enum `'masculino' / 'feminino' / 'nao_identificado'` | NOT NULL, default `'nao_identificado'` |
| email | text | nullable |
| celular | text | nullable |
| endereco | text | nullable |
| numero | text | nullable |
| complemento | text | nullable |
| bairro | text | nullable |
| cep | text | nullable |
| cidade | text | nullable |
| uf | text | nullable |
| criado_em | timestamp | NOT NULL, default now() |
| atualizado_em | timestamp | NOT NULL, default now() |

### Alterações em tabelas existentes

- `vendas` → adiciona coluna `cliente_id uuid REFERENCES clientes(id)` (nullable)
- `ordens_servico` → adiciona coluna `cliente_id uuid REFERENCES clientes(id)` (nullable)

Ambas as colunas entram como nullable para não impactar registros existentes.

---

## 2. Importação do CSV

### Processo de migração (script one-time)

1. Ler `exportar clientes Bling.csv` com encoding Latin-1, separador `;`
2. Extrair os primeiros nomes de todos os 2.016 registros
3. Enviar em lotes de ~100 nomes para o Claude API (modelo `claude-haiku-4-5-20251001`) para classificação de sexo → retorna `masculino / feminino / nao_identificado` por nome
4. Inserir todos os clientes na tabela com `ON CONFLICT (cpf_cnpj) DO NOTHING` para evitar duplicatas
5. Script localizado em `scripts/importar-clientes-bling.ts`, executado via `npx tsx`

### Campos mapeados do CSV

| CSV | Tabela |
|---|---|
| Nome | nome |
| Endereço | endereco |
| Número | numero |
| Complemento | complemento |
| Bairro | bairro |
| CEP | cep |
| Cidade | cidade |
| UF | uf |
| Celular | celular |
| E-mail | email |
| Tipo pessoa | tipo_pessoa (`Pessoa Física` → `fisica`, `Pessoa Jurídica` → `juridica`) |
| CNPJ / CPF | cpf_cnpj |

---

## 3. Módulo de Listagem e CRUD

### Acesso

| Papel | Ver | Criar | Editar | Excluir |
|---|---|---|---|---|
| admin_geral | ✓ | ✓ | ✓ | ✓ |
| admin_socio | ✓ | ✓ | ✓ | — |
| aux_adm | ✓ | ✓ | ✓ | — |
| vendedor | ✓ | ✓ | ✓ | — |
| mecanico | — | — | — | — |

### Página `/clientes`

- Busca em tempo real por nome, CPF/CNPJ ou celular
- Filtros: Tipo pessoa (PF/PJ), Sexo, Cidade (dropdown populado dinamicamente)
- Tabela: Nome, CPF/CNPJ, Celular, Cidade/UF, Sexo, Tipo
- Botão "Novo Cliente"
- Clique na linha → `/clientes/[id]`

### Página `/clientes/[id]` — Perfil

- Cabeçalho: nome, CPF/CNPJ, celular, email, endereço completo
- Botão Editar (todos os papéis com acesso) / Botão Excluir (só `admin_geral`)
- Seção **Histórico**: lista cronológica unificada de vendas (moto, data, valor) e OS (data, descrição, status)

### Formulário de cadastro/edição

- Todos os campos da tabela
- CEP com auto-preenchimento via API ViaCEP (busca ao sair do campo)
- Validação: CPF/CNPJ único (avisa se já cadastrado)

---

## 4. Componente Reutilizável `ClienteBusca`

Componente client-side usado em vendas e OS:

- Input de busca por nome ou CPF/CNPJ (mínimo 3 caracteres)
- Dropdown com resultados (nome + CPF/CNPJ)
- Opção "Cadastrar novo cliente" se não encontrar → abre modal com campos mínimos (nome + celular)
- Retorna `clienteId` selecionado para o formulário pai

---

## 5. Integração com Vendas e OS

### Vendas

- Formulário de nova venda recebe componente `ClienteBusca`
- Se cliente selecionado → `cliente_id` salvo na venda
- Se não encontrado → cadastro rápido via modal, vincula automaticamente
- Campo não obrigatório (venda pode ser registrada sem cliente)

### Ordens de Serviço

- Formulário de nova OS recebe componente `ClienteBusca`
- Mesmo fluxo das vendas
- Campo não obrigatório

---

## 6. Estrutura de Arquivos

```
src/app/(dashboard)/clientes/
  page.tsx                          ← listagem com busca e filtros
  [id]/
    page.tsx                        ← perfil + histórico
  components/
    clientes-table.tsx
    cliente-form.tsx
    cliente-busca.tsx               ← componente reutilizável
  actions.ts

scripts/
  importar-clientes-bling.ts        ← migração one-time do CSV
```

---

## 7. Fora do Escopo (v1)

- Histórico de caixa/financeiro vinculado ao cliente
- Demandas vinculadas ao cliente
- Importação recorrente de CSVs
- Portal do cliente
