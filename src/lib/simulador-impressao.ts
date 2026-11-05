import { esc } from '@/lib/html'
import { fmtBRL } from '@/lib/preco-minimo'
import type { DestaqueAvista12x } from '@/lib/simulador-padrao'

/**
 * Folha impressa do padrão 'avista_12x': o PIX em destaque e, se o modelo tiver, "ou 12x de".
 * Modelo sem 12x sai só com o PIX: o papel vai para o cliente e não leva card vazio.
 * As cores são var(--x); quem abre a janela troca pelos valores do tema claro.
 */
export function htmlAvista12x(
  modelo: { nome: string; imagemUrl: string | null },
  d: DestaqueAvista12x,
  frete: { kmIdaEVolta: number; custo: number } | null,
  dataTexto: string,
): string {
  const nome = esc(modelo.nome)
  const img = modelo.imagemUrl && /^https:\/\//i.test(modelo.imagemUrl) ? esc(modelo.imagemUrl) : null
  const desconto = [d.descontoPix ? `${d.descontoPix}% de desconto` : '', d.economiaPix ? `economia de ${fmtBRL(d.economiaPix)} sobre o 12x` : '']
    .filter(Boolean).join(', ')
  const ou12x = d.total12x !== null && d.parcela12x !== null ? `
      <div class="ou">
        <div class="q">ou no cartão</div>
        <div class="p">12x de ${fmtBRL(d.parcela12x)}</div>
        <div class="q">total ${fmtBRL(d.total12x)}</div>
      </div>` : ''
  const blocoFrete = frete && d.comFrete ? `
    <div class="frete">
      <div>Frete: ${frete.custo > 0 ? fmtBRL(frete.custo) : 'grátis'} (${frete.kmIdaEVolta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km ida e volta)</div>
      <b>PIX + frete: ${fmtBRL(d.comFrete.pix)}</b>
      ${d.comFrete.parcela12x !== null ? `<b>12x + frete: 12x de ${fmtBRL(d.comFrete.parcela12x)}</b>` : ''}
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação: ${nome}</title>
  <style>
    *{box-sizing:border-box;margin:0}
    body{font-family:Arial,sans-serif;padding:40px;color:var(--foreground);font-size:14px;max-width:640px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid var(--border)}
    .brand{font-size:11px;color:var(--muted-foreground);margin-bottom:4px}
    .model{font-size:24px;font-weight:700}
    .date{font-size:11px;color:var(--muted-foreground);white-space:nowrap}
    .hero{display:flex;gap:20px;align-items:center;justify-content:space-between;border-radius:14px;padding:22px 24px;border:2px solid color-mix(in srgb, var(--success) 45%, var(--card));background:color-mix(in srgb, var(--success) 8%, var(--card))}
    .l{font-size:13px;font-weight:700;color:var(--success)}
    .v{font-size:36px;font-weight:700;color:var(--success);margin-top:2px}
    .eco{font-size:13px;font-weight:700;color:var(--success);margin-top:4px}
    .ou{border-left:1px solid color-mix(in srgb, var(--success) 30%, var(--card));padding-left:20px;min-width:200px}
    .p{font-size:22px;font-weight:700;color:var(--info)}
    .q{font-size:12px;color:var(--muted-foreground)}
    .frete{margin-top:18px;padding:12px;border-radius:8px;background:var(--muted);border:1px solid var(--border);font-size:12px;color:var(--muted-foreground)}
    .frete b{display:block;font-size:13px;color:var(--foreground);margin-top:4px}
    .footer{margin-top:28px;padding-top:12px;border-top:1px solid var(--border);font-size:10px;color:var(--muted-foreground);text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${img ? `<img src="${img}" alt="${nome}" style="height:72px;width:108px;object-fit:contain;border-radius:8px;background:var(--muted);border:1px solid var(--border);padding:4px">` : ''}
      <div>
        <div class="brand">MOVA, gestão em mobilidade elétrica</div>
        <div class="model">${nome}</div>
      </div>
    </div>
    <div class="date">${dataTexto}</div>
  </div>

  <div class="hero">
    <div>
      <div class="l">À vista no PIX ou dinheiro</div>
      <div class="v">${fmtBRL(d.pix)}</div>
      ${desconto ? `<div class="eco">${desconto}</div>` : ''}
    </div>${ou12x}
  </div>
  ${blocoFrete}

  <div class="footer">Simulação gerada em ${dataTexto}. Valores sujeitos a alteração sem aviso prévio.</div>
</body>
</html>`
}
