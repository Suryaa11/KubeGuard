import { Spinner } from './Spinner'

const variants = {
  primary: 'bg-gradient-to-r from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-indigo-600',
  secondary: 'bg-white/5 text-text-primary border border-border hover:bg-white/10',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
  success: 'bg-green-500/90 text-white hover:bg-green-500',
}

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  fullWidth = false,
  type = 'button',
  children,
  className = '',
  ...props
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={[
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
      variants[variant],
      sizes[size],
      fullWidth ? 'w-full' : '',
      className,
    ].join(' ')}
    {...props}
  >
    {loading ? <Spinner size={16} /> : Icon ? <Icon size={16} /> : null}
    <span>{children}</span>
  </button>
)
