export const Input = ({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  hint,
  required,
  icon: Icon,
  disabled,
  className = '',
  ...props
}) => (
  <label className={`block ${className}`}>
    {label ? (
      <span className="mb-2 block text-sm font-medium text-text-primary">
        {label}
        {required ? <span className="ml-1 text-rose-400">*</span> : null}
      </span>
    ) : null}
    <div
      className={[
        'flex items-center gap-2 rounded-xl border bg-surface/80 px-3 transition-all',
        error ? 'border-rose-500/60' : 'border-border focus-within:border-indigo-500 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.25)]',
        disabled ? 'opacity-70' : '',
      ].join(' ')}
    >
      {Icon ? <Icon size={16} className="text-text-secondary" /> : null}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
        {...props}
      />
    </div>
    {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : hint ? <p className="mt-2 text-sm text-text-secondary">{hint}</p> : null}
  </label>
)
