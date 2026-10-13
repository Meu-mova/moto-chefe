// Ondas da marca no fundo do login. Cada onda repete o mesmo desenho a cada 800 px, então
// deslizar 800 px fecha o loop sem emenda; o balanço vertical fica num <g> separado.
// O preenchimento desce além da base (V900): com o balanço, a onda sobe e não pode descobrir o fundo.
function onda(y: number, a: number) {
  return `M0 ${y} C 200 ${y - a}, 600 ${y + a}, 800 ${y} C 1000 ${y - a}, 1400 ${y + a}, 1600 ${y} V900 H0Z`
}

export function FundoOndas() {
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <linearGradient id="mova-onda" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--brand-1)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--brand-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-3)' }} />
        </linearGradient>
      </defs>
      <g className="mova-balancar"><path d={onda(400, 60)} fill="url(#mova-onda)" className="mova-onda-volta opacity-45 dark:opacity-30" /></g>
      <g className="mova-balancar-2"><path d={onda(440, 70)} fill="url(#mova-onda)" className="mova-onda opacity-75 dark:opacity-50" /></g>
      <g className="mova-balancar"><path d={onda(500, 45)} fill="url(#mova-onda)" className="mova-onda-volta dark:opacity-85" /></g>
      <path d="M0 140 C 220 60, 420 220, 800 90" pathLength={1} fill="none" strokeWidth="1.5"
        className="mova-desenhar stroke-(--brand-3) opacity-45 dark:opacity-60" />
      {/* Pulso no <g>: duas animações no mesmo elemento, a segunda anularia o traçado. */}
      <g className="mova-pulso">
        <path d="M0 200 C 260 120, 480 300, 800 160" pathLength={1} fill="none" strokeWidth="1"
          className="mova-desenhar stroke-(--brand-3) opacity-30" />
      </g>
    </svg>
  )
}
