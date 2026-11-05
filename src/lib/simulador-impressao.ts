import { esc } from '@/lib/html'
import { fmtBRL } from '@/lib/preco-minimo'
import type { DestaqueAvista12x } from '@/lib/simulador-padrao'

/**
 * Papel da simulação, comum aos dois padrões do simulador: página, estilos de base, cabeçalho
 * (foto, marca, nome e data) e rodapé. Cada padrão entrega os estilos e o corpo dele.
 * As cores são var(--x); quem abre a janela troca pelos valores do tema claro.
 * `titulo` e `marca` existem porque o papel do padrão taxas sai igual ao de antes (com travessão)
 * e o novo não leva travessão.
 */
export function folhaSimulacao({ modelo, dataTexto, estilos, corpo, rodape, titulo, marca }: {
  modelo: { nome: string; imagemUrl: string | null }
  dataTexto: string
  /** Regras CSS do padrão, uma por linha, já com o recuo do bloco. */
  estilos: string
  corpo: string
  rodape: string
  titulo: (nome: string) => string
  marca: string
}): string {
  const nome = esc(modelo.nome)
  const img = modelo.imagemUrl && /^https:\/\//i.test(modelo.imagemUrl) ? esc(modelo.imagemUrl) : null
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${titulo(nome)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:var(--foreground);font-size:14px;max-width:640px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid var(--border)}
    .brand{font-size:11px;color:var(--muted-foreground);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .model{font-size:26px;font-weight:700}
    .date{font-size:11px;color:var(--muted-foreground);text-align:right;white-space:nowrap}
${estilos}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--border);font-size:10px;color:var(--muted-foreground);text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${img ? `<img src="${img}" alt="${nome}" style="height:72px;width:108px;object-fit:contain;border-radius:8px;background:var(--muted);border:1px solid var(--border);padding:4px">` : ''}
      <div>
        <div class="brand">${marca}</div>
        <div class="model">${nome}</div>
      </div>
    </div>
    <div class="date">${dataTexto}</div>
  </div>

  ${corpo}

  <div class="footer">${rodape}</div>
</body>
</html>`
}

const ESTILOS_AVISTA_12X = `    .hero{display:flex;gap:20px;align-items:center;justify-content:space-between;border-radius:14px;padding:22px 24px;border:2px solid color-mix(in srgb, var(--success) 45%, var(--card));background:color-mix(in srgb, var(--success) 8%, var(--card))}
    .l{font-size:13px;font-weight:700;color:var(--success)}
    .v{font-size:36px;font-weight:700;color:var(--success);margin-top:2px}
    .eco{font-size:13px;font-weight:700;color:var(--success);margin-top:4px}
    .ou{border-left:1px solid color-mix(in srgb, var(--success) 30%, var(--card));padding-left:20px;min-width:200px}
    .p{font-size:22px;font-weight:700;color:var(--info)}
    .q{font-size:12px;color:var(--muted-foreground)}
    .frete{margin-top:18px;padding:12px;border-radius:8px;background:var(--muted);border:1px solid var(--border);font-size:12px;color:var(--muted-foreground)}
    .frete b{display:block;font-size:13px;color:var(--foreground);margin-top:4px}`

/**
 * Papel do padrão 'avista_12x': o PIX em destaque e, se o modelo tiver, "ou 12x de".
 * Modelo sem 12x sai só com o PIX: o papel vai para o cliente e não leva card vazio.
 */
export function htmlAvista12x(
  modelo: { nome: string; imagemUrl: string | null },
  d: DestaqueAvista12x,
  /** Distância do frete calculado; o valor do frete vem em `d.comFrete`. */
  kmIdaEVolta: number | null,
  dataTexto: string,
): string {
  const desconto = [d.descontoPix ? `${d.descontoPix}% de desconto` : '', d.economiaPix ? `economia de ${fmtBRL(d.economiaPix)} sobre o 12x` : '']
    .filter(Boolean).join(', ')
  const ou12x = d.total12x !== null && d.parcela12x !== null ? `
      <div class="ou">
        <div class="q">ou no cartão</div>
        <div class="p">12x de ${fmtBRL(d.parcela12x)}</div>
        <div class="q">total ${fmtBRL(d.total12x)}</div>
      </div>` : ''
  const blocoFrete = d.comFrete ? `
    <div class="frete">
      <div>Frete: ${d.comFrete.custo > 0 ? fmtBRL(d.comFrete.custo) : 'grátis'}${kmIdaEVolta !== null ? ` (${kmIdaEVolta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km ida e volta)` : ''}</div>
      <b>PIX + frete: ${fmtBRL(d.comFrete.pix)}</b>
      ${d.comFrete.parcela12x !== null ? `<b>12x + frete: 12x de ${fmtBRL(d.comFrete.parcela12x)}</b>` : ''}
    </div>` : ''

  return folhaSimulacao({
    modelo,
    dataTexto,
    titulo: nome => `Simulação: ${nome}`,
    marca: 'MOVA, gestão em mobilidade elétrica',
    estilos: ESTILOS_AVISTA_12X,
    corpo: `<div class="hero">
    <div>
      <div class="l">À vista no PIX ou dinheiro</div>
      <div class="v">${fmtBRL(d.pix)}</div>
      ${desconto ? `<div class="eco">${desconto}</div>` : ''}
    </div>${ou12x}
  </div>
  ${blocoFrete}`,
    rodape: `Simulação gerada em ${dataTexto}. Valores sujeitos a alteração sem aviso prévio.`,
  })
}
