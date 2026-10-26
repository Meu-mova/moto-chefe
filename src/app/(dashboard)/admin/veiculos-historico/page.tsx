import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { contarVeiculosHistoricoAction } from './actions'
import { ImportarVeiculosClient } from './importar-client'
import { ArrowLeft, Database } from 'lucide-react'
import Link from 'next/link'

export default async function VeiculosHistoricoPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/veiculos-historico')) redirect('/dashboard')

  const total = await contarVeiculosHistoricoAction()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Voltar
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-primary-foreground rounded-lg">
            <Database size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Banco Histórico de Veículos</h1>
            <p className="text-muted-foreground text-sm">
              Relação de todas as motos já comercializadas — usada para enriquecer as Ordens de Serviço
            </p>
          </div>
        </div>
      </div>

      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm text-warning space-y-1">
        <p className="font-semibold">Como preparar sua planilha Excel:</p>
        <ul className="list-disc pl-5 space-y-0.5 text-xs">
          <li>A <strong>primeira linha</strong> deve ser o cabeçalho</li>
          <li>Colunas obrigatórias: <strong>Chassi</strong></li>
          <li>Colunas opcionais: <strong>Motor</strong> (nº motor), <strong>Marca</strong>, <strong>Modelo</strong>, <strong>Cor</strong>, <strong>Ano</strong>, <strong>NF Entrada</strong> (número da nota fiscal de entrada)</li>
          <li>Os nomes das colunas não precisam ser exatos — o sistema tenta identificar automaticamente</li>
          <li>Cada importação faz <strong>upsert</strong>: atualiza se o chassi já existir, insere se for novo</li>
        </ul>
      </div>

      <ImportarVeiculosClient totalAtual={total} />
    </div>
  )
}
