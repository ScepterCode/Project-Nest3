/**
 * The ProjectNest mark: a nest holding an egg. The nest is always ProjectNest
 * green; the egg takes a programme's own colour where there is one.
 */
export function NestMark({
  size = 32,
  eggColor,
  className,
}: {
  size?: number;
  /** A programme's colour; ProjectNest green when not given. */
  eggColor?: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
    >
      <g
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={5.5}
        strokeLinecap="round"
      >
        <path d="M8 32 A24 24 0 0 0 56 32" />
        <path d="M17 32 A15 15 0 0 0 47 32" strokeOpacity={0.45} />
      </g>
      <circle
        cx="32"
        cy="26"
        r="8.5"
        fill={eggColor ?? 'hsl(var(--primary))'}
      />
    </svg>
  );
}
