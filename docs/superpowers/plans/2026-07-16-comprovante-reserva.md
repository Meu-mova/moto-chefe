# Comprovante de Reserva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao registrar uma reserva de moto no módulo de Vendas, gerar um comprovante imprimível para entregar ao cliente, seguindo o mesmo padrão de impressão já usado nas Ordens de Serviço.

**Architecture:** Nova rota `(print)/reservas/[id]/imprimir` (Server Component, CSS inline, `window.print()` automático via `PrintTrigger`), idêntica em estrutura à já existente `(print)/ordens-servico/[id]/imprimir`. Uma nova query `buscarReserva` monta os dados via join `reservas → motos → modelos → lojas → usuarios`. `registrarReservaAction` passa a retornar o `id` criado, para o `VenderButton` mostrar uma tela de sucesso com o link de impressão assim que a reserva é confirmada. Um ícone de reimpressão fica disponível a qualquer momento na listagem de estoque e na ficha da moto, para o que precisar de reimprimir depois.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript, Tailwind, lucide-react. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Sem migração de schema — todos os campos usados já existem em `reservas` (spec: `docs/superpowers/specs/2026-07-16-comprovante-reserva-design.md`).
- Sem lib de PDF — impressão via `window.print()` do navegador, igual ao padrão de OS.
- Checagem de acesso na página de impressão: `admin_geral`/`admin_socio` veem qualquer reserva; qualquer outro papel só vê reservas da própria loja (`reserva.lojaId === usuario.lojaId`), senão `notFound()`.
- Deploy ao final: push + `vercel --prod --yes` (preferência do usuário — sempre publicar automaticamente ao terminar).

---

### Task 1: Query `buscarReserva`

**Files:**
- Create: `D:\Claude\Teste\src\lib\queries\reservas.ts`

**Interfaces:**
- Produces: `buscarReserva(id: string): Promise<ReservaComDetalhes | null>` onde `ReservaComDetalhes` expõe `{ id, numero, status, criadoEm, motoId, lojaId, lojaNome, marca, modelo, cor, chassi, vendedorNome, valorReserva, valorTotalVenda, meioPagamento, cartaoOperadora, cartaoParcelas, dataPrevistaFinalizacao, clienteNome, clienteCpf, clienteCelular, clienteEmail, clienteCep, clienteLogradouro, clienteNumero, clienteComplemento, clienteBairro, clienteCidade, clienteEstado }` — usada pela Task 2.

- [ ] **Step 1: Criar o arquivo com a query**

```ts
// src/lib/queries/reservas.ts
import { db } from '@/lib/db'
import { reservas, motos, modelos, lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type ReservaComDetalhes = Awaited<ReturnType<typeof buscarReserva>>

export async function buscarReserva(id: string) {
  const [reserva] = await db
    .select({
      id: reservas.id,
      numero: reservas.numero,
      status: reservas.status,
      criadoEm: reservas.criadoEm,
      motoId: reservas.motoId,
      lojaId: reservas.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      cor: motos.cor,
      chassi: motos.chassi,
      vendedorNome: usuarios.nome,
      valorReserva: reservas.valorReserva,
      valorTotalVenda: reservas.valorTotalVenda,
      meioPagamento: reservas.meioPagamento,
      cartaoOperadora: reservas.cartaoOperadora,
      cartaoParcelas: reservas.cartaoParcelas,
      dataPrevistaFinalizacao: reservas.dataPrevistaFinalizacao,
      clienteNome: reservas.clienteNome,
      clienteCpf: reservas.clienteCpf,
      clienteCelular: reservas.clienteCelular,
      clienteEmail: reservas.clienteEmail,
      clienteCep: reservas.clienteCep,
      clienteLogradouro: reservas.clienteLogradouro,
      clienteNumero: reservas.clienteNumero,
      clienteComplemento: reservas.clienteComplemento,
      clienteBairro: reservas.clienteBairro,
      clienteCidade: reservas.clienteCidade,
      clienteEstado: reservas.clienteEstado,
    })
    .from(reservas)
    .innerJoin(motos, eq(reservas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(reservas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(reservas.vendedorId, usuarios.id))
    .where(eq(reservas.id, id))
    .limit(1)
  return reserva ?? null
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/reservas.ts
git commit -m "$(cat <<'EOF'
feat: adiciona query buscarReserva para comprovante de reserva

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rota de impressão do comprovante

**Files:**
- Create: `D:\Claude\Teste\src\app\(print)\reservas\[id]\imprimir\print-trigger.tsx`
- Create: `D:\Claude\Teste\src\app\(print)\reservas\[id]\imprimir\page.tsx`

**Interfaces:**
- Consumes: `buscarReserva` (Task 1), `getUsuarioLogado` de `@/lib/auth`.
- Produces: rota `/reservas/[id]/imprimir` — usada pelas Tasks 3 e 5 como destino do link de impressão.

O layout `(print)/layout.tsx` já existe (`return <>{children}</>`) e não precisa de nenhuma mudança.

- [ ] **Step 1: Criar `print-trigger.tsx`**

Idêntico ao já usado em OS — componente genérico, sem nada específico de reserva:

```tsx
'use client'
import { useEffect } from 'react'

export function PrintTrigger() {
  useEffect(() => { window.print() }, [])
  return null
}
```

- [ ] **Step 2: Criar `page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { buscarReserva } from '@/lib/queries/reservas'
import { getUsuarioLogado } from '@/lib/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'

const fmtR = (v: string | null) =>
  v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

const meioLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

export default async function ImprimirReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [reserva, usuario] = await Promise.all([buscarReserva(id), getUsuarioLogado()])
  if (!reserva) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && reserva.lojaId !== usuario.lojaId) notFound()

  const criadoEm = format(new Date(reserva.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const dataPrevista = format(new Date(reserva.dataPrevistaFinalizacao + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
  const endereco = [
    reserva.clienteLogradouro,
    reserva.clienteNumero && `nº ${reserva.clienteNumero}`,
    reserva.clienteComplemento,
  ].filter(Boolean).join(', ')
  const cidadeEstado = [reserva.clienteBairro, reserva.clienteCidade, reserva.clienteEstado].filter(Boolean).join(' — ')

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px; }
        .os-n { font-size: 26px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .obs { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .obs h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 6px; }
        .obs p  { font-size: 12px; line-height: 1.55; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        td { border: 1px solid #e2e8f0; padding: 7px 9px; font-size: 12px; }
        .tr { text-align: right; }
        .tot td { font-weight: 700; background: #f8fafc; }
        .grand { font-size: 15px; font-weight: 900; color: #166534; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .sig  { text-align: center; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 5px; font-size: 10px; color: #64748b; }
        .ftr { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print {
          body { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 44, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>MotoChefe Sul de Minas</p>
            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{reserva.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="os-n">Reserva #{reserva.numero}</div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Registrada em: {criadoEm}</p>
          <p style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>Previsão de finalização: {dataPrevista}</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Cliente</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{reserva.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{reserva.clienteCpf}</span></div>
          <div className="f"><span className="fl">Celular</span><span className="fv">{reserva.clienteCelular}</span></div>
          {reserva.clienteEmail && (
            <div className="f"><span className="fl">E-mail</span><span className="fv">{reserva.clienteEmail}</span></div>
          )}
          {endereco && (
            <div className="f"><span className="fl">Endereço</span><span className="fv">{endereco}{cidadeEstado && ` — ${cidadeEstado}`}</span></div>
          )}
        </div>
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Marca / Modelo</span><span className="fv">{reserva.marca} {reserva.modelo}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{reserva.cor}</span></div>
          <div className="f">
            <span className="fl">Chassi</span>
            <span className="fv" style={{ fontFamily: 'monospace' }}>{reserva.chassi}</span>
          </div>
        </div>
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ fontSize: 11, color: '#64748b' }}>Valor da entrada (sinal pago)</td>
            <td className="tr" style={{ fontSize: 11 }}>{fmtR(reserva.valorReserva)}</td>
          </tr>
          <tr className="tot">
            <td><span className="grand">Valor total negociado</span></td>
            <td className="tr"><span className="grand">{fmtR(reserva.valorTotalVenda)}</span></td>
          </tr>
          <tr>
            <td style={{ fontSize: 11, color: '#64748b' }}>Forma de pagamento da entrada</td>
            <td className="tr" style={{ fontSize: 11 }}>
              {meioLabel[reserva.meioPagamento] ?? reserva.meioPagamento}
              {reserva.cartaoParcelas ? ` — ${reserva.cartaoParcelas}x` : ''}
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: 11, color: '#64748b' }}>Vendedor</td>
            <td className="tr" style={{ fontSize: 11 }}>{reserva.vendedorNome}</td>
          </tr>
        </tbody>
      </table>

      <div className="obs">
        <h2>Termos da reserva</h2>
        <p>Este comprovante formaliza a reserva do veículo acima mediante o sinal pago. A reserva é válida até a data prevista de finalização informada, após a qual poderá ser cancelada a critério da loja.</p>
      </div>

      <div className="sigs">
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Vendedor</div>
        </div>
      </div>

      <div className="ftr">
        <p>MOVA — Sistema de Gestão · MotoChefe Sul de Minas</p>
        <p>Gerado em {geradoEm}</p>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(print)/reservas"
git commit -m "$(cat <<'EOF'
feat: pagina de impressao do comprovante de reserva

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `registrarReservaAction` retorna o id criado

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\vendas\actions.ts:866-914`

**Interfaces:**
- Produces: `registrarReservaAction(data: DadosReserva): Promise<{ id: string }>` (antes retornava `void`) — usado pela Task 4.

- [ ] **Step 1: Capturar o id no insert e retornar**

Trocar (dentro de `registrarReservaAction`):

```ts
  await db.transaction(async (tx) => {
    const valorTotalNum = parseFloat(data.valorTotalVenda)

    const dataReservaFinal = data.dataReserva ? new Date(data.dataReserva + 'T12:00:00') : new Date()
    await tx.insert(reservas).values({
```

por:

```ts
  let reservaId = ''

  await db.transaction(async (tx) => {
    const valorTotalNum = parseFloat(data.valorTotalVenda)

    const dataReservaFinal = data.dataReserva ? new Date(data.dataReserva + 'T12:00:00') : new Date()
    const [novaReserva] = await tx.insert(reservas).values({
```

E logo após o bloco `values({...})` dessa mesma chamada (que hoje termina em `criadoEm: dataReservaFinal,\n    })`), trocar:

```ts
      criadoEm: dataReservaFinal,
    })

    await tx.update(motos)
```

por:

```ts
      criadoEm: dataReservaFinal,
    }).returning({ id: reservas.id })
    reservaId = novaReserva.id

    await tx.update(motos)
```

E no final da função, trocar:

```ts
  })

  revalidatePath('/estoque')
}
```

(a que fecha `registrarReservaAction`, logo após o `tx.insert(historicoEstoque)...`) por:

```ts
  })

  revalidatePath('/estoque')
  return { id: reservaId }
}
```

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/vendas/actions.ts"
git commit -m "$(cat <<'EOF'
feat: registrarReservaAction retorna id da reserva criada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tela de sucesso com impressão no `VenderButton`

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\estoque\components\vender-button.tsx`

**Interfaces:**
- Consumes: `registrarReservaAction` retornando `{ id: string }` (Task 3), rota `/reservas/[id]/imprimir` (Task 2).

- [ ] **Step 1: Adicionar estado de sucesso**

Em `vender-button.tsx:110-114`, trocar:

```ts
export function VenderButton({ motoId, descricao, vendedorId, vendedorNome, papel, usuarios, soReserva, reservaAtiva, showLabel, precoMinimoPix: precoMinimoPixProp, taxasVenda: taxasVendaProp, podeAprovarPagamentoSensivel = false }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<'venda' | 'reserva'>(soReserva ? 'reserva' : 'venda')
  const [loading, setLoading] = useState(false)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedorId)
```

por:

```ts
export function VenderButton({ motoId, descricao, vendedorId, vendedorNome, papel, usuarios, soReserva, reservaAtiva, showLabel, precoMinimoPix: precoMinimoPixProp, taxasVenda: taxasVendaProp, podeAprovarPagamentoSensivel = false }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<'venda' | 'reserva'>(soReserva ? 'reserva' : 'venda')
  const [loading, setLoading] = useState(false)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedorId)
  const [reservaCriadaId, setReservaCriadaId] = useState<string | null>(null)
```

- [ ] **Step 2: Resetar o novo estado ao abrir/fechar o dialog**

Em `resetForm`, no início da função (`vender-button.tsx:159`), trocar:

```ts
  function resetForm(tipoInicial: 'venda' | 'reserva') {
    setTipo(reservaAtiva ? 'venda' : tipoInicial)
```

por:

```ts
  function resetForm(tipoInicial: 'venda' | 'reserva') {
    setReservaCriadaId(null)
    setTipo(reservaAtiva ? 'venda' : tipoInicial)
```

- [ ] **Step 3: Guardar o id ao confirmar reserva, sem fechar o dialog**

Em `handleSubmit` (`vender-button.tsx:400-412`), trocar:

```ts
      } else {
        await registrarReservaAction({
          motoId, ...clienteBase, valorReserva, valorTotalVenda, meioPagamento: meioPgto,
          vendedorId: vendedorSelecionado,
          ...(meioPgto === 'cartao_credito' ? {
            cartaoOperadora: meioPgtoOperadora,
            cartaoParcelas: parseInt(meioPgtoParcelas),
          } : {}),
          dataPrevistaFinalizacao: dataPrevista,
          dataReserva: dataVenda || undefined,
        })
        toast.success('Reserva registrada com sucesso!')
      }
      setOpen(false)
```

por:

```ts
      } else {
        const resultado = await registrarReservaAction({
          motoId, ...clienteBase, valorReserva, valorTotalVenda, meioPagamento: meioPgto,
          vendedorId: vendedorSelecionado,
          ...(meioPgto === 'cartao_credito' ? {
            cartaoOperadora: meioPgtoOperadora,
            cartaoParcelas: parseInt(meioPgtoParcelas),
          } : {}),
          dataPrevistaFinalizacao: dataPrevista,
          dataReserva: dataVenda || undefined,
        })
        toast.success('Reserva registrada com sucesso!')
        setReservaCriadaId(resultado.id)
        return
      }
      setOpen(false)
```

- [ ] **Step 4: Renderizar a tela de sucesso**

Em `vender-button.tsx`, trocar o bloco do `DialogContent` (que hoje começa em `<DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">` e vai até o `</DialogContent>` correspondente) para checar `reservaCriadaId` primeiro. Trocar:

```tsx
        <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          {/* ── Cabeçalho ── */}
```

por:

```tsx
        <DialogContent className={reservaCriadaId ? 'sm:max-w-sm' : 'sm:max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0'}>
          {reservaCriadaId ? (
            <div className="flex flex-col items-center gap-4 py-6 px-2 text-center">
              <CheckCircle2 size={40} className="text-green-600" />
              <div>
                <p className="font-semibold text-slate-800">Reserva registrada com sucesso!</p>
                <p className="text-sm text-slate-500 mt-1">Entregue o comprovante ao cliente.</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
                <a
                  href={`/reservas/${reservaCriadaId}/imprimir`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 text-white text-sm font-medium h-9 px-4 hover:bg-slate-800"
                >
                  Imprimir comprovante
                </a>
              </div>
            </div>
          ) : (
          <>
          {/* ── Cabeçalho ── */}
```

E, no fechamento do `DialogContent` (a linha `        </DialogContent>` que fecha esse bloco, logo antes de `      </Dialog>`), trocar:

```tsx
        </DialogContent>
      </Dialog>
```

por:

```tsx
          </>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/estoque/components/vender-button.tsx"
git commit -m "$(cat <<'EOF'
feat: tela de sucesso com impressao de comprovante ao reservar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Ícone de reimpressão na listagem e na ficha da moto

**Files:**
- Modify: `D:\Claude\Teste\src\lib\queries\motos.ts` (funções `listarMotos` e `buscarMoto`)
- Modify: `D:\Claude\Teste\src\app\(dashboard)\estoque\components\moto-table.tsx`
- Modify: `D:\Claude\Teste\src\app\(dashboard)\estoque\[id]\components\moto-actions.tsx`

**Interfaces:**
- Consumes: rota `/reservas/[id]/imprimir` (Task 2).
- Produces: campo `reservaId: string | null` disponível em `MotoComDetalhes` (tipo inferido de `listarMotos`) e no tipo `Moto` de `moto-actions.tsx`.

- [ ] **Step 1: Adicionar subselect `reservaId` em `listarMotos`**

Em `src/lib/queries/motos.ts:55`, logo antes de `reservaValorEntrada`, adicionar:

```ts
      reservaId: sql<string | null>`(
        SELECT r.id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorEntrada: sql<string | null>`(
```

(ou seja, o `select({` de `listarMotos` ganha esse campo extra logo antes de `reservaValorEntrada`).

- [ ] **Step 2: Adicionar o mesmo subselect em `buscarMoto`**

Em `src/lib/queries/motos.ts:206`, mesma mudança, dentro do `select({` de `buscarMoto`, logo antes de `reservaValorEntrada`:

```ts
      reservaId: sql<string | null>`(
        SELECT r.id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorEntrada: sql<string | null>`(
```

- [ ] **Step 3: Verificar tipos**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros (o tipo `MotoComDetalhes` é inferido da query, então `moto-table.tsx` já enxerga `reservaId` automaticamente).

- [ ] **Step 4: Ícone de impressão em `moto-table.tsx`**

Trocar o import de ícones (`moto-table.tsx:5`):

```ts
import { Eye, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight } from 'lucide-react'
```

por:

```ts
import { Eye, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight, Printer } from 'lucide-react'
```

Em `moto-table.tsx:162-191`, logo depois do bloco `{/* Reservada: só finalizar venda */}` (que fecha em `)}` na linha 191), adicionar um novo bloco condicional com o ícone de impressão:

```tsx
                                {/* Reservada: só finalizar venda */}
                                {moto.disponibilidade === 'reservada' && moto.reservaValorEntrada && (
                                  <VenderButton
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    vendedorId={vendedorId}
                                    vendedorNome={vendedorNome}
                                    papel={papel}
                                    usuarios={usuarios}
                                    podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
                                    reservaAtiva={{
                                      valorEntrada: moto.reservaValorEntrada,
                                      valorTotal: moto.reservaValorTotal ?? '0',
                                      clienteNome: moto.reservaClienteNome ?? '',
                                      clienteCpf: moto.reservaClienteCpf ?? '',
                                      clienteCelular: moto.reservaClienteCelular ?? '',
                                      clienteEmail: moto.reservaClienteEmail ?? '',
                                      clienteCep: moto.reservaClienteCep ?? '',
                                      clienteLogradouro: moto.reservaClienteLogradouro ?? '',
                                      clienteNumero: moto.reservaClienteNumero ?? '',
                                      clienteComplemento: moto.reservaClienteComplemento ?? '',
                                      clienteBairro: moto.reservaClienteBairro ?? '',
                                      clienteCidade: moto.reservaClienteCidade ?? '',
                                      clienteEstado: moto.reservaClienteEstado ?? '',
                                      vendedorId: moto.reservaVendedorId ?? vendedorId,
                                      meioPagamento: moto.reservaMeioPagamento ?? 'pix',
                                      cartaoOperadora: moto.reservaCartaoOperadora,
                                      cartaoParcelas: moto.reservaCartaoParcelas,
                                    }}
                                  />
                                )}
                                {moto.disponibilidade === 'reservada' && moto.reservaId && (
                                  <a
                                    href={`/reservas/${moto.reservaId}/imprimir`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Imprimir comprovante da reserva"
                                    className={buttonVariants({ variant: 'ghost', size: 'icon' }) + ' h-8 w-8 text-slate-500 hover:text-slate-700'}
                                  >
                                    <Printer size={16} />
                                  </a>
                                )}
```

- [ ] **Step 5: Campo `reservaId` no tipo `Moto` de `moto-actions.tsx`**

Em `src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx:16-43`, trocar:

```ts
type Moto = {
  id: string
  status: string
  disponibilidade: string | null
  lojaId: string
  lojaNome: string
  marca: string
  modelo: string
  cor: string
  transferenciaPendente: boolean
  reservaValorEntrada: string | null
```

por:

```ts
type Moto = {
  id: string
  status: string
  disponibilidade: string | null
  lojaId: string
  lojaNome: string
  marca: string
  modelo: string
  cor: string
  transferenciaPendente: boolean
  reservaId: string | null
  reservaValorEntrada: string | null
```

- [ ] **Step 6: Ícone de impressão em `moto-actions.tsx`**

Trocar o import de ícones (`moto-actions.tsx:9`):

```ts
import { ArrowLeftRight } from 'lucide-react'
```

por:

```ts
import { ArrowLeftRight, Printer } from 'lucide-react'
```

Em `moto-actions.tsx:124-159`, logo depois do `acoes.push(<VenderButton key="vender-reserva" .../>)` que fecha em `)` na linha 158-159, adicionar mais um `acoes.push` com o link de impressão:

```ts
      if (moto.disponibilidade === 'reservada' && moto.reservaValorEntrada) {
        acoes.push(
          <VenderButton
            key="vender-reserva"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
            podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
            reservaAtiva={{
              valorEntrada: moto.reservaValorEntrada,
              valorTotal: moto.reservaValorTotal ?? '0',
              clienteNome: moto.reservaClienteNome ?? '',
              clienteCpf: moto.reservaClienteCpf ?? '',
              clienteCelular: moto.reservaClienteCelular ?? '',
              clienteEmail: moto.reservaClienteEmail ?? '',
              clienteCep: moto.reservaClienteCep ?? '',
              clienteLogradouro: moto.reservaClienteLogradouro ?? '',
              clienteNumero: moto.reservaClienteNumero ?? '',
              clienteComplemento: moto.reservaClienteComplemento ?? '',
              clienteBairro: moto.reservaClienteBairro ?? '',
              clienteCidade: moto.reservaClienteCidade ?? '',
              clienteEstado: moto.reservaClienteEstado ?? '',
              vendedorId: moto.reservaVendedorId ?? vendedorId,
              meioPagamento: moto.reservaMeioPagamento ?? 'pix',
              cartaoOperadora: moto.reservaCartaoOperadora,
              cartaoParcelas: moto.reservaCartaoParcelas,
            }}
          />
        )
        if (moto.reservaId) {
          acoes.push(
            <a
              key="imprimir-reserva"
              href={`/reservas/${moto.reservaId}/imprimir`}
              target="_blank"
              rel="noopener noreferrer"
              title="Imprimir comprovante da reserva"
              className="h-8 gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-3 inline-flex items-center"
            >
              <Printer size={14} />
              Comprovante
            </a>
          )
        }
      }
```

- [ ] **Step 7: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 8: Build**

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, incluindo a nova rota `/reservas/[id]/imprimir`.

- [ ] **Step 9: Checagem manual no navegador**

Com o dev server rodando (`npm run dev`), logado como vendedor ou admin:
1. Ir em `/estoque`, abrir "Reservar" numa moto disponível, preencher os dados e confirmar. Verificar que o dialog não fecha sozinho e mostra a tela de sucesso com os botões "Fechar" e "Imprimir comprovante".
2. Clicar em "Imprimir comprovante" — deve abrir `/reservas/{id}/imprimir` em nova aba, disparar a janela de impressão do navegador automaticamente, e mostrar os dados da reserva (cliente, moto, valores, termos, assinatura).
3. Fechar a aba, clicar em "Fechar" no dialog original — deve fechar normalmente e a moto deve aparecer como "Reservada" na listagem.
4. Na listagem de estoque, ao lado do botão "Finalizar Venda" da moto agora reservada, deve aparecer o ícone de impressão — clicar deve abrir o mesmo comprovante em nova aba.
5. Repetir a checagem do ícone de impressão na ficha da moto (`/estoque/{id}`).
6. Como usuário de outra loja (não admin), tentar acessar diretamente a URL `/reservas/{id}/imprimir` de uma reserva de loja diferente — deve retornar 404.

- [ ] **Step 10: Commit**

```bash
git add src/lib/queries/motos.ts "src/app/(dashboard)/estoque/components/moto-table.tsx" "src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx"
git commit -m "$(cat <<'EOF'
feat: icone de reimpressao do comprovante de reserva no estoque

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"`.
