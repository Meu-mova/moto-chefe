import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos, vendas, usuarios } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { LABEL_TIPO, type TipoDocumento } from '@/lib/assinatura/documento'
import type { Evidencias } from '@/lib/assinatura/hash'

/**
 * Dossiê de assinatura — é o que se leva a uma contestação.
 *
 * Reúne num só lugar o documento assinado, a foto do signatário, o traço da
 * assinatura, o resumo criptográfico e a trilha completa de eventos com IP e
 * horário. Página imprimível: em juízo o que vale é o papel ou o PDF.
 *
 * Fica no grupo (print), atrás de login — o link público do cliente NUNCA
 * mostra a foto.
 */

const LABEL_EVENTO: Record<string, string> = {
  enviado: 'Documento enviado ao cliente',
  reenviado: 'Link reenviado',
  link_aberto: 'Link aberto pelo cliente',
  codigo_enviado: 'Código enviado por WhatsApp',
  codigo_errado: 'Código recusado',
  codigo_ok: 'Código conferido com sucesso',
  selfie_enviada: 'Registro fotográfico coletado',
  assinado: 'Documento assinado',
  cancelado: 'Documento cancelado pela loja',
  assinado_em_papel: 'Assinado à caneta na loja e digitalizado',
}

function dataHora(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default async function DossieAssinaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await getUsuarioLogado()

  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.id, id)).limit(1)
  if (!doc) notFound()

  // Restrito a admin_geral e admin_socio — mais fechado que o resto do sistema,
  // de propósito: aqui está a FOTO do cliente, o dado mais sensível do conjunto.
  // Vendedor e aux_adm continuam enviando, reenviando e vendo o status pelo
  // painel da venda; só não abrem o registro fotográfico. Ver o spec (LGPD:
  // acesso restrito a quem precisa).
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) notFound()

  const [venda] = await db.select({ lojaId: vendas.lojaId, numero: vendas.numero })
    .from(vendas).where(eq(vendas.id, doc.vendaId)).limit(1)

  const eventos = await db.select().from(assinaturaEventos)
    .where(eq(assinaturaEventos.documentoId, doc.id))
    .orderBy(asc(assinaturaEventos.criadoEm))

  const [enviadoPor] = doc.criadoPor
    ? await db.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, doc.criadoPor)).limit(1)
    : [null]

  // URLs assinadas de curta duração: as imagens ficam em bucket privado e não
  // podem virar link permanente.
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const assinar = async (caminho: string | null) => {
    if (!caminho) return null
    const { data } = await admin.storage.from('assinaturas').createSignedUrl(caminho, 600)
    return data?.signedUrl ?? null
  }
  const [selfieUrl, tracoUrl, viaFisicaUrl] = await Promise.all([
    assinar(doc.selfiePath), assinar(doc.assinaturaPath), assinar(doc.viaFisicaPath),
  ])
  const emPapel = doc.assinaturaModo === 'papel'

  const ev = doc.evidenciasJson as Evidencias | null

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 24px 28px; }
        h1 { font-size: 17px; margin-bottom: 2px; }
        h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 18px 0 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; width: 190px; font-weight: 600; }
        .mono { font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
        .doc { border: 1px solid #e2e8f0; padding: 14px; margin-top: 6px; }
        .imgs { display: flex; gap: 14px; }
        .imgs figure { border: 1px solid #e2e8f0; padding: 8px; }
        .imgs img { max-width: 240px; max-height: 300px; display: block; }
        figcaption { font-size: 9px; color: #64748b; margin-top: 4px; }
        .rodape { margin-top: 18px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        @media print { .no-print { display: none } }
      `}</style>

      <h1>Dossiê de assinatura {emPapel ? 'em papel' : 'eletrônica'}</h1>
      <p style={{ color: '#64748b', marginBottom: 12 }}>
        {LABEL_TIPO[doc.tipo as TipoDocumento]} — venda #{venda?.numero ?? '—'}
      </p>

      <h2>Identificação do documento</h2>
      <table>
        <tbody>
          <tr><th>Situação</th><td>{doc.status === 'assinado' ? 'ASSINADO' : doc.status.toUpperCase()}</td></tr>
          <tr>
            <th>Forma da assinatura</th>
            <td>{emPapel
              ? 'Manuscrita, na loja — via digitalizada anexada abaixo'
              : 'Eletrônica, pelo celular do signatário'}</td>
          </tr>
          <tr><th>Assinado em</th><td>{dataHora(doc.assinadoEm)} (horário de Brasília)</td></tr>
          <tr><th>Enviado em</th><td>{dataHora(doc.criadoEm)}{enviadoPor?.nome ? ` por ${enviadoPor.nome}` : ''}</td></tr>
          <tr><th>WhatsApp do signatário</th><td>{doc.celularDestino}</td></tr>
          <tr><th>Endereço IP</th><td>{doc.ipAssinatura ?? '—'}</td></tr>
          <tr><th>Navegador</th><td style={{ fontSize: 10 }}>{doc.userAgent ?? '—'}</td></tr>
          <tr>
            <th>Localização</th>
            <td>{doc.geoLat ? `${doc.geoLat}, ${doc.geoLon} (±${doc.geoPrecisao}m)` : 'não autorizada pelo signatário'}</td>
          </tr>
        </tbody>
      </table>

      <h2>Prova de integridade</h2>
      <table>
        <tbody>
          <tr><th>Resumo do documento (SHA-256)</th><td className="mono">{doc.snapshotHash}</td></tr>
          <tr><th>Resumo da foto (SHA-256)</th><td className="mono">{doc.selfieHash ?? '—'}</td></tr>
          <tr><th>Resumo da assinatura (SHA-256)</th><td className="mono">{doc.assinaturaHash ?? '—'}</td></tr>
          <tr><th>Código de verificação</th><td className="mono">{doc.docHash ?? '—'}</td></tr>
          <tr>
            <th>Conjunto assinado (JSON)</th>
            <td className="mono" style={{ fontSize: 9 }}>{ev ? JSON.stringify(ev) : '—'}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: '#64748b' }}>
        O código de verificação é o SHA-256 do conjunto acima. Recalculá-lo sobre o JSON reproduz o
        mesmo valor — qualquer alteração posterior no documento, na foto ou nas evidências muda o
        resultado.
      </p>

      {emPapel && (
        <>
          <h2>Via assinada à caneta</h2>
          {viaFisicaUrl
            ? (doc.viaFisicaPath?.endsWith('.pdf')
                ? <p><a href={viaFisicaUrl}>Abrir o PDF da via assinada</a> (link válido por 10 minutos)</p>
                /* eslint-disable-next-line @next/next/no-img-element */
                : <img src={viaFisicaUrl} alt="Via do documento assinada à caneta" style={{ maxWidth: 420, border: '1px solid #e2e8f0' }} />)
            : <p style={{ fontSize: 11 }}>Via não localizada no arquivo.</p>}
          <p style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
            Resumo da via (SHA-256): <span className="mono">{doc.viaFisicaHash ?? '—'}</span>
          </p>
        </>
      )}

      {!emPapel && (
      <>
      <h2>Registro fotográfico e assinatura</h2>
      <div className="imgs">
        <figure>
          {selfieUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={selfieUrl} alt="Foto do signatário no ato da assinatura" />
            : <p style={{ fontSize: 10 }}>Sem foto registrada</p>}
          <figcaption>Foto coletada em {dataHora(doc.assinadoEm)}</figcaption>
        </figure>
        <figure>
          {tracoUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={tracoUrl} alt="Assinatura manuscrita do signatário" />
            : <p style={{ fontSize: 10 }}>Sem assinatura registrada</p>}
          <figcaption>Assinatura lançada na tela</figcaption>
        </figure>
      </div>
      </>
      )}

      <h2>Trilha de eventos</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 130 }}>Quando</th>
            <th style={{ width: 'auto' }}>Evento</th>
            <th style={{ width: 120 }}>IP</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map(e => (
            <tr key={e.id}>
              <td>{dataHora(e.criadoEm)}</td>
              <td>{LABEL_EVENTO[e.tipo] ?? e.tipo}</td>
              <td className="mono" style={{ fontSize: 10 }}>{e.ip || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Documento assinado</h2>
      {/* HTML gerado pelo servidor, com escape em todo campo do banco — ver
          src/lib/assinatura/documento.ts. Nada aqui vem do navegador. */}
      <div className="doc" dangerouslySetInnerHTML={{ __html: doc.htmlSnapshot }} />

      <p className="rodape">
        {emPapel
          ? 'Documento assinado de forma manuscrita na loja, com via digitalizada arquivada neste sistema. '
          : 'Documento assinado eletronicamente nos termos do art. 10, §2º da Medida Provisória 2.200-2/2001, com aceite expresso das partes no próprio instrumento. '}
        Dossiê emitido em{' '}
        {dataHora(new Date())} por {usuario.nome}.
      </p>
    </>
  )
}
