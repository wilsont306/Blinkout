export default function StatusPill({ variant = 'violet', pulse = false, children, style }) {
  return (
    <span className={`pill pill--${variant}`} style={style}>
      <span className={`pill__dot${pulse ? ' pill__dot--pulse' : ''}`} />
      {children}
    </span>
  )
}
