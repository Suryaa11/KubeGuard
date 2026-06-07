export const Badge = ({ color, bg, border, label, pulse = false, size = 'md', className = '' }) => (
  <span
    className={[
      'inline-flex items-center rounded-full border font-medium',
      size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
      pulse ? 'animate-glow-pulse' : '',
      className,
    ].join(' ')}
    style={{
      color,
      backgroundColor: bg,
      borderColor: border,
    }}
  >
    {label}
  </span>
)
