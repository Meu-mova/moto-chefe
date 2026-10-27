'use client'

export function PrintButtons() {
  return (
    <div className="actions-bar">
      <button onClick={() => window.close()} className="btn">
        Fechar
      </button>
      <button onClick={() => window.print()} className="btn btn-primary">
        Imprimir / Salvar PDF
      </button>
    </div>
  )
}
