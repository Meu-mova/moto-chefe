// "MOVA" traçado letra por letra (mesmo desenho de public/brand/mova-nome-*.svg).
// pathLength=1 normaliza o traço de cada letra para a animação de stroke-dashoffset.
const atraso = (i: number) => ({ pathLength: 1, className: 'mova-tracar', style: { animationDelay: `${0.15 + i * 0.22}s` } })

export function NomeAnimado({ className }: { className?: string }) {
  return (
    <svg viewBox="435 50 970 312" className={className} role="img" aria-label="MOVA">
      <defs>
        <linearGradient id="mova-o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--brand-o-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-o-2)' }} />
        </linearGradient>
      </defs>
      <g fill="none" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground">
        <path d="M470 330 V82 L545 192 L620 82 V330" {...atraso(0)} />
        <circle cx="822" cy="206" r="110" stroke="url(#mova-o)" transform="rotate(-90 822 206)" {...atraso(1)} />
        <path d="M1005 82 L1085 330 L1165 82" {...atraso(2)} />
        <path d="M1215 330 L1295 82 L1375 330 M1247 256 H1343" {...atraso(3)} />
      </g>
    </svg>
  )
}
