import { buttonVariants } from '@/components/ui/button'
import { FileText, FileDown } from 'lucide-react'

// 4 das 80 notas capturadas vieram só como resumo da SEFAZ, sem o XML
// completo ainda distribuído — `temXml` vem de `xml IS NOT NULL` na query.
// Nesses casos os botões ficam desabilitados, com o motivo no title: nenhum
// dos dois clica pra dar erro.
const SEM_XML =
  'A SEFAZ entregou só o resumo desta nota, sem o XML completo — nada para baixar ainda.'

export function NotaDownloads({ chave, temXml }: { chave: string; temXml: boolean }) {
  const cls = buttonVariants({ variant: 'outline', size: 'xs', className: 'gap-1' })

  if (!temXml) {
    return (
      <div className="flex gap-1">
        <button type="button" disabled title={SEM_XML} className={cls}>
          <FileText size={12} /> XML
        </button>
        <button type="button" disabled title={SEM_XML} className={cls}>
          <FileDown size={12} /> DANFE
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <a href={`/api/nfe/${chave}/xml`} className={cls} title="Baixar o XML da nota">
        <FileText size={12} /> XML
      </a>
      <a href={`/api/nfe/${chave}/danfe`} className={cls} title="Baixar o DANFE (PDF) da nota">
        <FileDown size={12} /> DANFE
      </a>
    </div>
  )
}
