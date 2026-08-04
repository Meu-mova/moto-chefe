# Checklist de Entrega e Certificado de Bateria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar duas páginas de impressão (Checklist de Entrega e Certificado de Bateria) com dados da venda auto-preenchidos, acessíveis assim que a nota fiscal de saída é lançada.

**Architecture:** Duas novas rotas `(print)/vendas/[id]/checklist-entrega` e `(print)/vendas/[id]/certificado-bateria`, seguindo exatamente o padrão já usado em `(print)/ordens-servico` e `(print)/reservas` (Server Component, CSS inline A4, `PrintTrigger` com `window.print()` automático, sem lib de PDF). Uma nova query `buscarVenda(id)` alimenta as duas. Os links aparecem na aba "Venda" da ficha da moto e numa tela de sucesso logo após confirmar a NF.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Postgres (Supabase), TypeScript, date-fns. Sem framework de testes automatizado — verificação via `npm run type-check`, `npm run build` e checagem manual no navegador.

## Global Constraints

- Sem geração de PDF real no servidor — só `window.print()` do navegador (decisão do usuário).
- Sem upload/gerenciamento de template pela aplicação — layout fixo no código (decisão do usuário: "fixo por enquanto").
- "SELO DA BATERIA" fica em branco na página impressa; o número solto "8953508591550" do certificado original é descartado, não aparece em lugar nenhum.
- A nota "CIDADE E DATA PREENCHIDA AUTOMATICAMENTE" do template original não é impressa literalmente — vira uma linha com `{loja.cidade}, {data}` de fato preenchida.
- Checagem de acesso nas duas rotas: `admin_geral`/`admin_socio` veem qualquer venda; demais papéis só se `venda.lojaId === usuario.lojaId`, senão `notFound()` — mesmo padrão de `(print)/reservas`.

---

### Task 1: Query `buscarVenda`

**Files:**
- Modify: `D:\Claude\Teste\src\lib\queries\vendas.ts`

**Interfaces:**
- Produces: `buscarVenda(id: string): Promise<VendaComDocumento | null>` com campos `{ id, dataVenda, notaFiscalSaida, motoId, lojaId, lojaNome, lojaCidade, marca, modelo, chassi, cor, motor, clienteNome, clienteCpf, clienteLogradouro, clienteNumero, clienteComplemento, clienteBairro, clienteCidade, clienteEstado }` — usada pelas Tasks 3 e 4.

- [ ] **Step 1: Adicionar a função ao final do arquivo**

Ao final de `src/lib/queries/vendas.ts`, adicionar:

```ts

export type VendaComDocumento = Awaited<ReturnType<typeof buscarVenda>>

export async function buscarVenda(id: string) {
  const [venda] = await db
    .select({
      id: vendas.id,
      dataVenda: vendas.dataVenda,
      notaFiscalSaida: vendas.notaFiscalSaida,
      motoId: vendas.motoId,
      lojaId: vendas.lojaId,
      lojaNome: lojas.nome,
      lojaCidade: lojas.cidade,
      marca: modelos.marca,
      modelo: modelos.modelo,
      chassi: motos.chassi,
      cor: motos.cor,
      motor: sql<string>`COALESCE(${motos.motor}, ${modelos.motor})`.as('motor'),
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(eq(vendas.id, id))
    .limit(1)
  return venda ?? null
}
```

`db`, `vendas`, `motos`, `modelos`, `lojas`, `eq`, `sql` já estão importados no topo do arquivo (usados por `listarVendas`/`buscarPedido`) — não precisa adicionar nenhum import novo.

- [ ] **Step 2: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/vendas.ts
git commit -m "$(cat <<'EOF'
feat: adiciona query buscarVenda para checklist e certificado de bateria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `confirmarNFSaidaAction` retorna o id da venda

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\vendas\actions.ts:361-388`

**Interfaces:**
- Produces: `confirmarNFSaidaAction(motoId: string, notaFiscal: string): Promise<{ vendaId: string }>` (antes retornava `void`) — usado pela Task 5.

- [ ] **Step 1: Retornar o id da venda já localizada**

A função já localiza a venda pendente de NF em `venda.id` — só falta devolver esse id. Trocar:

```ts
  if (!venda) throw new Error('Nenhuma venda pendente de NF encontrada para esta moto')

  await db.transaction(async (tx) => {
    await tx.update(vendas)
      .set({ notaFiscalSaida: notaFiscal })
      .where(eq(vendas.id, venda.id))

    await tx.update(motos)
      .set({ disponibilidade: 'vendida' as any })
      .where(eq(motos.id, motoId))
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}
```

por:

```ts
  if (!venda) throw new Error('Nenhuma venda pendente de NF encontrada para esta moto')

  await db.transaction(async (tx) => {
    await tx.update(vendas)
      .set({ notaFiscalSaida: notaFiscal })
      .where(eq(vendas.id, venda.id))

    await tx.update(motos)
      .set({ disponibilidade: 'vendida' as any })
      .where(eq(motos.id, motoId))
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  return { vendaId: venda.id }
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
feat: confirmarNFSaidaAction retorna id da venda

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rota de impressão — Checklist de Entrega

**Files:**
- Create: `D:\Claude\Teste\src\app\(print)\vendas\[id]\checklist-entrega\print-trigger.tsx`
- Create: `D:\Claude\Teste\src\app\(print)\vendas\[id]\checklist-entrega\page.tsx`

**Interfaces:**
- Consumes: `buscarVenda` (Task 1), `getUsuarioLogado` de `@/lib/auth`.
- Produces: rota `/vendas/[id]/checklist-entrega` — usada pela Task 5.

O layout `(print)/layout.tsx` já existe e cobre esta rota — nenhuma mudança necessária nele.

- [ ] **Step 1: Criar `print-trigger.tsx`**

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
import { buscarVenda } from '@/lib/queries/vendas'
import { getUsuarioLogado } from '@/lib/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'

const ITENS = [
  'Chave de ignição',
  'Ignição pelo painel / controle / cartão',
  'Acelerador',
  'Freios em funcionamento',
  'Comandos 1, 2 e 3',
  'Ré',
  'Sensor de freio',
  'Lanterna',
  'Farol (baixo e alto)',
  'Buzina',
  'Setas dianteiras e traseiras',
  'Alarmes e travas',
  'Carenagens em perfeito estado',
  'Carregador em funcionamento',
  'Abertura do banco / compartimento da bateria',
]

export default async function ChecklistEntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [venda, usuario] = await Promise.all([buscarVenda(id), getUsuarioLogado()])
  if (!venda) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && venda.lojaId !== usuario.lojaId) notFound()

  const data = format(new Date(venda.dataVenda), 'dd/MM/yyyy', { locale: ptBR })
  const endereco = [
    venda.clienteLogradouro,
    venda.clienteNumero && `nº ${venda.clienteNumero}`,
    venda.clienteComplemento,
    venda.clienteBairro,
  ].filter(Boolean).join(', ')
  const cidadeEstado = [venda.clienteCidade, venda.clienteEstado].filter(Boolean).join('/')

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 14px; }
        .titulo { font-size: 20px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 9px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; }
        td { border: 1px solid #e2e8f0; padding: 5px 9px; font-size: 11px; }
        .chk { text-align: center; width: 46px; }
        .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #64748b; }
        .obs { margin: 10px 0 18px; font-size: 11px; }
        .obsline { display: inline-block; border-bottom: 1px solid #94a3b8; width: 100%; min-height: 16px; }
        .sig  { text-align: center; margin-top: 10px; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 5px; font-size: 10px; color: #64748b; margin-top: 34px; }
        .sigs2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
        .localdata { margin: 14px 0; font-size: 11px; text-align: right; }
        @media print {
          body { padding: 0; }
          @page { margin: 1.3cm; }
        }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 40, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>MotoChefe Sul de Minas</p>
            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{venda.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="titulo">CHECKLIST DE ENTREGA</div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Cliente: {venda.clienteNome}</p>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>Data: {data}</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Marca / Modelo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
        </div>
        <div className="card">
          <h2>Cliente</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{venda.clienteCpf}</span></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>Nº</th>
            <th>Itens, equipamento e funcionalidades</th>
            <th className="chk">OK</th>
            <th className="chk">Não</th>
          </tr>
        </thead>
        <tbody>
          {ITENS.map((item, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{item}</td>
              <td className="chk"><span className="box" /></td>
              <td className="chk"><span className="box" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="obs">
        Observações complementares:
        <div className="obsline" />
      </div>

      <div className="sig">
        <div className="sigline">(Nome do Cliente)</div>
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Dados do Proprietário</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{venda.clienteCpf}</span></div>
          <div className="f"><span className="fl">Endereço</span><span className="fv">{endereco || '—'}{cidadeEstado && ` — ${cidadeEstado}`}</span></div>
        </div>
        <div className="card">
          <h2>Dados MotoChefe</h2>
          <div className="f"><span className="fl">Modelo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Motor</span><span className="fv">{venda.motor}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Dados da Loja</h2>
        <div className="grid2">
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.lojaNome}</span></div>
          <div className="f"><span className="fl">Nº Nota Fiscal</span><span className="fv">{venda.notaFiscalSaida ?? '—'}</span></div>
          <div className="f"><span className="fl">Data Emissão</span><span className="fv">{data}</span></div>
        </div>
      </div>

      <div className="localdata">{venda.lojaCidade}, {data}</div>

      <div className="sigs2">
        <div className="sig">
          <div style={{ height: 40 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 40 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura da Loja</div>
        </div>
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
git add "src/app/(print)/vendas/[id]/checklist-entrega"
git commit -m "$(cat <<'EOF'
feat: pagina de impressao do checklist de entrega

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rota de impressão — Certificado de Bateria

**Files:**
- Create: `D:\Claude\Teste\src\app\(print)\vendas\[id]\certificado-bateria\print-trigger.tsx`
- Create: `D:\Claude\Teste\src\app\(print)\vendas\[id]\certificado-bateria\page.tsx`

**Interfaces:**
- Consumes: `buscarVenda` (Task 1), `getUsuarioLogado` de `@/lib/auth`.
- Produces: rota `/vendas/[id]/certificado-bateria` — usada pela Task 5.

- [ ] **Step 1: Criar `print-trigger.tsx`**

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
import { buscarVenda } from '@/lib/queries/vendas'
import { getUsuarioLogado } from '@/lib/auth'
import { PrintTrigger } from './print-trigger'

export default async function CertificadoBateriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [venda, usuario] = await Promise.all([buscarVenda(id), getUsuarioLogado()])
  if (!venda) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && venda.lojaId !== usuario.lojaId) notFound()

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 32px 40px; }
        .hdr { text-align: center; margin-bottom: 18px; }
        .titulo { font-size: 22px; font-weight: 900; margin-top: 10px; }
        .subtitulo { font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: .04em; }
        .destaque { text-align: center; margin: 16px 0; }
        .destaque .a { font-size: 15px; font-weight: 900; color: #166534; }
        .destaque .b { font-size: 11px; color: #64748b; }
        .par { font-size: 11px; line-height: 1.6; text-align: justify; margin-bottom: 12px; }
        .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .selo { border: 1px dashed #94a3b8; border-radius: 8px; height: 90px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; }
        .ftr { text-align: center; font-size: 10px; color: #64748b; margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print {
          body { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="hdr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 48, width: 'auto', margin: '0 auto' }} />
        <div className="titulo">CERTIFICADO</div>
        <div className="subtitulo">SEGURO EXCLUSIVO BATERIAS</div>
      </div>

      <div className="destaque">
        <div className="a">PRIMEIRO SEGURO DE BATERIA</div>
        <div className="b">GARANTIA QUE VAI ALÉM!</div>
      </div>

      <p className="par">
        A MOTOCHEFE OFERECE GARANTIA PARA SUAS BATERIAS, COM COBERTURA PARA INDENIZAÇÃO POR EVENTUAIS DANOS, OBSERVADOS OS LIMITES E CONDIÇÕES ESTABELECIDOS NO TERMO DE COBERTURA.
      </p>
      <p className="par">
        ESTA COBERTURA É GARANTIDA PELA YELUM SEGURADORA, INTEGRANTE DO GRUPO HDI SEGUROS, POR MEIO DA APÓLICE Nº 51.38.2025.0000324, VÁLIDA EM TERRITÓRIO NACIONAL, CONFORME OS TERMOS E CONDIÇÕES ESTABELECIDOS NO CONTRATO DE SEGURO.
      </p>

      <div className="card">
        <h2>Dados do Assegurado</h2>
        <div className="grid3">
          <div className="f"><span className="fl">Nome completo</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{venda.clienteCpf}</span></div>
          <div className="f"><span className="fl">Nº da Nota Fiscal</span><span className="fv">{venda.notaFiscalSaida ?? '—'}</span></div>
          <div className="f"><span className="fl">Modelo do Veículo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
          <div className="f"><span className="fl">Loja</span><span className="fv">{venda.lojaNome}</span></div>
        </div>
      </div>

      <div className="selo">Selo da Bateria</div>

      <p className="par">
        ESTE CERTIFICADO ASSEGURA AO CONSUMIDOR A COBERTURA PARA INDENIZAÇÃO POR EVENTUAIS DANOS OCASIONADOS POR DEFEITO/VÍCIO DE FABRICAÇÃO DEVIDAMENTE CONSTATADO, CONFORME OS LIMITES E CONDIÇÕES PREVISTOS NO TERMO DE COBERTURA. A REIVINDICAÇÃO DOS TERMOS DESTE CERTIFICADO DE GARANTIA PELO CONSUMIDOR SERÁ CONDICIONADA MEDIANTE APRESENTAÇÃO DA NOTA FISCAL, DESTE CERTIFICADO, E COMPROVADAS AS RAZÕES DE SUA APLICAÇÃO EM OBEDIÊNCIA AS CONDIÇÕES PREVISTAS.
      </p>
      <p className="par">
        A MOTOCHEFE RESERVA-SE O DIREITO DE RESCINDIR A COBERTURA A QUALQUER MOMENTO, EM CONFORMIDADE COM CONDIÇÕES PREVISTAS NO TERMO. O ENCERRAMENTO PODERÁ OCORRER MEDIANTE COMUNICAÇÃO POR AVISO PUBLICADO NO SITE OFICIAL DA EMPRESA.
      </p>

      <div className="ftr">
        <p>SAC (21) 96679-0202</p>
        <p>MOTOCHEFEBRASIL.COM.BR · @MOTOCHEFEBRASIL</p>
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
git add "src/app/(print)/vendas/[id]/certificado-bateria"
git commit -m "$(cat <<'EOF'
feat: pagina de impressao do certificado de bateria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Links de impressão na aba Venda e tela de sucesso ao confirmar NF

**Files:**
- Modify: `D:\Claude\Teste\src\app\(dashboard)\estoque\[id]\components\venda-tab.tsx`
- Modify: `D:\Claude\Teste\src\app\(dashboard)\estoque\components\nf-saida-button.tsx`

**Interfaces:**
- Consumes: rotas `/vendas/[id]/checklist-entrega` e `/vendas/[id]/certificado-bateria` (Tasks 3 e 4), `confirmarNFSaidaAction` retornando `{ vendaId }` (Task 2).

- [ ] **Step 1: Links na aba Venda (`venda-tab.tsx`)**

Trocar:

```tsx
              <p className="flex items-center gap-2">
                NF Saída: <span className="text-slate-900">{venda.notaFiscalSaida ?? '—'}</span>
                {venda.notaFiscalSaida && venda.blingNfeId && (
                  <DanfeButton motoId={motoId} />
                )}
              </p>
```

por:

```tsx
              <p className="flex items-center gap-2 flex-wrap">
                NF Saída: <span className="text-slate-900">{venda.notaFiscalSaida ?? '—'}</span>
                {venda.notaFiscalSaida && venda.blingNfeId && (
                  <DanfeButton motoId={motoId} />
                )}
                {venda.notaFiscalSaida && (
                  <>
                    <a
                      href={`/vendas/${venda.id}/checklist-entrega`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Checklist de Entrega
                    </a>
                    <a
                      href={`/vendas/${venda.id}/certificado-bateria`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Certificado Bateria
                    </a>
                  </>
                )}
              </p>
```

- [ ] **Step 2: Tela de sucesso em `nf-saida-button.tsx` — adicionar estado**

Trocar:

```ts
type Etapa = 'inicial' | 'aguardando' | 'manual'

export function NfSaidaButton({ motoId, descricao, blingNfeId }: Props) {
  const urlExistente = blingNfeId ? `https://www.bling.com.br/notas.fiscais.php#edit/${blingNfeId}` : ''

  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [blingUrl, setBlingUrl] = useState(urlExistente)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()
```

por:

```ts
type Etapa = 'inicial' | 'aguardando' | 'manual'

export function NfSaidaButton({ motoId, descricao, blingNfeId }: Props) {
  const urlExistente = blingNfeId ? `https://www.bling.com.br/notas.fiscais.php#edit/${blingNfeId}` : ''

  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [blingUrl, setBlingUrl] = useState(urlExistente)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()
  const [vendaConfirmadaId, setVendaConfirmadaId] = useState<string | null>(null)
```

- [ ] **Step 3: Resetar o novo estado ao abrir o dialog**

Trocar:

```ts
  function abrir() {
    setErro('')
    setNf('')
```

por:

```ts
  function abrir() {
    setErro('')
    setNf('')
    setVendaConfirmadaId(null)
```

- [ ] **Step 4: Capturar o `vendaId` retornado, sem fechar o dialog**

Trocar:

```ts
  function confirmar() {
    if (!nf.trim()) { setErro('Informe o número da NF'); return }
    setErro('')
    startTransition(async () => {
      try {
        await confirmarNFSaidaAction(motoId, nf.trim())
        setAberto(false)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }
```

por:

```ts
  function confirmar() {
    if (!nf.trim()) { setErro('Informe o número da NF'); return }
    setErro('')
    startTransition(async () => {
      try {
        const resultado = await confirmarNFSaidaAction(motoId, nf.trim())
        setVendaConfirmadaId(resultado.vendaId)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }
```

- [ ] **Step 5: Renderizar a tela de sucesso**

Trocar o início do `DialogContent`:

```tsx
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>NF-e de Saída</DialogTitle>
            <p className="text-sm text-slate-500">{descricao}</p>
          </DialogHeader>

          {etapa === 'inicial' && (
```

por:

```tsx
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="max-w-sm">
          {vendaConfirmadaId ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <FileCheck size={36} className="text-green-600" />
              <div>
                <p className="font-semibold text-slate-800">NF de saída confirmada!</p>
                <p className="text-sm text-slate-500 mt-1">Imprima os documentos de entrega para o cliente.</p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <a
                  href={`/vendas/${vendaConfirmadaId}/checklist-entrega`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white text-sm font-medium h-9 px-4 hover:bg-slate-800"
                >
                  Imprimir Checklist de Entrega
                </a>
                <a
                  href={`/vendas/${vendaConfirmadaId}/certificado-bateria`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white text-sm font-medium h-9 px-4 hover:bg-slate-800"
                >
                  Imprimir Certificado Bateria
                </a>
                <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
              </div>
            </div>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle>NF-e de Saída</DialogTitle>
            <p className="text-sm text-slate-500">{descricao}</p>
          </DialogHeader>

          {etapa === 'inicial' && (
```

E no fechamento do `DialogContent` (a linha `        </DialogContent>` que fecha esse bloco, logo antes de `      </Dialog>`), trocar:

```tsx
        </DialogContent>
      </Dialog>
    </>
  )
}
```

por:

```tsx
          </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 6: Verificar**

```bash
cd "D:/Claude/Teste" && npm run type-check
```

Expected: sem erros.

```bash
cd "D:/Claude/Teste" && npm run build
```

Expected: build limpo, incluindo as novas rotas `/vendas/[id]/checklist-entrega` e `/vendas/[id]/certificado-bateria`.

- [ ] **Step 7: Checagem manual no navegador**

Com o dev server rodando, logado como admin (`admin_geral`/`admin_socio`, já que confirmar NF é admin-only): abrir a ficha de uma moto com venda registrada mas sem NF, clicar em "NF Saída" → "Nota já emitida", informar um número de NF e confirmar. Verificar que o dialog mostra a tela de sucesso com os dois botões de impressão. Clicar em cada um — deve abrir a respectiva página em nova aba, disparar a impressão automaticamente, e mostrar os dados corretos (cliente, moto, loja, NF). Fechar o dialog, ir na aba "Venda" da mesma moto e confirmar que os dois links "Checklist de Entrega"/"Certificado Bateria" aparecem ali também e abrem os mesmos documentos.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/estoque/[id]/components/venda-tab.tsx" "src/app/(dashboard)/estoque/components/nf-saida-button.tsx"
git commit -m "$(cat <<'EOF'
feat: links de impressao do checklist e certificado apos confirmar NF

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Deploy

- [ ] **Step 1:** `git push origin main`
- [ ] **Step 2:** `vercel --prod --yes`
- [ ] **Step 3:** Confirmar `readyState: "READY"`.
