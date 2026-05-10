export default function StatusPill({ variant = 'violet', pulse = false, children }) {
  return (
    <span className={`pill pill--${variant}`}>
      <span className={`pill__dot${pulse ? ' pill__dot--pulse' : ''}`} />
      {children}
    </span>
  )
}
