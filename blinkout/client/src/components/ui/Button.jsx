export default function Button({ variant = 'primary', size, onClick, disabled, children, fullWidth }) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size === 'lg' ? 'btn-lg' : '',
    fullWidth ? 'btn-full' : '',
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} onClick={onClick} disabled={disabled}
      style={fullWidth ? { width: '100%' } : undefined}>
      {children}
    </button>
  )
}
