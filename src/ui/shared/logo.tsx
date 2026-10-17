interface Props {
  onDark?: boolean;
  cell?: number;
  size?: number;
  href?: string;
  onClick?: (event: MouseEvent) => void;
}

const LIGHT = [
  '#17140F',
  '#8A8173',
  '#C9BFAE',
  '#4A4338',
  '#17140F',
  '#8A8173',
  '#C9BFAE',
  '#C8231B',
  '#4A4338',
];
const DARK = [
  '#F6F1E6',
  '#8A8173',
  '#4A4338',
  '#C9BFAE',
  '#F6F1E6',
  '#8A8173',
  '#4A4338',
  '#C8231B',
  '#C9BFAE',
];

export function Logo({ onDark = false, cell = 9, size = 30, href = '/', onClick }: Props) {
  const cells = onDark ? DARK : LIGHT;
  return (
    <a
      class="logo"
      href={href}
      onClick={onClick}
      style={{ '--logo-cell': `${cell}px`, '--logo-size': `${size}px` }}
      aria-label="DECOY home"
    >
      <span class="logo__grid" aria-hidden="true">
        {cells.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </span>
      <span class="logo__word">DECOY</span>
    </a>
  );
}
