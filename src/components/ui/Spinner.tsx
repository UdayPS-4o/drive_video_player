import './ui.css'

interface SpinnerProps {
  size?: number
  stroke?: number
}

/** A smooth SVG ring spinner. Inherits color from `var(--accent)`. */
export default function Spinner({ size = 24, stroke = 2.5 }: SpinnerProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg
      className="ui-spinner"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="status"
      aria-label="Loading"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * 0.72}
      />
    </svg>
  )
}
